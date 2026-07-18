import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createV1Router } from "./v1.js";
import { setAuthorizationDependencies } from "../middleware/auth.js";
import { errorHandler } from "../middleware/errorHandler.js";

function buildApp({ role = "Producer", mediaPermissions = { read: true, join: true, producerControl: true } }) {
  const authService = {
    verifyToken: async () => ({
      valid: true,
      user: {
        id: "user-1",
        username: role.toLowerCase(),
        role,
      },
    }),
  };

  const authorizationService = {
    evaluate: async ({ permissionKey }) => {
      if (permissionKey === "media.rooms.read") {
        return { allowed: mediaPermissions.read, reason: mediaPermissions.read ? "permission_granted" : "permission_missing", roles: [role] };
      }
      if (permissionKey === "media.session.join") {
        return { allowed: mediaPermissions.join, reason: mediaPermissions.join ? "permission_granted" : "permission_missing", roles: [role] };
      }
      if (permissionKey === "media.producer.control") {
        return { allowed: mediaPermissions.producerControl, reason: mediaPermissions.producerControl ? "permission_granted" : "permission_missing", roles: [role] };
      }
      return { allowed: true, reason: "permission_granted", roles: [role] };
    },
  };

  const auditService = {
    record: async () => ({}),
    list: async () => [],
  };

  setAuthorizationDependencies({ authService, authorizationService, auditService });

  const mediaService = {
    listCapabilities: () => [{ key: "livekit", capabilities: { provider: "livekit" } }],
    listRooms: async () => [{ id: "room-1", name: "control-room" }],
    createRoom: async ({ payload }) => ({ id: "room-1", ...payload }),
    joinSession: async () => ({
      room: { id: "room-1", name: "control-room" },
      participant: { id: "participant-1", participantRole: "reporter" },
      connectionDetails: { token: "dev-token", wsUrl: "wss://livekit.example/ws" },
    }),
    leaveSession: async ({ participantId }) => ({ id: participantId, connectionStatus: "left" }),
    updateDeviceSelection: async ({ participantId, deviceSelection }) => ({ id: participantId, deviceSelection }),
    setPublisherState: async ({ participantId, enabled }) => ({ id: participantId, publisherEnabled: enabled }),
    applyProducerControl: async ({ participantId, action }) => ({ id: participantId, muted: action === "mute" }),
  };

  const orchestration = {
    capabilities: () => ({}),
    providerHealth: async () => ({ provider: "proxmox", status: "healthy" }),
    vpnReadiness: async () => ({ status: "ready", blocked: 0, checks: [] }),
    status: async () => [],
    providerMethod: async () => [],
    logs: async () => [],
    events: async () => [],
    metrics: async () => [],
    invokeAction: async () => ({ ok: true }),
    persistProviderState: async () => ({ ok: true }),
    listProviderState: async () => [],
  };
  const eventService = { publish: async () => ({}), list: async () => [] };
  const platformConfigService = { list: async () => [] };
  const databaseService = { health: async () => ({ status: "ok" }) };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.correlationId = "corr-media-test";
    next();
  });

  app.use("/api/v1", createV1Router({
    orchestration,
    authService,
    auditService,
    eventService,
    platformConfigService,
    databaseService,
    reporterService: { list: async () => [] },
    studioService: { list: async () => [] },
    assignmentService: { list: async () => [] },
    presenceService: { list: async () => [] },
    mediaService,
  }));
  app.use(errorHandler);

  return app;
}

async function withServer(app, run) {
  const server = await new Promise((resolve) => {
    const srv = app.listen(0, "127.0.0.1", () => resolve(srv));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

test("media rooms endpoint returns data for authorized reader", async () => {
  const app = buildApp({ mediaPermissions: { read: true, join: true, producerControl: true } });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/media/rooms`, {
      headers: { authorization: "Bearer token" },
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(Array.isArray(body.data), true);
    assert.equal(body.data.length, 1);
  });
});

test("media join endpoint is denied without join permission", async () => {
  const app = buildApp({ mediaPermissions: { read: true, join: false, producerControl: true } });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/media/sessions/join`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ roomId: "room-1", participantIdentity: "reporter-1" }),
    });

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error.code, "RBAC_DENIED");
  });
});

test("media producer control endpoint is denied without producer control permission", async () => {
  const app = buildApp({ mediaPermissions: { read: true, join: true, producerControl: false } });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/media/sessions/participant-1/producer-control`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "mute", value: true }),
    });

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error.code, "RBAC_DENIED");
  });
});
