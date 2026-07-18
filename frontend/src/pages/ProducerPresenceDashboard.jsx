import { useEffect, useMemo, useState } from "react";
import ModulePage from "../components/common/ModulePage";
import EmptyTableRow from "../components/common/EmptyTableRow";
import { useAuth } from "../contexts/AuthContext";
import { presenceService } from "../services/presenceService";

function formatDateTime(value) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString();
}

export default function ProducerPresenceDashboard() {
  const auth = useAuth();
  const [rows, setRows] = useState([]);
  const [socketState, setSocketState] = useState("connecting");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    let socketHandle = null;

    async function bootstrap() {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const initial = await presenceService.list();
        if (!mounted) return;
        setRows(Array.isArray(initial) ? initial : []);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error.message || "Failed to load presence list.");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }

      socketHandle = presenceService.connect({
        token: auth?.token,
        onSnapshot: (snapshot) => {
          if (!mounted) return;
          setRows(Array.isArray(snapshot) ? snapshot : []);
        },
        onError: (message) => {
          if (!mounted) return;
          setErrorMessage(message || "Presence websocket error.");
        },
        onStateChange: (state) => {
          if (!mounted) return;
          setSocketState(state);
        },
      });
    }

    bootstrap();

    return () => {
      mounted = false;
      if (socketHandle) {
        socketHandle.close();
      }
    };
  }, [auth?.token]);

  const stats = useMemo(() => {
    const online = rows.filter((item) => ["Online", "Ready", "Live"].includes(item.connectionStatus)).length;
    const ready = rows.filter((item) => item.connectionStatus === "Ready").length;
    const live = rows.filter((item) => item.connectionStatus === "Live").length;

    return [
      { label: "Connected Reporters", value: rows.length ? String(online) : "—", tone: "blue", detail: `${rows.length} total tracked` },
      { label: "Ready", value: rows.length ? String(ready) : "—", tone: "green", detail: "Ready for producer handoff" },
      { label: "Live", value: rows.length ? String(live) : "—", tone: "amber", detail: "Currently marked live" },
      { label: "Socket", value: socketState, tone: "teal", detail: "Realtime websocket state" },
    ];
  }, [rows, socketState]);

  return (
    <ModulePage
      title="Producer Presence Dashboard"
      subtitle="Live reporter connectivity, readiness, and assignment state for control room decisions."
      summary="Phase 3.2 realtime presence layer. No media streaming is performed in this view."
      stats={stats}
      apiSpec={{
        endpoint: "GET /presence/reporters + WS /presence/ws",
        requestModel: "PresenceSnapshotRequest",
        responseModel: "PresenceSnapshotResponse",
        loadingState: "Load realtime presence snapshot and subscribe to updates.",
        emptyState: "Show no active reporter presence entries.",
        errorState: "Display websocket or backend presence errors.",
      }}
      searchPlaceholder="Search reporter"
      filters={["All", "Online", "Ready", "Live", "Disconnected"]}
      tableTitle="Live reporter presence"
      tableSubtitle="Connection state, assignment, studio, readiness, and heartbeat telemetry"
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage="No reporter presence records available yet."
    >
      {({ searchValue, activeFilter }) => {
        const filtered = rows.filter((item) => {
          const haystack = `${item.reporterName || ""} ${item.currentStudioName || ""} ${item.currentAssignmentTitle || ""}`.toLowerCase();
          const matchesSearch = haystack.includes(searchValue.toLowerCase());
          const matchesFilter = activeFilter === "All" || item.connectionStatus === activeFilter;
          return matchesSearch && matchesFilter;
        });

        return (
          <table className="table">
            <thead>
              <tr>
                <th>Reporter</th>
                <th>Status</th>
                <th>Studio</th>
                <th>Assignment</th>
                <th>Device</th>
                <th>Readiness</th>
                <th>Network</th>
                <th>Heartbeat</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyTableRow colSpan={8} message="No Data Available" />
              ) : (
                filtered.map((item) => (
                  <tr key={item.reporterId}>
                    <td>{item.reporterName || item.reporterId}</td>
                    <td>{item.connectionStatus || "Offline"}</td>
                    <td>{item.currentStudioName || "N/A"}</td>
                    <td>{item.currentAssignmentTitle || "N/A"}</td>
                    <td>{`${item.deviceType || "unknown"} / ${item.operatingSystem || "unknown"}`}</td>
                    <td>{`Cam:${item.cameraReady ? "Y" : "N"} Mic:${item.microphoneReady ? "Y" : "N"} Spk:${item.speakerReady ? "Y" : "N"}`}</td>
                    <td>{`${item.internetQuality || "unknown"} (sig ${item.signalStrength ?? "n/a"}%)`}</td>
                    <td>{formatDateTime(item.lastHeartbeat)}</td>
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
