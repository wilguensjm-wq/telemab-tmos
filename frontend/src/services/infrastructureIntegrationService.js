import APIClient from "../api/APIClient";
import { PROVIDER_CONFIG } from "../constants/providers";
import { UptimeKumaAdapter } from "../providers/adapters/UptimeKumaAdapter";
import { DockerPortainerAdapter } from "../providers/adapters/DockerPortainerAdapter";
import { ProxmoxAdapter } from "../providers/adapters/ProxmoxAdapter";
import { NginxProxyManagerAdapter } from "../providers/adapters/NginxProxyManagerAdapter";
import { StreamingAdapter } from "../providers/adapters/StreamingAdapter";
import { formatApiError } from "../utils/errorHandling";
import { auditService } from "./auditService";

const uptimeKumaAdapter = new UptimeKumaAdapter({
  apiClient: APIClient,
  providerConfig: PROVIDER_CONFIG.uptimeKuma,
});

const dockerPortainerAdapter = new DockerPortainerAdapter({
  apiClient: APIClient,
  providerConfig: PROVIDER_CONFIG.portainer,
});

const proxmoxAdapter = new ProxmoxAdapter({
  apiClient: APIClient,
  providerConfig: PROVIDER_CONFIG.proxmox,
});

const nginxProxyManagerAdapter = new NginxProxyManagerAdapter({
  apiClient: APIClient,
  providerConfig: PROVIDER_CONFIG.nginxProxyManager,
});
const streamingAdapter = new StreamingAdapter({ apiClient: APIClient });

function toPercent(value) {
  return `${Number(value).toFixed(1)}%`;
}

async function publishActionEvent(result, domain = "infrastructure") {
  const { tmosEventBus } = await import("./tmosEventBus");
  return tmosEventBus.publishEvent({
    provider: result.provider,
    source: result.source,
    domain,
    type: "action",
    severity: result.success ? "info" : "critical",
    status: result.success ? "acknowledged" : "open",
    message: result.message,
    entityId: result.targetId,
    entityName: result.targetId,
    raw: result.data || {},
  });
}

async function recordAction(result, actionName) {
  await auditService.recordAction({
    actor: "operator",
    action: actionName,
    target: result.targetId,
    result: result.success ? "success" : "failure",
    metadata: result,
  });
}

export const infrastructureIntegrationService = {
  async getMonitoringOverview() {
    try {
      const data = await uptimeKumaAdapter.getMonitoringOverview();
      const monitors = data.monitors || [];
      const healthyCount = monitors.filter((item) => item.status === "Healthy").length;
      const avgLatency = monitors.length
        ? Math.round(monitors.reduce((acc, item) => acc + Number(item.latencyMs || 0), 0) / monitors.length)
        : 0;
      const avgUptime = monitors.length
        ? monitors.reduce((acc, item) => acc + Number(item.uptimePct || 0), 0) / monitors.length
        : 0;

      return {
        source: data.source,
        fallbackActive: Boolean(data.fallbackActive),
        fallbackReason: data.fallbackReason || "",
        monitors,
        incidents: data.incidents || [],
        stats: {
          activeMonitors: monitors.length,
          healthyEndpoints: healthyCount,
          averageLatencyMs: avgLatency,
          uptimePct: toPercent(avgUptime),
        },
      };
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async getContainerRuntime() {
    try {
      const data = await dockerPortainerAdapter.getContainerRuntime();
      return {
        source: data.source,
        fallbackActive: Boolean(data.fallbackActive),
        fallbackReason: data.fallbackReason || "",
        items: data.items || [],
        alerts: data.alerts || [],
        logs: data.logs || [],
      };
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async prepareContainerRestart(containerId) {
    try {
      return await dockerPortainerAdapter.prepareRestart(containerId);
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async getProxmoxOverview() {
    try {
      const data = await proxmoxAdapter.getVmOverview();
      return {
        source: data.source,
        fallbackActive: Boolean(data.fallbackActive),
        fallbackReason: data.fallbackReason || "",
        items: data.items || [],
        nodes: data.nodes || [],
        storage: data.storage || [],
        tasks: data.tasks || [],
        alerts: data.alerts || [],
        logs: data.logs || [],
      };
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async getProxyOverview() {
    try {
      const data = await nginxProxyManagerAdapter.getProxyOverview();
      return {
        source: data.source,
        fallbackActive: Boolean(data.fallbackActive),
        fallbackReason: data.fallbackReason || "",
        hosts: data.hosts || [],
        certificates: data.certificates || [],
        alerts: data.alerts || [],
        logs: data.logs || [],
      };
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async getStreamingInterfaces() {
    try {
      const [obs, ffmpeg, rtmp, hls, livekit] = await Promise.all([
        streamingAdapter.getObsConnections(),
        streamingAdapter.getFfmpegJobs(),
        streamingAdapter.getRtmpEndpoints(),
        streamingAdapter.getHlsEndpoints(),
        streamingAdapter.getLiveKitRooms(),
      ]);

      return { obs, ffmpeg, rtmp, hls, livekit };
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async getProviderOperationsSnapshot() {
    try {
      const [proxmox, containers, monitoring, proxy, streaming] = await Promise.all([
        proxmoxAdapter.getOperationalState(),
        dockerPortainerAdapter.getOperationalState(),
        uptimeKumaAdapter.getOperationalState(),
        nginxProxyManagerAdapter.getOperationalState(),
        streamingAdapter.getOperationalState(),
      ]);

      return {
        providers: [proxmox, containers, monitoring, proxy, streaming],
      };
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async restartContainer(containerId) {
    try {
      const result = await dockerPortainerAdapter.restartContainer(containerId);
      await recordAction(result, "infrastructure.restartContainer");
      await publishActionEvent(result);
      return result;
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async startContainer(containerId) {
    try {
      const result = await dockerPortainerAdapter.startContainer(containerId);
      await recordAction(result, "infrastructure.startContainer");
      await publishActionEvent(result);
      return result;
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async stopContainer(containerId) {
    try {
      const result = await dockerPortainerAdapter.stopContainer(containerId);
      await recordAction(result, "infrastructure.stopContainer");
      await publishActionEvent(result);
      return result;
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async startProxmoxVm(vmId) {
    try {
      const result = await proxmoxAdapter.startVm(vmId);
      await recordAction(result, "infrastructure.startVm");
      await publishActionEvent(result);
      return result;
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async stopProxmoxVm(vmId) {
    try {
      const result = await proxmoxAdapter.stopVm(vmId);
      await recordAction(result, "infrastructure.stopVm");
      await publishActionEvent(result);
      return result;
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async rebootProxmoxVm(vmId) {
    try {
      const result = await proxmoxAdapter.rebootVm(vmId);
      await recordAction(result, "infrastructure.rebootVm");
      await publishActionEvent(result);
      return result;
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async openProxmoxConsole(vmId) {
    try {
      const result = await proxmoxAdapter.openConsole(vmId);
      await recordAction(result, "infrastructure.openVmConsole");
      await publishActionEvent(result);
      return result;
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async pauseMonitoringMonitor(monitorId) {
    try {
      const result = await uptimeKumaAdapter.pauseMonitor(monitorId);
      await recordAction(result, "monitoring.pauseMonitor");
      await publishActionEvent(result);
      return result;
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async resumeMonitoringMonitor(monitorId) {
    try {
      const result = await uptimeKumaAdapter.resumeMonitor(monitorId);
      await recordAction(result, "monitoring.resumeMonitor");
      await publishActionEvent(result);
      return result;
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async refreshMonitoringMonitor(monitorId) {
    try {
      const result = await uptimeKumaAdapter.refreshMonitor(monitorId);
      await recordAction(result, "monitoring.refreshMonitor");
      await publishActionEvent(result);
      return result;
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async acknowledgeMonitoringIncident(incidentId) {
    try {
      const result = await uptimeKumaAdapter.acknowledgeIncident(incidentId);
      await recordAction(result, "monitoring.acknowledgeIncident");
      await publishActionEvent(result);
      return result;
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async reloadProxy() {
    try {
      const result = await nginxProxyManagerAdapter.reloadProxy();
      await recordAction(result, "proxy.reload");
      await publishActionEvent(result);
      return result;
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async setProxyHostEnabled(hostId, enabled) {
    try {
      const result = await nginxProxyManagerAdapter.toggleHost(hostId, enabled);
      await recordAction(result, "proxy.toggleHost");
      await publishActionEvent(result);
      return result;
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async renewProxyCertificate(certificateId) {
    try {
      const result = await nginxProxyManagerAdapter.renewCertificate(certificateId);
      await recordAction(result, "proxy.renewCertificate");
      await publishActionEvent(result);
      return result;
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },
};
