function getConnectionTone(status) {
  const token = String(status || "").toLowerCase();
  if (token.includes("connected")) return "green";
  if (token.includes("degraded")) return "amber";
  if (token.includes("offline")) return "slate";
  return "cyan";
}

function getRecordingTone(status) {
  const token = String(status || "").toLowerCase();
  if (token.includes("record")) return "red";
  if (token.includes("standby")) return "teal";
  return "slate";
}

function renderLatency(latencyMs) {
  if (latencyMs === null || latencyMs === undefined) {
    return "—";
  }

  return `${latencyMs} ms`;
}

export default function LiveSourceCard({ source }) {
  const audioWidth = Math.max(0, Math.min(100, Number(source.audioLevel || 0)));
  const isLiveKit = source.sourceProvider === "livekit";

  return (
    <article className="live-source-card">
      <div className="live-source-preview">
        <div className="live-source-preview-label">{source.previewLabel}</div>
        <div className="live-source-preview-overlay">
          <span className={`data-source-badge ${getConnectionTone(source.connectionStatus)}`}>
            {source.connectionStatus}
          </span>
          <span className={`data-source-badge ${getRecordingTone(source.recordingStatus)}`}>
            {source.recordingStatus}
          </span>
        </div>
      </div>

      <div className="live-source-header">
        <div>
          <p className="live-source-type">{source.type}</p>
          <h3 className="live-source-name">{source.name}</h3>
          <p className="live-source-location">{source.location}</p>
        </div>
      </div>

      <div className="live-source-metrics">
        <div className="live-source-metric">
          <span>Resolution</span>
          <strong>{source.resolution}</strong>
        </div>
        <div className="live-source-metric">
          <span>Bitrate</span>
          <strong>{source.bitrateKbps ? `${source.bitrateKbps} kbps` : "—"}</strong>
        </div>
        <div className="live-source-metric">
          <span>Latency</span>
          <strong>{renderLatency(source.latencyMs)}</strong>
        </div>
        <div className="live-source-metric">
          <span>Provider Hint</span>
          <strong>{source.providerHint}</strong>
        </div>

        {isLiveKit ? (
          <>
            <div className="live-source-metric">
              <span>Camera</span>
              <strong>{source.cameraStatus || "Off"}</strong>
            </div>
            <div className="live-source-metric">
              <span>Microphone</span>
              <strong>{source.microphoneStatus || "Off"}</strong>
            </div>
            <div className="live-source-metric">
              <span>Network Quality</span>
              <strong>{source.networkQuality || "Unknown"}</strong>
            </div>
            <div className="live-source-metric">
              <span>Speaking</span>
              <strong>{source.speaking ? "Active" : "Quiet"}</strong>
            </div>
            <div className="live-source-metric">
              <span>Track Resolution</span>
              <strong>{source.trackResolution || source.resolution}</strong>
            </div>
          </>
        ) : null}
      </div>

      <div className="live-source-audio">
        <div className="live-source-audio-row">
          <span>Audio Level</span>
          <strong>{audioWidth}%</strong>
        </div>
        <div className="live-source-meter" aria-label={`Audio level ${audioWidth}%`}>
          <div className="live-source-meter-fill" style={{ width: `${audioWidth}%` }} />
        </div>
      </div>
    </article>
  );
}
