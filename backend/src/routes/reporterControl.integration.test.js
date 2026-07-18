import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createV1Router } from "./v1.js";
import { setAuthorizationDependencies } from "../middleware/auth.js";
import { errorHandler } from "../middleware/errorHandler.js";

function buildApp({ role = "Operator", allowWrite = true }) {
  const auditEntries = [];

  const auditService = {
    record: async (entry) => {
      auditEntries.push(entry);
      return entry;
    },
    list: async () => [],
  };

  const reporterService = {
    list: async () => [{ id: "rep-1", fullName: "Reporter One", email: "one@example.com", status: "active" }],
    getById: async (id) => ({ id, fullName: "Reporter One", email: "one@example.com", status: "active" }),
    create: async (payload) => ({ id: "rep-new", ...payload, status: payload.status || "active" }),
    update: async (id, payload) => ({ id, ...payload }),
    remove: async (id) => ({ id }),
  };

  const studioService = {
    list: async () => [{ id: "stu-1", name: "Studio A", location: "HQ", capacity: 2, status: "available" }],
    getById: async (id) => ({ id, name: "Studio A", location: "HQ", capacity: 2, status: "available" }),
    create: async (payload) => ({ id: "stu-new", ...payload, status: payload.status || "available" }),
    update: async (id, payload) => ({ id, ...payload }),
    remove: async (id) => ({ id }),
  };

  const assignmentService = {
    list: async () => [{ id: "asg-1", title: "Morning", reporterId: "rep-1", studioId: "stu-1", assignmentStatus: "scheduled" }],
    getById: async (id) => ({ id, title: "Morning", reporterId: "rep-1", studioId: "stu-1", assignmentStatus: "scheduled" }),
    create: async (payload) => ({ id: "asg-new", ...payload, assignmentStatus: payload.assignmentStatus || "scheduled" }),
    update: async (id, payload) => ({ id, ...payload }),
    remove: async (id) => ({ id }),
  };

  const authService = {
    verifyToken: async () => ({
      valid: true,
      user: {
        id: "user-1",
        username: "operator",
        role,
      },
    }),
  };

  const authorizationService = {
    evaluate: async ({ permissionKey }) => {
      if (!allowWrite && ["reporters.write", "studios.write", "assignments.write"].includes(permissionKey)) {
        return { allowed: false, reason: "permission_missing", roles: [role] };
      }
      return { allowed: true, reason: "permission_granted", roles: [role] };
    },
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

  const eventService = { publish: async () => ({ ok: true }), list: async () => [] };
  const platformConfigService = { list: async () => [] };
  const databaseService = { health: async () => ({ status: "ok" }) };

  setAuthorizationDependencies({ authService, authorizationService, auditService });

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.correlationId = "corr-reporter-control";
    next();
  });
  app.use("/api/v1", createV1Router({
    orchestration,
    authService,
    auditService,
    eventService,
    platformConfigService,
    databaseService,
    reporterService,
    studioService,
    assignmentService,
  }));
  app.use(errorHandler);

  return { app, auditEntries };
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

test("reporter control read endpoint returns data for authorized user", async () => {
  const { app } = buildApp({ role: "Viewer", allowWrite: false });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/reporters`, {
      headers: { authorization: "Bearer token" },
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(Array.isArray(body.data), true);
    assert.equal(body.data.length, 1);
  });
});

test("reporter control write endpoint denies viewer and returns 403", async () => {
  const { app } = buildApp({ role: "Viewer", allowWrite: false });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/reporters`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ fullName: "New Reporter", email: "new@tmos.local" }),
    });

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error.code, "RBAC_DENIED");
  });
});

test("reporter control write endpoints create audit records for CUD operations", async () => {
  const { app, auditEntries } = buildApp({ role: "Operator", allowWrite: true });

  await withServer(app, async (baseUrl) => {
    const headers = {
      authorization: "Bearer token",
      "content-type": "application/json",
    };

    const createResponse = await fetch(`${baseUrl}/api/v1/reporters`, {
      method: "POST",
      headers,
      body: JSON.stringify({ fullName: "New Reporter", email: "new@tmos.local" }),
    });
    assert.equal(createResponse.status, 201);

    const updateResponse = await fetch(`${baseUrl}/api/v1/studios/stu-1`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status: "maintenance" }),
    });
    assert.equal(updateResponse.status, 200);

    const deleteResponse = await fetch(`${baseUrl}/api/v1/assignments/asg-1`, {
      method: "DELETE",
      headers: {
        authorization: "Bearer token",
      },
    });
    assert.equal(deleteResponse.status, 200);
  });

  const actions = auditEntries.map((entry) => entry.action);
  assert.equal(actions.includes("reporter.create"), true);
  assert.equal(actions.includes("studio.update"), true);
  assert.equal(actions.includes("assignment.delete"), true);
});
