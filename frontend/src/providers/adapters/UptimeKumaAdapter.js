import { API_CONFIG } from "../../constants/api";
import { modeToSource } from "../../services/sourceState";
import { providerFetchJson } from "../http/providerFetch";

function normalizeStatus(status) {
  if (status === true || status === 1 || status === "up" || status === "UP") return "Healthy";
  if (status === "degraded") return "Warning";
  return "Warning";
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toIsoNow() {
  return new Date().toISOString();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isUnimplemented(error) {
  const status = error?.response?.status;
  return status === 404 || status === 501 || status === 503;
}

async function safeArrayRequest(requestFn) {
  try {
    const response = await requestFn();
    return asArray(response?.data?.data || response?.data || []);
  } catch (error) {
    if (isUnimplemented(error)) {
      return [];
    }
    throw error;
  }
}

function fillPath(template, values = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] || "");
}

export class UptimeKumaAdapter {
  constructor({ apiClient, providerConfig }) {
    this.apiClient = apiClient;
    this.providerConfig = providerConfig;
  }

  async getMonitoringOverview() {
    if (this.providerConfig.enabled && this.providerConfig.direct && this.providerConfig.baseUrl) {
      try {
        return await this.fetchDirect();
      } catch (directError) {
        try {
          const fallback = await this.fetchViaApi();
          return {
            ...fallback,
            fallbackActive: true,
            fallbackReason: directError.message || "Direct provider unavailable.",
          };
        } catch {
          throw new Error(`Uptime Kuma direct and fallback failed: ${directError.message || "provider unavailable"}`);
        }
      }
    }

    return this.fetchViaApi();
  }

  async fetchViaApi() {
    const [payload, incidentsPayload, logsPayload] = await Promise.all([
      safeArrayRequest(() => this.apiClient.get(API_CONFIG.endpoints.infrastructure.monitoring)),
      safeArrayRequest(() => this.apiClient.get(API_CONFIG.endpoints.infrastructure.monitoringIncidents)),
      safeArrayRequest(() => this.apiClient.get(API_CONFIG.endpoints.infrastructure.monitoringLogs)),
    ]);

    const incidents = incidentsPayload.map((item, index) => ({
      id: item.id || `INC-${index + 1}`,
      monitor: item.monitor || item.name || `Monitor ${index + 1}`,
      severity: item.severity || "warning",
      detail: item.detail || "",
      status: item.status || "open",
      createdAt: item.createdAt || toIsoNow(),
    }));

    return {
      source: modeToSource(),
      fallbackActive: false,
      monitors: payload.map((item, index) => ({
        id: item.id || `${index}`,
        name: item.monitor || item.name || `Monitor ${index + 1}`,
        status: item.status || "Warning",
        latencyMs: safeNumber(String(item.latency).replace(" ms", ""), 0),
        uptimePct: safeNumber(item.uptimePct, 99),
        incidentCount: safeNumber(item.incidentCount, item.status === "Warning" ? 1 : 0),
      })),
      incidents,
      logs: logsPayload.map((item, index) => ({
        id: item.id || `UK-LOG-${index + 1}`,
        level: item.level || "info",
        message: item.message || item.detail || "Monitoring event",
        timestamp: item.timestamp || item.createdAt || toIsoNow(),
      })),
    };
  }

  async fetchDirect() {
    const headers = this.providerConfig.apiKey
      ? {
          "Authorization": `Bearer ${this.providerConfig.apiKey}`,
          "Content-Type": "application/json",
        }
      : { "Content-Type": "application/json" };

    const monitorsResponse = await fetch(`${this.providerConfig.baseUrl}${this.providerConfig.monitorsPath}`, {
      method: "GET",
      headers,
    });

    if (!monitorsResponse.ok) {
      throw new Error(`Uptime Kuma request failed (${monitorsResponse.status})`);
    }

    const monitorsPayload = await monitorsResponse.json();
    const monitors = Array.isArray(monitorsPayload) ? monitorsPayload : monitorsPayload?.data || [];

    return {
      source: "live",
      fallbackActive: false,
      monitors: monitors.map((item, index) => ({
        id: item.id || `${index}`,
        name: item.name || `Monitor ${index + 1}`,
        status: normalizeStatus(item.active ?? item.status),
        latencyMs: safeNumber(item.ping || item.latency || 0, 0),
        uptimePct: safeNumber(item.uptime || item.uptimePct, 99),
        incidentCount: safeNumber(item.incidents || 0),
      })),
      incidents: [],
      logs: [],
    };
  }

  buildOperationalState(data) {
    const monitors = data.monitors || [];
    const incidents = data.incidents || [];
    const logs = data.logs || [];

    return {
      provider: "uptime-kuma",
      source: data.source,
      fallbackActive: Boolean(data.fallbackActive),
      fallbackReason: data.fallbackReason || "",
      telemetry: {
        monitorCount: monitors.length,
        incidentCount: incidents.length,
      },
      health: monitors.map((item) => ({
        id: item.id,
        name: item.name,
        status: item.status,
        metric: `${item.latencyMs} ms`,
      })),
      alerts: [
        ...incidents.map((item) => ({
          id: item.id,
          severity: item.severity,
          message: `${item.monitor}: ${item.detail}`,
          status: item.status || "open",
          timestamp: item.createdAt || toIsoNow(),
        })),
      ],
      logs,
      actions: [
        {
          id: "acknowledge-monitor-incident",
          label: "Acknowledge incident",
          action: "acknowledge",
          enabled: true,
        },
      ],
    };
  }

  async getOperationalState() {
    const data = await this.getMonitoringOverview();
    return this.buildOperationalState(data);
  }

  async acknowledgeIncident(incidentId) {
    try {
      const response = await this.apiClient.post(API_CONFIG.endpoints.infrastructure.monitoringAcknowledge, {
        incidentId,
      });
      const payload = response?.data?.data || response?.data || {};
      return {
        success: true,
        provider: "uptime-kuma",
        action: "acknowledge",
        targetId: incidentId,
        source: modeToSource(),
        timestamp: payload.timestamp || toIsoNow(),
        message: payload.message || "Incident acknowledged",
      };
    } catch (error) {
      return {
        success: false,
        provider: "uptime-kuma",
        action: "acknowledge",
        targetId: incidentId,
        source: modeToSource(),
        timestamp: toIsoNow(),
        message: error?.message || "Failed to acknowledge incident",
      };
    }
  }

  async pauseMonitor(monitorId) {
    if (this.providerConfig.enabled && this.providerConfig.direct && this.providerConfig.baseUrl) {
      return this.directMonitorAction("pause", monitorId, this.providerConfig.pausePath);
    }

    return this.apiMonitorAction(API_CONFIG.endpoints.infrastructure.monitoringPause, "pause", monitorId);
  }

  async resumeMonitor(monitorId) {
    if (this.providerConfig.enabled && this.providerConfig.direct && this.providerConfig.baseUrl) {
      return this.directMonitorAction("resume", monitorId, this.providerConfig.resumePath);
    }

    return this.apiMonitorAction(API_CONFIG.endpoints.infrastructure.monitoringResume, "resume", monitorId);
  }

  async refreshMonitor(monitorId) {
    if (this.providerConfig.enabled && this.providerConfig.direct && this.providerConfig.baseUrl) {
      return this.directMonitorAction("refresh", monitorId, this.providerConfig.refreshPath);
    }

    return this.apiMonitorAction(API_CONFIG.endpoints.infrastructure.monitoringRefresh, "refresh", monitorId);
  }

  async apiMonitorAction(endpoint, action, monitorId) {
    try {
      const response = await this.apiClient.post(endpoint, { monitorId });
      const payload = response?.data?.data || response?.data || {};
      return {
        success: true,
        provider: "uptime-kuma",
        action,
        targetId: monitorId,
        source: modeToSource(),
        timestamp: payload.timestamp || toIsoNow(),
        message: payload.message || `Monitor ${action} request accepted`,
        data: payload,
      };
    } catch (error) {
      return {
        success: false,
        provider: "uptime-kuma",
        action,
        targetId: monitorId,
        source: modeToSource(),
        timestamp: toIsoNow(),
        message: error?.message || `Failed to ${action} monitor`,
      };
    }
  }

  async directMonitorAction(action, monitorId, template) {
    const path = fillPath(template, { id: monitorId });
    const headers = this.providerConfig.apiKey
      ? { Authorization: `Bearer ${this.providerConfig.apiKey}` }
      : {};

    try {
      const payload = await providerFetchJson({
        baseUrl: this.providerConfig.baseUrl,
        path,
        method: "POST",
        headers,
      });
      return {
        success: true,
        provider: "uptime-kuma",
        action,
        targetId: monitorId,
        source: "live",
        timestamp: toIsoNow(),
        message: `Monitor ${action} request accepted`,
        data: payload,
      };
    } catch (error) {
      return {
        success: false,
        provider: "uptime-kuma",
        action,
        targetId: monitorId,
        source: "live",
        timestamp: toIsoNow(),
        message: error?.message || `Failed to ${action} monitor`,
      };
    }
  }
}
