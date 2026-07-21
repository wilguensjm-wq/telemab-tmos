const ACTION_ITEMS = [
  { key: "preview", label: "Preview", tone: "ghost" },
  { key: "take", label: "Take", tone: "action" },
  { key: "cut", label: "Cut", tone: "ghost" },
  { key: "fade", label: "Fade", tone: "ghost" },
  { key: "auto", label: "Auto", tone: "ghost" },
];

const EMERGENCY_ITEMS = [
  { key: "emergency-black", label: "Emergency Black", tone: "danger" },
  { key: "emergency-slate", label: "Emergency Slate", tone: "danger" },
];

export default function ProgramSwitcherControlPanel({
  selectedSource,
  emergencyMode,
  onAction,
  disableTransitions = false,
  connectionSummary,
  broadcastState,
  onBroadcastAction,
  broadcastBusy = false,
}) {
  const canBroadcast = typeof onBroadcastAction === "function";

  return (
    <article className="panel program-switcher-control-panel">
      <div className="panel-title-row">
        <div>
          <h3 className="panel-title">Transition controls</h3>
          <p className="panel-caption">Run broadcast-safe transitions from preview to program.</p>
        </div>
      </div>

      <div className="program-switcher-button-row">
        {ACTION_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={item.tone === "action" ? "action-button" : "ghost-button"}
            onClick={() => onAction(item.key)}
            disabled={disableTransitions}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="program-switcher-button-row emergency">
        {EMERGENCY_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className="danger-button"
            onClick={() => onAction(item.key)}
          >
            {item.label}
          </button>
        ))}

        <button
          type="button"
          className="ghost-button"
          onClick={() => onAction("clear-emergency")}
          disabled={!emergencyMode}
        >
          Clear Emergency
        </button>
      </div>

      <div className="program-switcher-selected-details">
        <p><span>Preview Source</span>{selectedSource?.name || "None selected"}</p>
        <p><span>Source Status</span>{selectedSource?.connectionStatus || "Unknown"}</p>
        <p><span>Connection Status</span>{connectionSummary}</p>
      </div>

      <div className="program-switcher-button-row broadcast">
        <button
          type="button"
          className="action-button"
          onClick={() => onBroadcastAction("start")}
          disabled={!canBroadcast || broadcastBusy}
        >
          Start Broadcast
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={() => onBroadcastAction("stop")}
          disabled={!canBroadcast || broadcastBusy}
        >
          Stop Broadcast
        </button>
        <button
          type="button"
          className="action-button"
          onClick={() => onBroadcastAction("record-start")}
          disabled={!canBroadcast || broadcastBusy}
        >
          Start Recording
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={() => onBroadcastAction("record-stop")}
          disabled={!canBroadcast || broadcastBusy}
        >
          Stop Recording
        </button>
      </div>

      <div className="program-switcher-selected-details">
        <p><span>Broadcast Engine</span>{broadcastState?.engineStatus || "unknown"}</p>
        <p><span>Recording</span>{broadcastState?.recordingStatus || "unknown"}</p>
        <p><span>FFmpeg Readiness</span>{broadcastState?.ffmpegReadiness || "unknown"}</p>
      </div>
    </article>
  );
}
