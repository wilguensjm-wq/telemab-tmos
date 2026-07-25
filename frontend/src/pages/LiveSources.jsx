import { useEffect, useMemo, useState } from "react";
import ModulePage from "../components/common/ModulePage";
import EmptyTableRow from "../components/common/EmptyTableRow";
import LiveSourceCard from "../components/liveSources/LiveSourceCard";
import LiveKitRoomManager from "../components/livekit/LiveKitRoomManager";
import ParticipantGrid from "../components/livekit/ParticipantGrid";
import { liveSourcesService } from "../services/liveSourcesService";
import { useNotification } from "../hooks/useNotification";
import "../styles/livekit.css";

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
  const [liveKitState, setLiveKitState] = useState(liveSourcesService.getLiveKitState());
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const notification = useNotification();

  useEffect(() => {
    let mounted = true;

    async function loadSources() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const data = await liveSourcesService.listSources();
        if (!mounted) return;
        setSources(Array.isArray(data) ? data : []);
        setLiveKitState(liveSourcesService.getLiveKitState());
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

    const unsubscribe = liveSourcesService.subscribe((payload) => {
      if (!mounted) return;
      setSources(Array.isArray(payload?.sources) ? payload.sources : []);
      setLiveKitState(payload?.liveKit || liveSourcesService.getLiveKitState());
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const handleJoinRoom = async ({ roomName, identity, role }) => {
    setActionBusy(true);
    try {
      await liveSourcesService.joinLiveKitRoom({
        roomName,
        identity,
        role,
        metadata: {
          module: "live-sources",
        },
      });
      notification.success(`Joined LiveKit room ${roomName} as ${identity}`);
    } catch (error) {
      notification.error(`Failed to join room: ${error.message}`);
    } finally {
      setActionBusy(false);
    }
  };

  const handleLeaveRoom = async () => {
    setActionBusy(true);
    try {
      await liveSourcesService.leaveLiveKitRoom();
      notification.info("Left LiveKit room.");
    } catch (error) {
      notification.error(`Failed to leave room: ${error.message}`);
    } finally {
      setActionBusy(false);
    }
  };

  const handlePublishCamera = async (enabled) => {
    setActionBusy(true);
    try {
      await liveSourcesService.publishCamera(enabled);
      notification.success(enabled ? "Camera publishing enabled." : "Camera publishing stopped.");
    } catch (error) {
      notification.error(`Camera update failed: ${error.message}`);
    } finally {
      setActionBusy(false);
    }
  };

  const handlePublishMicrophone = async (enabled) => {
    setActionBusy(true);
    try {
      await liveSourcesService.publishMicrophone(enabled);
      notification.success(enabled ? "Microphone publishing enabled." : "Microphone publishing stopped.");
    } catch (error) {
      notification.error(`Microphone update failed: ${error.message}`);
    } finally {
      setActionBusy(false);
    }
  };

  const handleRefreshParticipants = async () => {
    setActionBusy(true);
    try {
      await liveSourcesService.refreshParticipants();
      notification.info("Participant state refreshed.");
    } catch (error) {
      notification.error(`Refresh failed: ${error.message}`);
    } finally {
      setActionBusy(false);
    }
  };

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
      summary="Live Sources now integrates with LiveKit room and participant state while preserving TMOS source-inventory contracts for downstream modules."
      stats={stats}
      apiSpec={{
        endpoint: "GET /media/rooms + POST /media/sessions/join + POST /media/sessions/:participantId/*",
        requestModel: "LiveSourceListRequest",
        responseModel: "LiveSourceListResponse",
        loadingState: "Load source inventory from the Live Sources service and LiveKit participant state.",
        emptyState: "Show that no live sources are currently registered.",
        errorState: "Display live sources loading error and keep the control room shell visible.",
      }}
      searchPlaceholder="Search sources by name or type"
      filters={["All", "Reporter", "Studio Camera", "Guest", "Weather Camera", "Connected", "Degraded", "Offline"]}
      tableTitle="Source inventory"
      tableSubtitle="Live source status and media availability"
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage="No active reporters or live sources available."
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
            <LiveKitRoomManager
              roomState={liveKitState}
              onJoin={handleJoinRoom}
              onLeave={handleLeaveRoom}
              onToggleCamera={handlePublishCamera}
              onToggleMicrophone={handlePublishMicrophone}
              onRefresh={handleRefreshParticipants}
              busy={actionBusy}
            />

            <section className="panel">
              <div className="panel-title-row">
                <div>
                  <h3 className="panel-title">LiveKit participants</h3>
                  <p className="panel-caption">Realtime participant tiles with camera, microphone, network, speaking, and track resolution status.</p>
                </div>
              </div>
              <ParticipantGrid participants={liveKitState?.participants || []} />
            </section>

            <section className="live-sources-grid">
              {filteredSources.length === 0 ? (
                <div className="panel live-sources-empty-panel">
                  <p className="empty-state-message">No live sources match your search criteria.</p>
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
                    <th>Camera</th>
                    <th>Microphone</th>
                    <th>Network</th>
                    <th>Speaking</th>
                    <th>Track Resolution</th>
                    <th>Resolution</th>
                    <th>Bitrate</th>
                    <th>Latency</th>
                    <th>Recording</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSources.length === 0 ? (
                    <EmptyTableRow colSpan={12} message="No live sources match your filters." />
                  ) : (
                    filteredSources.map((source) => (
                      <tr key={source.id}>
                        <td>{source.name}</td>
                        <td>{source.type}</td>
                        <td>{source.connectionStatus}</td>
                        <td>{source.cameraStatus || "N/A"}</td>
                        <td>{source.microphoneStatus || "N/A"}</td>
                        <td>{source.networkQuality || "Unknown"}</td>
                        <td>{source.speaking ? "Active" : "Quiet"}</td>
                        <td>{source.trackResolution || source.resolution}</td>
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
