import APIClient from "../api/APIClient";
import { API_CONFIG } from "../constants/api";

export const tmosEventBus = {
  async publishEvent(event) {
    return {
      id: event.id || `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: event.timestamp || new Date().toISOString(),
      provider: event.provider || "tmos",
      source: event.source || "backend-cache",
      domain: event.domain || "infrastructure",
      type: event.type || "action",
      severity: event.severity || "info",
      status: event.status || "open",
      message: event.message || "TMOS event",
      entityId: event.entityId || "n/a",
      entityName: event.entityName || event.provider || "TMOS",
      fallbackActive: Boolean(event.fallbackActive),
      fallbackReason: event.fallbackReason || "",
      raw: event.raw || {},
    };
  },

  async getEvents() {
    try {
      const response = await APIClient.get(API_CONFIG.endpoints.operations.events);
      const payload = response?.data?.data || response?.data || [];
      return Array.isArray(payload) ? payload : [];
    } catch {
      return [];
    }
  },

  async getIncidents() {
    const events = await this.getEvents();
    return events.filter((event) => ["critical", "warning"].includes(event.severity));
  },

  async getTimeline(limit = 12) {
    try {
      const response = await APIClient.get(API_CONFIG.endpoints.operations.timeline);
      const payload = response?.data?.data || response?.data || [];
      if (Array.isArray(payload)) {
        return payload.slice(0, limit);
      }
    } catch {
      return [];
    }
    return [];
  },

  async getRecentChanges(limit = 10) {
    try {
      const response = await APIClient.get(API_CONFIG.endpoints.operations.changes);
      const payload = response?.data?.data || response?.data || [];
      if (Array.isArray(payload)) {
        return payload.slice(0, limit);
      }
    } catch {
      return [];
    }
    return [];
  },

  async getHealthSummary() {
    const events = await this.getEvents();
    const critical = events.filter((event) => event.severity === "critical").length;
    const warning = events.filter((event) => event.severity === "warning").length;

    return {
      critical,
      warning,
      healthy: Math.max(0, events.length - critical - warning),
      total: events.length,
    };
  },
};
