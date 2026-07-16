import { randomUUID } from "node:crypto";

const auditLog = [];

export const auditService = {
  record({ actor, action, target, result, provider, correlationId, metadata = {} }) {
    const entry = {
      id: `aud-${randomUUID()}`,
      timestamp: new Date().toISOString(),
      actor,
      action,
      target,
      result,
      provider,
      correlationId,
      metadata,
    };

    auditLog.unshift(entry);
    if (auditLog.length > 2000) {
      auditLog.length = 2000;
    }

    return entry;
  },

  list(limit = 200) {
    return auditLog.slice(0, limit);
  },
};