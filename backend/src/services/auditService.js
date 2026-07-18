import { randomUUID } from "node:crypto";

export class AuditService {
  constructor({ auditRepository }) {
    this.auditRepository = auditRepository;
  }

  async record({ actor, action, target, result, provider, correlationId, networkPath = "unknown", metadata = {} }) {
    const entry = {
      id: `aud-${randomUUID()}`,
      timestamp: new Date().toISOString(),
      actor,
      action,
      target,
      result,
      provider,
      correlationId,
      networkPath,
      metadata,
    };

    return this.auditRepository.insert(entry);
  }

  async list(limit = 200) {
    return this.auditRepository.list(limit);
  }
}