function getConnectionTone(status) {
  const token = String(status || "").toLowerCase();
  if (token.includes("connected")) return "green";
  if (token.includes("degraded")) return "amber";
  if (token.includes("offline")) return "slate";
  return "cyan";
}

function getTallyTone(activeTally) {
  return activeTally ? "red" : "slate";
}

export default function ProgramSwitcherSourceCard({ source, selected = false, onSelect, onPreview }) {
  const audioWidth = Math.max(0, Math.min(100, Number(source.audioLevel || 0)));

  const handleActivate = () => {
    onSelect(source);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={`program-switcher-source-card${selected ? " selected" : ""}`}
      onClick={handleActivate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleActivate();
        }
      }}
    >
      <div className="program-switcher-source-preview">
        <span className="program-switcher-source-preview-label">{source.previewLabel}</span>
        <div className="program-switcher-source-badges">
          <span className={`data-source-badge ${getConnectionTone(source.connectionStatus)}`}>
            {source.connectionStatus}
          </span>
          <span className={`data-source-badge ${getTallyTone(source.activeTally)}`}>
            {source.activeTally ? "Tally Active" : "Tally Standby"}
          </span>
        </div>
      </div>

      <div className="program-switcher-source-body">
        <div>
          <p className="program-switcher-source-type">{source.type}</p>
          <h3 className="program-switcher-source-name">{source.name}</h3>
          <p className="program-switcher-source-meta">{source.resolution} · {source.frameRate} · {source.recordingStatus}</p>
        </div>

        <div className="program-switcher-source-meter-wrap">
          <div className="program-switcher-source-meter-label">
            <span>Audio</span>
            <strong>{audioWidth}%</strong>
          </div>
          <div className="program-switcher-source-meter" aria-label={`Audio level ${audioWidth}%`}>
            <div className="program-switcher-source-meter-fill" style={{ width: `${audioWidth}%` }} />
          </div>
        </div>

        <div className="program-switcher-source-footer">
          <span>{source.latencyMs === null || source.latencyMs === undefined ? "Latency —" : `Latency ${source.latencyMs} ms`}</span>
          <button
            type="button"
            className="ghost-button"
            onClick={(event) => {
              event.stopPropagation();
              onPreview(source);
            }}
          >
            Preview
          </button>
        </div>
      </div>
    </div>
  );
}
