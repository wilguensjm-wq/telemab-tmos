import { ok } from "../utils/apiResponse.js";

export class ReporterController {
  constructor({ reporterService, auditService }) {
    this.reporterService = reporterService;
    this.auditService = auditService;
  }

  async list(req, res, next) {
    try {
      return ok(res, req, await this.reporterService.list());
    } catch (error) {
      return next(error);
    }
  }

  async listPending(req, res, next) {
    try {
      return ok(res, req, await this.reporterService.listPending());
    } catch (error) {
      return next(error);
    }
  }

  async getById(req, res, next) {
    try {
      return ok(res, req, await this.reporterService.getById(req.params.reporterId));
    } catch (error) {
      return next(error);
    }
  }

  async create(req, res, next) {
    try {
      const created = await this.reporterService.create(req.body || {});
      await this.auditService.record({
        actor: req.operator?.username || "unknown",
        action: "reporter.create",
        target: created.id,
        result: "success",
        provider: "tmos",
        correlationId: req.correlationId,
        metadata: { reporterId: created.id, email: created.email },
      });
      return ok(res, req, created, 201);
    } catch (error) {
      return next(error);
    }
  }

  async update(req, res, next) {
    try {
      const updated = await this.reporterService.update(req.params.reporterId, req.body || {});
      await this.auditService.record({
        actor: req.operator?.username || "unknown",
        action: "reporter.update",
        target: updated.id,
        result: "success",
        provider: "tmos",
        correlationId: req.correlationId,
        metadata: { reporterId: updated.id },
      });
      return ok(res, req, updated);
    } catch (error) {
      return next(error);
    }
  }

  async remove(req, res, next) {
    try {
      const deleted = await this.reporterService.remove(req.params.reporterId);
      await this.auditService.record({
        actor: req.operator?.username || "unknown",
        action: "reporter.delete",
        target: deleted.id,
        result: "success",
        provider: "tmos",
        correlationId: req.correlationId,
        metadata: { reporterId: deleted.id },
      });
      return ok(res, req, deleted);
    } catch (error) {
      return next(error);
    }
  }
}
