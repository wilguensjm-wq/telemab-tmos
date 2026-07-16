import ModulePage from "../components/common/ModulePage";
import { useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { channelService } from "../services/channelService";
import EmptyTableRow from "../components/common/EmptyTableRow";

function normalizeState(value) {
  const token = String(value || "Unknown").toLowerCase();
  if (token.includes("live")) return "On Air";
  if (token.includes("standby")) return "Standby";
  if (token.includes("armed")) return "Armed";
  if (token.includes("running")) return "On Air";
  return "Unknown";
}

export default function LiveChannelManager() {
  const { pathname } = useLocation();
  const [channels, setChannels] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadChannels() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const data = await channelService.list();
        if (!mounted) return;
        setChannels(Array.isArray(data) ? data : []);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error.message || "Failed to load channel control state.");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadChannels();

    return () => {
      mounted = false;
    };
  }, []);

  const rows = useMemo(() => {
    return channels.map((item, index) => ({
      service: item.service || item.name || `Channel ${index + 1}`,
      state: normalizeState(item.state || item.status),
      primaryFeed: item.primaryFeed || item.primary || item.input || "Waiting for Provider",
      backupFeed: item.backupFeed || item.backup || "Waiting for Provider",
      signal: item.signal || item.health || "Unknown",
      nextAction: item.nextAction || "Awaiting operator action",
    }));
  }, [channels]);
  const hasData = rows.length > 0;

  const isObs = pathname.includes("/broadcast/obs-connections");

  const pageConfig = isObs
    ? {
        title: "OBS Connections",
        subtitle: "Manage OBS Studio links, program/preview pipelines, and contribution handoffs into TELEMAP core services.",
        summary: `OBS control links are provided by backend gateway endpoints.${actionMessage ? ` Last action: ${actionMessage}` : ""}`,
        stats: [
          { label: "Connected Services", value: hasData ? String(rows.length) : "—", tone: "blue", detail: hasData ? "Reported by backend channel service" : "Not Connected" },
          { label: "On Air", value: hasData ? String(rows.filter((item) => item.state === "On Air").length) : "—", tone: "green", detail: hasData ? "Current live channels" : "Waiting for Provider" },
          { label: "Standby", value: hasData ? String(rows.filter((item) => item.state === "Standby").length) : "—", tone: "teal", detail: hasData ? "Ready backup channels" : "Waiting for Provider" },
          { label: "Unknown", value: hasData ? String(rows.filter((item) => item.state === "Unknown").length) : "—", tone: "amber", detail: "No Data Available" },
        ],
        actionPrimary: "Reload channel status",
        actionSecondary: "Trigger control sync",
        endpoint: "GET /broadcast/obs/connections",
        requestModel: "ObsConnectionsRequest",
        responseModel: "ObsConnectionsResponse",
        loadingState: "Load OBS control node health and feed mappings.",
        emptyState: "Show that no OBS connections are currently registered.",
        errorState: "Display OBS connection polling error and fallback controls.",
        tableTitle: "OBS connection matrix",
        tableSubtitle: "Program and preview links between OBS nodes and ingest services",
      }
    : {
        title: "Live Channels",
        subtitle: "Operate on-air switching, emergency takeover, and live signal status from a single control plane.",
        summary: `Live channel state is provided via TMOS backend gateway.${actionMessage ? ` Last action: ${actionMessage}` : ""}`,
        stats: [
          { label: "Control Services", value: hasData ? String(rows.length) : "—", tone: "blue", detail: hasData ? "Current backend payload" : "Not Connected" },
          { label: "On Air", value: hasData ? String(rows.filter((item) => item.state === "On Air").length) : "—", tone: "green", detail: hasData ? "Live service paths" : "Waiting for Provider" },
          { label: "Standby", value: hasData ? String(rows.filter((item) => item.state === "Standby").length) : "—", tone: "teal", detail: hasData ? "Ready backup paths" : "Waiting for Provider" },
          { label: "Armed", value: hasData ? String(rows.filter((item) => item.state === "Armed").length) : "—", tone: "amber", detail: hasData ? "Manual takeover controls" : "No Data Available" },
        ],
        actionPrimary: "Trigger emergency takeover",
        actionSecondary: "Sync OBS scene state",
        endpoint: "GET /broadcast/master-control/status",
        requestModel: "MasterControlStatusRequest",
        responseModel: "MasterControlStatusResponse",
        loadingState: "Load signal, on-air, and takeover states for control room services.",
        emptyState: "Show that no control services are currently registered.",
        errorState: "Display master control telemetry failure and fallback action.",
        tableTitle: "Control service matrix",
        tableSubtitle: "On-air source, backup path, and emergency readiness across core control services",
      };

  return (
    <ModulePage
      title={pageConfig.title}
      subtitle={pageConfig.subtitle}
      summary={pageConfig.summary}
      stats={pageConfig.stats}
      actions={(
        <>
          <button type="button" className="action-button">{pageConfig.actionPrimary}</button>
          <button type="button" className="ghost-button">{pageConfig.actionSecondary}</button>
        </>
      )}
      apiSpec={{
        endpoint: pageConfig.endpoint,
        requestModel: pageConfig.requestModel,
        responseModel: pageConfig.responseModel,
        loadingState: pageConfig.loadingState,
        emptyState: pageConfig.emptyState,
        errorState: pageConfig.errorState,
      }}
      searchPlaceholder="Search control service"
      filters={["All", "On Air", "Standby", "Armed"]}
      tableTitle={pageConfig.tableTitle}
      tableSubtitle={pageConfig.tableSubtitle}
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage="No channel-control records were returned. Waiting for provider connection."
    >
      {({ searchValue, activeFilter }) => {
        const filtered = rows.filter((channel) => {
          const matchesSearch = channel.service.toLowerCase().includes(searchValue.toLowerCase());
          const matchesFilter = activeFilter === "All" || channel.state === activeFilter;
          return matchesSearch && matchesFilter;
        });

        return (
          <table className="table">
            <thead>
              <tr>
                <th>Service</th>
                <th>State</th>
                <th>Primary Feed</th>
                <th>Backup Feed</th>
                <th>Signal</th>
                <th>Next Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyTableRow colSpan={6} message="No Data Available" />
              ) : (
                filtered.map((channel) => (
                  <tr key={channel.service}>
                    <td>{channel.service}</td>
                    <td>{channel.state}</td>
                    <td>{channel.primaryFeed}</td>
                    <td>{channel.backupFeed}</td>
                    <td>{channel.signal}</td>
                    <td>{channel.nextAction}</td>
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
