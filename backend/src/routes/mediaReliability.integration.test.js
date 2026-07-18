import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createV1Router } from "./v1.js";
import { setAuthorizationDependencies } from "../middleware/auth.js";
import { errorHandler } from "../middleware/errorHandler.js";
import { MediaService } from "../services/mediaService.js";
import { MediaSessionManager } from "../services/mediaSessionManager.js";
import { MediaPolicyEngine } from "../services/MediaPolicyEngine.js";
import { IdempotencyService } from "../services/IdempotencyService.js";

function createMediaHarness() {
  const rooms = [];
  const sessions = [];
  const participants = [];
  const readiness = [];
  const operationKeys = [];
  const audits = [];

  const mediaProviderRegistry = {
    listCapabilities: () => [{ key: "livekit", provider: "livekit" }],
    get: () => ({
      createRoom: async ({ roomName, roomType = "control-room", metadata = {} }) => ({
        providerRoomId: `provider-room-${roomName}`,
        roomName,
        roomType,
        metadata,
        status: "active",
      }),
      joinSession: async ({ participantIdentity }) => ({
        providerParticipantId: `provider-participant-${participantIdentity}`,
        connectionDetails: { token: "dev-token", provider: "livekit" },
      }),
      leaveSession: async () => ({ status: "left" }),
      applyProducerControl: async () => ({ status: "applied" }),
      updateDeviceSelection: async () => ({ status: "updated" }),
      setPublisherState: async () => ({ status: "updated" }),
    }),
  };

  const mediaRepository = {
    async createRoom(payload) {
      const room = {
        id: `room-${rooms.length + 1}`,
        providerKey: payload.providerKey,
        providerRoomId: payload.providerRoomId,
        name: payload.name,
        roomType: payload.roomType,
        status: payload.status,
        metadata: payload.metadata || {},
        createdBy: payload.createdBy,
      };
      rooms.push(room);
      return room;
    },
    async listRooms() {
      return rooms;
    },
    async findRoomById(roomId) {
      return rooms.find((item) => item.id === roomId) || null;
    },
    async createSession(payload) {
      const session = {
        id: `session-${sessions.length + 1}`,
        roomId: payload.roomId,
        programName: payload.programName,
        assignmentId: payload.assignmentId,
        studioId: payload.studioId,
        producerUserId: payload.producerUserId,
        producerUsername: payload.producerUsername,
        status: payload.status || "active",
        recordingEnabled: Boolean(payload.recordingEnabled),
        notes: payload.notes || null,
        version: payload.version ?? 0,
        startedAt: payload.startedAt || new Date().toISOString(),
        endedAt: payload.endedAt || null,
        metadata: payload.metadata || {},
      };
      sessions.push(session);
      return session;
    },
    async listSessions() {
      return sessions;
    },
    async findSessionById(sessionId) {
      return sessions.find((item) => item.id === sessionId) || null;
    },
    async updateSession(sessionId, patch) {
      const session = sessions.find((item) => item.id === sessionId);
      if (!session) return null;
      if (patch.expectedVersion !== undefined && patch.expectedVersion !== null && patch.expectedVersion !== session.version) {
        return null;
      }
      Object.assign(session, patch);
      delete session.expectedVersion;
      session.version += 1;
      return session;
    },
    async createParticipant(payload) {
      const participant = {
        id: `participant-${participants.length + 1}`,
        connectionStatus: payload.connectionStatus || "connected",
        lifecycleState: payload.lifecycleState || "connected",
        isProducer: Boolean(payload.isProducer),
        invitedBy: payload.invitedBy || null,
        metadata: payload.metadata || {},
        muted: Boolean(payload.muted),
        ...payload,
      };
      participants.push(participant);
      return participant;
    },
    async listParticipantsBySession(sessionId) {
      return participants.filter((item) => item.sessionId === sessionId);
    },
    async findParticipantById(participantId) {
      return participants.find((item) => item.id === participantId) || null;
    },
    async updateParticipant(participantId, patch) {
      const participant = participants.find((item) => item.id === participantId);
      if (!participant) return null;
      Object.assign(participant, patch);
      return participant;
    },
    async createParticipantStateTransition() {
      return {};
    },
    async upsertSessionReadiness(payload) {
      const existing = readiness.find((item) => item.sessionId === payload.sessionId && item.participantId === payload.participantId);
      const next = {
        id: existing?.id || `readiness-${readiness.length + 1}`,
        sessionId: payload.sessionId,
        participantId: payload.participantId,
        cameraReady: payload.cameraReady,
        microphoneReady: payload.microphoneReady,
        speakerReady: payload.speakerReady,
        networkQuality: payload.networkQuality,
        metadata: payload.metadata || {},
        lastReportedAt: new Date().toISOString(),
      };
      if (existing) {
        Object.assign(existing, next);
      } else {
        readiness.push(next);
      }
      return next;
    },
    async listSessionReadiness(sessionId) {
      return readiness
        .filter((item) => item.sessionId === sessionId)
        .map((item) => ({
          ...item,
          username: participants.find((participant) => participant.id === item.participantId)?.username || null,
        }));
    },
    async findOperationKey(operationKey) {
      return operationKeys.find((item) => item.operationKey === operationKey) || null;
    },
    async createOperationKey(payload) {
      const created = {
        id: `op-${operationKeys.length + 1}`,
        operationKey: payload.operationKey,
        endpoint: payload.endpoint,
        actor: payload.actor,
        correlationId: payload.correlationId,
        requestHash: payload.requestHash,
        responseHash: null,
        responsePayload: null,
        createdAt: new Date().toISOString(),
        expiresAt: payload.expiresAt,
      };
      operationKeys.push(created);
      return created;
    },
    async completeOperationKey({ operationKey, responseHash, responsePayload }) {
      const operation = operationKeys.find((item) => item.operationKey === operationKey);
      if (!operation) return null;
      operation.responseHash = responseHash;
      operation.responsePayload = responsePayload;
      return operation;
    },
  };

  const auditService = {
    async record(entry) {
      audits.push(entry);
      return entry;
    },
    async list() {
      return audits;
    },
  };

  const mediaSessionManager = new MediaSessionManager({
    mediaProviderRegistry,
    mediaRepository,
    auditService,
    mediaPolicyEngine: new MediaPolicyEngine(),
    idempotencyService: new IdempotencyService({ mediaRepository }),
  });

  const mediaService = new MediaService({
    mediaProviderRegistry,
    mediaRepository,
    auditService,
    mediaSessionManager,
  });

  return { mediaService, auditService, audits };
}

function buildApp({ permissions = {} } = {}) {
  const { mediaService, auditService, audits } = createMediaHarness();

  const authService = {
    verifyToken: async () => ({
      valid: true,
      user: {
        id: "user-producer",
        username: "producer",
        role: "Producer",
      },
    }),
  };

  const defaultPermissionMap = {
    "media.session.read": true,
    "media.session.create": true,
    "media.session.update": true,
    "media.session.close": true,
    "media.participant.manage": true,
    "media.producer.transfer": true,
    "media.session.readiness.read": true,
    "media.session.readiness.write": true,
    "media.session.live.control": true,
  };

  const permissionMap = {
    ...defaultPermissionMap,
    ...permissions,
  };

  const authorizationService = {
    evaluate: async ({ permissionKey }) => ({
      allowed: permissionMap[permissionKey] ?? true,
      reason: (permissionMap[permissionKey] ?? true) ? "permission_granted" : "permission_missing",
      roles: ["Producer"],
    }),
  };

  setAuthorizationDependencies({ authService, authorizationService, auditService });

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.correlationId = "corr-media-reliability";
    next();
  });

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

  app.use("/api/v1", createV1Router({
    orchestration,
    authService,
    auditService,
    eventService: { publish: async () => ({}), list: async () => [] },
    platformConfigService: { list: async () => [] },
    databaseService: { health: async () => ({ status: "ok" }) },
    reporterService: { list: async () => [] },
    studioService: { list: async () => [] },
    assignmentService: { list: async () => [] },
    presenceService: { list: async () => [] },
    mediaService,
  }));
  app.use(errorHandler);

  return { app, audits };
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

test("media reliability workflow covers readiness, go-live, replay, stop-live, and audit events", async () => {
  const { app, audits } = buildApp();

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
    const created = await createResponse.json();
    const sessionId = created.data.session.id;

    const inviteResponse = await fetch(`${baseUrl}/api/v1/media/sessions/${sessionId}/participants`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ participantIdentity: "reporter-1", participantRole: "reporter", username: "reporter-1" }),
    });
    assert.equal(inviteResponse.status, 201);
    const invited = await inviteResponse.json();
    const participantId = invited.data.participant.id;

    const readinessResponse = await fetch(`${baseUrl}/api/v1/media/sessions/${sessionId}/readiness`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        participantId,
        cameraReady: true,
        microphoneReady: true,
        speakerReady: true,
        networkQuality: "good",
      }),
    });
    assert.equal(readinessResponse.status, 201);

    const readinessStatusResponse = await fetch(`${baseUrl}/api/v1/media/sessions/${sessionId}/readiness`, {
      headers: {
        authorization: "Bearer token",
      },
    });
    assert.equal(readinessStatusResponse.status, 200);
    const readinessStatus = await readinessStatusResponse.json();
    assert.equal(readinessStatus.data.summary.canGoLive, true);

    const goLiveResponse = await fetch(`${baseUrl}/api/v1/media/sessions/${sessionId}/go-live`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "if-match-version": "0",
        "idempotency-key": "go-live-replay-key-12345",
      },
    });
    assert.equal(goLiveResponse.status, 200);
    const goLiveBody = await goLiveResponse.json();
    assert.equal(goLiveBody.data.session.status, "live");
    assert.equal(goLiveBody.data.replayed, false);

    const replayResponse = await fetch(`${baseUrl}/api/v1/media/sessions/${sessionId}/go-live`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "if-match-version": "0",
        "idempotency-key": "go-live-replay-key-12345",
      },
    });
    assert.equal(replayResponse.status, 200);
    const replayBody = await replayResponse.json();
    assert.equal(replayBody.data.replayed, true);

    const stopResponse = await fetch(`${baseUrl}/api/v1/media/sessions/${sessionId}/stop-live`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "if-match-version": "1",
        "idempotency-key": "stop-live-key-12345",
      },
    });
    assert.equal(stopResponse.status, 200);
    const stopBody = await stopResponse.json();
    assert.equal(stopBody.data.session.status, "active");
  });

  assert.equal(audits.some((entry) => entry.action === "media.readiness.reported"), true);
  assert.equal(audits.some((entry) => entry.action === "media.session.live.started"), true);
  assert.equal(audits.some((entry) => entry.action === "media.session.live.stopped"), true);
  assert.equal(audits.some((entry) => entry.action === "media.operation.idempotent_replay"), true);
});

test("media reliability returns idempotency conflict and optimistic concurrency conflict", async () => {
  const { app, audits } = buildApp();

  await withServer(app, async (baseUrl) => {
    const createResponse = await fetch(`${baseUrl}/api/v1/media/sessions`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ providerKey: "livekit", roomName: "show-room-2", programName: "Evening Show" }),
    });
    const created = await createResponse.json();
    const sessionId = created.data.session.id;

    const firstGoLive = await fetch(`${baseUrl}/api/v1/media/sessions/${sessionId}/go-live`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "if-match-version": "0",
        "idempotency-key": "go-live-conflict-key-12345",
      },
    });
    assert.equal(firstGoLive.status, 409);

    const idempotencyConflict = await fetch(`${baseUrl}/api/v1/media/sessions/${sessionId}/go-live`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "if-match-version": "1",
        "idempotency-key": "go-live-conflict-key-12345",
      },
    });
    assert.equal(idempotencyConflict.status, 409);
    const idempotencyBody = await idempotencyConflict.json();
    assert.equal(idempotencyBody.error.code, "VALIDATION_ERROR");

    const inviteResponse = await fetch(`${baseUrl}/api/v1/media/sessions/${sessionId}/participants`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ participantIdentity: "reporter-2", participantRole: "reporter", username: "reporter-2" }),
    });
    const invited = await inviteResponse.json();

    await fetch(`${baseUrl}/api/v1/media/sessions/${sessionId}/readiness`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        participantId: invited.data.participant.id,
        cameraReady: true,
        microphoneReady: true,
        speakerReady: true,
        networkQuality: "good",
      }),
    });

    const liveResponse = await fetch(`${baseUrl}/api/v1/media/sessions/${sessionId}/go-live`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "if-match-version": "0",
        "idempotency-key": "go-live-ok-key-12345",
      },
    });
    assert.equal(liveResponse.status, 200);

    const versionConflict = await fetch(`${baseUrl}/api/v1/media/sessions/${sessionId}/stop-live`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "if-match-version": "0",
        "idempotency-key": "stop-live-conflict-key-12345",
      },
    });
    assert.equal(versionConflict.status, 409);
    const versionBody = await versionConflict.json();
    assert.equal(versionBody.error.code, "VERSION_CONFLICT");
  });

  assert.equal(audits.some((entry) => entry.action === "media.operation.version_conflict"), true);
});

test("media reliability endpoints enforce RBAC permissions", async () => {
  const { app } = buildApp({
    permissions: {
      "media.session.live.control": false,
      "media.session.readiness.write": false,
    },
  });

  await withServer(app, async (baseUrl) => {
    const createResponse = await fetch(`${baseUrl}/api/v1/media/sessions`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ providerKey: "livekit", roomName: "show-room-3", programName: "Denied Show" }),
    });
    const created = await createResponse.json();
    const sessionId = created.data.session.id;

    const readinessResponse = await fetch(`${baseUrl}/api/v1/media/sessions/${sessionId}/readiness`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        participantId: "participant-unknown",
        cameraReady: true,
        microphoneReady: true,
        speakerReady: true,
        networkQuality: "good",
      }),
    });
    assert.equal(readinessResponse.status, 403);

    const goLiveResponse = await fetch(`${baseUrl}/api/v1/media/sessions/${sessionId}/go-live`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "if-match-version": "0",
        "idempotency-key": "deny-go-live-key-12345",
      },
    });
    assert.equal(goLiveResponse.status, 403);
  });
});
