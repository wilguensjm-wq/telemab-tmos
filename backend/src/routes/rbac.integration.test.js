import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createV1Router } from "./v1.js";
import { setAuthorizationDependencies } from "../middleware/auth.js";
import { errorHandler } from "../middleware/errorHandler.js";

function buildApp({ authService, authorizationService, auditEntries }) {
  const auditService = {
    record: async (entry) => {
      auditEntries.push(entry);
      return entry;
    },
    list: async () => [],
  };

  const orchestration = {
    capabilities: () => ({ proxmox: { actions: ["start", "stop", "restart"] } }),
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

  const eventService = {
    publish: async () => ({ ok: true }),
    list: async () => [],
  };

  const platformConfigService = {
    list: async () => [],
  };

  const databaseService = {
    health: async () => ({ status: "ok" }),
  };

  setAuthorizationDependencies({ authService, authorizationService, auditService });

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.correlationId = "corr-test";
    next();
  });
  app.use("/api/v1", createV1Router({
    orchestration,
    authService,
    auditService,
    eventService,
    platformConfigService,
    databaseService,
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

test("protected endpoint allows authorized user and records successful decision", async () => {
  const auditEntries = [];
  const app = buildApp({
    authService: {
      verifyToken: async () => ({ valid: true, user: { id: "user-1", username: "operator" } }),
    },
    authorizationService: {
      evaluate: async () => ({ allowed: true, reason: "permission_granted", roles: ["Operator"] }),
    },
    auditEntries,
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/providers/capabilities`, {
      headers: { authorization: "Bearer token-ok" },
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
  });

  const authzLog = auditEntries.find((entry) => entry.action === "authz.decision");
  assert.ok(authzLog);
  assert.equal(authzLog.result, "success");
  assert.equal(authzLog.metadata.permissionKey, "providers.capabilities.read");
});

test("protected endpoint denies unauthorized user and records failed decision", async () => {
  const auditEntries = [];
  const app = buildApp({
    authService: {
      verifyToken: async () => ({ valid: true, user: { id: "user-2", username: "viewer" } }),
    },
    authorizationService: {
      evaluate: async () => ({ allowed: false, reason: "permission_missing", roles: ["Viewer"] }),
    },
    auditEntries,
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/infrastructure/proxmox/vms/start`, {
      method: "POST",
      headers: {
        authorization: "Bearer token-deny",
        "content-type": "application/json",
      },
      body: JSON.stringify({ vmId: "101" }),
    });

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, "RBAC_DENIED");
  });

  const authzLog = auditEntries.find((entry) => entry.action === "authz.decision");
  assert.ok(authzLog);
  assert.equal(authzLog.result, "failure");
  assert.equal(authzLog.metadata.permissionKey, "infrastructure.proxmox.action");
});
