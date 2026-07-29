import { TmosError } from "../errors/TmosError.js";

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

function normalizeLiveKitConnectionDetails(connectionDetails = {}) {
  const raw = connectionDetails || {};
  const token = String(
    raw.token
      || raw.accessToken
      || raw.jwt
      || raw.connectionToken
      || "",
  ).trim();
  const wsUrl = String(
    raw.wsUrl
      || raw.serverUrl
      || raw.livekitUrl
      || raw.url
      || "",
  ).trim();

  return {
    ...raw,
    token,
    wsUrl,
  };
}

export class MediaService {
  constructor({ mediaProviderRegistry, mediaRepository, auditService, mediaSessionManager = null }) {
    this.mediaProviderRegistry = mediaProviderRegistry;
    this.mediaRepository = mediaRepository;
    this.auditService = auditService;
    this.mediaSessionManager = mediaSessionManager;
  }

  ensureSessionManager() {
    if (!this.mediaSessionManager) {
      throw new TmosError({
        code: "INTERNAL_ERROR",
        message: "Media session manager is not configured",
        status: 500,
      });
    }
    return this.mediaSessionManager;
  }

  listCapabilities() {
    return this.mediaProviderRegistry.listCapabilities();
  }

  async listRooms() {
    const rooms = await this.mediaRepository.listRooms();
    const withParticipants = await Promise.all(
      rooms.map(async (room) => ({
        ...room,
        participants: await this.mediaRepository.listParticipantsByRoom(room.id),
      })),
    );

    return withParticipants;
  }

  async createRoom({ actor, correlationId, payload = {} }) {
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
        operation: "media.session.create",
        roomName: payload.roomName,
      },
    });

    const providerRoom = await provider.createRoom({
      roomName: payload.roomName,
      roomType: payload.roomType || "control-room",
      metadata: payload.metadata || {},
    });

    const room = await this.mediaRepository.createRoom({
      providerKey: payload.providerKey,
      providerRoomId: providerRoom.providerRoomId,
      name: providerRoom.roomName,
      roomType: providerRoom.roomType || payload.roomType || "control-room",
      status: providerRoom.status || "active",
      metadata: providerRoom.metadata || payload.metadata || {},
      createdBy: actor,
    });

    await this.auditService.record({
      actor,
      action: "media.session.create",
      target: room.id,
      result: "success",
      provider: payload.providerKey,
      correlationId,
      metadata: {
        roomName: room.name,
        providerRoomId: room.providerRoomId,
      },
    });

    return room;
  }

  async joinSession({ actor, user, correlationId, payload = {} }) {
    requireNonEmpty(payload.roomId, "roomId");

    const room = await this.mediaRepository.findRoomById(payload.roomId);
    if (!room) {
      throw new TmosError({
        code: "RESOURCE_NOT_FOUND",
        message: "Media room not found",
        status: 404,
        details: { roomId: payload.roomId },
      });
    }

    const provider = this.mediaProviderRegistry.get(room.providerKey);
    const joined = await provider.joinSession({
      roomName: room.name,
      participantIdentity: payload.participantIdentity || `${user?.username || actor}-${Date.now()}`,
      role: payload.participantRole || "reporter",
      metadata: payload.metadata || {},
      requestContext: {
        forwardedHost: payload.forwardedHost || null,
        hostHeader: payload.hostHeader || null,
        xForwardedProto: payload.xForwardedProto || null,
        isHttps: Boolean(payload.isHttps),
      },
    });

    const participant = await this.mediaRepository.createParticipant({
      roomId: room.id,
      providerParticipantId: joined.providerParticipantId,
      userId: user?.id || null,
      username: user?.username || actor,
      reporterId: payload.reporterId || null,
      participantRole: payload.participantRole || "reporter",
      deviceSelection: payload.deviceSelection || {},
      metadata: payload.metadata || {},
    });

    await this.auditService.record({
      actor,
      action: "media.session.join",
      target: participant.id,
      result: "success",
      provider: room.providerKey,
      correlationId,
      metadata: {
        roomId: room.id,
        providerParticipantId: participant.providerParticipantId,
        participantRole: participant.participantRole,
      },
    });

    return {
      room,
      participant,
      connectionDetails: joined.connectionDetails ? normalizeLiveKitConnectionDetails(joined.connectionDetails) : null,
    };
  }

  async leaveSession({ actor, correlationId, participantId }) {
    requireNonEmpty(participantId, "participantId");

    const participant = await this.mediaRepository.findParticipantById(participantId);
    if (!participant) {
      throw new TmosError({
        code: "RESOURCE_NOT_FOUND",
        message: "Media participant not found",
        status: 404,
        details: { participantId },
      });
    }

    const room = await this.mediaRepository.findRoomById(participant.roomId);
    const provider = this.mediaProviderRegistry.get(room.providerKey);
    await provider.leaveSession({ providerParticipantId: participant.providerParticipantId });

    const left = await this.mediaRepository.markParticipantLeft(participantId);

    await this.auditService.record({
      actor,
      action: "media.session.leave",
      target: participantId,
      result: "success",
      provider: room.providerKey,
      correlationId,
      metadata: {
        roomId: room.id,
        providerParticipantId: participant.providerParticipantId,
      },
    });

    return left;
  }

  async updateDeviceSelection({ actor, correlationId, participantId, deviceSelection = {} }) {
    const participant = await this.mediaRepository.findParticipantById(participantId);
    if (!participant) {
      throw new TmosError({
        code: "RESOURCE_NOT_FOUND",
        message: "Media participant not found",
        status: 404,
        details: { participantId },
      });
    }

    const room = await this.mediaRepository.findRoomById(participant.roomId);
    const provider = this.mediaProviderRegistry.get(room.providerKey);
    await provider.updateDeviceSelection({
      providerParticipantId: participant.providerParticipantId,
      deviceSelection,
    });

    const updated = await this.mediaRepository.updateParticipant(participantId, { deviceSelection });

    await this.auditService.record({
      actor,
      action: "media.device.select",
      target: participantId,
      result: "success",
      provider: room.providerKey,
      correlationId,
      metadata: {
        roomId: room.id,
        deviceSelection,
      },
    });

    return updated;
  }

  async setPublisherState({ actor, correlationId, participantId, enabled }) {
    const participant = await this.mediaRepository.findParticipantById(participantId);
    if (!participant) {
      throw new TmosError({
        code: "RESOURCE_NOT_FOUND",
        message: "Media participant not found",
        status: 404,
        details: { participantId },
      });
    }

    const room = await this.mediaRepository.findRoomById(participant.roomId);
    const provider = this.mediaProviderRegistry.get(room.providerKey);
    await provider.setPublisherState({
      providerParticipantId: participant.providerParticipantId,
      enabled,
    });

    const updated = await this.mediaRepository.updateParticipant(participantId, { publisherEnabled: Boolean(enabled) });

    await this.auditService.record({
      actor,
      action: "media.publisher.toggle",
      target: participantId,
      result: "success",
      provider: room.providerKey,
      correlationId,
      metadata: {
        roomId: room.id,
        enabled: Boolean(enabled),
      },
    });

    return updated;
  }

  async applyProducerControl({ actor, correlationId, participantId, action, value = null }) {
    requireNonEmpty(action, "action");

    const participant = await this.mediaRepository.findParticipantById(participantId);
    if (!participant) {
      throw new TmosError({
        code: "RESOURCE_NOT_FOUND",
        message: "Media participant not found",
        status: 404,
        details: { participantId },
      });
    }

    const room = await this.mediaRepository.findRoomById(participant.roomId);
    const provider = this.mediaProviderRegistry.get(room.providerKey);
    await provider.applyProducerControl({
      providerParticipantId: participant.providerParticipantId,
      action,
      value,
    });

    const patch = {};
    if (action === "mute") patch.muted = true;
    if (action === "unmute") patch.muted = false;
    if (action === "subscriber.enable") patch.subscriberEnabled = true;
    if (action === "subscriber.disable") patch.subscriberEnabled = false;

    const updated = await this.mediaRepository.updateParticipant(participantId, {
      ...patch,
      metadata: {
        ...(participant.metadata || {}),
        lastProducerControl: {
          action,
          value,
          timestamp: new Date().toISOString(),
          actor,
        },
      },
    });

    await this.auditService.record({
      actor,
      action: "media.producer.control",
      target: participantId,
      result: "success",
      provider: room.providerKey,
      correlationId,
      metadata: {
        roomId: room.id,
        action,
        value,
      },
    });

    return updated;
  }

  async createManagedSession({ actor, user, correlationId, payload = {} }) {
    return this.ensureSessionManager().createSession({ actor, user, correlationId, payload });
  }

  async listManagedSessions() {
    return this.ensureSessionManager().listSessions();
  }

  async getManagedSession(sessionId) {
    return this.ensureSessionManager().getSession(sessionId);
  }

  async updateManagedSession({ actor, correlationId, sessionId, payload = {}, expectedVersion = undefined }) {
    return this.ensureSessionManager().updateSession({ actor, correlationId, sessionId, payload, expectedVersion });
  }

  async closeManagedSession({ actor, correlationId, sessionId }) {
    return this.ensureSessionManager().closeSession({ actor, correlationId, sessionId });
  }

  async inviteParticipant({ actor, user, correlationId, sessionId, payload = {} }) {
    return this.ensureSessionManager().inviteParticipant({ actor, user, correlationId, sessionId, payload });
  }

  async removeParticipant({ actor, correlationId, sessionId, participantId }) {
    return this.ensureSessionManager().removeParticipant({ actor, correlationId, sessionId, participantId });
  }

  async muteParticipant({ actor, correlationId, sessionId, participantId }) {
    return this.ensureSessionManager().muteParticipant({ actor, correlationId, sessionId, participantId });
  }

  async unmuteParticipant({ actor, correlationId, sessionId, participantId }) {
    return this.ensureSessionManager().unmuteParticipant({ actor, correlationId, sessionId, participantId });
  }

  async promoteParticipant({ actor, correlationId, sessionId, participantId }) {
    return this.ensureSessionManager().promoteParticipant({ actor, correlationId, sessionId, participantId });
  }

  async demoteParticipant({ actor, correlationId, sessionId, participantId }) {
    return this.ensureSessionManager().demoteParticipant({ actor, correlationId, sessionId, participantId });
  }

  async transferProducer({ actor, correlationId, sessionId, participantId }) {
    return this.ensureSessionManager().transferProducer({ actor, correlationId, sessionId, participantId });
  }

  async reportSessionReadiness({ actor, correlationId, sessionId, participantId, payload = {} }) {
    return this.ensureSessionManager().reportReadiness({ actor, correlationId, sessionId, participantId, payload });
  }

  async getSessionReadinessStatus(sessionId) {
    return this.ensureSessionManager().getReadinessStatus(sessionId);
  }

  async goLiveSession({ actor, correlationId, sessionId, expectedVersion = undefined, idempotencyKey = undefined }) {
    return this.ensureSessionManager().goLive({
      actor,
      correlationId,
      sessionId,
      expectedVersion,
      idempotencyKey,
    });
  }

  async stopLiveSession({ actor, correlationId, sessionId, expectedVersion = undefined, idempotencyKey = undefined }) {
    return this.ensureSessionManager().stopLive({
      actor,
      correlationId,
      sessionId,
      expectedVersion,
      idempotencyKey,
    });
  }
}
