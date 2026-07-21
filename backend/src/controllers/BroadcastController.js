import { ok } from "../utils/apiResponse.js";

export class BroadcastController {
  constructor({ broadcastEngine }) {
    this.broadcastEngine = broadcastEngine;
  }

  getStatus(req, res, next) {
    try {
      return ok(res, req, this.broadcastEngine.getStatus());
    } catch (error) {
      return next(error);
    }
  }

  start(req, res, next) {
    try {
      const status = this.broadcastEngine.start({
        activeProgram: req.body?.activeProgram,
      });
      return ok(res, req, status);
    } catch (error) {
      return next(error);
    }
  }

  stop(req, res, next) {
    try {
      return ok(res, req, this.broadcastEngine.stop());
    } catch (error) {
      return next(error);
    }
  }

  startRecording(req, res, next) {
    try {
      return ok(res, req, this.broadcastEngine.startRecording());
    } catch (error) {
      return next(error);
    }
  }

  stopRecording(req, res, next) {
    try {
      return ok(res, req, this.broadcastEngine.stopRecording());
    } catch (error) {
      return next(error);
    }
  }

  configureRtmp(req, res, next) {
    try {
      return ok(res, req, this.broadcastEngine.configureRtmp(req.body || {}));
    } catch (error) {
      return next(error);
    }
  }

  configureSrt(req, res, next) {
    try {
      return ok(res, req, this.broadcastEngine.configureSrt(req.body || {}));
    } catch (error) {
      return next(error);
    }
  }
}
