import StatCard from "../components/dashboard/StatCard";
import LiveChannelsTable from "../components/dashboard/LiveChannelsTable";
import AlertPanel from "../components/dashboard/AlertPanel";
import AssistantPanel from "../components/dashboard/AssistantPanel";
import RecentActivityPanel from "../components/dashboard/RecentActivityPanel";
import QuickActionsPanel from "../components/dashboard/QuickActionsPanel";
import ModuleGrid from "../components/dashboard/ModuleGrid";
import LoadingState from "../components/common/LoadingState";
import EmptyState from "../components/common/EmptyState";
import { useEffect, useState } from "react";
import { dashboardService } from "../services/dashboardService";
import "../styles/dashboard.css";

const DEFAULT_BROADCAST_STATE = {
  engineStatus: "unknown",
  recordingStatus: "unknown",
  rtmpStatus: "not-configured",
  srtStatus: "not-configured",
  ffmpegReadiness: "unknown",
  activeProgram: "Program standby",
  cpuUsagePct: 0,
  memoryUsagePct: 0,
  uptimeSeconds: 0,
  lastError: "",
};

function formatUptime(seconds) {
  const total = Number(seconds || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  return `${hours}h ${minutes}m ${remainingSeconds}s`;
}

export default function Dashboard() {
  const [overview, setOverview] = useState({
    stats: [],
    proxmoxNodes: [],
    proxmoxVms: [],
    broadcast: DEFAULT_BROADCAST_STATE,
    channels: [],
    alerts: [],
    assistantActions: [],
    quickActions: [],
    modules: [],
    activity: [],
    integrationReady: false,
    statusMessage: "Connecting...",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const hasExtendedLiveData = overview.channels.length > 0
    || overview.alerts.length > 0
    || overview.assistantActions.length > 0
    || overview.quickActions.length > 0
    || overview.activity.length > 0;

  useEffect(() => {
    let mounted = true;

    async function loadOverview() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const data = await dashboardService.getOverview();
        if (!mounted) return;
        setOverview({
          stats: data.stats || [],
          proxmoxNodes: data.proxmoxNodes || [],
          proxmoxVms: data.proxmoxVms || [],
          broadcast: data.broadcast || DEFAULT_BROADCAST_STATE,
          channels: data.channels || [],
          alerts: data.alerts || [],
          assistantActions: data.assistantActions || [],
          quickActions: data.quickActions || [],
          modules: data.modules || [],
          activity: data.activity || [],
          integrationReady: Boolean(data.integrationReady),
          statusMessage: data.statusMessage || "Connecting...",
        });
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error.message || "Failed to load command center overview.");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadOverview();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <>
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Unified NOC BOC AI Ops</p>
          <h1>Operate TELEMAP infrastructure, broadcast, and AI workflows from one TMOS command center.</h1>
          <p className="hero-copy">
            Monitor Proxmox hosts, Docker services, FFmpeg pipelines, streaming protocols, and AI incidents in a single platform built for daily operations.
          </p>
        </div>
        <div className="hero-badge">
          <span className="hero-dot" />
          {overview.statusMessage}
        </div>
      </section>

      {isLoading ? <LoadingState message="Loading operations command center..." /> : null}
      {errorMessage ? <EmptyState title="Command center unavailable" message={errorMessage} /> : null}

      {!isLoading && !errorMessage ? (
        <>
          <section className="stats-grid">
            {overview.stats.map((item) => (
              <StatCard key={item.label} {...item} />
            ))}
          </section>

          <section className="content-grid">
            <div className="panel">
              <div className="panel-title-row">
                <h3 className="panel-title">Live Proxmox Nodes</h3>
                <p className="panel-caption">{overview.proxmoxNodes.length} nodes</p>
              </div>
              {overview.proxmoxNodes.length ? (
                <div className="live-list-grid">
                  {overview.proxmoxNodes.map((node) => (
                    <article key={node.id || node.node} className="live-list-card">
                      <p className="live-list-title">{node.node}</p>
                      <p className="live-list-meta">Status: {node.status}</p>
                      <p className="live-list-meta">CPU: {Number(node.cpuPct || 0).toFixed(2)}%</p>
                      <p className="live-list-meta">Memory: {Number(node.memoryPct || 0).toFixed(2)}%</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="panel-empty-message">No live node data available.</p>
              )}
            </div>

            <div className="panel">
              <div className="panel-title-row">
                <h3 className="panel-title">Live Proxmox VMs</h3>
                <p className="panel-caption">{overview.proxmoxVms.length} VMs</p>
              </div>
              {overview.proxmoxVms.length ? (
                <div className="live-list-grid">
                  {overview.proxmoxVms.map((vm) => (
                    <article key={vm.id || vm.vmId} className="live-list-card">
                      <p className="live-list-title">{vm.name}</p>
                      <p className="live-list-meta">Node: {vm.node || "n/a"}</p>
                      <p className="live-list-meta">Status: {vm.status}</p>
                      <p className="live-list-meta">CPU: {Number(vm.cpuPct || 0).toFixed(2)}%</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="panel-empty-message">No live VM data available.</p>
              )}
            </div>

            <div className="panel broadcast-status-panel">
              <div className="panel-title-row">
                <h3 className="panel-title">Broadcast Engine</h3>
                <p className="panel-caption">Foundation control status</p>
              </div>
              <div className="broadcast-status-grid">
                <p><span>Engine Status</span>{overview.broadcast.engineStatus}</p>
                <p><span>Recording</span>{overview.broadcast.recordingStatus}</p>
                <p><span>RTMP</span>{overview.broadcast.rtmpStatus}</p>
                <p><span>SRT</span>{overview.broadcast.srtStatus}</p>
                <p><span>FFmpeg Readiness</span>{overview.broadcast.ffmpegReadiness}</p>
                <p><span>Active Program</span>{overview.broadcast.activeProgram || "Program standby"}</p>
                <p><span>CPU</span>{Number(overview.broadcast.cpuUsagePct || 0).toFixed(2)}%</p>
                <p><span>Memory</span>{Number(overview.broadcast.memoryUsagePct || 0).toFixed(2)}%</p>
                <p><span>Uptime</span>{formatUptime(overview.broadcast.uptimeSeconds)}</p>
                <p><span>Last Error</span>{overview.broadcast.lastError || "None"}</p>
              </div>
            </div>
          </section>

          {overview.modules.length > 0 ? <ModuleGrid items={overview.modules} /> : null}

          {hasExtendedLiveData ? (
            <section className="content-grid">
              <div className="content-column">
                <LiveChannelsTable channels={overview.channels} />
                <RecentActivityPanel items={overview.activity} />
              </div>

              <div className="content-column">
                <AlertPanel alerts={overview.alerts} />
                <AssistantPanel actions={overview.assistantActions} />
                <QuickActionsPanel actions={overview.quickActions} />
              </div>
            </section>
          ) : (
            <section className="panel">
              <div className="panel-title-row">
                <h3 className="panel-title">Additional Widgets</h3>
                <p className="panel-caption">Coming Soon</p>
              </div>
              <p className="panel-empty-message">
                Non-Proxmox dashboard modules are hidden until their live provider integrations are implemented.
              </p>
            </section>
          )}
        </>
      ) : null}
    </>
  );
}
