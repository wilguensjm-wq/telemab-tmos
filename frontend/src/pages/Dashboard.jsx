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

export default function Dashboard() {
  const [overview, setOverview] = useState({
    stats: [],
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

          <ModuleGrid items={overview.modules} />

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
        </>
      ) : null}
    </>
  );
}
