function formatMetric(value, suffix = "") {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return `${value}${suffix}`;
}

export default function ProgramSwitcherMonitor({ title, status, source, highlight = false, recording = false, indicators = [] }) {
  return (
    <article className={`program-switcher-monitor${highlight ? " highlight" : ""}`}>
      <div className="program-switcher-monitor-screen">
        <div className="program-switcher-monitor-overlay">
          <span className="program-switcher-monitor-label">{title}</span>
          <span className="program-switcher-monitor-status">{status}</span>
        </div>

        {indicators.length > 0 ? (
          <div className="program-switcher-monitor-indicators">
            {indicators.map((indicator) => (
              <span key={`${title}-${indicator.label}`} className={`program-switcher-indicator ${indicator.tone || "slate"}`}>
                {indicator.label}
              </span>
            ))}
          </div>
        ) : null}

        <div className="program-switcher-monitor-frame">
          <div className="program-switcher-monitor-stage">
            <p className="program-switcher-monitor-stage-title">{source?.previewLabel || "Preview placeholder"}</p>
            <p className="program-switcher-monitor-stage-name">{source?.name || "No source selected"}</p>
            <p className="program-switcher-monitor-stage-meta">{source?.type || "Awaiting Live Sources"}</p>
          </div>
        </div>

        {recording ? <div className="program-switcher-recording-dot">REC</div> : null}
      </div>

      <div className="program-switcher-monitor-metrics">
        <div>
          <span>Frame Rate</span>
          <strong>{formatMetric(source?.frameRate)}</strong>
        </div>
        <div>
          <span>Resolution</span>
          <strong>{formatMetric(source?.resolution)}</strong>
        </div>
        <div>
          <span>Bitrate</span>
          <strong>{formatMetric(source?.bitrateKbps, " kbps")}</strong>
        </div>
        <div>
          <span>Latency</span>
          <strong>{formatMetric(source?.latencyMs, " ms")}</strong>
        </div>
        <div>
          <span>Connection</span>
          <strong>{source?.connectionStatus || "Unknown"}</strong>
        </div>
        <div>
          <span>Recording</span>
          <strong>{source?.recordingStatus || "Not Recording"}</strong>
        </div>
      </div>
    </article>
  );
}
