import APIClient from "../api/APIClient";
import { API_CONFIG } from "../constants/api";
import { formatApiError } from "../utils/errorHandling";

function buildWebSocketUrl(token) {
  const base = API_CONFIG.baseURL || "/api";
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.host;

  let path = API_CONFIG.endpoints.presence.ws;
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }

  const url = new URL(`${protocol}://${host}${base}${path}`);
  if (token) {
    url.searchParams.set("token", token);
  }

  return url.toString();
}

export const presenceService = {
  async list() {
    try {
      const response = await APIClient.get(API_CONFIG.endpoints.presence.reporters);
      return response?.data?.data || [];
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async override(reporterId, payload) {
    try {
      const response = await APIClient.post(`${API_CONFIG.endpoints.presence.reporters}/${reporterId}/override`, payload);
      return response?.data?.data || response?.data;
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  connect({ token, onSnapshot, onConnected, onError, onStateChange, autoReconnect = true, reconnectBaseMs = 1000, reporterSession = null }) {
    let socket = null;
    let heartbeatTimer = null;
    let reconnectTimer = null;
    let disposed = false;
    let reconnectAttempt = 0;

    const setState = (state) => {
      if (typeof onStateChange === "function") {
        onStateChange(state);
      }
    };

    function clearTimers() {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    const send = (payload) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return false;
      }
      socket.send(JSON.stringify(payload));
      return true;
    };

    const scheduleReconnect = () => {
      if (!autoReconnect || disposed) {
        return;
      }

      reconnectAttempt += 1;
      const delay = Math.min(10000, reconnectBaseMs * 2 ** Math.min(reconnectAttempt, 5));
      reconnectTimer = setTimeout(() => {
        connectNow();
      }, delay);
    };

    const startHeartbeat = () => {
      if (!reporterSession) {
        return;
      }

      heartbeatTimer = setInterval(() => {
        send({
          type: "presence.heartbeat",
          reporterId: reporterSession.reporterId,
          connectionStatus: reporterSession.connectionStatus || "Online",
          currentAssignmentId: reporterSession.currentAssignmentId || null,
          currentStudioId: reporterSession.currentStudioId || null,
          deviceType: reporterSession.deviceType || null,
          operatingSystem: reporterSession.operatingSystem || null,
          appVersion: reporterSession.appVersion || null,
          cameraReady: reporterSession.cameraReady || false,
          microphoneReady: reporterSession.microphoneReady || false,
          speakerReady: reporterSession.speakerReady || false,
          internetQuality: reporterSession.internetQuality || null,
          signalStrength: reporterSession.signalStrength ?? null,
          batteryLevel: reporterSession.batteryLevel ?? null,
          isCharging: reporterSession.isCharging ?? null,
        });
      }, 10000);
    };

    const connectNow = () => {
      clearTimers();
      setState("connecting");

      socket = new WebSocket(buildWebSocketUrl(token));

      socket.addEventListener("open", () => {
        reconnectAttempt = 0;
      });

      socket.addEventListener("message", (event) => {
        let payload = null;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }

        if (payload.type === "presence.connected") {
          setState("online");
          if (typeof onConnected === "function") {
            onConnected(payload);
          }

          if (reporterSession?.reporterId) {
            send({
              type: "presence.heartbeat",
              reporterId: reporterSession.reporterId,
              connectionStatus: reporterSession.connectionStatus || "Online",
              currentAssignmentId: reporterSession.currentAssignmentId || null,
              currentStudioId: reporterSession.currentStudioId || null,
              deviceType: reporterSession.deviceType || null,
              operatingSystem: reporterSession.operatingSystem || null,
              appVersion: reporterSession.appVersion || null,
              cameraReady: reporterSession.cameraReady || false,
              microphoneReady: reporterSession.microphoneReady || false,
              speakerReady: reporterSession.speakerReady || false,
              internetQuality: reporterSession.internetQuality || null,
              signalStrength: reporterSession.signalStrength ?? null,
              batteryLevel: reporterSession.batteryLevel ?? null,
              isCharging: reporterSession.isCharging ?? null,
            });
            startHeartbeat();
          }
          return;
        }

        if (payload.type === "presence.snapshot") {
          if (typeof onSnapshot === "function") {
            onSnapshot(payload.data || []);
          }
          return;
        }

        if (payload.type === "presence.error") {
          if (typeof onError === "function") {
            onError(payload.message || "Presence websocket error");
          }
        }
      });

      socket.addEventListener("close", () => {
        clearTimers();
        if (disposed) {
          setState("disconnected");
          return;
        }

        setState("reconnecting");
        scheduleReconnect();
      });

      socket.addEventListener("error", () => {
        if (typeof onError === "function") {
          onError("Presence websocket connection failed");
        }
      });
    };

    connectNow();

    return {
      close() {
        disposed = true;
        clearTimers();
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
        setState("disconnected");
      },
      sendOverride(payload) {
        return send({ type: "presence.override", ...payload });
      },
    };
  },
};
