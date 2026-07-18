import { ok } from "../utils/apiResponse.js";

export class StudioController {
  constructor({ studioService, auditService }) {
    this.studioService = studioService;
    this.auditService = auditService;
  }

  async list(req, res, next) {
    try {
      return ok(res, req, await this.studioService.list());
    } catch (error) {
      return next(error);
    }
  }

  async getById(req, res, next) {
    try {
      return ok(res, req, await this.studioService.getById(req.params.studioId));
    } catch (error) {
      return next(error);
    }
  }

  async create(req, res, next) {
    try {
      const created = await this.studioService.create(req.body || {});
      await this.auditService.record({
        actor: req.operator?.username || "unknown",
        action: "studio.create",
        target: created.id,
        result: "success",
        provider: "tmos",
        correlationId: req.correlationId,
        metadata: { studioId: created.id, name: created.name },
      });
      return ok(res, req, created, 201);
    } catch (error) {
      return next(error);
    }
  }

  async update(req, res, next) {
    try {
      const updated = await this.studioService.update(req.params.studioId, req.body || {});
      await this.auditService.record({
        actor: req.operator?.username || "unknown",
        action: "studio.update",
        target: updated.id,
        result: "success",
        provider: "tmos",
        correlationId: req.correlationId,
        metadata: { studioId: updated.id },
      });
      return ok(res, req, updated);
    } catch (error) {
      return next(error);
    }
  }

  async remove(req, res, next) {
    try {
      const deleted = await this.studioService.remove(req.params.studioId);
      await this.auditService.record({
        actor: req.operator?.username || "unknown",
        action: "studio.delete",
        target: deleted.id,
        result: "success",
        provider: "tmos",
        correlationId: req.correlationId,
        metadata: { studioId: deleted.id },
      });
      return ok(res, req, deleted);
    } catch (error) {
      return next(error);
    }
  }
}
