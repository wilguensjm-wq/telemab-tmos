import { useEffect, useMemo, useState } from "react";
import ModulePage from "../components/common/ModulePage";
import EmptyTableRow from "../components/common/EmptyTableRow";
import LiveSourceCard from "../components/liveSources/LiveSourceCard";
import { liveSourcesService } from "../services/liveSourcesService";

function normalizeSourceType(type) {
  const token = String(type || "").toLowerCase();
  if (token.includes("reporter")) return "Reporter";
  if (token.includes("studio")) return "Studio Camera";
  if (token.includes("guest")) return "Guest";
  if (token.includes("weather")) return "Weather Camera";
  return "Other";
}

function normalizeConnection(status) {
  const token = String(status || "").toLowerCase();
  if (token.includes("connected")) return "Connected";
  if (token.includes("degraded")) return "Degraded";
  if (token.includes("offline")) return "Offline";
  return "Unknown";
}

export default function LiveSources() {
  const [sources, setSources] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadSources() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const data = await liveSourcesService.listSources();
        if (!mounted) return;
        setSources(Array.isArray(data) ? data : []);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error.message || "Failed to load live sources.");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadSources();

    return () => {
      mounted = false;
    };
  }, []);

  const normalizedSources = useMemo(() => {
    return sources.map((source) => ({
      ...source,
      type: normalizeSourceType(source.type),
      connectionStatus: normalizeConnection(source.connectionStatus),
    }));
  }, [sources]);

  const stats = useMemo(() => {
    const connected = normalizedSources.filter((source) => source.connectionStatus === "Connected").length;
    const degraded = normalizedSources.filter((source) => source.connectionStatus === "Degraded").length;
    const offline = normalizedSources.filter((source) => source.connectionStatus === "Offline").length;
    const recording = normalizedSources.filter((source) => String(source.recordingStatus || "").toLowerCase().includes("record")).length;

    return [
      { label: "Connected", value: String(connected), tone: "green", detail: "Sources online" },
      { label: "Degraded", value: String(degraded), tone: "amber", detail: "Needs attention" },
      { label: "Offline", value: String(offline), tone: "slate", detail: "Disconnected sources" },
      { label: "Recording", value: String(recording), tone: "red", detail: "Active recorders" },
    ];
  }, [normalizedSources]);

  return (
    <ModulePage
      title="Live Sources Control Room"
      subtitle="Monitor reporters, studio cameras, guests, and remote contribution sources from one operational view."
      summary="Live Sources is prepared for future LiveKit integration while using a frontend service layer and sample source inventory today."
      stats={stats}
      apiSpec={{
        endpoint: "GET /live-sources",
        requestModel: "LiveSourceListRequest",
        responseModel: "LiveSourceListResponse",
        loadingState: "Load source inventory from the Live Sources service layer.",
        emptyState: "Show that no live sources are currently registered.",
        errorState: "Display live sources loading error and keep the control room shell visible.",
      }}
      searchPlaceholder="Search sources by name or type"
      filters={["All", "Reporter", "Studio Camera", "Guest", "Weather Camera", "Connected", "Degraded", "Offline"]}
      tableTitle="Source inventory"
      tableSubtitle="Preview placeholders, quality telemetry, and recording status for every source"
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage="No live sources were returned yet."
    >
      {({ searchValue, activeFilter }) => {
        const filteredSources = normalizedSources.filter((source) => {
          const haystack = `${source.name || ""} ${source.type || ""} ${source.location || ""}`.toLowerCase();
          const matchesSearch = haystack.includes(searchValue.toLowerCase());
          const matchesFilter = activeFilter === "All" || source.type === activeFilter || source.connectionStatus === activeFilter;
          return matchesSearch && matchesFilter;
        });

        return (
          <>
            <section className="live-sources-grid">
              {filteredSources.length === 0 ? (
                <div className="panel live-sources-empty-panel">
                  <p className="empty-state-message">No sources match your search criteria.</p>
                </div>
              ) : (
                filteredSources.map((source) => <LiveSourceCard key={source.id} source={source} />)
              )}
            </section>

            <section className="panel">
              <div className="panel-title-row">
                <div>
                  <h3 className="panel-title">Source table</h3>
                  <p className="panel-caption">A compact operational view for future backend-fed source records.</p>
                </div>
              </div>

              <table className="table live-sources-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Resolution</th>
                    <th>Bitrate</th>
                    <th>Latency</th>
                    <th>Recording</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSources.length === 0 ? (
                    <EmptyTableRow colSpan={7} message="No live sources match your filters." />
                  ) : (
                    filteredSources.map((source) => (
                      <tr key={source.id}>
                        <td>{source.name}</td>
                        <td>{source.type}</td>
                        <td>{source.connectionStatus}</td>
                        <td>{source.resolution}</td>
                        <td>{source.bitrateKbps ? `${source.bitrateKbps} kbps` : "—"}</td>
                        <td>{source.latencyMs === null || source.latencyMs === undefined ? "—" : `${source.latencyMs} ms`}</td>
                        <td>{source.recordingStatus}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
          </>
        );
      }}
    </ModulePage>
  );
}
