import test from "node:test";
import assert from "node:assert/strict";
import { MediaSessionManager, PARTICIPANT_STATES } from "./mediaSessionManager.js";
import { MediaPolicyEngine } from "./MediaPolicyEngine.js";
import { IdempotencyService } from "./IdempotencyService.js";

function createHarness({ transactionalFacade = null } = {}) {
  const rooms = [];
  const sessions = [];
  const participants = [];
  const transitions = [];
  const audits = [];
  const readiness = [];
  const operationKeys = [];

  const mediaProviderRegistry = {
    get: () => ({
      createRoom: async ({ roomName, roomType = "control-room", metadata = {} }) => ({
        providerRoomId: `provider-room-${roomName}`,
        roomName,
        roomType,
        metadata,
        status: "active",
      }),
      joinSession: async ({ roomName, participantIdentity }) => ({
        providerParticipantId: `provider-participant-${participantIdentity}`,
        roomName,
        connectionDetails: { token: "dev-token", wsUrl: "wss://livekit.example/ws", provider: "livekit" },
      }),
      leaveSession: async ({ providerParticipantId }) => ({ providerParticipantId, status: "left" }),
      applyProducerControl: async ({ providerParticipantId, action }) => ({ providerParticipantId, action, status: "applied" }),
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
    async createParticipantStateTransition(payload) {
      transitions.push(payload);
      return payload;
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
      if (!operation) {
        return null;
      }
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
  };

  const mediaPolicyEngine = new MediaPolicyEngine();
  const idempotencyService = new IdempotencyService({ mediaRepository });

  const manager = new MediaSessionManager({ mediaProviderRegistry, mediaRepository, auditService, mediaPolicyEngine, idempotencyService, transactionalFacade });
  return { manager, rooms, sessions, participants, transitions, audits };
}

test("MediaSessionManager creates and lists sessions", async () => {
  const { manager, sessions, audits } = createHarness();

  const created = await manager.createSession({
    actor: "producer",
    user: { id: "user-1", username: "producer-1" },
    correlationId: "corr-session-create",
    payload: {
      providerKey: "livekit",
      roomName: "control-room-alpha",
      programName: "Morning Live",
      studioId: "studio-1",
      assignmentId: "assignment-1",
    },
  });

  assert.equal(created.session.programName, "Morning Live");
  assert.equal(sessions.length, 1);
  assert.equal(audits.some((entry) => entry.action === "media.session.created"), true);
  assert.equal(audits.some((entry) => entry.action === "media.provider.selected"), true);

  const listed = await manager.listSessions();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].activeParticipants, 0);
});

test("MediaSessionManager enforces participant state transitions", async () => {
  const { manager, participants, transitions } = createHarness();

  const created = await manager.createSession({
    actor: "producer",
    user: { id: "user-1", username: "producer-1" },
    correlationId: "corr-state-create",
    payload: {
      providerKey: "livekit",
      roomName: "control-room-beta",
      programName: "State Show",
    },
  });

  const invited = await manager.inviteParticipant({
    actor: "producer",
    user: { id: "user-1", username: "producer-1" },
    correlationId: "corr-state-invite",
    sessionId: created.session.id,
    payload: {
      participantIdentity: "reporter-1",
      participantRole: "reporter",
      username: "reporter-1",
    },
  });

  assert.equal(invited.participant.lifecycleState, PARTICIPANT_STATES.JOINED);

  await manager.muteParticipant({
    actor: "producer",
    correlationId: "corr-state-mute",
    sessionId: created.session.id,
    participantId: invited.participant.id,
  });

  const muted = participants.find((item) => item.id === invited.participant.id);
  assert.equal(muted.lifecycleState, PARTICIPANT_STATES.MUTED);

  await manager.unmuteParticipant({
    actor: "producer",
    correlationId: "corr-state-unmute",
    sessionId: created.session.id,
    participantId: invited.participant.id,
  });

  const unmuted = participants.find((item) => item.id === invited.participant.id);
  assert.equal(unmuted.lifecycleState, PARTICIPANT_STATES.READY);
  assert.equal(transitions.length >= 3, true);

  await assert.rejects(
    () => manager.recordTransition({
      participant: unmuted,
      toState: PARTICIPANT_STATES.AUTHENTICATED,
      actor: "producer",
      correlationId: "corr-invalid",
      reason: "invalid_transition_test",
    }),
    (error) => error?.code === "VALIDATION_ERROR",
  );
});

test("MediaSessionManager transfer producer and close session", async () => {
  const { manager, sessions, audits } = createHarness();

  const created = await manager.createSession({
    actor: "producer",
    user: { id: "user-1", username: "producer-1" },
    correlationId: "corr-transfer-create",
    payload: {
      providerKey: "livekit",
      roomName: "control-room-gamma",
      programName: "Transfer Show",
    },
  });

  const first = await manager.inviteParticipant({
    actor: "producer",
    user: { id: "user-1", username: "producer-1" },
    correlationId: "corr-transfer-invite-1",
    sessionId: created.session.id,
    payload: {
      participantIdentity: "producer-1",
      participantRole: "producer",
      userId: "user-1",
      username: "producer-1",
    },
  });

  const second = await manager.inviteParticipant({
    actor: "producer",
    user: { id: "user-2", username: "producer-2" },
    correlationId: "corr-transfer-invite-2",
    sessionId: created.session.id,
    payload: {
      participantIdentity: "producer-2",
      participantRole: "producer",
      userId: "user-2",
      username: "producer-2",
    },
  });

  await manager.promoteParticipant({
    actor: "producer",
    correlationId: "corr-transfer-promote",
    sessionId: created.session.id,
    participantId: first.participant.id,
  });

  const transferred = await manager.transferProducer({
    actor: "producer",
    correlationId: "corr-transfer",
    sessionId: created.session.id,
    participantId: second.participant.id,
  });

  assert.equal(transferred.producerUsername, "producer-2");

  const closed = await manager.closeSession({
    actor: "producer",
    correlationId: "corr-close",
    sessionId: created.session.id,
  });

  assert.equal(closed.status, "closed");
  assert.equal(Boolean(closed.endedAt), true);
  assert.equal(audits.some((entry) => entry.action === "media.producer.transferred"), true);
  assert.equal(audits.some((entry) => entry.action === "media.session.closed"), true);
  assert.equal(sessions[0].status, "closed");
});

test("MediaSessionManager readiness report and go-live/stop-live workflows", async () => {
  const { manager, audits } = createHarness();

  const created = await manager.createSession({
    actor: "producer",
    user: { id: "user-1", username: "producer-1" },
    correlationId: "corr-live-create",
    payload: {
      providerKey: "livekit",
      roomName: "control-room-live",
      programName: "Live Show",
    },
  });

  const invited = await manager.inviteParticipant({
    actor: "producer",
    user: { id: "user-2", username: "reporter-1" },
    correlationId: "corr-live-invite",
    sessionId: created.session.id,
    payload: {
      participantIdentity: "reporter-1",
      participantRole: "reporter",
      username: "reporter-1",
    },
  });

  await manager.reportReadiness({
    actor: "producer",
    correlationId: "corr-live-readiness",
    sessionId: created.session.id,
    participantId: invited.participant.id,
    payload: {
      participantId: invited.participant.id,
      cameraReady: true,
      microphoneReady: true,
      speakerReady: true,
      networkQuality: "good",
    },
  });

  const readinessStatus = await manager.getReadinessStatus(created.session.id);
  assert.equal(readinessStatus.summary.canGoLive, true);

  const live = await manager.goLive({
    actor: "producer",
    correlationId: "corr-go-live",
    sessionId: created.session.id,
    expectedVersion: 0,
    idempotencyKey: "go-live-idem-key-12345",
  });
  assert.equal(live.session.status, "live");
  assert.equal(live.replayed, false);

  const replay = await manager.goLive({
    actor: "producer",
    correlationId: "corr-go-live-replay",
    sessionId: created.session.id,
    expectedVersion: 0,
    idempotencyKey: "go-live-idem-key-12345",
  });
  assert.equal(replay.replayed, true);

  const stopped = await manager.stopLive({
    actor: "producer",
    correlationId: "corr-stop-live",
    sessionId: created.session.id,
    expectedVersion: 1,
    idempotencyKey: "stop-live-idem-key-12345",
  });
  assert.equal(stopped.session.status, "active");

  assert.equal(audits.some((entry) => entry.action === "media.readiness.reported"), true);
  assert.equal(audits.some((entry) => entry.action === "media.session.live.started"), true);
  assert.equal(audits.some((entry) => entry.action === "media.session.live.stopped"), true);
  assert.equal(audits.some((entry) => entry.action === "media.operation.idempotent_replay"), true);
});

test("MediaSessionManager returns 409 for version and idempotency conflicts", async () => {
  const { manager, audits } = createHarness();

  const created = await manager.createSession({
    actor: "producer",
    user: { id: "user-1", username: "producer-1" },
    correlationId: "corr-conflict-create",
    payload: {
      providerKey: "livekit",
      roomName: "control-room-conflict",
      programName: "Conflict Show",
    },
  });

  await assert.rejects(
    () => manager.updateSession({
      actor: "producer",
      correlationId: "corr-version-conflict",
      sessionId: created.session.id,
      expectedVersion: 9,
      payload: { notes: "stale write" },
    }),
    (error) => error?.code === "VERSION_CONFLICT" && error?.status === 409,
  );

  assert.equal(audits.some((entry) => entry.action === "media.operation.version_conflict"), true);

  await manager.goLive({
    actor: "producer",
    correlationId: "corr-idem-first",
    sessionId: created.session.id,
    idempotencyKey: "idem-conflict-key-12345",
    expectedVersion: 0,
  }).catch(() => {
    // Readiness is intentionally missing; this call still reserves the operation key.
  });

  await assert.rejects(
    () => manager.goLive({
      actor: "producer",
      correlationId: "corr-idem-second",
      sessionId: created.session.id,
      idempotencyKey: "idem-conflict-key-12345",
      expectedVersion: 1,
    }),
    (error) => error?.code === "VALIDATION_ERROR" && error?.status === 409,
  );
});

test("MediaSessionManager uses transactional facade for expanded mutating operations", async () => {
  let executeCalls = 0;

  const { manager } = createHarness({
    transactionalFacade: {
      async execute(work) {
        executeCalls += 1;
        return work({
          mediaRepository: manager.mediaRepository,
          auditService: manager.auditService,
        });
      },
    },
  });

  const created = await manager.createSession({
    actor: "producer",
    user: { id: "user-1", username: "producer-1" },
    correlationId: "corr-tx-create",
    payload: {
      providerKey: "livekit",
      roomName: "control-room-tx",
      programName: "Transactional Show",
    },
  });

  const invited = await manager.inviteParticipant({
    actor: "producer",
    user: { id: "user-2", username: "reporter-1" },
    correlationId: "corr-tx-invite",
    sessionId: created.session.id,
    payload: {
      participantIdentity: "reporter-tx",
      participantRole: "reporter",
      username: "reporter-tx",
    },
  });

  await manager.updateSession({
    actor: "producer",
    correlationId: "corr-tx-update",
    sessionId: created.session.id,
    payload: { notes: "tx update" },
  });

  await manager.promoteParticipant({
    actor: "producer",
    correlationId: "corr-tx-promote",
    sessionId: created.session.id,
    participantId: invited.participant.id,
  });

  await manager.muteParticipant({
    actor: "producer",
    correlationId: "corr-tx-mute",
    sessionId: created.session.id,
    participantId: invited.participant.id,
  });

  assert.equal(executeCalls >= 5, true);
});
