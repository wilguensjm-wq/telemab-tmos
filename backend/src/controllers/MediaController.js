import { ok } from "../utils/apiResponse.js";
import { TmosError } from "../errors/TmosError.js";

function parseExpectedVersionHeader(req) {
  const raw = req.header("If-Match-Version");
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return undefined;
  }

  const numeric = Number.parseInt(String(raw), 10);
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new TmosError({
      code: "VALIDATION_ERROR",
      message: "If-Match-Version must be a non-negative integer",
      status: 400,
      details: { header: "If-Match-Version", value: raw },
    });
  }

  return numeric;
}

export class MediaController {
  constructor({ mediaService }) {
    this.mediaService = mediaService;
  }

  listCapabilities(req, res, next) {
    try {
      return ok(res, req, this.mediaService.listCapabilities());
    } catch (error) {
      return next(error);
    }
  }

  async listRooms(req, res, next) {
    try {
      return ok(res, req, await this.mediaService.listRooms());
    } catch (error) {
      return next(error);
    }
  }

  async createRoom(req, res, next) {
    try {
      const created = await this.mediaService.createRoom({
        actor: req.operator?.username || "unknown",
        correlationId: req.correlationId,
        payload: req.body || {},
      });
      return ok(res, req, created, 201);
    } catch (error) {
      return next(error);
    }
  }

  async joinSession(req, res, next) {
    try {
      const requestContext = {
        forwardedHost: req.headers?.["x-forwarded-host"] || null,
        hostHeader: req.headers?.host || null,
        xForwardedProto: req.headers?.["x-forwarded-proto"] || null,
        isHttps: Boolean(req.secure || String(req.headers?.["x-forwarded-proto"] || "").toLowerCase() === "https"),
        userAgent: req.headers?.["user-agent"] || null,
      };

      const joined = await this.mediaService.joinSession({
        actor: req.operator?.username || "unknown",
        user: req.operator,
        correlationId: req.correlationId,
        payload: {
          ...(req.body || {}),
          ...requestContext,
        },
      });
      return ok(res, req, joined, 201);
    } catch (error) {
      return next(error);
    }
  }

  async leaveSession(req, res, next) {
    try {
      const left = await this.mediaService.leaveSession({
        actor: req.operator?.username || "unknown",
        correlationId: req.correlationId,
        participantId: req.params.participantId,
      });
      return ok(res, req, left);
    } catch (error) {
      return next(error);
    }
  }

  async updateDeviceSelection(req, res, next) {
    try {
      const updated = await this.mediaService.updateDeviceSelection({
        actor: req.operator?.username || "unknown",
        correlationId: req.correlationId,
        participantId: req.params.participantId,
        deviceSelection: req.body?.deviceSelection || {},
      });
      return ok(res, req, updated);
    } catch (error) {
      return next(error);
    }
  }

  async setPublisherState(req, res, next) {
    try {
      const updated = await this.mediaService.setPublisherState({
        actor: req.operator?.username || "unknown",
        correlationId: req.correlationId,
        participantId: req.params.participantId,
        enabled: req.body?.enabled,
      });
      return ok(res, req, updated);
    } catch (error) {
      return next(error);
    }
  }

  async applyProducerControl(req, res, next) {
    try {
      const updated = await this.mediaService.applyProducerControl({
        actor: req.operator?.username || "unknown",
        correlationId: req.correlationId,
        participantId: req.params.participantId,
        action: req.body?.action,
        value: req.body?.value,
      });
      return ok(res, req, updated);
    } catch (error) {
      return next(error);
    }
  }

  async createSession(req, res, next) {
    try {
      const created = await this.mediaService.createManagedSession({
        actor: req.operator?.username || "unknown",
        user: req.operator,
        correlationId: req.correlationId,
        payload: req.body || {},
      });
      return ok(res, req, created, 201);
    } catch (error) {
      return next(error);
    }
  }

  async listSessions(req, res, next) {
    try {
      return ok(res, req, await this.mediaService.listManagedSessions());
    } catch (error) {
      return next(error);
    }
  }

  async getSession(req, res, next) {
    try {
      return ok(res, req, await this.mediaService.getManagedSession(req.params.id));
    } catch (error) {
      return next(error);
    }
  }

  async updateSession(req, res, next) {
    try {
      const updated = await this.mediaService.updateManagedSession({
        actor: req.operator?.username || "unknown",
        correlationId: req.correlationId,
        sessionId: req.params.id,
        payload: req.body || {},
        expectedVersion: parseExpectedVersionHeader(req),
      });
      return ok(res, req, updated);
    } catch (error) {
      return next(error);
    }
  }

  async closeSession(req, res, next) {
    try {
      const closed = await this.mediaService.closeManagedSession({
        actor: req.operator?.username || "unknown",
        correlationId: req.correlationId,
        sessionId: req.params.id,
      });
      return ok(res, req, closed);
    } catch (error) {
      return next(error);
    }
  }

  async inviteParticipant(req, res, next) {
    try {
      const invited = await this.mediaService.inviteParticipant({
        actor: req.operator?.username || "unknown",
        user: req.operator,
        correlationId: req.correlationId,
        sessionId: req.params.id,
        payload: req.body || {},
      });
      return ok(res, req, invited, 201);
    } catch (error) {
      return next(error);
    }
  }

  async removeParticipant(req, res, next) {
    try {
      const removed = await this.mediaService.removeParticipant({
        actor: req.operator?.username || "unknown",
        correlationId: req.correlationId,
        sessionId: req.params.id,
        participantId: req.params.participantId,
      });
      return ok(res, req, removed);
    } catch (error) {
      return next(error);
    }
  }

  async muteParticipant(req, res, next) {
    try {
      const updated = await this.mediaService.muteParticipant({
        actor: req.operator?.username || "unknown",
        correlationId: req.correlationId,
        sessionId: req.params.id,
        participantId: req.body?.participantId,
      });
      return ok(res, req, updated);
    } catch (error) {
      return next(error);
    }
  }

  async unmuteParticipant(req, res, next) {
    try {
      const updated = await this.mediaService.unmuteParticipant({
        actor: req.operator?.username || "unknown",
        correlationId: req.correlationId,
        sessionId: req.params.id,
        participantId: req.body?.participantId,
      });
      return ok(res, req, updated);
    } catch (error) {
      return next(error);
    }
  }

  async promoteParticipant(req, res, next) {
    try {
      const updated = await this.mediaService.promoteParticipant({
        actor: req.operator?.username || "unknown",
        correlationId: req.correlationId,
        sessionId: req.params.id,
        participantId: req.body?.participantId,
      });
      return ok(res, req, updated);
    } catch (error) {
      return next(error);
    }
  }

  async demoteParticipant(req, res, next) {
    try {
      const updated = await this.mediaService.demoteParticipant({
        actor: req.operator?.username || "unknown",
        correlationId: req.correlationId,
        sessionId: req.params.id,
        participantId: req.body?.participantId,
      });
      return ok(res, req, updated);
    } catch (error) {
      return next(error);
    }
  }

  async transferProducer(req, res, next) {
    try {
      const updated = await this.mediaService.transferProducer({
        actor: req.operator?.username || "unknown",
        correlationId: req.correlationId,
        sessionId: req.params.id,
        participantId: req.body?.participantId,
      });
      return ok(res, req, updated);
    } catch (error) {
      return next(error);
    }
  }

  async reportReadiness(req, res, next) {
    try {
      const readiness = await this.mediaService.reportSessionReadiness({
        actor: req.operator?.username || "unknown",
        correlationId: req.correlationId,
        sessionId: req.params.id,
        participantId: req.body?.participantId,
        payload: req.body || {},
      });
      return ok(res, req, readiness, 201);
    } catch (error) {
      return next(error);
    }
  }

  async getReadinessStatus(req, res, next) {
    try {
      const status = await this.mediaService.getSessionReadinessStatus(req.params.id);
      return ok(res, req, status);
    } catch (error) {
      return next(error);
    }
  }

  async goLive(req, res, next) {
    try {
      const response = await this.mediaService.goLiveSession({
        actor: req.operator?.username || "unknown",
        correlationId: req.correlationId,
        sessionId: req.params.id,
        expectedVersion: parseExpectedVersionHeader(req),
        idempotencyKey: req.header("Idempotency-Key"),
      });
      return ok(res, req, response);
    } catch (error) {
      return next(error);
    }
  }

  async stopLive(req, res, next) {
    try {
      const response = await this.mediaService.stopLiveSession({
        actor: req.operator?.username || "unknown",
        correlationId: req.correlationId,
        sessionId: req.params.id,
        expectedVersion: parseExpectedVersionHeader(req),
        idempotencyKey: req.header("Idempotency-Key"),
      });
      return ok(res, req, response);
    } catch (error) {
      return next(error);
    }
  }
}
