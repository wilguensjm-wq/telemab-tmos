import express from "express";
import { correlationIdMiddleware } from "./middleware/correlationId.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { createV1Router } from "./routes/v1.js";
import { ok } from "./utils/apiResponse.js";

export function createApp({ orchestration, authService, auditService, eventService, platformConfigService, databaseService, operationsDashboardService, reporterService, studioService, assignmentService, presenceService, mediaService, broadcastEngine }) {
  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use(requestLogger);

  app.get("/", (req, res) => {
    return ok(res, req, {
      service: "tmos-backend",
      status: "ok",
      message: "TMOS backend is running",
      health: "/api/v1/health",
    });
  });

  app.get("/health", async (req, res, next) => {
    try {
      const database = await databaseService.health();
      return ok(res, req, { service: "tmos-backend", status: "ok", database });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/readyz", async (req, res, next) => {
    try {
      const database = await databaseService.health();
      return ok(res, req, { service: "tmos-backend", status: "ready", checks: { database } });
    } catch (error) {
      return next(error);
    }
  });

  const v1 = createV1Router({
    orchestration,
    authService,
    auditService,
    eventService,
    platformConfigService,
    databaseService,
    operationsDashboardService,
    reporterService,
    studioService,
    assignmentService,
    presenceService,
    mediaService,
    broadcastEngine,
  });
  app.use("/api/v1", v1);

  // Temporary compatibility alias while frontend migrates to v1 paths.
  app.use("/api", v1);

  app.use(errorHandler);
  return app;
}