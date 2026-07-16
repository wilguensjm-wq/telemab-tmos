import ModulePage from "../components/common/ModulePage";
import { useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { infrastructureIntegrationService } from "../services/infrastructureIntegrationService";
import { sourceToBadge } from "../services/sourceState";
import EmptyTableRow from "../components/common/EmptyTableRow";

export default function Analytics() {
  const { pathname } = useLocation();
  const [overview, setOverview] = useState({ source: "backend-cache", fallbackActive: false, fallbackReason: "", monitors: [], incidents: [], stats: null });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadMonitoring() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const data = await infrastructureIntegrationService.getMonitoringOverview();
        if (!mounted) return;
        setOverview(data);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error.message || "Failed to load monitoring data.");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadMonitoring();

    return () => {
      mounted = false;
    };
  }, []);

  async function reloadMonitoring() {
    const data = await infrastructureIntegrationService.getMonitoringOverview();
    setOverview(data);
  }

  async function handleMonitorAction(monitor, action) {
    const confirmation = window.confirm(`Confirm ${action} for ${monitor.name}?`);
    if (!confirmation) return;

    setIsLoading(true);
    setErrorMessage("");

    try {
      let result;
      if (action === "pause") {
        result = await infrastructureIntegrationService.pauseMonitoringMonitor(monitor.id);
      } else if (action === "resume") {
        result = await infrastructureIntegrationService.resumeMonitoringMonitor(monitor.id);
      } else {
        result = await infrastructureIntegrationService.refreshMonitoringMonitor(monitor.id);
      }

      setActionMessage(result.message || `Monitor ${action} completed.`);
      await reloadMonitoring();
    } catch (error) {
      setErrorMessage(error.message || `Failed to ${action} monitor.`);
    } finally {
      setIsLoading(false);
    }
  }

  const metricRows = useMemo(() => {
    const stats = overview.stats || {
      activeMonitors: 0,
      healthyEndpoints: 0,
      averageLatencyMs: 0,
      uptimePct: "—",
    };

    const hasStats = stats.activeMonitors > 0;

    return [
      { metric: "Active Monitors", current: hasStats ? String(stats.activeMonitors) : "—", trend: hasStats ? "Live" : "Not Connected", target: hasStats ? "Configured" : "Waiting for Provider" },
      { metric: "Healthy Endpoints", current: hasStats ? String(stats.healthyEndpoints) : "—", trend: hasStats ? "Live" : "Not Connected", target: hasStats ? String(stats.activeMonitors) : "Waiting for Provider" },
      { metric: "Average Latency", current: hasStats ? `${stats.averageLatencyMs} ms` : "—", trend: hasStats ? "Live" : "Not Connected", target: hasStats ? "Provider SLA" : "Waiting for Provider" },
      { metric: "Overall Uptime", current: hasStats ? stats.uptimePct : "—", trend: hasStats ? "Live" : "Not Connected", target: hasStats ? "Provider SLA" : "Waiting for Provider" },
    ];
  }, [overview.stats]);

  const pageConfig = pathname.includes("/monitoring/uptime-kuma")
    ? {
        title: "Uptime Kuma",
        subtitle: "Track service checks, endpoint reachability, and monitor states from Uptime Kuma.",
        endpoint: "GET /infrastructure/monitoring/checks",
        requestModel: "MonitoringChecksRequest",
        responseModel: "MonitoringChecksResponse",
      }
    : pathname.includes("/monitoring/alerts")
      ? {
          title: "Alerts",
          subtitle: "Review active alerts, escalation policies, and acknowledgement flow across TELEMAP operations.",
          endpoint: "GET /monitoring/alerts/active",
          requestModel: "MonitoringAlertsRequest",
          responseModel: "MonitoringAlertsResponse",
        }
      : pathname.includes("/monitoring/performance")
        ? {
            title: "Performance",
            subtitle: "Inspect throughput, latency, and service performance SLOs across infrastructure and streaming.",
            endpoint: "GET /monitoring/performance/metrics",
            requestModel: "PerformanceMetricsRequest",
            responseModel: "PerformanceMetricsResponse",
          }
        : pathname.includes("/monitoring/incidents")
          ? {
              title: "Incidents",
              subtitle: "Track incident timelines and operations impact correlated from monitoring sources.",
              endpoint: "GET /monitoring/incidents",
              requestModel: "MonitoringIncidentsRequest",
              responseModel: "MonitoringIncidentsResponse",
            }
          : {
              title: "Monitoring",
              subtitle: "Track service checks, route latency, and availability SLOs from TELEMAP infrastructure monitoring.",
              endpoint: "GET /infrastructure/monitoring/checks",
              requestModel: "MonitoringChecksRequest",
              responseModel: "MonitoringChecksResponse",
            };

  const stats = overview.stats || {
    activeMonitors: 0,
    healthyEndpoints: 0,
    averageLatencyMs: 0,
    uptimePct: "—",
  };
  const hasData = stats.activeMonitors > 0;

  const isIncidentsView = pathname.includes("/monitoring/incidents") || pathname.includes("/monitoring/alerts");

  return (
    <ModulePage
      title={pageConfig.title}
      subtitle={pageConfig.subtitle}
      summary={`Monitoring data source: ${sourceToBadge(overview.source).label}.${overview.fallbackActive ? ` Fallback active: ${overview.fallbackReason}` : ""}${actionMessage ? ` Last action: ${actionMessage}` : ""}`}
      dataSource={sourceToBadge(overview.source)}
      stats={[
        { label: "Active Monitors", value: hasData ? String(stats.activeMonitors) : "—", tone: "blue", detail: hasData ? "Uptime Kuma checks" : "Not Connected" },
        { label: "Healthy Endpoints", value: hasData ? String(stats.healthyEndpoints) : "—", tone: "green", detail: hasData ? "Live monitor status" : "Waiting for Provider" },
        { label: "Average Latency", value: hasData ? `${stats.averageLatencyMs} ms` : "—", tone: "teal", detail: hasData ? "Across monitored services" : "No Data Available" },
        { label: "Overall Uptime", value: hasData ? stats.uptimePct : "—", tone: "cyan", detail: hasData ? "Aggregated monitor uptime" : "No Data Available" },
      ]}
      actions={(
        <>
          <button type="button" className="action-button">Open monitoring console</button>
          <button type="button" className="ghost-button">Refresh checks</button>
        </>
      )}
      apiSpec={{
        endpoint: pageConfig.endpoint,
        requestModel: pageConfig.requestModel,
        responseModel: pageConfig.responseModel,
        loadingState: "Load monitor status and latency from Uptime Kuma APIs.",
        emptyState: "Show that no monitoring checks are currently configured.",
        errorState: "Display monitoring retrieval error and keep last successful snapshot.",
      }}
      searchPlaceholder="Search metric"
      filters={["All", "Host", "Route", "Container", "Stream"]}
      tableTitle="Monitoring KPI snapshot"
      tableSubtitle="Availability and latency indicators for NOC operations"
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage="No monitoring data returned from configured providers."
    >
      {({ searchValue, activeFilter }) => {
        const filteredMetrics = metricRows.filter((item) => {
          const matchesSearch = item.metric.toLowerCase().includes(searchValue.toLowerCase());
          const matchesFilter = activeFilter === "All" || item.metric.includes(activeFilter);
          return matchesSearch && matchesFilter;
        });

        const filteredMonitors = overview.monitors.filter((item) => {
          const matchesSearch = item.name.toLowerCase().includes(searchValue.toLowerCase());
          return matchesSearch;
        });

        const filteredIncidents = overview.incidents.filter((item) => {
          const searchToken = `${item.monitor} ${item.detail}`.toLowerCase();
          return searchToken.includes(searchValue.toLowerCase());
        });

        if (isIncidentsView) {
          return (
            <table className="table">
              <thead>
                <tr>
                  <th>Incident ID</th>
                  <th>Monitor</th>
                  <th>Severity</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {filteredIncidents.length === 0 ? (
                  <EmptyTableRow colSpan={4} message="No Data Available" />
                ) : (
                  filteredIncidents.map((item) => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.monitor}</td>
                      <td>{item.severity}</td>
                      <td>{item.detail}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          );
        }

        if (pathname.includes("/monitoring/uptime-kuma")) {
          return (
            <table className="table">
              <thead>
                <tr>
                  <th>Monitor</th>
                  <th>Status</th>
                  <th>Latency</th>
                  <th>Uptime</th>
                  <th>Incidents</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMonitors.length === 0 ? (
                  <EmptyTableRow colSpan={6} message="Waiting for Provider" />
                ) : (
                  filteredMonitors.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.status}</td>
                      <td>{item.latencyMs} ms</td>
                      <td>{item.uptimePct}%</td>
                      <td>{item.incidentCount}</td>
                      <td>
                        <div className="table-actions">
                          <button type="button" className="ghost-button" onClick={() => handleMonitorAction(item, "pause")}>Pause</button>
                          <button type="button" className="ghost-button" onClick={() => handleMonitorAction(item, "resume")}>Resume</button>
                          <button type="button" className="ghost-button" onClick={() => handleMonitorAction(item, "refresh")}>Refresh</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          );
        }

        return (
          <table className="table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Current</th>
                <th>Trend</th>
                <th>Target</th>
              </tr>
            </thead>
            <tbody>
              {filteredMetrics.length === 0 ? (
                <EmptyTableRow colSpan={4} message="No Data Available" />
              ) : (
                filteredMetrics.map((item) => (
                  <tr key={item.metric}>
                    <td>{item.metric}</td>
                    <td>{item.current}</td>
                    <td>{item.trend}</td>
                    <td>{item.target}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        );
      }}
    </ModulePage>
  );
}
