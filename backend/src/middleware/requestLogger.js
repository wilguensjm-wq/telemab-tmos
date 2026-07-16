import { logger } from "../logging/logger.js";

export function requestLogger(req, res, next) {
  const startedAt = Date.now();

  res.on("finish", () => {
    logger.info("request.completed", {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      correlationId: req.correlationId,
      durationMs: Date.now() - startedAt,
    });
  });

  next();
}