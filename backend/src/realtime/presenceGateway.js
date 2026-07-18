import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";

function parseTokenFromRequest(request) {
  const authHeader = request.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  const url = new URL(request.url || "", "http://localhost");
  return url.searchParams.get("token") || "";
}

function parseJson(message) {
  try {
    return JSON.parse(String(message));
  } catch {
    return null;
  }
}

function sendJson(socket, payload) {
  if (socket.readyState !== 1) {
    return;
  }
  socket.send(JSON.stringify(payload));
}

export function createPresenceGateway({ server, authService, authorizationService, presenceService, logger, permissionCatalog, heartbeatIntervalMs = 10000 }) {
  const sockets = new Map();
  const wss = new WebSocketServer({ noServer: true });

  async function can(user, permissionKey) {
    const decision = await authorizationService.evaluate({ user, permissionKey });
    return decision.allowed;
  }

  async function broadcastToReaders(event) {
    for (const [, state] of sockets) {
      if (!state.permissions.read) {
        continue;
      }
      sendJson(state.socket, event);
    }
  }

  presenceService.setBroadcaster(async (event) => {
    await broadcastToReaders({ type: event.type, reason: event.reason, data: event.data, timestamp: new Date().toISOString() });
  });

  async function handleClientMessage(state, payload) {
    if (!payload?.type) {
      return;
    }

    const { socket, user, reporterId, sessionId } = state;

    if (payload.type === "presence.heartbeat") {
      if (!state.permissions.update) {
        sendJson(socket, { type: "presence.error", code: "RBAC_DENIED", message: "presence.update permission required" });
        return;
      }

      await presenceService.heartbeat({
        reporterId: reporterId || payload.reporterId,
        actor: user.username,
        correlationId: payload.correlationId || `ws-${sessionId}`,
        payload: {
          connectionStatus: payload.connectionStatus,
          currentAssignmentId: payload.currentAssignmentId,
          currentStudioId: payload.currentStudioId,
          cameraReady: payload.cameraReady,
          microphoneReady: payload.microphoneReady,
          speakerReady: payload.speakerReady,
          internetQuality: payload.internetQuality,
          signalStrength: payload.signalStrength,
          batteryLevel: payload.batteryLevel,
          isCharging: payload.isCharging,
          appVersion: payload.appVersion,
          operatingSystem: payload.operatingSystem,
          deviceType: payload.deviceType,
          sessionId,
        },
      });

      sendJson(socket, { type: "presence.heartbeat.ack", timestamp: new Date().toISOString() });
      return;
    }

    if (payload.type === "presence.override") {
      if (!state.permissions.override) {
        sendJson(socket, { type: "presence.error", code: "RBAC_DENIED", message: "presence.override permission required" });
        return;
      }

      const updated = await presenceService.overridePresence({
        reporterId: payload.reporterId,
        actor: user.username,
        correlationId: payload.correlationId || `ws-${sessionId}`,
        payload,
      });
      sendJson(socket, { type: "presence.override.ack", data: updated });
      return;
    }

    sendJson(socket, { type: "presence.error", code: "VALIDATION_ERROR", message: "Unsupported message type" });
  }

  async function registerSocket(socket, request) {
    const token = parseTokenFromRequest(request);
    const verified = await authService.verifyToken(token);
    if (!verified.valid) {
      sendJson(socket, { type: "presence.error", code: "AUTH_FORBIDDEN", message: "Invalid or expired access token" });
      socket.close(4001, "unauthorized");
      return;
    }

    const user = verified.user;
    const url = new URL(request.url || "", "http://localhost");
    const reporterId = url.searchParams.get("reporterId") || null;
    const sessionId = `ws-${randomUUID()}`;

    const permissions = {
      read: await can(user, permissionCatalog.PRESENCE_READ),
      update: await can(user, permissionCatalog.PRESENCE_UPDATE),
      override: await can(user, permissionCatalog.PRESENCE_OVERRIDE),
    };

    if (!permissions.read && !permissions.update && !permissions.override) {
      sendJson(socket, { type: "presence.error", code: "RBAC_DENIED", message: "Presence access denied" });
      socket.close(4003, "forbidden");
      return;
    }

    const state = {
      socket,
      user,
      reporterId,
      sessionId,
      permissions,
      heartbeatTicker: null,
    };

    sockets.set(sessionId, state);

    if (permissions.update && reporterId) {
      await presenceService.connectReporter({
        reporterId,
        actor: user.username,
        correlationId: `ws-connect-${sessionId}`,
        payload: {
          sessionId,
          connectionStatus: "Online",
          deviceType: url.searchParams.get("deviceType") || null,
          operatingSystem: url.searchParams.get("operatingSystem") || null,
          appVersion: url.searchParams.get("appVersion") || null,
          currentAssignmentId: url.searchParams.get("assignmentId") || null,
          currentStudioId: url.searchParams.get("studioId") || null,
        },
      });
    }

    sendJson(socket, {
      type: "presence.connected",
      sessionId,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
      permissions,
      heartbeatIntervalMs,
      timestamp: new Date().toISOString(),
    });

    sendJson(socket, {
      type: "presence.snapshot",
      reason: "initial",
      data: await presenceService.list(),
      timestamp: new Date().toISOString(),
    });

    state.heartbeatTicker = setInterval(() => {
      sendJson(socket, { type: "presence.server.ping", timestamp: new Date().toISOString() });
    }, heartbeatIntervalMs);

    socket.on("message", async (raw) => {
      const payload = parseJson(raw);
      if (!payload) {
        sendJson(socket, { type: "presence.error", code: "VALIDATION_ERROR", message: "Invalid JSON payload" });
        return;
      }

      try {
        await handleClientMessage(state, payload);
      } catch (error) {
        sendJson(socket, { type: "presence.error", code: error?.code || "INTERNAL_ERROR", message: error?.message || "Presence message failed" });
      }
    });

    socket.on("close", async () => {
      if (state.heartbeatTicker) {
        clearInterval(state.heartbeatTicker);
      }
      sockets.delete(sessionId);

      if (permissions.update && reporterId) {
        try {
          await presenceService.disconnectReporter({
            reporterId,
            actor: user.username,
            correlationId: `ws-disconnect-${sessionId}`,
            reason: "socket_closed",
          });
        } catch {
          // Ignore disconnect write failures on socket close.
        }
      }
    });
  }

  server.on("upgrade", async (request, socket, head) => {
    if (!(request.url || "").startsWith("/api/v1/presence/ws")) {
      return;
    }

    wss.handleUpgrade(request, socket, head, async (wsSocket) => {
      try {
        await registerSocket(wsSocket, request);
      } catch (error) {
        logger.error("presence.gateway.register_failed", {
          code: error?.code || "INTERNAL_ERROR",
          message: error?.message || "Unknown presence gateway error",
        });
        wsSocket.close(1011, "gateway_error");
      }
    });
  });

  return {
    broadcastToReaders,
    close: async () => {
      for (const [, state] of sockets) {
        if (state.heartbeatTicker) {
          clearInterval(state.heartbeatTicker);
        }
        state.socket.close();
      }
      sockets.clear();
      wss.close();
    },
  };
}
