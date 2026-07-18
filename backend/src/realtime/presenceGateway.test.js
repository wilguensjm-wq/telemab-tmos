import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import WebSocket from "ws";
import { createPresenceGateway } from "./presenceGateway.js";

async function waitForMessage(socket, matcher, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for websocket message"));
    }, timeoutMs);

    const onMessage = (raw) => {
      let payload;
      try {
        payload = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (!matcher(payload)) {
        return;
      }

      cleanup();
      resolve(payload);
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off("message", onMessage);
    };

    socket.on("message", onMessage);
  });
}

async function createGatewayHarness({ permissionByToken }) {
  const app = express();
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  const authService = {
    verifyToken: async (token) => {
      if (!token || token === "bad-token") {
        return { valid: false };
      }
      if (token === "reader-token") {
        return { valid: true, user: { id: "user-reader", username: "reader", role: "Viewer" } };
      }
      return { valid: true, user: { id: "user-reporter", username: "reporter", role: "Operator" } };
    },
  };

  const authorizationService = {
    evaluate: async ({ user, permissionKey }) => {
      const key = `${user.username}:${permissionKey}`;
      const allowed = Boolean(permissionByToken[key]);
      return { allowed, reason: allowed ? "permission_granted" : "permission_missing", roles: [user.role] };
    },
  };

  const presenceState = [];
  const presenceService = {
    setBroadcaster(fn) {
      this.broadcast = fn;
    },
    async list() {
      return presenceState;
    },
    async connectReporter({ reporterId }) {
      presenceState.push({ reporterId, connectionStatus: "Online" });
    },
    async heartbeat({ reporterId }) {
      presenceState.push({ reporterId, connectionStatus: "Ready" });
    },
    async disconnectReporter() {},
    async overridePresence() {},
  };

  const gateway = createPresenceGateway({
    server,
    authService,
    authorizationService,
    presenceService,
    logger: { error: () => {} },
    permissionCatalog: {
      PRESENCE_READ: "presence.read",
      PRESENCE_UPDATE: "presence.update",
      PRESENCE_OVERRIDE: "presence.override",
    },
    heartbeatIntervalMs: 200,
  });

  return {
    gateway,
    baseWsUrl: `ws://127.0.0.1:${address.port}/api/v1/presence/ws`,
    async close() {
      await gateway.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

test("presence websocket rejects unauthorized token", async () => {
  const harness = await createGatewayHarness({
    permissionByToken: {},
  });

  try {
    const socket = new WebSocket(`${harness.baseWsUrl}?token=bad-token`);
    const closeEvent = await new Promise((resolve) => {
      socket.on("close", (code) => resolve(code));
    });
    assert.equal(closeEvent, 4001);
  } finally {
    await harness.close();
  }
});

test("presence websocket sends connected + snapshot and accepts heartbeat for update users", async () => {
  const harness = await createGatewayHarness({
    permissionByToken: {
      "reporter:presence.read": true,
      "reporter:presence.update": true,
      "reporter:presence.override": true,
    },
  });

  try {
    const socket = new WebSocket(`${harness.baseWsUrl}?token=reporter-token&reporterId=rep-1`);
    await waitForMessage(socket, (payload) => payload.type === "presence.connected");

    socket.send(JSON.stringify({ type: "presence.heartbeat", reporterId: "rep-1", connectionStatus: "Ready" }));
    const ack = await waitForMessage(socket, (payload) => payload.type === "presence.heartbeat.ack");
    assert.equal(Boolean(ack.timestamp), true);

    socket.close();
  } finally {
    await harness.close();
  }
});

test("presence websocket denies heartbeat when update permission is missing", async () => {
  const harness = await createGatewayHarness({
    permissionByToken: {
      "reader:presence.read": true,
      "reader:presence.update": false,
      "reader:presence.override": false,
    },
  });

  try {
    const socket = new WebSocket(`${harness.baseWsUrl}?token=reader-token&reporterId=rep-2`);
    await waitForMessage(socket, (payload) => payload.type === "presence.connected");

    socket.send(JSON.stringify({ type: "presence.heartbeat", reporterId: "rep-2", connectionStatus: "Ready" }));
    const denied = await waitForMessage(socket, (payload) => payload.type === "presence.error");
    assert.equal(denied.code, "RBAC_DENIED");

    socket.close();
  } finally {
    await harness.close();
  }
});

test("presence websocket supports reconnect", async () => {
  const harness = await createGatewayHarness({
    permissionByToken: {
      "reporter:presence.read": true,
      "reporter:presence.update": true,
      "reporter:presence.override": false,
    },
  });

  try {
    const first = new WebSocket(`${harness.baseWsUrl}?token=reporter-token&reporterId=rep-3`);
    await waitForMessage(first, (payload) => payload.type === "presence.connected");
    first.close();

    const second = new WebSocket(`${harness.baseWsUrl}?token=reporter-token&reporterId=rep-3`);
    const connected = await waitForMessage(second, (payload) => payload.type === "presence.connected");
    assert.equal(Boolean(connected.sessionId), true);
    second.close();
  } finally {
    await harness.close();
  }
});
