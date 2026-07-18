import { ok } from "../utils/apiResponse.js";

export class AssignmentController {
  constructor({ assignmentService, auditService }) {
    this.assignmentService = assignmentService;
    this.auditService = auditService;
  }

  async list(req, res, next) {
    try {
      return ok(res, req, await this.assignmentService.list());
    } catch (error) {
      return next(error);
    }
  }

  async getById(req, res, next) {
    try {
      return ok(res, req, await this.assignmentService.getById(req.params.assignmentId));
    } catch (error) {
      return next(error);
    }
  }

  async create(req, res, next) {
    try {
      const created = await this.assignmentService.create(req.body || {});
      await this.auditService.record({
        actor: req.operator?.username || "unknown",
        action: "assignment.create",
        target: created.id,
        result: "success",
        provider: "tmos",
        correlationId: req.correlationId,
        metadata: {
          assignmentId: created.id,
          reporterId: created.reporterId,
          studioId: created.studioId,
        },
      });
      return ok(res, req, created, 201);
    } catch (error) {
      return next(error);
    }
  }

  async update(req, res, next) {
    try {
      const updated = await this.assignmentService.update(req.params.assignmentId, req.body || {});
      await this.auditService.record({
        actor: req.operator?.username || "unknown",
        action: "assignment.update",
        target: updated.id,
        result: "success",
        provider: "tmos",
        correlationId: req.correlationId,
        metadata: { assignmentId: updated.id },
      });
      return ok(res, req, updated);
    } catch (error) {
      return next(error);
    }
  }

  async remove(req, res, next) {
    try {
      const deleted = await this.assignmentService.remove(req.params.assignmentId);
      await this.auditService.record({
        actor: req.operator?.username || "unknown",
        action: "assignment.delete",
        target: deleted.id,
        result: "success",
        provider: "tmos",
        correlationId: req.correlationId,
        metadata: { assignmentId: deleted.id },
      });
      return ok(res, req, deleted);
    } catch (error) {
      return next(error);
    }
  }
}
