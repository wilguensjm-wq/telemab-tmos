import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createV1Router } from "./v1.js";
import { setAuthorizationDependencies } from "../middleware/auth.js";
import { errorHandler } from "../middleware/errorHandler.js";

function buildApp({
  role = "Producer",
  permissions = {
    sessionRead: true,
    sessionCreate: true,
    sessionUpdate: true,
    sessionClose: true,
    participantManage: true,
    producerTransfer: true,
  },
}) {
  const authService = {
    verifyToken: async () => ({
      valid: true,
      user: {
        id: "user-producer",
        username: "producer",
        role,
      },
    }),
  };

  const permissionMap = {
    "media.session.read": permissions.sessionRead,
    "media.session.create": permissions.sessionCreate,
    "media.session.update": permissions.sessionUpdate,
    "media.session.close": permissions.sessionClose,
    "media.participant.manage": permissions.participantManage,
    "media.producer.transfer": permissions.producerTransfer,
  };

  const authorizationService = {
    evaluate: async ({ permissionKey }) => ({
      allowed: permissionMap[permissionKey] ?? true,
      reason: (permissionMap[permissionKey] ?? true) ? "permission_granted" : "permission_missing",
      roles: [role],
    }),
  };

  const auditService = {
    record: async () => ({}),
    list: async () => [],
  };

  setAuthorizationDependencies({ authService, authorizationService, auditService });

  const mediaService = {
    createManagedSession: async ({ payload }) => ({
      session: { id: "session-1", programName: payload.programName || "Show", status: "active" },
      room: { id: "room-1", name: payload.roomName || "room-1" },
      participants: [],
    }),
    listManagedSessions: async () => [{ id: "session-1", programName: "Show", status: "active", participants: [] }],
    getManagedSession: async (id) => ({ id, programName: "Show", status: "active", participants: [] }),
    updateManagedSession: async ({ sessionId, payload }) => ({ id: sessionId, ...payload }),
    closeManagedSession: async ({ sessionId }) => ({ id: sessionId, status: "closed" }),
    inviteParticipant: async ({ sessionId, payload }) => ({
      session: { id: sessionId },
      participant: { id: "participant-1", username: payload.username || "reporter" },
      connectionDetails: { token: "dev-token", provider: "livekit" },
    }),
    removeParticipant: async ({ participantId }) => ({ id: participantId, lifecycleState: "disconnected" }),
    muteParticipant: async ({ participantId }) => ({ id: participantId, lifecycleState: "muted", muted: true }),
    unmuteParticipant: async ({ participantId }) => ({ id: participantId, lifecycleState: "ready", muted: false }),
    promoteParticipant: async ({ participantId }) => ({ id: participantId, isProducer: true }),
    demoteParticipant: async ({ participantId }) => ({ id: participantId, isProducer: false }),
    transferProducer: async ({ sessionId }) => ({ id: sessionId, producerUsername: "next-producer" }),

    listCapabilities: () => [],
    listRooms: async () => [],
    createRoom: async () => ({}),
    joinSession: async () => ({}),
    leaveSession: async () => ({}),
    updateDeviceSelection: async () => ({}),
    setPublisherState: async () => ({}),
    applyProducerControl: async () => ({}),
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
    req.correlationId = "corr-media-orch";
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

test("media session orchestration endpoints allow authorized operations", async () => {
  const app = buildApp({});

  await withServer(app, async (baseUrl) => {
    const createResponse = await fetch(`${baseUrl}/api/v1/media/sessions`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ providerKey: "livekit", roomName: "show-room", programName: "Morning Show" }),
    });
    assert.equal(createResponse.status, 201);

    const listResponse = await fetch(`${baseUrl}/api/v1/media/sessions`, {
      headers: { authorization: "Bearer token" },
    });
    assert.equal(listResponse.status, 200);

    const transferResponse = await fetch(`${baseUrl}/api/v1/media/sessions/session-1/transfer`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ participantId: "participant-1" }),
    });
    assert.equal(transferResponse.status, 200);

    const closeResponse = await fetch(`${baseUrl}/api/v1/media/sessions/session-1`, {
      method: "DELETE",
      headers: { authorization: "Bearer token" },
    });
    assert.equal(closeResponse.status, 200);
  });
});

test("media session orchestration denies participant management without permission", async () => {
  const app = buildApp({ permissions: { participantManage: false } });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/media/sessions/session-1/mute`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ participantId: "participant-1" }),
    });

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error.code, "RBAC_DENIED");
  });
});

test("media session orchestration denies producer transfer without permission", async () => {
  const app = buildApp({ permissions: { producerTransfer: false } });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/media/sessions/session-1/transfer`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ participantId: "participant-1" }),
    });

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error.code, "RBAC_DENIED");
  });
});
