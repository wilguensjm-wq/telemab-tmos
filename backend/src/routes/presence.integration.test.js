import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createV1Router } from "./v1.js";
import { errorHandler } from "../middleware/errorHandler.js";
import { setAuthorizationDependencies } from "../middleware/auth.js";

function buildApp({ allowRead = true, allowOverride = true }) {
  const presenceRows = [
    {
      reporterId: "rep-1",
      reporterName: "Reporter One",
      connectionStatus: "Online",
      currentStudioName: "Studio A",
      currentAssignmentTitle: "Morning Live",
      cameraReady: true,
      microphoneReady: true,
      speakerReady: true,
      internetQuality: "good",
      signalStrength: 83,
      batteryLevel: 75,
      isCharging: false,
      lastHeartbeat: new Date().toISOString(),
    },
  ];

  const presenceService = {
    list: async () => presenceRows,
    getByReporterId: async (reporterId) => ({ ...presenceRows[0], reporterId }),
    overridePresence: async ({ reporterId, payload }) => ({ ...presenceRows[0], reporterId, ...payload }),
  };

  const authService = {
    verifyToken: async () => ({
      valid: true,
      user: {
        id: "user-1",
        username: "producer",
        role: "Producer",
      },
    }),
  };

  const authorizationService = {
    evaluate: async ({ permissionKey }) => {
      if (permissionKey === "presence.read") {
        return { allowed: allowRead, reason: allowRead ? "permission_granted" : "permission_missing", roles: ["Producer"] };
      }
      if (permissionKey === "presence.override") {
        return { allowed: allowOverride, reason: allowOverride ? "permission_granted" : "permission_missing", roles: ["Producer"] };
      }
      return { allowed: true, reason: "permission_granted", roles: ["Producer"] };
    },
  };

  const auditService = { record: async () => ({}), list: async () => [] };

  setAuthorizationDependencies({ authService, authorizationService, auditService });

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

  const eventService = { publish: async () => ({ ok: true }), list: async () => [] };
  const platformConfigService = { list: async () => [] };
  const databaseService = { health: async () => ({ status: "ok" }) };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.correlationId = "corr-presence-test";
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
    presenceService,
  }));

  app.use(errorHandler);
  return { app };
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

test("presence list endpoint returns data for authorized reader", async () => {
  const { app } = buildApp({ allowRead: true });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/presence/reporters`, {
      headers: { authorization: "Bearer token" },
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(Array.isArray(body.data), true);
    assert.equal(body.data.length, 1);
  });
});

test("presence override endpoint is denied when permission is missing", async () => {
  const { app } = buildApp({ allowRead: true, allowOverride: false });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/presence/reporters/rep-1/override`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ connectionStatus: "Live" }),
    });

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error.code, "RBAC_DENIED");
  });
});
