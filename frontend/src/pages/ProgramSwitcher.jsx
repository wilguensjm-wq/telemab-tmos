import { useEffect, useMemo, useRef, useState } from "react";
import ModulePage from "../components/common/ModulePage";
import ProgramSwitcherMonitor from "../components/programSwitcher/ProgramSwitcherMonitor";
import ProgramSwitcherControlPanel from "../components/programSwitcher/ProgramSwitcherControlPanel";
import ProgramSwitcherSourceCard from "../components/programSwitcher/ProgramSwitcherSourceCard";
import ProgramSwitcherTelemetryBar from "../components/programSwitcher/ProgramSwitcherTelemetryBar";
import { programSwitcherService } from "../services/programSwitcherService";
import { broadcastEngineService } from "../services/broadcastEngineService";
import { useNotification } from "../hooks/useNotification";
import { dispatchBroadcastStatusRefresh, useBroadcastStatusRefresh } from "../utils/broadcastStatusSync";
import "../styles/program-switcher.css";

function matchesSearch(source, searchValue) {
  const haystack = `${source.name || ""} ${source.type || ""} ${source.location || ""}`.toLowerCase();
  return haystack.includes(searchValue.toLowerCase());
}

function matchesFilter(source, activeFilter) {
  return activeFilter === "All" || source.type === activeFilter || source.connectionStatus === activeFilter;
}

function buildConnectionSummary(sources) {
  const connected = sources.filter((item) => item.connectionStatus === "Connected").length;
  const degraded = sources.filter((item) => item.connectionStatus === "Degraded").length;
  const offline = sources.filter((item) => item.connectionStatus === "Offline").length;
  return `${connected} connected / ${degraded} degraded / ${offline} offline`;
}

export default function ProgramSwitcher() {
  const defaultBroadcastState = {
    engineStatus: "unknown",
    recordingStatus: "unknown",
    rtmpStatus: "not-configured",
    srtStatus: "not-configured",
    ffmpegReadiness: "unknown",
    ffmpegPid: null,
    ffmpegRunning: false,
    activeProgram: "Program standby",
    cpuUsagePct: 0,
    memoryUsagePct: 0,
    bitrateKbps: 0,
    fps: 0,
    droppedFrames: 0,
    uptimeSeconds: 0,
    lastError: "",
    details: {
      recording: {
        durationSeconds: 0,
        currentFile: null,
      },
    },
  };

  const [runtimeState, setRuntimeState] = useState(null);
  const [selectedSourceId, setSelectedSourceId] = useState(null);
  const [broadcastState, setBroadcastState] = useState(defaultBroadcastState);
  const [broadcastBusy, setBroadcastBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const isMountedRef = useRef(true);
  const broadcastRequestIdRef = useRef(0);
  const notification = useNotification();

  const applyBroadcastSnapshot = (status) => {
    const nextStatus = status || defaultBroadcastState;
    setBroadcastState(nextStatus);
    setRuntimeState((current) => programSwitcherService.syncRuntimeStateWithBroadcast(current, nextStatus));
    return nextStatus;
  };

  const syncBroadcastState = async () => {
    const requestId = ++broadcastRequestIdRef.current;
    const status = await broadcastEngineService.getStatus();

    if (!isMountedRef.current || requestId !== broadcastRequestIdRef.current) {
      return null;
    }

    return applyBroadcastSnapshot(status);
  };

  useBroadcastStatusRefresh((event) => {
    const status = event?.detail?.status;
    if (status) {
      applyBroadcastSnapshot(status);
      return;
    }

    syncBroadcastState().catch(() => {});
  });

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadSwitcherState() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const [state, broadcast] = await Promise.all([
          programSwitcherService.getProgramSwitcherState(),
          broadcastEngineService.getStatus(),
        ]);
        if (!mounted) return;
        setRuntimeState({
          sources: state.sources,
          programSourceId: state.programSourceId,
          previewSourceId: state.previewSourceId,
          emergencyMode: state.emergencyMode,
          activeProgramSource: state.activeProgramSource,
          activePreviewSource: state.activePreviewSource,
          liveState: state.liveState,
          recordingState: state.recordingState,
          lastTransition: state.lastTransition,
        });
        setSelectedSourceId(state.previewSourceId || state.programSourceId || null);
        broadcastRequestIdRef.current += 1;
        applyBroadcastSnapshot(broadcast);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error.message || "Failed to load program switcher state.");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadSwitcherState();

    const timer = setInterval(() => {
      syncBroadcastState()
        .catch(() => {});
    }, 3000);

    const handleVisibilitySync = () => {
      if (document.visibilityState === "visible") {
        syncBroadcastState().catch(() => {});
      }
    };

    const handleFocusSync = () => {
      syncBroadcastState().catch(() => {});
    };

    document.addEventListener("visibilitychange", handleVisibilitySync);
    window.addEventListener("focus", handleFocusSync);

    return () => {
      mounted = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilitySync);
      window.removeEventListener("focus", handleFocusSync);
    };
  }, []);

  const sources = runtimeState?.sources || [];

  const selectedSource = useMemo(() => (
    sources.find((source) => source.id === selectedSourceId) || null
  ), [selectedSourceId, sources]);

  const programSource = runtimeState?.activeProgramSource || null;
  const previewSource = runtimeState?.activePreviewSource || null;

  const programStatus = programSource
    ? `Program on ${programSource.name}`
    : "Program standby";

  const stats = useMemo(() => {
    const connected = sources.filter((source) => source.connectionStatus === "Connected").length;
    const selected = selectedSourceId ? 1 : 0;
    const recording = sources.filter((source) => String(source.recordingStatus || "").toLowerCase().includes("record")).length;
    const sourceCount = sources.length;
    const activeTally = sources.filter((source) => source.activeTally).length;

    return [
      { label: "Sources", value: String(sourceCount), tone: "blue", detail: "Available for switching" },
      { label: "Connected", value: String(connected), tone: "green", detail: "Ready for switching" },
      { label: "Selected", value: String(selected), tone: "amber", detail: "Current preview source" },
      { label: "Active Tally", value: String(activeTally), tone: "red", detail: "Source currently on program" },
      { label: "Recording", value: String(recording), tone: "red", detail: "Sources on record" },
    ];
  }, [selectedSourceId, sources]);

  const canApplyPreview = Boolean(runtimeState && selectedSourceId);

  const canTransition = Boolean(
    runtimeState
      && runtimeState.previewSourceId
      && runtimeState.previewSourceId !== runtimeState.programSourceId,
  );

  const applyState = (nextState) => {
    if (!nextState) return;
    setRuntimeState(nextState);
  };

  const handleSelect = (source) => {
    setSelectedSourceId(source.id);
  };

  const applyPreviewSelection = (sourceId) => {
    if (!runtimeState || !sourceId) return;
    const nextState = programSwitcherService.setPreviewSource(runtimeState, sourceId);
    applyState(nextState);
  };

  const handleAction = async (action) => {
    if (!runtimeState) return;

    setErrorMessage("");

    if (action === programSwitcherService.ACTIONS.PREVIEW) {
      if (!canApplyPreview) {
        notification.warning("Select a source before previewing.");
        return;
      }
      applyPreviewSelection(selectedSourceId);
      notification.info("Preview source armed.");
      return;
    }

    const preparedState = selectedSourceId
      ? programSwitcherService.setPreviewSource(runtimeState, selectedSourceId)
      : runtimeState;

    const nextState = programSwitcherService.runAction(preparedState, action);

    if (action === programSwitcherService.ACTIONS.EMERGENCY_BLACK) {
      try {
        const status = await broadcastEngineService.setActiveProgram({ activeProgram: "Emergency Black" });
        applyState(programSwitcherService.syncRuntimeStateWithBroadcast(nextState, status));
        dispatchBroadcastStatusRefresh({
          source: "program-switcher",
          reason: action,
          status,
        });
        notification.warning("Emergency Black activated.");
      } catch (error) {
        notification.error(error.message || "Failed to synchronize Emergency Black state.");
      }
      return;
    }

    if (action === programSwitcherService.ACTIONS.EMERGENCY_SLATE) {
      try {
        const status = await broadcastEngineService.setActiveProgram({ activeProgram: "Emergency Slate" });
        applyState(programSwitcherService.syncRuntimeStateWithBroadcast(nextState, status));
        dispatchBroadcastStatusRefresh({
          source: "program-switcher",
          reason: action,
          status,
        });
        notification.warning("Emergency Slate activated.");
      } catch (error) {
        notification.error(error.message || "Failed to synchronize Emergency Slate state.");
      }
      return;
    }

    if (action === programSwitcherService.ACTIONS.CLEAR_EMERGENCY) {
      try {
        const status = await broadcastEngineService.setActiveProgram({
          activeProgram: nextState?.activeProgramSource?.name || "Program standby",
        });
        applyState(programSwitcherService.syncRuntimeStateWithBroadcast(nextState, status));
        dispatchBroadcastStatusRefresh({
          source: "program-switcher",
          reason: action,
          status,
        });
        notification.success("Emergency mode cleared.");
      } catch (error) {
        notification.error(error.message || "Failed to clear emergency state in backend.");
      }
      return;
    }

    const transitionedProgramName = nextState?.activeProgramSource?.name;
    if (transitionedProgramName) {
      try {
        const status = await broadcastEngineService.setActiveProgram({
          activeProgram: transitionedProgramName,
        });
        applyState(programSwitcherService.syncRuntimeStateWithBroadcast(nextState, status));
        dispatchBroadcastStatusRefresh({
          source: "program-switcher",
          reason: action,
          status,
        });
      } catch (error) {
        notification.error(error.message || "Failed to synchronize active program.");
        return;
      }
    } else {
      applyState(nextState);
    }

    notification.success(`Transition complete: ${nextState.lastTransition}`);
  };

  const handleBroadcastAction = async (action) => {
    setBroadcastBusy(true);
    try {
      let status = null;
      if (action === "start") {
        status = await broadcastEngineService.startBroadcast({
          activeProgram: runtimeState?.activeProgramSource?.name || "Program standby",
        });
        notification.success("Broadcast Engine started.");
      } else if (action === "restart") {
        status = await broadcastEngineService.restartBroadcast();
        notification.success("FFmpeg restarted.");
      } else if (action === "refresh") {
        status = await broadcastEngineService.refreshEngine();
        notification.info("Broadcast Engine refreshed.");
      } else if (action === "stop") {
        status = await broadcastEngineService.stopBroadcast();
        notification.info("Broadcast Engine stopped.");
      } else if (action === "record-start") {
        status = await broadcastEngineService.startRecording();
        notification.success("Recording started.");
      } else if (action === "record-stop") {
        status = await broadcastEngineService.stopRecording();
        notification.info("Recording stopped.");
      }

      if (status) {
        applyBroadcastSnapshot(status);
        dispatchBroadcastStatusRefresh({
          source: "program-switcher",
          reason: action,
          status,
        });
      }

      await syncBroadcastState();
      setTimeout(() => {
        syncBroadcastState().catch(() => {});
      }, 600);
    } catch (error) {
      notification.error(error.message || "Broadcast action failed.");
    } finally {
      if (isMountedRef.current) {
        setBroadcastBusy(false);
      }
    }
  };

  return (
    <ModulePage
      title="Program Switcher Control Room"
      subtitle="Operate preview and program buses with professional production switching controls."
      summary="Program Switcher is integrated with backend broadcast status and control endpoints for live program, transitions, recording, and emergency bus states."
      stats={stats}
      apiSpec={{
        endpoint: "GET /media/rooms + GET/PATCH/POST /broadcast/*",
        requestModel: "ProgramSwitcherActionRequest",
        responseModel: "ProgramSwitcherStateResponse",
        loadingState: "Load source inventory and initialize switcher buses from the service layer.",
        emptyState: "Show that no switcher sources are currently available.",
        errorState: "Display switcher loading errors while preserving operational controls.",
      }}
      searchPlaceholder="Search switcher sources by name, type, or location"
      filters={["All", "Reporter", "Studio Camera", "Guest", "Weather Camera", "Connected", "Degraded", "Offline"]}
      tableTitle="Switcher workspace"
      tableSubtitle="Preview, program, transitions, emergency controls, and source status"
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage="No program switcher sources were returned yet."
      actions={(
        <div className="program-switcher-actions">
          <span className="data-source-badge cyan">Last Transition: {runtimeState?.lastTransition || "Boot"}</span>
          <button
            type="button"
            className="ghost-button"
            onClick={() => applyPreviewSelection(selectedSourceId)}
            disabled={!canApplyPreview}
          >
            Preview
          </button>
          <button
            type="button"
            className="action-button"
            onClick={() => handleAction(programSwitcherService.ACTIONS.TAKE)}
            disabled={!canTransition}
          >
            Take
          </button>
        </div>
      )}
    >
      {({ searchValue, activeFilter }) => {
        const filteredSources = sources.filter((source) => {
          return matchesSearch(source, searchValue) && matchesFilter(source, activeFilter);
        });

        const monitorIndicators = [
          { label: runtimeState?.liveState || "Standby", tone: runtimeState?.liveState === "Live" ? "green" : "slate" },
          { label: runtimeState?.recordingState || "Standby", tone: runtimeState?.recordingState === "Recording" ? "red" : "slate" },
          { label: runtimeState?.emergencyMode ? "Emergency" : "Normal", tone: runtimeState?.emergencyMode ? "amber" : "green" },
        ];

        return (
          <>
            <section className="program-switcher-layout">
              <div className="program-switcher-monitors">
                <ProgramSwitcherMonitor
                  title="Preview Monitor"
                  status={previewSource ? `Previewing ${previewSource.name}` : "Preview ready"}
                  source={previewSource || selectedSource || null}
                  highlight={false}
                  recording={Boolean(previewSource?.recordingStatus && String(previewSource.recordingStatus).toLowerCase().includes("record"))}
                  indicators={monitorIndicators}
                />
                <ProgramSwitcherMonitor
                  title="Program Monitor"
                  status={programStatus}
                  source={programSource}
                  highlight
                  recording={Boolean(programSource && String(programSource.recordingStatus || "").toLowerCase().includes("record"))}
                  indicators={monitorIndicators}
                />
              </div>

              <div className="program-switcher-side-panel">
                <ProgramSwitcherControlPanel
                  selectedSource={selectedSource}
                  emergencyMode={runtimeState?.emergencyMode}
                  onAction={handleAction}
                  disableTransitions={!canTransition}
                  connectionSummary={buildConnectionSummary(sources)}
                  broadcastState={broadcastState}
                  onBroadcastAction={handleBroadcastAction}
                  broadcastBusy={broadcastBusy}
                />
              </div>
            </section>

            {runtimeState ? (
              <ProgramSwitcherTelemetryBar
                runtimeState={runtimeState}
                activeSource={programSource}
                broadcastState={broadcastState}
              />
            ) : null}

            <section className="panel">
              <div className="panel-title-row">
                <div>
                  <h3 className="panel-title">Source grid</h3>
                  <p className="panel-caption">Select a source, preview it, then transition it to program.</p>
                </div>
              </div>

              <div className="program-switcher-source-grid">
                {filteredSources.length === 0 ? (
                  <div className="program-switcher-empty-selection">
                    <p>No switcher sources match your filters.</p>
                  </div>
                ) : (
                  filteredSources.map((source) => (
                    <ProgramSwitcherSourceCard
                      key={source.id}
                      source={source}
                      selected={selectedSourceId === source.id}
                      onSelect={handleSelect}
                      onPreview={(item) => {
                        setSelectedSourceId(item.id);
                        applyPreviewSelection(item.id);
                        notification.info(`Preview source set to ${item.name}`);
                      }}
                    />
                  ))
                )}
              </div>
            </section>
          </>
        );
      }}
    </ModulePage>
  );
}
