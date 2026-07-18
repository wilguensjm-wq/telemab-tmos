import { TmosError } from "../errors/TmosError.js";

export const PARTICIPANT_STATES = Object.freeze({
  OFFLINE: "offline",
  AUTHENTICATED: "authenticated",
  CONNECTED: "connected",
  JOINED: "joined",
  READY: "ready",
  LIVE: "live",
  MUTED: "muted",
  DISCONNECTED: "disconnected",
});

const ALLOWED_TRANSITIONS = Object.freeze({
  [PARTICIPANT_STATES.OFFLINE]: [PARTICIPANT_STATES.AUTHENTICATED],
  [PARTICIPANT_STATES.AUTHENTICATED]: [PARTICIPANT_STATES.CONNECTED, PARTICIPANT_STATES.DISCONNECTED],
  [PARTICIPANT_STATES.CONNECTED]: [PARTICIPANT_STATES.JOINED, PARTICIPANT_STATES.DISCONNECTED],
  [PARTICIPANT_STATES.JOINED]: [PARTICIPANT_STATES.READY, PARTICIPANT_STATES.MUTED, PARTICIPANT_STATES.DISCONNECTED],
  [PARTICIPANT_STATES.READY]: [PARTICIPANT_STATES.LIVE, PARTICIPANT_STATES.MUTED, PARTICIPANT_STATES.DISCONNECTED],
  [PARTICIPANT_STATES.LIVE]: [PARTICIPANT_STATES.READY, PARTICIPANT_STATES.MUTED, PARTICIPANT_STATES.DISCONNECTED],
  [PARTICIPANT_STATES.MUTED]: [PARTICIPANT_STATES.READY, PARTICIPANT_STATES.LIVE, PARTICIPANT_STATES.DISCONNECTED],
  [PARTICIPANT_STATES.DISCONNECTED]: [PARTICIPANT_STATES.CONNECTED],
});

function requireNonEmpty(value, field) {
  if (!value || !String(value).trim()) {
    throw new TmosError({
      code: "VALIDATION_ERROR",
      message: `${field} is required`,
      status: 400,
      details: { field },
    });
  }
}

function transitionEventName(toState) {
  if (toState === PARTICIPANT_STATES.JOINED) return "media.participant.joined";
  if (toState === PARTICIPANT_STATES.DISCONNECTED) return "media.participant.left";
  if (toState === PARTICIPANT_STATES.MUTED) return "media.participant.muted";
  if (toState === PARTICIPANT_STATES.READY || toState === PARTICIPANT_STATES.LIVE) return "media.participant.ready";
  return "media.participant.transitioned";
}

export class MediaSessionManager {
  constructor({ mediaProviderRegistry, mediaRepository, auditService, mediaPolicyEngine = null, idempotencyService = null, transactionalFacade = null }) {
    this.mediaProviderRegistry = mediaProviderRegistry;
    this.mediaRepository = mediaRepository;
    this.auditService = auditService;
    this.mediaPolicyEngine = mediaPolicyEngine;
    this.idempotencyService = idempotencyService;
    this.transactionalFacade = transactionalFacade;
  }

  async raiseVersionConflict({ actor, correlationId, sessionId, expectedVersion }) {
    await this.auditService.record({
      actor,
      action: "media.operation.version_conflict",
      target: sessionId,
      result: "failure",
      provider: "tmos",
      correlationId,
      metadata: {
        sessionId,
        expectedVersion,
      },
    });

    throw new TmosError({
      code: "VERSION_CONFLICT",
      message: "Session version conflict",
      status: 409,
      details: {
        sessionId,
        expectedVersion,
      },
    });
  }

  async executeCritical(work) {
    if (!this.transactionalFacade) {
      return work({
        mediaRepository: this.mediaRepository,
        auditService: this.auditService,
      });
    }

    return this.transactionalFacade.execute(work);
  }

  ensurePolicyEngine() {
    if (!this.mediaPolicyEngine) {
      throw new TmosError({
        code: "INTERNAL_ERROR",
        message: "Media policy engine is not configured",
        status: 500,
      });
    }
    return this.mediaPolicyEngine;
  }

  async withIdempotency({ idempotencyKey, endpoint, actor, correlationId, payload, work }) {
    if (!this.idempotencyService || idempotencyKey === undefined || idempotencyKey === null) {
      return work();
    }

    const begin = await this.idempotencyService.begin({
      idempotencyKey,
      endpoint,
      actor,
      correlationId,
      payload,
    });

    if (begin.replay) {
      await this.auditService.record({
        actor,
        action: "media.operation.idempotent_replay",
        target: endpoint,
        result: "success",
        provider: "tmos",
        correlationId,
        metadata: {
          endpoint,
          operationKey: begin.operation.operationKey,
        },
      });

      if (begin.operation.responsePayload) {
        return {
          ...begin.operation.responsePayload,
          replayed: true,
        };
      }
      throw new TmosError({
        code: "VALIDATION_ERROR",
        message: "Idempotent request is in progress and has no replayable result yet",
        status: 409,
        details: { operationKey: begin.operation.operationKey },
      });
    }

    const response = await work();
    await this.idempotencyService.complete({
      operationKey: begin.operation.operationKey,
      responsePayload: response,
    });
    return response;
  }

  validateTransition(fromState, toState) {
    if (fromState === toState) {
      return;
    }

    const allowed = ALLOWED_TRANSITIONS[fromState] || [];
    if (!allowed.includes(toState)) {
      throw new TmosError({
        code: "VALIDATION_ERROR",
        message: `Invalid participant state transition: ${fromState} -> ${toState}`,
        status: 400,
        details: {
          fromState,
          toState,
          allowed,
        },
      });
    }
  }

  async recordTransition({ participant, toState, actor, correlationId, reason = null, metadata = {}, mediaRepository = this.mediaRepository, auditService = this.auditService }) {
    this.validateTransition(participant.lifecycleState, toState);

    const updated = await mediaRepository.updateParticipant(participant.id, {
      lifecycleState: toState,
      connectionStatus: toState === PARTICIPANT_STATES.DISCONNECTED ? "left" : participant.connectionStatus,
    });

    await mediaRepository.createParticipantStateTransition({
      participantId: participant.id,
      sessionId: participant.sessionId,
      fromState: participant.lifecycleState,
      toState,
      reason,
      actor,
      correlationId,
      metadata,
    });

    await auditService.record({
      actor,
      action: transitionEventName(toState),
      target: participant.id,
      result: "success",
      provider: metadata.providerKey || "tmos",
      correlationId,
      metadata: {
        sessionId: participant.sessionId,
        roomId: participant.roomId,
        fromState: participant.lifecycleState,
        toState,
        reason,
      },
    });

    return updated;
  }

  async createSession({ actor, user, correlationId, payload = {} }) {
    requireNonEmpty(payload.programName, "programName");
    requireNonEmpty(payload.providerKey, "providerKey");
    requireNonEmpty(payload.roomName, "roomName");

    const provider = this.mediaProviderRegistry.get(payload.providerKey);
    await this.auditService.record({
      actor,
      action: "media.provider.selected",
      target: payload.providerKey,
      result: "success",
      provider: payload.providerKey,
      correlationId,
      metadata: {
        operation: "media.session.created",
        roomName: payload.roomName,
      },
    });

    const providerRoom = await provider.createRoom({
      roomName: payload.roomName,
      roomType: payload.roomType || "control-room",
      metadata: payload.metadata || {},
    });

    return this.executeCritical(async ({ mediaRepository, auditService }) => {
      const room = await mediaRepository.createRoom({
        providerKey: payload.providerKey,
        providerRoomId: providerRoom.providerRoomId,
        name: providerRoom.roomName,
        roomType: providerRoom.roomType || payload.roomType || "control-room",
        status: providerRoom.status || "active",
        metadata: providerRoom.metadata || payload.metadata || {},
        createdBy: actor,
      });

      const session = await mediaRepository.createSession({
        roomId: room.id,
        programName: payload.programName,
        assignmentId: payload.assignmentId || null,
        studioId: payload.studioId || null,
        producerUserId: user?.id || null,
        producerUsername: payload.producerUsername || user?.username || actor,
        status: payload.status || "active",
        recordingEnabled: Boolean(payload.recordingEnabled),
        notes: payload.notes || null,
        metadata: payload.metadata || {},
      });

      await auditService.record({
        actor,
        action: "media.session.created",
        target: session.id,
        result: "success",
        provider: payload.providerKey,
        correlationId,
        metadata: {
          roomId: room.id,
          programName: session.programName,
          producerUsername: session.producerUsername,
        },
      });

      return {
        session,
        room,
        participants: [],
      };
    });
  }

  async listSessions() {
    const sessions = await this.mediaRepository.listSessions();
    return Promise.all(
      sessions.map(async (session) => {
        const [room, participants] = await Promise.all([
          this.mediaRepository.findRoomById(session.roomId),
          this.mediaRepository.listParticipantsBySession(session.id),
        ]);

        return {
          ...session,
          room,
          activeParticipants: participants.filter((item) => item.lifecycleState !== PARTICIPANT_STATES.DISCONNECTED).length,
          participants,
        };
      }),
    );
  }

  async getSession(sessionId) {
    requireNonEmpty(sessionId, "sessionId");

    const session = await this.mediaRepository.findSessionById(sessionId);
    if (!session) {
      throw new TmosError({
        code: "RESOURCE_NOT_FOUND",
        message: "Media session not found",
        status: 404,
        details: { sessionId },
      });
    }

    const [room, participants] = await Promise.all([
      this.mediaRepository.findRoomById(session.roomId),
      this.mediaRepository.listParticipantsBySession(session.id),
    ]);

    return {
      ...session,
      room,
      activeParticipants: participants.filter((item) => item.lifecycleState !== PARTICIPANT_STATES.DISCONNECTED).length,
      participants,
    };
  }

  async updateSession({ actor, correlationId, sessionId, payload = {}, expectedVersion = undefined }) {
    const existing = await this.mediaRepository.findSessionById(sessionId);
    if (!existing) {
      throw new TmosError({
        code: "RESOURCE_NOT_FOUND",
        message: "Media session not found",
        status: 404,
        details: { sessionId },
      });
    }

    return this.executeCritical(async ({ mediaRepository, auditService }) => {
      const updated = await mediaRepository.updateSession(sessionId, {
        programName: payload.programName,
        assignmentId: payload.assignmentId,
        studioId: payload.studioId,
        producerUserId: payload.producerUserId,
        producerUsername: payload.producerUsername,
        status: payload.status,
        recordingEnabled: payload.recordingEnabled,
        notes: payload.notes,
        metadata: payload.metadata,
        expectedVersion,
      });

      if (!updated && expectedVersion !== undefined && expectedVersion !== null) {
        await this.raiseVersionConflict({ actor, correlationId, sessionId, expectedVersion });
      }

      await auditService.record({
        actor,
        action: "media.session.updated",
        target: sessionId,
        result: "success",
        provider: "tmos",
        correlationId,
        metadata: {
          changes: payload,
          expectedVersion,
        },
      });

      return updated;
    });
  }

  async reportReadiness({ actor, correlationId, sessionId, participantId, payload = {} }) {
    requireNonEmpty(sessionId, "sessionId");
    requireNonEmpty(participantId, "participantId");

    const session = await this.mediaRepository.findSessionById(sessionId);
    if (!session) {
      throw new TmosError({
        code: "RESOURCE_NOT_FOUND",
        message: "Media session not found",
        status: 404,
        details: { sessionId },
      });
    }

    const participant = await this.ensureParticipantInSession(sessionId, participantId);
    const validatedPayload = this.ensurePolicyEngine().validateReadinessPayload(payload);

    return this.executeCritical(async ({ mediaRepository, auditService }) => {
      const readiness = await mediaRepository.upsertSessionReadiness({
        sessionId,
        participantId,
        cameraReady: validatedPayload.cameraReady,
        microphoneReady: validatedPayload.microphoneReady,
        speakerReady: validatedPayload.speakerReady,
        networkQuality: validatedPayload.networkQuality,
        metadata: validatedPayload.metadata,
      });

      await auditService.record({
        actor,
        action: "media.readiness.reported",
        target: participantId,
        result: "success",
        provider: "tmos",
        correlationId,
        metadata: {
          sessionId,
          participantId,
          username: participant.username,
          readiness: {
            cameraReady: readiness.cameraReady,
            microphoneReady: readiness.microphoneReady,
            speakerReady: readiness.speakerReady,
            networkQuality: readiness.networkQuality,
          },
        },
      });

      return readiness;
    });
  }

  async getReadinessStatus(sessionId) {
    requireNonEmpty(sessionId, "sessionId");
    const session = await this.mediaRepository.findSessionById(sessionId);
    if (!session) {
      throw new TmosError({
        code: "RESOURCE_NOT_FOUND",
        message: "Media session not found",
        status: 404,
        details: { sessionId },
      });
    }

    const readiness = await this.mediaRepository.listSessionReadiness(sessionId);
    const summary = this.ensurePolicyEngine().evaluateSessionReadiness({ readinessRows: readiness });

    return {
      sessionId,
      sessionStatus: session.status,
      sessionVersion: session.version,
      readiness,
      summary,
    };
  }

  async goLive({ actor, correlationId, sessionId, expectedVersion = undefined, idempotencyKey = undefined }) {
    return this.withIdempotency({
      idempotencyKey,
      endpoint: "media.session.go_live",
      actor,
      correlationId,
      payload: {
        sessionId,
        expectedVersion,
        action: "go_live",
      },
      work: async () => {
        const session = await this.mediaRepository.findSessionById(sessionId);
        const readinessRows = await this.mediaRepository.listSessionReadiness(sessionId);
        const summary = this.ensurePolicyEngine().evaluateSessionReadiness({ readinessRows });
        this.ensurePolicyEngine().assertCanGoLive({ session, readinessSummary: summary });

        const updated = await this.executeCritical(async ({ mediaRepository, auditService }) => {
          const next = await mediaRepository.updateSession(sessionId, {
            status: "live",
            expectedVersion,
          });

          if (!next && expectedVersion !== undefined && expectedVersion !== null) {
            await this.raiseVersionConflict({ actor, correlationId, sessionId, expectedVersion });
          }

          await auditService.record({
            actor,
            action: "media.session.live.started",
            target: sessionId,
            result: "success",
            provider: "tmos",
            correlationId,
            metadata: {
              expectedVersion,
              readinessSummary: summary,
            },
          });

          return next;
        });

        return {
          session: updated,
          readinessSummary: summary,
          replayed: false,
        };
      },
    });
  }

  async stopLive({ actor, correlationId, sessionId, expectedVersion = undefined, idempotencyKey = undefined }) {
    return this.withIdempotency({
      idempotencyKey,
      endpoint: "media.session.stop_live",
      actor,
      correlationId,
      payload: {
        sessionId,
        expectedVersion,
        action: "stop_live",
      },
      work: async () => {
        const session = await this.mediaRepository.findSessionById(sessionId);
        this.ensurePolicyEngine().assertCanStopLive({ session });

        const updated = await this.executeCritical(async ({ mediaRepository, auditService }) => {
          const next = await mediaRepository.updateSession(sessionId, {
            status: "active",
            expectedVersion,
          });

          if (!next && expectedVersion !== undefined && expectedVersion !== null) {
            await this.raiseVersionConflict({ actor, correlationId, sessionId, expectedVersion });
          }

          await auditService.record({
            actor,
            action: "media.session.live.stopped",
            target: sessionId,
            result: "success",
            provider: "tmos",
            correlationId,
            metadata: {
              expectedVersion,
            },
          });

          return next;
        });

        return {
          session: updated,
          replayed: false,
        };
      },
    });
  }

  async closeSession({ actor, correlationId, sessionId }) {
    const session = await this.mediaRepository.findSessionById(sessionId);
    if (!session) {
      throw new TmosError({
        code: "RESOURCE_NOT_FOUND",
        message: "Media session not found",
        status: 404,
        details: { sessionId },
      });
    }

    const room = await this.mediaRepository.findRoomById(session.roomId);
    const provider = this.mediaProviderRegistry.get(room.providerKey);
    const participants = await this.mediaRepository.listParticipantsBySession(sessionId);

    const activeParticipants = participants.filter((participant) => participant.lifecycleState !== PARTICIPANT_STATES.DISCONNECTED);
    for (const participant of activeParticipants) {
      await provider.leaveSession({ providerParticipantId: participant.providerParticipantId });
    }

    return this.executeCritical(async ({ mediaRepository, auditService }) => {
      for (const participant of activeParticipants) {
        await this.recordTransition({
          participant,
          toState: PARTICIPANT_STATES.DISCONNECTED,
          actor,
          correlationId,
          reason: "session_closed",
          metadata: { providerKey: room.providerKey },
          mediaRepository,
          auditService,
        });
      }

      const updatedSession = await mediaRepository.updateSession(sessionId, {
        status: "closed",
        endedAt: new Date().toISOString(),
      });

      await auditService.record({
        actor,
        action: "media.session.closed",
        target: sessionId,
        result: "success",
        provider: room.providerKey,
        correlationId,
        metadata: {
          roomId: room.id,
          participantCount: participants.length,
        },
      });

      return updatedSession;
    });
  }

  async inviteParticipant({ actor, user, correlationId, sessionId, payload = {} }) {
    requireNonEmpty(sessionId, "sessionId");
    requireNonEmpty(payload.participantIdentity, "participantIdentity");

    const session = await this.mediaRepository.findSessionById(sessionId);
    if (!session) {
      throw new TmosError({
        code: "RESOURCE_NOT_FOUND",
        message: "Media session not found",
        status: 404,
        details: { sessionId },
      });
    }

    const room = await this.mediaRepository.findRoomById(session.roomId);
    const provider = this.mediaProviderRegistry.get(room.providerKey);

    const joined = await provider.joinSession({
      roomName: room.name,
      participantIdentity: payload.participantIdentity,
      role: payload.participantRole || "reporter",
      metadata: payload.metadata || {},
    });

    return this.executeCritical(async ({ mediaRepository, auditService }) => {
      const participant = await mediaRepository.createParticipant({
        sessionId,
        roomId: room.id,
        providerParticipantId: joined.providerParticipantId,
        userId: payload.userId || user?.id || null,
        username: payload.username || payload.participantIdentity,
        reporterId: payload.reporterId || null,
        participantRole: payload.participantRole || "reporter",
        lifecycleState: PARTICIPANT_STATES.JOINED,
        invitedBy: actor,
        metadata: payload.metadata || {},
      });

      await mediaRepository.createParticipantStateTransition({
        participantId: participant.id,
        sessionId,
        fromState: PARTICIPANT_STATES.CONNECTED,
        toState: PARTICIPANT_STATES.JOINED,
        reason: "invited",
        actor,
        correlationId,
        metadata: { providerKey: room.providerKey },
      });

      await auditService.record({
        actor,
        action: "media.participant.joined",
        target: participant.id,
        result: "success",
        provider: room.providerKey,
        correlationId,
        metadata: {
          sessionId,
          roomId: room.id,
          participantRole: participant.participantRole,
        },
      });

      return {
        session,
        room,
        participant,
        connectionDetails: joined.connectionDetails || null,
      };
    });
  }

  async removeParticipant({ actor, correlationId, sessionId, participantId }) {
    const session = await this.mediaRepository.findSessionById(sessionId);
    if (!session) {
      throw new TmosError({
        code: "RESOURCE_NOT_FOUND",
        message: "Media session not found",
        status: 404,
        details: { sessionId },
      });
    }

    const participant = await this.mediaRepository.findParticipantById(participantId);
    if (!participant || participant.sessionId !== sessionId) {
      throw new TmosError({
        code: "RESOURCE_NOT_FOUND",
        message: "Media participant not found in session",
        status: 404,
        details: { participantId, sessionId },
      });
    }

    const room = await this.mediaRepository.findRoomById(session.roomId);
    const provider = this.mediaProviderRegistry.get(room.providerKey);

    await provider.leaveSession({ providerParticipantId: participant.providerParticipantId });
    return this.executeCritical(async ({ mediaRepository, auditService }) => {
      const updated = await this.recordTransition({
        participant,
        toState: PARTICIPANT_STATES.DISCONNECTED,
        actor,
        correlationId,
        reason: "removed",
        metadata: { providerKey: room.providerKey },
        mediaRepository,
        auditService,
      });

      await auditService.record({
        actor,
        action: "media.participant.left",
        target: participant.id,
        result: "success",
        provider: room.providerKey,
        correlationId,
        metadata: {
          sessionId,
          roomId: room.id,
        },
      });

      return updated;
    });
  }

  async muteParticipant({ actor, correlationId, sessionId, participantId }) {
    return this.applyParticipantControl({
      actor,
      correlationId,
      sessionId,
      participantId,
      action: "mute",
    });
  }

  async unmuteParticipant({ actor, correlationId, sessionId, participantId }) {
    return this.applyParticipantControl({
      actor,
      correlationId,
      sessionId,
      participantId,
      action: "unmute",
    });
  }

  async promoteParticipant({ actor, correlationId, sessionId, participantId }) {
    await this.ensureParticipantInSession(sessionId, participantId);
    return this.executeCritical(async ({ mediaRepository, auditService }) => {
      const updated = await mediaRepository.updateParticipant(participantId, {
        isProducer: true,
        promotedAt: new Date().toISOString(),
      });

      await auditService.record({
        actor,
        action: "media.participant.promoted",
        target: participantId,
        result: "success",
        provider: "tmos",
        correlationId,
        metadata: {
          sessionId,
        },
      });

      return updated;
    });
  }

  async demoteParticipant({ actor, correlationId, sessionId, participantId }) {
    await this.ensureParticipantInSession(sessionId, participantId);
    return this.executeCritical(async ({ mediaRepository, auditService }) => {
      const updated = await mediaRepository.updateParticipant(participantId, {
        isProducer: false,
        demotedAt: new Date().toISOString(),
      });

      await auditService.record({
        actor,
        action: "media.participant.demoted",
        target: participantId,
        result: "success",
        provider: "tmos",
        correlationId,
        metadata: {
          sessionId,
        },
      });

      return updated;
    });
  }

  async transferProducer({ actor, correlationId, sessionId, participantId }) {
    const target = await this.ensureParticipantInSession(sessionId, participantId);
    const session = await this.mediaRepository.findSessionById(sessionId);

    const participants = await this.mediaRepository.listParticipantsBySession(sessionId);
    return this.executeCritical(async ({ mediaRepository, auditService }) => {
      await Promise.all(
        participants.map(async (participant) => {
          if (participant.id === participantId) {
            await mediaRepository.updateParticipant(participant.id, {
              isProducer: true,
              promotedAt: new Date().toISOString(),
            });
          } else if (participant.isProducer) {
            await mediaRepository.updateParticipant(participant.id, {
              isProducer: false,
              demotedAt: new Date().toISOString(),
            });
          }
        }),
      );

      const updatedSession = await mediaRepository.updateSession(sessionId, {
        producerUserId: target.userId,
        producerUsername: target.username,
      });

      await auditService.record({
        actor,
        action: "media.producer.transferred",
        target: participantId,
        result: "success",
        provider: "tmos",
        correlationId,
        metadata: {
          sessionId,
          previousProducer: session.producerUsername,
          nextProducer: target.username,
        },
      });

      return updatedSession;
    });
  }

  async applyParticipantControl({ actor, correlationId, sessionId, participantId, action }) {
    const session = await this.mediaRepository.findSessionById(sessionId);
    if (!session) {
      throw new TmosError({
        code: "RESOURCE_NOT_FOUND",
        message: "Media session not found",
        status: 404,
        details: { sessionId },
      });
    }

    const participant = await this.ensureParticipantInSession(sessionId, participantId);
    const room = await this.mediaRepository.findRoomById(session.roomId);
    const provider = this.mediaProviderRegistry.get(room.providerKey);

    await provider.applyProducerControl({
      providerParticipantId: participant.providerParticipantId,
      action,
      value: true,
    });

    const nextState = action === "mute" ? PARTICIPANT_STATES.MUTED : PARTICIPANT_STATES.READY;
    return this.executeCritical(async ({ mediaRepository, auditService }) => {
      const patched = await mediaRepository.updateParticipant(participantId, {
        muted: action === "mute",
      });

      const transitioned = await this.recordTransition({
        participant: patched,
        toState: nextState,
        actor,
        correlationId,
        reason: `producer_${action}`,
        metadata: { providerKey: room.providerKey },
        mediaRepository,
        auditService,
      });

      await auditService.record({
        actor,
        action: action === "mute" ? "media.participant.muted" : "media.participant.unmuted",
        target: participantId,
        result: "success",
        provider: room.providerKey,
        correlationId,
        metadata: {
          sessionId,
          roomId: room.id,
        },
      });

      return transitioned;
    });
  }

  async ensureParticipantInSession(sessionId, participantId) {
    const participant = await this.mediaRepository.findParticipantById(participantId);
    if (!participant || participant.sessionId !== sessionId) {
      throw new TmosError({
        code: "RESOURCE_NOT_FOUND",
        message: "Media participant not found in session",
        status: 404,
        details: { participantId, sessionId },
      });
    }

    return participant;
  }
}
