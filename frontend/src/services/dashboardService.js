import { API_CONFIG } from "../constants/api";
import { formatApiError } from "../utils/errorHandling";
import { infrastructureIntegrationService } from "./infrastructureIntegrationService";
import { tmosEventBus } from "./tmosEventBus";
import { broadcastEngineService } from "./broadcastEngineService";

function toStat(label, value, tone, detail) {
  return { label, value: String(value), tone, detail };
}

function average(values = []) {
  if (!values.length) return 0;
  return values.reduce((acc, value) => acc + Number(value || 0), 0) / values.length;
}

function toPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function buildProxmoxStats(proxmox) {
  const nodes = proxmox.nodes || [];
  const vms = proxmox.items || [];
  const storage = proxmox.storage || [];

  const nodeNames = nodes.map((item) => item.node).filter(Boolean);
  const primaryNode = nodeNames[0] || "Unavailable";
  const vmCount = vms.length;
  const runningVmCount = vms.filter((item) => String(item.status).toLowerCase() === "running").length;

  const cpuUsagePct = nodes.length
    ? average(nodes.map((item) => Number(item.cpuPct || 0)))
    : average(vms.map((item) => Number(item.cpuPct || 0)));
  const memoryUsagePct = nodes.length
    ? average(nodes.map((item) => Number(item.memoryPct || 0)))
    : average(vms.map((item) => Number(item.memoryPct || 0)));

  const totalStorageBytes = storage.reduce((acc, item) => acc + Number(item.totalBytes || 0), 0);
  const usedStorageBytes = storage.reduce((acc, item) => acc + Number(item.usedBytes || 0), 0);
  const storageUsagePct = totalStorageBytes > 0
    ? (usedStorageBytes / totalStorageBytes) * 100
    : average(storage.map((item) => Number(item.usedPct || 0)));

  return [
    toStat("Node Name", primaryNode, "blue", `${nodeNames.length || 0} nodes discovered`),
    toStat("VM Count", vmCount, "green", `${runningVmCount} running`),
    toStat("Running VM Count", runningVmCount, "teal", `${Math.max(vmCount - runningVmCount, 0)} stopped`),
    toStat("CPU Usage", toPercent(cpuUsagePct), "cyan", "Average cluster CPU"),
    toStat("Memory Usage", toPercent(memoryUsagePct), "purple", "Average cluster memory"),
    toStat("Storage Usage", toPercent(storageUsagePct), "amber", "Aggregate storage usage"),
  ];
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

function buildInfrastructureAlerts(monitors, containers, proxyHosts) {
  const monitoringAlerts = (monitors || [])
    .filter((item) => item.status !== "Healthy")
    .map((item) => ({
      title: `Monitor ${item.name}`,
      detail: `${item.status} - ${item.latencyMs} ms - ${item.uptimePct}% uptime`,
      severity: item.status === "Healthy" ? "info" : "warning",
    }));

  const containerAlerts = (containers || [])
    .filter((item) => item.status !== "Healthy")
    .map((item) => ({
      title: `Container ${item.name}`,
      detail: `${item.status} - ${item.cpuPct}% CPU - ${item.memoryMb} MB`,
      severity: "warning",
    }));

  const proxyAlerts = (proxyHosts || [])
    .filter((item) => item.status !== "Online")
    .map((item) => ({
      title: `Proxy ${item.domain}`,
      detail: `${item.status} - ${item.upstream}`,
      severity: "warning",
    }));

  return [...monitoringAlerts, ...containerAlerts, ...proxyAlerts].slice(0, 6);
}

function buildInfrastructureActivity(monitors, containers, proxyHosts) {
  const monitorItems = (monitors || []).map((item) => ({
    title: `Monitor ${item.name}`,
    desc: `${item.status} with ${item.latencyMs} ms average latency`,
    time: item.lastCheckedAt || "Live",
  }));

  const containerItems = (containers || []).map((item) => ({
    title: `Container ${item.name}`,
    desc: `${item.status} on image ${item.image}`,
    time: "Live",
  }));

  const proxyItems = (proxyHosts || []).map((item) => ({
    title: `Proxy ${item.domain}`,
    desc: `${item.status} routing to ${item.upstream}`,
    time: "Live",
  }));

  return [...monitorItems, ...containerItems, ...proxyItems].slice(0, 8);
}

function buildModuleCards(containers, monitors, proxyHosts) {
  return [
    {
      icon: "D",
      label: "Docker Runtime",
      description: `${containers.length} live containers detected from the host runtime.`,
    },
    {
      icon: "M",
      label: "Uptime Kuma",
      description: `${monitors.length} live monitors connected through TMOS backend.`,
    },
    {
      icon: "P",
      label: "Proxy Manager",
      description: `${proxyHosts.length} live proxy hosts discovered from Nginx Proxy Manager.`,
    },
  ].filter((item) => !item.description.startsWith("0 "));
}

export const dashboardService = {
  endpoint: API_CONFIG.endpoints.dashboard,

  async getOverview() {
    try {
      const [snapshotResult, eventsResult, incidentsResult, timelineResult, recentChangesResult, monitoringResult, containersResult, proxmoxResult, proxyResult, streamingResult, broadcastResult] = await Promise.allSettled([
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
        broadcastEngineService.getStatus(),
      ]);

      const snapshot = snapshotResult.status === "fulfilled" ? snapshotResult.value : { providers: [] };
      const events = eventsResult.status === "fulfilled" ? eventsResult.value : [];
      const incidents = incidentsResult.status === "fulfilled" ? incidentsResult.value : [];
      const timeline = timelineResult.status === "fulfilled" ? timelineResult.value : [];
      const recentChanges = recentChangesResult.status === "fulfilled" ? recentChangesResult.value : [];
      const monitoring = monitoringResult.status === "fulfilled"
        ? monitoringResult.value
        : { monitors: [], incidents: [] };
      const containers = containersResult.status === "fulfilled"
        ? containersResult.value
        : { items: [], alerts: [] };
      const proxmox = proxmoxResult.status === "fulfilled"
        ? proxmoxResult.value
        : {
            source: "live",
            fallbackActive: false,
            fallbackReason: proxmoxResult.reason?.message || "Proxmox unavailable",
            items: [],
            nodes: [],
            storage: [],
            tasks: [],
            alerts: [],
            logs: [],
          };
      const proxy = proxyResult.status === "fulfilled"
        ? proxyResult.value
        : { hosts: [], certificates: [] };
      const streaming = streamingResult.status === "fulfilled"
        ? streamingResult.value
        : { rtmp: [], hls: [] };
      const broadcast = broadcastResult.status === "fulfilled"
        ? broadcastResult.value
        : {
            engineStatus: "unknown",
            recordingStatus: "unknown",
            rtmpStatus: "not-configured",
            srtStatus: "not-configured",
            ffmpegReadiness: "unknown",
            activeProgram: "Program standby",
            cpuUsagePct: 0,
            memoryUsagePct: 0,
            uptimeSeconds: 0,
            lastError: broadcastResult.reason?.message || "",
          };

      const providerMap = new Map((snapshot.providers || []).map((provider) => [provider.provider, provider]));
      const streamingProvider = providerMap.get("streaming");
      const streamingEndpointCount = (streaming.rtmp || []).length + (streaming.hls || []).length;
      const proxmoxStats = buildProxmoxStats(proxmox);
      const moduleCards = buildModuleCards(containers.items || [], monitoring.monitors || [], proxy.hosts || []);
      const infrastructureAlerts = buildInfrastructureAlerts(monitoring.monitors || [], containers.items || [], proxy.hosts || []);
      const infrastructureActivity = buildInfrastructureActivity(monitoring.monitors || [], containers.items || [], proxy.hosts || []);

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
          stats: proxmoxStats,
          proxmoxNodes: proxmox.nodes || [],
          proxmoxVms: proxmox.items || [],
          broadcast,
          channels: [],
          alerts: infrastructureAlerts,
          assistantActions: [],
          quickActions: [],
          modules: moduleCards,
          activity: infrastructureActivity,
          integrationReady: true,
          statusMessage: proxmox.fallbackReason || "No live data available yet",
        };
      }

      return {
        stats: proxmoxStats,
        proxmoxNodes: proxmox.nodes || [],
        proxmoxVms: proxmox.items || [],
        broadcast,
        channels: buildChannelsFromStreaming(streaming),
        alerts: infrastructureAlerts.length ? infrastructureAlerts : incidents.slice(0, 6).map(toAlert),
        assistantActions: incidents.slice(0, 3).map((event) => `Investigate ${event.provider}: ${event.message}`),
        quickActions: [],
        modules: moduleCards,
        activity: [...infrastructureActivity, ...timeline, ...recentChanges].slice(0, 8),
        integrationReady: false,
        statusMessage: "Live provider telemetry connected",
      };
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },
};
