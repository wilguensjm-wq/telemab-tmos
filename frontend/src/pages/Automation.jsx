import ModulePage from "../components/common/ModulePage";
import { useEffect, useMemo, useState } from "react";
import { infrastructureIntegrationService } from "../services/infrastructureIntegrationService";
import { sourceToBadge } from "../services/sourceState";
import EmptyTableRow from "../components/common/EmptyTableRow";

export default function Automation() {
  const [containers, setContainers] = useState([]);
  const [source, setSource] = useState("backend-cache");
  const [fallbackReason, setFallbackReason] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadContainers() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const data = await infrastructureIntegrationService.getContainerRuntime();
        if (!mounted) return;
        setContainers(data.items || []);
        setSource(data.source || "backend-cache");
        setFallbackReason(data.fallbackActive ? data.fallbackReason || "Direct provider unavailable" : "");
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error.message || "Failed to load container runtime data.");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadContainers();

    return () => {
      mounted = false;
    };
  }, []);

  async function reloadContainers() {
    const data = await infrastructureIntegrationService.getContainerRuntime();
    setContainers(data.items || []);
    setSource(data.source || "backend-cache");
    setFallbackReason(data.fallbackActive ? data.fallbackReason || "Direct provider unavailable" : "");
  }

  async function handleContainerAction(container, action) {
    const confirmation = window.confirm(`Confirm ${action} for ${container.name}?`);
    if (!confirmation) return;

    setIsLoading(true);
    setErrorMessage("");

    try {
      let result;
      if (action === "start") {
        result = await infrastructureIntegrationService.startContainer(container.id);
      } else if (action === "stop") {
        result = await infrastructureIntegrationService.stopContainer(container.id);
      } else {
        result = await infrastructureIntegrationService.restartContainer(container.id);
      }

      setActionMessage(result.message || `Container ${action} completed.`);
      await reloadContainers();
    } catch (error) {
      setErrorMessage(error.message || `Failed to ${action} container.`);
    } finally {
      setIsLoading(false);
    }
  }

  const summaryStats = useMemo(() => {
    const total = containers.length;
    const healthy = containers.filter((item) => item.status === "Healthy").length;
    const avgCpu = total ? (containers.reduce((acc, item) => acc + Number(item.cpuPct || 0), 0) / total).toFixed(1) : "0.0";
    const avgMemory = total ? Math.round(containers.reduce((acc, item) => acc + Number(item.memoryMb || 0), 0) / total) : 0;

    return {
      total,
      healthy,
      avgCpu,
      avgMemory,
    };
  }, [containers]);
  const hasData = containers.length > 0;

  return (
    <ModulePage
      title="Docker and Portainer"
      subtitle="Automate container recovery, stack redeploys, and service scaling through infrastructure policies."
      summary={`Container runtime source: ${sourceToBadge(source).label}.${fallbackReason ? ` Fallback active: ${fallbackReason}` : ""}${actionMessage ? ` Last action: ${actionMessage}` : ""}`}
      dataSource={sourceToBadge(source)}
      stats={[
        { label: "Running Containers", value: hasData ? String(summaryStats.total) : "—", tone: "blue", detail: hasData ? "Docker runtime inventory" : "Not Connected" },
        { label: "Healthy Containers", value: hasData ? String(summaryStats.healthy) : "—", tone: "green", detail: hasData ? "Container health checks" : "Waiting for Provider" },
        { label: "Average CPU", value: hasData ? `${summaryStats.avgCpu}%` : "—", tone: "amber", detail: hasData ? "Across running containers" : "No Data Available" },
        { label: "Average Memory", value: hasData ? `${summaryStats.avgMemory} MB` : "—", tone: "teal", detail: hasData ? "Per-container average" : "No Data Available" },
      ]}
      actions={(
        <>
          <button type="button" className="action-button">Create automation policy</button>
          <button type="button" className="ghost-button">Open Portainer actions</button>
        </>
      )}
      apiSpec={{
        endpoint: "GET /infrastructure/containers/status",
        requestModel: "ContainerRuntimeRequest",
        responseModel: "ContainerRuntimeResponse",
        loadingState: "Load container runtime status, health, CPU, and memory.",
        emptyState: "Show that no containers are currently running.",
        errorState: "Display runtime API error and keep manual recovery options.",
      }}
      searchPlaceholder="Search container"
      filters={["All", "Healthy", "Warning"]}
      tableTitle="Container automation policies"
      tableSubtitle="Container runtime state and restart preparedness"
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage="No containers were returned by the runtime provider."
    >
      {({ searchValue, activeFilter }) => {
        const filtered = containers.filter((item) => {
          const matchesSearch = item.name.toLowerCase().includes(searchValue.toLowerCase());
          const matchesFilter = activeFilter === "All" || item.status === activeFilter;
          return matchesSearch && matchesFilter;
        });

        return (
          <table className="table">
            <thead>
              <tr>
                <th>Container</th>
                <th>Status</th>
                <th>Health</th>
                <th>CPU</th>
                <th>Memory</th>
                  <th>Control</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyTableRow colSpan={6} message="No Data Available" />
              ) : (
                filtered.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.status}</td>
                    <td>{item.health}</td>
                    <td>{item.cpuPct}%</td>
                    <td>{item.memoryMb} MB</td>
                      <td>
                        <div className="table-actions">
                          <button type="button" className="ghost-button" onClick={() => handleContainerAction(item, "start")}>Start</button>
                          <button type="button" className="ghost-button" onClick={() => handleContainerAction(item, "stop")}>Stop</button>
                          <button type="button" className="ghost-button" onClick={() => handleContainerAction(item, "restart")}>Restart</button>
                        </div>
                      </td>
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
