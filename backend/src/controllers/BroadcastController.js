import { ok } from "../utils/apiResponse.js";

export class BroadcastController {
  constructor({ broadcastEngine }) {
    this.broadcastEngine = broadcastEngine;
  }

  getStatus(req, res, next) {
    try {
      return ok(res, req, this.broadcastEngine.refresh());
    } catch (error) {
      return next(error);
    }
  }

  async start(req, res, next) {
    try {
      const status = await this.broadcastEngine.start({
        activeProgram: req.body?.activeProgram,
      });
      return ok(res, req, status);
    } catch (error) {
      return next(error);
    }
  }

  async stop(req, res, next) {
    try {
      return ok(res, req, await this.broadcastEngine.stop());
    } catch (error) {
      return next(error);
    }
  }

  async startRecording(req, res, next) {
    try {
      return ok(res, req, await this.broadcastEngine.startRecording());
    } catch (error) {
      return next(error);
    }
  }

  async stopRecording(req, res, next) {
    try {
      return ok(res, req, await this.broadcastEngine.stopRecording());
    } catch (error) {
      return next(error);
    }
  }

  async configureRtmp(req, res, next) {
    try {
      return ok(res, req, await this.broadcastEngine.configureRtmp(req.body || {}));
    } catch (error) {
      return next(error);
    }
  }

  async configureSrt(req, res, next) {
    try {
      return ok(res, req, await this.broadcastEngine.configureSrt(req.body || {}));
    } catch (error) {
      return next(error);
    }
  }

  async restart(req, res, next) {
    try {
      return ok(res, req, await this.broadcastEngine.restart());
    } catch (error) {
      return next(error);
    }
  }

  async setActiveProgram(req, res, next) {
    try {
      return ok(res, req, await this.broadcastEngine.setActiveProgram({
        activeProgram: req.body?.activeProgram,
      }));
    } catch (error) {
      return next(error);
    }
  }

  refresh(req, res, next) {
    try {
      return ok(res, req, this.broadcastEngine.refresh());
    } catch (error) {
      return next(error);
    }
  }
}
