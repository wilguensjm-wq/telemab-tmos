import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { MediaProvider } from "../MediaProvider.js";
import { TmosError } from "../../errors/TmosError.js";
import { logger } from "../../logging/logger.js";

const DEFAULT_TOKEN_TTL_SECONDS = 3600;
const MIN_TOKEN_TTL_SECONDS = 30;
const MAX_TOKEN_TTL_SECONDS = 86400;
const CLOCK_SKEW_TOLERANCE_SECONDS = 5;

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

function isLoopbackHost(host = "") {
  const normalized = String(host || "").trim().toLowerCase();
  return ["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(normalized);
}

function buildRequestWsUrl(requestContext = {}) {
  const forwardedHost = String(requestContext?.forwardedHost || "").trim();
  const hostHeader = String(requestContext?.hostHeader || "").trim();
  const xForwardedProto = String(requestContext?.xForwardedProto || "").trim().toLowerCase();
  const requestProto = xForwardedProto === "https" ? "https" : requestContext?.isHttps ? "https" : "http";
  const requestHost = forwardedHost || hostHeader || "";

  if (!requestHost) {
    return "";
  }

  const protocol = requestProto === "https" ? "wss" : "ws";
  return `${protocol}://${requestHost}/ws/`;
}

function normalizeWsUrl(rawValue = "", requestContext = {}) {
  const trimmed = String(rawValue || "").trim();
  if (!trimmed) {
    return buildRequestWsUrl(requestContext);
  }

  try {
    const parsed = new URL(trimmed);
    const requestHost = String(requestContext?.forwardedHost || requestContext?.hostHeader || "").trim();
    const requestHostName = requestHost.includes(":") ? requestHost.split(":")[0] : requestHost;
    const requestProto = String(requestContext?.xForwardedProto || "").trim().toLowerCase();
    const resolvedProtocol = requestProto === "https" || requestContext?.isHttps ? "wss" : "ws";

    if (isLoopbackHost(parsed.hostname) && requestHostName && !isLoopbackHost(requestHostName)) {
      return `${resolvedProtocol}://${requestHost}/ws/`;
    }

    if (parsed.protocol === "ws:" && (requestProto === "https" || requestContext?.isHttps)) {
      parsed.protocol = "wss:";
    }

    if (parsed.pathname === "" || parsed.pathname === "/") {
      parsed.pathname = "/ws/";
    } else if (parsed.pathname === "/ws") {
      parsed.pathname = "/ws/";
    }

    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

export class LiveKitProvider extends MediaProvider {
  constructor({ config = {} }) {
    super();
    const tokenTtlSeconds = Number(config.tokenTtlSeconds);
    this.config = {
      enabled: Boolean(config.enabled),
      wsUrl: config.wsUrl || "",
      apiKey: config.apiKey || "",
      apiSecret: config.apiSecret || "",
      tokenTtlSeconds: this.sanitizeTokenTtlSeconds(tokenTtlSeconds),
    };
  }

  sanitizeTokenTtlSeconds(rawTtlSeconds) {
    if (!Number.isFinite(rawTtlSeconds)) {
      return DEFAULT_TOKEN_TTL_SECONDS;
    }

    const normalized = Math.floor(rawTtlSeconds);
    if (normalized < MIN_TOKEN_TTL_SECONDS || normalized > MAX_TOKEN_TTL_SECONDS) {
      logger.warn("media.livekit.token_ttl.invalid", {
        configuredTokenTtlSeconds: rawTtlSeconds,
        minTokenTtlSeconds: MIN_TOKEN_TTL_SECONDS,
        maxTokenTtlSeconds: MAX_TOKEN_TTL_SECONDS,
        fallbackTokenTtlSeconds: DEFAULT_TOKEN_TTL_SECONDS,
      });
      return DEFAULT_TOKEN_TTL_SECONDS;
    }

    return normalized;
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
    const issuedAt = now - CLOCK_SKEW_TOLERANCE_SECONDS;
    const expiresAt = issuedAt + this.config.tokenTtlSeconds;
    const payload = {
      iss: this.config.apiKey,
      sub: identity,
      iat: issuedAt,
      nbf: issuedAt,
      exp: expiresAt,
      video: {
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
      },
      metadata: JSON.stringify({ role, ...metadata }),
    };

    logger.info("media.livekit.token.issued", {
      roomName,
      identity,
      role,
      issuedAt,
      notBefore: issuedAt,
      expiresAt,
      tokenTtlSeconds: this.config.tokenTtlSeconds,
      serverNowEpochSeconds: now,
    });

    return jwt.sign(payload, this.config.apiSecret, {
      algorithm: "HS256",
      header: {
        typ: "JWT",
      },
    });
  }

  async joinSession({ roomName, participantIdentity, role = "reporter", metadata = {}, requestContext = {} }) {
    requireNonEmpty(roomName, "roomName");
    requireNonEmpty(participantIdentity, "participantIdentity");

    return {
      providerParticipantId: `lk-participant-${randomUUID()}`,
      roomName,
      participantIdentity,
      connectionDetails: {
        token: this.buildToken({ identity: participantIdentity, roomName, role, metadata }),
        wsUrl: normalizeWsUrl(this.config.wsUrl, requestContext),
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
