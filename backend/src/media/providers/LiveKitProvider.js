import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { MediaProvider } from "../MediaProvider.js";
import { TmosError } from "../../errors/TmosError.js";

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

export class LiveKitProvider extends MediaProvider {
  constructor({ config = {} }) {
    super();
    this.config = {
      enabled: Boolean(config.enabled),
      wsUrl: config.wsUrl || "",
      apiKey: config.apiKey || "",
      apiSecret: config.apiSecret || "",
      tokenTtlSeconds: Number(config.tokenTtlSeconds || 3600),
    };
  }

  capabilities() {
    return {
      provider: "livekit",
      enabled: this.config.enabled,
      features: {
        rooms: true,
        participants: true,
        publishers: true,
        subscribers: true,
        producerControls: true,
        deviceSelection: true,
      },
    };
  }

  async createRoom({ roomName, roomType = "control-room", metadata = {} }) {
    requireNonEmpty(roomName, "roomName");

    return {
      providerRoomId: `lk-room-${randomUUID()}`,
      roomName: String(roomName).trim(),
      roomType,
      metadata,
      status: "active",
    };
  }

  buildToken({ identity, roomName, role, metadata = {} }) {
    if (!this.config.apiKey || !this.config.apiSecret) {
      // Foundation phase fallback token so application flow remains provider-agnostic.
      return `lk-dev-${identity}-${Date.now()}`;
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: this.config.apiKey,
      sub: identity,
      nbf: now,
      exp: now + this.config.tokenTtlSeconds,
      video: {
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
      },
      metadata: JSON.stringify({ role, ...metadata }),
    };

    return jwt.sign(payload, this.config.apiSecret, {
      algorithm: "HS256",
      header: {
        typ: "JWT",
      },
    });
  }

  async joinSession({ roomName, participantIdentity, role = "reporter", metadata = {} }) {
    requireNonEmpty(roomName, "roomName");
    requireNonEmpty(participantIdentity, "participantIdentity");

    return {
      providerParticipantId: `lk-participant-${randomUUID()}`,
      roomName,
      participantIdentity,
      connectionDetails: {
        token: this.buildToken({ identity: participantIdentity, roomName, role, metadata }),
        wsUrl: this.config.wsUrl || "",
        provider: "livekit",
      },
    };
  }

  async leaveSession({ providerParticipantId }) {
    requireNonEmpty(providerParticipantId, "providerParticipantId");
    return { providerParticipantId, status: "left" };
  }

  async updateDeviceSelection({ providerParticipantId, deviceSelection = {} }) {
    requireNonEmpty(providerParticipantId, "providerParticipantId");
    return { providerParticipantId, deviceSelection, status: "updated" };
  }

  async setPublisherState({ providerParticipantId, enabled }) {
    requireNonEmpty(providerParticipantId, "providerParticipantId");
    return { providerParticipantId, publisherEnabled: Boolean(enabled), status: "updated" };
  }

  async setSubscriberState({ providerParticipantId, enabled }) {
    requireNonEmpty(providerParticipantId, "providerParticipantId");
    return { providerParticipantId, subscriberEnabled: Boolean(enabled), status: "updated" };
  }

  async applyProducerControl({ providerParticipantId, action, value = null }) {
    requireNonEmpty(providerParticipantId, "providerParticipantId");
    requireNonEmpty(action, "action");
    return { providerParticipantId, action, value, status: "applied" };
  }
}
