import { randomUUID } from "node:crypto";

const events = [];

export const eventService = {
  publish({ provider, resource, action, severity, status, operator, correlationId, metadata = {} }) {
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

    events.unshift(event);
    if (events.length > 2000) {
      events.length = 2000;
    }

    return event;
  },

  list(limit = 300) {
    return events.slice(0, limit);
  },
};