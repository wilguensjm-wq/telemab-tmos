import { API_CONFIG } from "../constants/api";
import { formatApiError } from "../utils/errorHandling";
import { infrastructureIntegrationService } from "./infrastructureIntegrationService";
import { tmosEventBus } from "./tmosEventBus";

function toStat(label, value, tone, detail) {
  return { label, value: String(value), tone, detail };
}

function toAlert(event) {
  return {
    title: `${event.provider.toUpperCase()} ${event.type}`,
    detail: event.message,
    severity: event.severity,
  };
}

function buildChannelsFromStreaming(streaming) {
  const rtmp = (streaming.rtmp || []).map((item) => ({
    name: `RTMP ${item.endpoint}`,
    status: item.status || "Unknown",
    resolution: "N/A",
    bitrate: `${item.bitrateMbps || 0} Mbps`,
    viewers: "N/A",
    program: "RTMP Distribution",
  }));

  const hls = (streaming.hls || []).map((item) => ({
    name: `HLS ${item.endpoint}`,
    status: item.status || "Unknown",
    resolution: "Adaptive",
    bitrate: "N/A",
    viewers: String(item.viewers || 0),
    program: "Public Delivery",
  }));

  const obs = (streaming.obs || []).map((item) => ({
    name: `OBS ${item.node}`,
    status: item.status || "Unknown",
    resolution: "1080p",
    bitrate: "N/A",
    viewers: "N/A",
    program: item.scene || "Studio Program",
  }));

  return [...obs, ...rtmp, ...hls].slice(0, 8);
}

export const dashboardService = {
  endpoint: API_CONFIG.endpoints.dashboard,

  async getOverview() {
    try {
      const [snapshot, events, incidents, timeline, recentChanges, monitoring, containers, proxmox, proxy, streaming] = await Promise.all([
        infrastructureIntegrationService.getProviderOperationsSnapshot(),
        tmosEventBus.getEvents(),
        tmosEventBus.getIncidents(),
        tmosEventBus.getTimeline(8),
        tmosEventBus.getRecentChanges(6),
        infrastructureIntegrationService.getMonitoringOverview(),
        infrastructureIntegrationService.getContainerRuntime(),
        infrastructureIntegrationService.getProxmoxOverview(),
        infrastructureIntegrationService.getProxyOverview(),
        infrastructureIntegrationService.getStreamingInterfaces(),
      ]);

      const providerMap = new Map((snapshot.providers || []).map((provider) => [provider.provider, provider]));
      const streamingProvider = providerMap.get("streaming");
      const streamingEndpointCount = (streaming.rtmp || []).length + (streaming.hls || []).length;

      const criticalCount = incidents.filter((item) => item.severity === "critical").length;
      const warningCount = incidents.filter((item) => item.severity === "warning").length;
      const hasOperationalData = proxmox.items.length > 0
        || containers.items.length > 0
        || monitoring.monitors.length > 0
        || proxy.hosts.length > 0
        || streamingEndpointCount > 0
        || events.length > 0
        || incidents.length > 0;

      if (!hasOperationalData) {
        return {
          stats: [
            toStat("Proxmox Hosts", "—", "blue", "Not Connected"),
            toStat("Docker Containers", "—", "green", "Not Connected"),
            toStat("Uptime Kuma Checks", "—", "teal", "Provider Not Configured"),
            toStat("Nginx Routes", "—", "cyan", "Provider Not Configured"),
            toStat("Streaming Endpoints", "—", "purple", "Waiting for Provider"),
            toStat("Critical Alerts", "—", "amber", "No Data Available"),
            toStat("AI Incidents", "—", "blue", "Waiting for Provider"),
            toStat("Event Throughput", "—", "green", "Connecting..."),
          ],
          channels: [],
          alerts: [],
          assistantActions: [],
          quickActions: [],
          modules: [],
          activity: [],
          integrationReady: true,
          statusMessage: "No live data available yet",
        };
      }

      return {
        stats: [
          toStat("Proxmox Hosts", proxmox.items.length, "blue", `${proxmox.alerts.length} alerts`),
          toStat("Docker Containers", containers.items.length, "green", `${containers.alerts.length} alerts`),
          toStat("Uptime Kuma Checks", monitoring.monitors.length, "teal", `${monitoring.incidents.length} incidents`),
          toStat("Nginx Routes", proxy.hosts.length, "cyan", `${proxy.certificates.length} certificates`),
          toStat("Streaming Endpoints", streamingEndpointCount, "purple", `${(streamingProvider?.alerts || []).length} alerts`),
          toStat("Critical Alerts", criticalCount, "amber", `${warningCount} warnings open`),
          toStat("AI Incidents", incidents.length, "blue", "Derived from TMOS event bus"),
          toStat("Event Throughput", events.length, "green", "Unified provider event stream"),
        ],
        channels: buildChannelsFromStreaming(streaming),
        alerts: incidents.slice(0, 6).map(toAlert),
        assistantActions: incidents.slice(0, 3).map((event) => `Investigate ${event.provider}: ${event.message}`),
        quickActions: [
          { label: "Open Proxmox console", meta: "Inspect VM and host alerts" },
          { label: "Restart degraded container", meta: "Use Portainer restart action" },
          { label: "Acknowledge monitoring incident", meta: "Close resolved Uptime Kuma events" },
        ],
        modules: [
          { label: "Master Control", description: "On-air state, takeover bus, and OBS source switching", icon: "▣" },
          { label: "Media Ingest", description: "FFmpeg queue, upload intake, and metadata extraction", icon: "◫" },
          { label: "Streaming Delivery", description: "RTMP, HLS, SRT, and LiveKit endpoint health", icon: "⬢" },
          { label: "Infrastructure NOC", description: "Proxmox, Ubuntu, Docker, and Portainer telemetry", icon: "◐" },
          { label: "Monitoring", description: "Uptime Kuma checks and cross-service alerts", icon: "◍" },
          { label: "Proxy Control", description: "Nginx routes, SSL certificates, and ingress policies", icon: "◎" },
          { label: "AI Operations", description: "Incident triage and recommended operator actions", icon: "✦" },
          { label: "Automation", description: "Container and stream automation workflows", icon: "⚙" },
          { label: "Security", description: "User access policy and session protection", icon: "⎈" },
        ],
        activity: [...timeline, ...recentChanges].slice(0, 8),
        integrationReady: false,
        statusMessage: "Live provider telemetry connected",
      };
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },
};
