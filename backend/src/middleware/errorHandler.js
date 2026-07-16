import { normalizeError } from "../errors/normalizeError.js";
import { fail } from "../utils/apiResponse.js";
import { logger } from "../logging/logger.js";

export function errorHandler(error, req, res, _next) {
  const normalized = normalizeError(error);
  logger.error("request.failed", {
    method: req.method,
    path: req.originalUrl,
    correlationId: req.correlationId,
    code: normalized.code,
    status: normalized.status,
    message: normalized.message,
    details: normalized.details,
  });
  return fail(res, req, normalized);
}