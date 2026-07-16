import { randomUUID } from "node:crypto";

export function correlationIdMiddleware(req, _res, next) {
  req.correlationId = req.header("x-correlation-id") || randomUUID();
  next();
}