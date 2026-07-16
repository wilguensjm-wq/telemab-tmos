import ModulePage from "../components/common/ModulePage";
import { useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { infrastructureIntegrationService } from "../services/infrastructureIntegrationService";
import { sourceToBadge } from "../services/sourceState";
import EmptyTableRow from "../components/common/EmptyTableRow";

export default function SystemHealth() {
  const { pathname } = useLocation();
  const [proxmoxVms, setProxmoxVms] = useState([]);
  const [proxmoxNodes, setProxmoxNodes] = useState([]);
  const [proxmoxStorage, setProxmoxStorage] = useState([]);
  const [proxmoxTasks, setProxmoxTasks] = useState([]);
  const [proxmoxAlerts, setProxmoxAlerts] = useState([]);
  const [source, setSource] = useState("backend-cache");
  const [providerRows, setProviderRows] = useState([]);
  const [fallbackReason, setFallbackReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const configByPath = {
    "/infrastructure/proxmox": {
      title: "Proxmox",
      subtitle: "Operate virtualization hosts, VM health, and cluster resource allocation.",
      endpoint: "GET /infrastructure/proxmox/cluster",
      requestModel: "ProxmoxClusterRequest",
      responseModel: "ProxmoxClusterResponse",
    },
    "/infrastructure/ubuntu": {
      title: "Ubuntu Servers",
      subtitle: "Monitor Ubuntu service hosts, package posture, and runtime stability.",
      endpoint: "GET /infrastructure/ubuntu/servers",
      requestModel: "UbuntuServersRequest",
      responseModel: "UbuntuServersResponse",
    },
    "/infrastructure/storage": {
      title: "Storage",
      subtitle: "Track media volumes, retention pools, and IOPS saturation across storage backends.",
      endpoint: "GET /infrastructure/storage/volumes",
      requestModel: "StorageVolumesRequest",
      responseModel: "StorageVolumesResponse",
    },
    "/infrastructure/network": {
      title: "Network",
      subtitle: "Inspect network throughput, packet health, and path latency across TELEMAP services.",
      endpoint: "GET /infrastructure/network/links",
      requestModel: "NetworkLinksRequest",
      responseModel: "NetworkLinksResponse",
    },
  };

  const pageConfig = pathname.includes("/monitoring/logs")
    ? {
        title: "Logs",
        subtitle: "Review infrastructure and service logs correlated across host, container, and proxy layers.",
        endpoint: "GET /monitoring/logs/streams",
        requestModel: "LogsStreamRequest",
        responseModel: "LogsStreamResponse",
      }
    : configByPath[pathname] || {
        title: "Infrastructure",
        subtitle: "Observe Proxmox, Ubuntu, Docker, Portainer, Uptime Kuma, and Nginx Proxy Manager in one NOC console.",
        endpoint: "GET /infrastructure/noc/overview",
        requestModel: "InfrastructureOverviewRequest",
        responseModel: "InfrastructureOverviewResponse",
      };

  useEffect(() => {
    let mounted = true;

    async function loadInfrastructureView() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        if (pathname.includes("/infrastructure/proxmox")) {
          const vmData = await infrastructureIntegrationService.getProxmoxOverview();
          if (!mounted) return;
          setProxmoxVms(vmData.items || []);
          setProxmoxNodes(vmData.nodes || []);
          setProxmoxStorage(vmData.storage || []);
          setProxmoxTasks(vmData.tasks || []);
          setProxmoxAlerts(vmData.alerts || []);
          setProviderRows([]);
          setSource(vmData.source || "backend-cache");
          setFallbackReason(vmData.fallbackActive ? vmData.fallbackReason || "Live connection not configured" : "");
        } else {
          const snapshot = await infrastructureIntegrationService.getProviderOperationsSnapshot();
          if (!mounted) return;
          const rows = (snapshot.providers || []).flatMap((provider) => {
            const providerHealth = Array.isArray(provider.health) ? provider.health : [];

            if (providerHealth.length === 0) {
              return [{
                service: String(provider.provider || "unknown").toUpperCase(),
                role: "Provider integration",
                state: provider.fallbackActive ? "Warning" : "Healthy",
                node: provider.source || "Live connection not configured",
                metric: provider.fallbackActive ? "Fallback active" : "Connected",
              }];
            }

            return providerHealth.map((item, index) => ({
              service: item.name || `${String(provider.provider || "provider").toUpperCase()} ${index + 1}`,
              role: `${String(provider.provider || "provider").toUpperCase()} integration`,
              state: item.status || (provider.fallbackActive ? "Warning" : "Healthy"),
              node: provider.source || "Not Connected",
              metric: item.metric || "N/A",
            }));
          });

          setProxmoxVms([]);
          setProxmoxNodes([]);
          setProxmoxStorage([]);
          setProxmoxTasks([]);
          setProxmoxAlerts([]);
          setProviderRows(rows);
          setSource("backend-cache");
          setFallbackReason("");
        }
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error.message || "Failed to load Proxmox VM metrics.");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadInfrastructureView();

    return () => {
      mounted = false;
    };
  }, [pathname]);

  async function reloadProxmox() {
    const vmData = await infrastructureIntegrationService.getProxmoxOverview();
    setProxmoxVms(vmData.items || []);
    setProxmoxNodes(vmData.nodes || []);
    setProxmoxStorage(vmData.storage || []);
    setProxmoxTasks(vmData.tasks || []);
    setProxmoxAlerts(vmData.alerts || []);
    setSource(vmData.source || "backend-cache");
    setFallbackReason(vmData.fallbackActive ? vmData.fallbackReason || "Direct provider unavailable" : "");
  }

  const infraStats = useMemo(() => {
    const hasProxmoxData = proxmoxVms.length > 0;
    const hasProviderData = providerRows.length > 0;

    if (pathname.includes("/infrastructure/proxmox")) {
      return [
        { label: "Nodes", value: proxmoxNodes.length > 0 ? String(proxmoxNodes.length) : "—", tone: "blue", detail: proxmoxNodes.length > 0 ? "Cluster node inventory" : "Live connection not configured" },
        { label: "VMs", value: hasProxmoxData ? String(proxmoxVms.length) : "—", tone: "green", detail: hasProxmoxData ? "Proxmox VM inventory" : "Live connection not configured" },
        { label: "Storage", value: proxmoxStorage.length > 0 ? String(proxmoxStorage.length) : "—", tone: "teal", detail: proxmoxStorage.length > 0 ? "Storage pools discovered" : "Live connection not configured" },
        { label: "Tasks", value: proxmoxTasks.length > 0 ? String(proxmoxTasks.length) : "—", tone: "cyan", detail: proxmoxTasks.length > 0 ? "Recent cluster tasks" : "Live connection not configured" },
        { label: "Alerts", value: proxmoxAlerts.length > 0 ? String(proxmoxAlerts.length) : "—", tone: "amber", detail: proxmoxAlerts.length > 0 ? "Task or provider alerts" : "Live connection not configured" },
        { label: "Source", value: hasProxmoxData || proxmoxNodes.length > 0 ? sourceToBadge(source).label : "Live connection not configured", tone: "purple", detail: "Provider telemetry source" },
      ];
    }

    return [
      { label: "Service Rows", value: hasProviderData ? String(providerRows.length) : "—", tone: "blue", detail: hasProviderData ? "Aggregated provider health rows" : "Live connection not configured" },
      { label: "Healthy", value: hasProviderData ? String(providerRows.filter((item) => String(item.state).toLowerCase() === "healthy").length) : "—", tone: "green", detail: hasProviderData ? "Connected service entries" : "Live connection not configured" },
      { label: "Warnings", value: hasProviderData ? String(providerRows.filter((item) => String(item.state).toLowerCase() !== "healthy").length) : "—", tone: "teal", detail: hasProviderData ? "Degraded or unknown entries" : "Live connection not configured" },
      { label: "Source", value: hasProviderData ? "Backend" : "Live connection not configured", tone: "cyan", detail: "TMOS gateway-backed data" },
    ];
  }, [pathname, providerRows, proxmoxAlerts.length, proxmoxNodes.length, proxmoxStorage.length, proxmoxTasks.length, proxmoxVms, source]);

  async function handleVmAction(vm, action) {
    const confirmation = window.confirm(`Confirm ${action} for ${vm.vm}?`);
    if (!confirmation) return;

    setIsLoading(true);
    setErrorMessage("");

    try {
      let result;
      if (action === "start") {
        result = await infrastructureIntegrationService.startProxmoxVm(vm.id);
      } else if (action === "stop") {
        result = await infrastructureIntegrationService.stopProxmoxVm(vm.id);
      } else if (action === "restart") {
        result = await infrastructureIntegrationService.rebootProxmoxVm(vm.id);
      } else {
        result = await infrastructureIntegrationService.openProxmoxConsole(vm.id);
      }

      setActionMessage(result.message || `VM action ${action} completed.`);
      await reloadProxmox();
    } catch (error) {
      setErrorMessage(error.message || `Failed to ${action} VM.`);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <ModulePage
      title={pageConfig.title}
      subtitle={pageConfig.subtitle}
      summary={`Infrastructure telemetry source: ${sourceToBadge(source).label}.${fallbackReason ? ` Fallback active: ${fallbackReason}` : ""}${actionMessage ? ` Last action: ${actionMessage}` : ""}`}
      dataSource={pathname.includes("/infrastructure/proxmox") ? sourceToBadge(source) : null}
      stats={infraStats}
      actions={(
        <>
          <button type="button" className="action-button">Run infra diagnostics</button>
          <button type="button" className="ghost-button">Open host logs</button>
        </>
      )}
      apiSpec={{
        endpoint: pageConfig.endpoint,
        requestModel: pageConfig.requestModel,
        responseModel: pageConfig.responseModel,
        loadingState: "Load host, container, monitoring, and proxy metrics from NOC services.",
        emptyState: "Show that no infrastructure services have reported telemetry.",
        errorState: "Display infrastructure API error and fallback to last known status.",
      }}
      searchPlaceholder="Search service"
      filters={["All", "Healthy", "Warning"]}
      tableTitle="Infrastructure service status"
      tableSubtitle="Real service health, host metrics, and operational ownership"
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage={pathname.includes("/infrastructure/proxmox") ? "No Proxmox VMs were returned by the adapter." : "No items available yet."}
    >
      {({ searchValue, activeFilter }) => {
        if (pathname.includes("/infrastructure/proxmox")) {
          const filteredVms = proxmoxVms.filter((vm) => {
            const matchesSearch = vm.vm.toLowerCase().includes(searchValue.toLowerCase());
            const matchesFilter = activeFilter === "All" || vm.status === activeFilter;
            return matchesSearch && matchesFilter;
          });

          return (
            <>
              <h4>Virtual Machines</h4>
              <table className="table">
                <thead>
                  <tr>
                    <th>VM</th>
                    <th>Status</th>
                    <th>CPU</th>
                    <th>Memory</th>
                    <th>Storage</th>
                    <th>Network</th>
                    <th>Power</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVms.length === 0 ? (
                    <EmptyTableRow colSpan={8} message="Live connection not configured" />
                  ) : (
                    filteredVms.map((vm) => (
                      <tr key={vm.id}>
                        <td>{vm.vm}</td>
                        <td>{vm.status}</td>
                        <td>{vm.cpuPct}%</td>
                        <td>{vm.memoryPct}%</td>
                        <td>{vm.storagePct}%</td>
                        <td>{vm.networkMbps} Mbps</td>
                        <td>{vm.powerState}</td>
                        <td>
                          <div className="table-actions">
                            <button type="button" className="ghost-button" onClick={() => handleVmAction(vm, "start")}>Start</button>
                            <button type="button" className="ghost-button" onClick={() => handleVmAction(vm, "stop")}>Stop</button>
                            <button type="button" className="ghost-button" onClick={() => handleVmAction(vm, "restart")}>Restart</button>
                            <button type="button" className="ghost-button" onClick={() => handleVmAction(vm, "console")}>Console</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <h4>Nodes</h4>
              <table className="table">
                <thead>
                  <tr>
                    <th>Node</th>
                    <th>Status</th>
                    <th>CPU</th>
                    <th>Memory</th>
                    <th>Uptime (s)</th>
                  </tr>
                </thead>
                <tbody>
                  {proxmoxNodes.length === 0 ? (
                    <EmptyTableRow colSpan={5} message="Live connection not configured" />
                  ) : (
                    proxmoxNodes.map((node) => (
                      <tr key={node.id}>
                        <td>{node.node}</td>
                        <td>{node.status}</td>
                        <td>{node.cpuPct.toFixed(1)}%</td>
                        <td>{node.memoryPct.toFixed(1)}%</td>
                        <td>{node.uptimeSec}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <h4>Storage</h4>
              <table className="table">
                <thead>
                  <tr>
                    <th>Storage</th>
                    <th>Node</th>
                    <th>Status</th>
                    <th>Used</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {proxmoxStorage.length === 0 ? (
                    <EmptyTableRow colSpan={5} message="Live connection not configured" />
                  ) : (
                    proxmoxStorage.map((storage) => (
                      <tr key={storage.id}>
                        <td>{storage.storage}</td>
                        <td>{storage.node}</td>
                        <td>{storage.status}</td>
                        <td>{storage.usedPct.toFixed(1)}%</td>
                        <td>{storage.kind}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <h4>Tasks</h4>
              <table className="table">
                <thead>
                  <tr>
                    <th>Task ID</th>
                    <th>Node</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>VMID</th>
                  </tr>
                </thead>
                <tbody>
                  {proxmoxTasks.length === 0 ? (
                    <EmptyTableRow colSpan={5} message="Live connection not configured" />
                  ) : (
                    proxmoxTasks.slice(0, 20).map((task) => (
                      <tr key={task.id}>
                        <td>{task.id}</td>
                        <td>{task.node || "-"}</td>
                        <td>{task.type}</td>
                        <td>{task.status}</td>
                        <td>{task.vmid || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <h4>Alerts</h4>
              <table className="table">
                <thead>
                  <tr>
                    <th>Alert ID</th>
                    <th>Resource</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {proxmoxAlerts.length === 0 ? (
                    <EmptyTableRow colSpan={5} message="Live connection not configured" />
                  ) : (
                    proxmoxAlerts.slice(0, 20).map((alert) => (
                      <tr key={alert.id}>
                        <td>{alert.id}</td>
                        <td>{alert.resource}</td>
                        <td>{alert.severity}</td>
                        <td>{alert.status}</td>
                        <td>{alert.action}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </>
          );
        }

        const filtered = providerRows.filter((item) => {
          const matchesSearch = item.service.toLowerCase().includes(searchValue.toLowerCase());
          const matchesFilter = activeFilter === "All" || item.state === activeFilter;
          return matchesSearch && matchesFilter;
        });

        return (
          <table className="table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Role</th>
                <th>State</th>
                <th>Node</th>
                <th>Metric</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyTableRow colSpan={5} message="Live connection not configured" />
              ) : (
                filtered.map((item) => (
                  <tr key={item.service}>
                    <td>{item.service}</td>
                    <td>{item.role}</td>
                    <td>{item.state}</td>
                    <td>{item.node}</td>
                    <td>{item.metric}</td>
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
