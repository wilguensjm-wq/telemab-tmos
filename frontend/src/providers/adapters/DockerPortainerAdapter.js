import { API_CONFIG } from "../../constants/api";
import { providerFetchJson, pickArrayPayload } from "../http/providerFetch";
import { modeToSource } from "../../services/sourceState";

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

export class DockerPortainerAdapter {
  constructor({ apiClient, providerConfig }) {
    this.apiClient = apiClient;
    this.providerConfig = providerConfig;
  }

  async getContainerRuntime() {
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
          throw new Error(`Portainer direct and fallback failed: ${directError.message || "provider unavailable"}`);
        }
      }
    }

    return this.fetchViaApi();
  }

  async fetchViaApi() {
    const [payload, alertsPayload, logsPayload] = await Promise.all([
      safeArrayRequest(() => this.apiClient.get(API_CONFIG.endpoints.infrastructure.containers)),
      safeArrayRequest(() => this.apiClient.get(API_CONFIG.endpoints.infrastructure.containersAlerts)),
      safeArrayRequest(() => this.apiClient.get(API_CONFIG.endpoints.infrastructure.containersLogs)),
    ]);

    const items = this.normalize(payload);
    return {
      source: modeToSource(),
      fallbackActive: false,
      items,
      alerts: alertsPayload,
      logs: logsPayload,
    };
  }

  async fetchDirect() {
    const headers = this.providerConfig.apiKey
      ? { "X-API-Key": this.providerConfig.apiKey }
      : {};

    const payload = await providerFetchJson({
      baseUrl: this.providerConfig.baseUrl,
      path: this.providerConfig.containersPath,
      headers,
    });

    return {
      source: "live",
      fallbackActive: false,
      items: this.normalize(pickArrayPayload(payload)),
      alerts: [],
      logs: [],
    };
  }

  buildOperationalState(data) {
    const items = data.items || [];
    const alerts = data.alerts || [];
    const logs = data.logs || [];
    const healthy = items.filter((item) => item.status === "Healthy").length;

    return {
      provider: "docker-portainer",
      source: data.source,
      fallbackActive: Boolean(data.fallbackActive),
      fallbackReason: data.fallbackReason || "",
      telemetry: {
        containerCount: items.length,
        healthyContainers: healthy,
      },
      health: items.map((item) => ({
        id: item.id,
        name: item.name,
        status: item.status,
        metric: `${item.cpuPct}% CPU / ${item.memoryMb} MB`,
      })),
      alerts,
      logs,
      actions: [
        {
          id: "restart-container",
          label: "Restart container",
          action: "restart",
          enabled: true,
        },
      ],
    };
  }

  async getOperationalState() {
    const data = await this.getContainerRuntime();
    return this.buildOperationalState(data);
  }

  normalize(payload) {
    return payload.map((item, index) => ({
      id: item.id || `${index}`,
      name: item.container || item.stack || item.Names?.[0]?.replace(/^\//, "") || `container-${index + 1}`,
      status: item.state || item.status || "Healthy",
      health: item.health || item.Status || "healthy",
      cpuPct: safeNumber(item.cpuPct || item.cpu, 0),
      memoryMb: safeNumber(item.memoryMb || item.memory, 0),
      restartSupported: true,
    }));
  }

  async prepareRestart(containerId) {
    return this.restartContainer(containerId);
  }

  async restartContainer(containerId) {
    if (this.providerConfig.enabled && this.providerConfig.direct && this.providerConfig.baseUrl) {
      return this.directContainerAction("restart", containerId, this.providerConfig.restartPath);
    }

    return this.apiContainerAction(API_CONFIG.endpoints.infrastructure.containersRestart, "restart", containerId, { dryRun: false });
  }

  async startContainer(containerId) {
    if (this.providerConfig.enabled && this.providerConfig.direct && this.providerConfig.baseUrl) {
      return this.directContainerAction("start", containerId, this.providerConfig.startPath);
    }

    return this.apiContainerAction(API_CONFIG.endpoints.infrastructure.containersStart, "start", containerId);
  }

  async stopContainer(containerId) {
    if (this.providerConfig.enabled && this.providerConfig.direct && this.providerConfig.baseUrl) {
      return this.directContainerAction("stop", containerId, this.providerConfig.stopPath);
    }

    return this.apiContainerAction(API_CONFIG.endpoints.infrastructure.containersStop, "stop", containerId);
  }

  async apiContainerAction(endpoint, action, containerId, extraPayload = {}) {
    try {
      const response = await this.apiClient.post(endpoint, {
        containerId,
        ...extraPayload,
      });
      const payload = response?.data?.data || response?.data || { accepted: false };
      return {
        success: payload.accepted !== false,
        provider: "docker-portainer",
        action,
        targetId: containerId,
        source: modeToSource(),
        timestamp: payload.timestamp || toIsoNow(),
        message: payload.message || `Container ${action} request accepted`,
        data: payload,
      };
    } catch (error) {
      return {
        success: false,
        provider: "docker-portainer",
        action,
        targetId: containerId,
        source: modeToSource(),
        timestamp: toIsoNow(),
        message: error?.message || `Failed to ${action} container`,
      };
    }
  }

  async directContainerAction(action, containerId, pathTemplate) {
    const path = fillPath(pathTemplate, { id: containerId });

    try {
      const payload = await providerFetchJson({
        baseUrl: this.providerConfig.baseUrl,
        path,
        method: "POST",
        headers: this.providerConfig.apiKey ? { "X-API-Key": this.providerConfig.apiKey } : {},
      });

      return {
        success: true,
        provider: "docker-portainer",
        action,
        targetId: containerId,
        source: "live",
        timestamp: toIsoNow(),
        message: `Container ${action} request accepted`,
        data: payload,
      };
    } catch (error) {
      return {
        success: false,
        provider: "docker-portainer",
        action,
        targetId: containerId,
        source: "live",
        timestamp: toIsoNow(),
        message: error?.message || `Failed to ${action} container`,
      };
    }
  }
}
