import { API_CONFIG } from "../../constants/api";
import { providerFetchJson, pickArrayPayload } from "../http/providerFetch";
import { modeToSource } from "../../services/sourceState";

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

export class NginxProxyManagerAdapter {
  constructor({ apiClient, providerConfig }) {
    this.apiClient = apiClient;
    this.providerConfig = providerConfig;
  }

  async getProxyOverview() {
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
          throw new Error(`Nginx Proxy Manager direct and fallback failed: ${directError.message || "provider unavailable"}`);
        }
      }
    }

    return this.fetchViaApi();
  }

  async fetchViaApi() {
    const [hosts, certificates, alertsPayload, logsPayload] = await Promise.all([
      safeArrayRequest(() => this.apiClient.get(API_CONFIG.endpoints.infrastructure.proxyHosts)),
      safeArrayRequest(() => this.apiClient.get(API_CONFIG.endpoints.infrastructure.proxyCertificates)),
      safeArrayRequest(() => this.apiClient.get(API_CONFIG.endpoints.infrastructure.proxyAlerts)),
      safeArrayRequest(() => this.apiClient.get(API_CONFIG.endpoints.infrastructure.proxyLogs)),
    ]);

    return {
      source: modeToSource(),
      fallbackActive: false,
      hosts,
      certificates,
      alerts: alertsPayload,
      logs: logsPayload,
    };
  }

  async fetchDirect() {
    const headers = this.providerConfig.accessToken
      ? { Authorization: `Bearer ${this.providerConfig.accessToken}` }
      : {};

    const [hostsPayload, certsPayload] = await Promise.all([
      providerFetchJson({
        baseUrl: this.providerConfig.baseUrl,
        path: this.providerConfig.hostsPath,
        headers,
      }),
      providerFetchJson({
        baseUrl: this.providerConfig.baseUrl,
        path: this.providerConfig.certificatesPath,
        headers,
      }),
    ]);

    return {
      source: "live",
      fallbackActive: false,
      hosts: pickArrayPayload(hostsPayload),
      certificates: pickArrayPayload(certsPayload),
      alerts: [],
      logs: [],
    };
  }

  buildOperationalState(data) {
    const hosts = data.hosts || [];
    const certificates = data.certificates || [];

    return {
      provider: "nginx-proxy-manager",
      source: data.source,
      fallbackActive: Boolean(data.fallbackActive),
      fallbackReason: data.fallbackReason || "",
      telemetry: {
        hostCount: hosts.length,
        certificateCount: certificates.length,
      },
      health: hosts.map((item) => ({
        id: item.id,
        name: item.domain,
        status: item.status,
        metric: item.upstream,
      })),
      alerts: data.alerts || [],
      logs: data.logs || [],
      actions: [
        {
          id: "renew-certificate",
          label: "Renew certificate",
          action: "renew",
          enabled: true,
        },
      ],
    };
  }

  async getOperationalState() {
    const data = await this.getProxyOverview();
    return this.buildOperationalState(data);
  }

  async renewCertificate(certificateId) {
    if (this.providerConfig.enabled && this.providerConfig.direct && this.providerConfig.baseUrl) {
      return this.directAction("renew", this.providerConfig.renewPath, { certificateId });
    }

    try {
      const response = await this.apiClient.post(API_CONFIG.endpoints.infrastructure.proxyRenewCertificate, {
        certificateId,
      });
      const payload = response?.data?.data || response?.data || {};
      return {
        success: true,
        provider: "nginx-proxy-manager",
        action: "renew",
        targetId: certificateId,
        source: modeToSource(),
        timestamp: payload.timestamp || toIsoNow(),
        message: payload.message || "Certificate renew initiated",
        data: payload,
      };
    } catch (error) {
      return {
        success: false,
        provider: "nginx-proxy-manager",
        action: "renew",
        targetId: certificateId,
        source: modeToSource(),
        timestamp: toIsoNow(),
        message: error?.message || "Failed to renew certificate",
      };
    }
  }

  async reloadProxy() {
    if (this.providerConfig.enabled && this.providerConfig.direct && this.providerConfig.baseUrl) {
      return this.directAction("reload", this.providerConfig.reloadPath, {});
    }

    return this.apiAction(API_CONFIG.endpoints.infrastructure.proxyReload, "reload", {});
  }

  async toggleHost(hostId, enabled) {
    if (this.providerConfig.enabled && this.providerConfig.direct && this.providerConfig.baseUrl) {
      return this.directAction("toggle-host", fillPath(this.providerConfig.hostTogglePath, { id: hostId }), { enabled });
    }

    return this.apiAction(API_CONFIG.endpoints.infrastructure.proxyHostToggle, "toggle-host", { hostId, enabled });
  }

  async apiAction(endpoint, action, body) {
    try {
      const response = await this.apiClient.post(endpoint, body);
      const payload = response?.data?.data || response?.data || {};
      return {
        success: true,
        provider: "nginx-proxy-manager",
        action,
        targetId: body.hostId || body.certificateId || "proxy",
        source: modeToSource(),
        timestamp: payload.timestamp || toIsoNow(),
        message: payload.message || `Proxy ${action} accepted`,
        data: payload,
      };
    } catch (error) {
      return {
        success: false,
        provider: "nginx-proxy-manager",
        action,
        targetId: body.hostId || body.certificateId || "proxy",
        source: modeToSource(),
        timestamp: toIsoNow(),
        message: error?.message || `Failed to ${action} proxy`,
      };
    }
  }

  async directAction(action, path, body) {
    try {
      const payload = await providerFetchJson({
        baseUrl: this.providerConfig.baseUrl,
        path,
        method: "POST",
        headers: this.providerConfig.accessToken ? { Authorization: `Bearer ${this.providerConfig.accessToken}` } : {},
        body,
      });

      return {
        success: true,
        provider: "nginx-proxy-manager",
        action,
        targetId: body.hostId || body.certificateId || "proxy",
        source: "live",
        timestamp: toIsoNow(),
        message: `Proxy ${action} accepted`,
        data: payload,
      };
    } catch (error) {
      return {
        success: false,
        provider: "nginx-proxy-manager",
        action,
        targetId: body.hostId || body.certificateId || "proxy",
        source: "live",
        timestamp: toIsoNow(),
        message: error?.message || `Failed to ${action} proxy`,
      };
    }
  }
}
