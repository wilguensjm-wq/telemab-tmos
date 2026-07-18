import { ok } from "../utils/apiResponse.js";

export class PresenceController {
  constructor({ presenceService }) {
    this.presenceService = presenceService;
  }

  async list(req, res, next) {
    try {
      return ok(res, req, await this.presenceService.list());
    } catch (error) {
      return next(error);
    }
  }

  async getByReporterId(req, res, next) {
    try {
      return ok(res, req, await this.presenceService.getByReporterId(req.params.reporterId));
    } catch (error) {
      return next(error);
    }
  }

  async override(req, res, next) {
    try {
      const updated = await this.presenceService.overridePresence({
        reporterId: req.params.reporterId,
        actor: req.operator?.username || "unknown",
        correlationId: req.correlationId,
        payload: req.body || {},
      });
      return ok(res, req, updated);
    } catch (error) {
      return next(error);
    }
  }
}
