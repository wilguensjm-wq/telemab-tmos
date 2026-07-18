import { randomUUID } from "node:crypto";

export class EventService {
  constructor({ eventRepository }) {
    this.eventRepository = eventRepository;
  }

  async publish({ provider, resource, action, severity, status, operator, correlationId, metadata = {} }) {
    const event = {
      id: `evt-${randomUUID()}`,
      timestamp: new Date().toISOString(),
      provider,
      resource,
      action,
      severity,
      status,
      operator,
      correlationId,
      metadata,
    };

    return this.eventRepository.insert(event);
  }

  async list(limit = 300) {
    return this.eventRepository.list(limit);
  }
}