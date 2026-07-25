function renderMetric(value, suffix = "") {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return `${value}${suffix}`;
}

export default function ProgramSwitcherTelemetryBar({
  runtimeState,
  activeSource,
  broadcastState,
}) {
  const hasActiveBroadcast = String(broadcastState?.engineStatus || "").toLowerCase() === "running";

  return (
    <section className="panel program-switcher-telemetry-bar">
      <div className="panel-title-row">
        <div>
          <h3 className="panel-title">Operational telemetry</h3>
          <p className="panel-caption">Live/program status with integration-ready signal interfaces.</p>
        </div>
      </div>

      <div className="program-switcher-status-list">
        <div>
          <span>Live Indicator</span>
          <strong>{runtimeState.liveState}</strong>
        </div>
        <div>
          <span>Recording Indicator</span>
          <strong>{runtimeState.recordingState}</strong>
        </div>
        <div>
          <span>Connection Status</span>
          <strong>{activeSource?.connectionStatus || "Unknown"}</strong>
        </div>
        <div>
          <span>Active Tally</span>
          <strong>{activeSource?.activeTally ? "Program" : "Standby"}</strong>
        </div>
        <div>
          <span>Frame Rate</span>
          <strong>{renderMetric(activeSource?.frameRate)}</strong>
        </div>
        <div>
          <span>Resolution</span>
          <strong>{renderMetric(activeSource?.resolution)}</strong>
        </div>
        <div>
          <span>Bitrate</span>
          <strong>{renderMetric(activeSource?.bitrateKbps, " kbps")}</strong>
        </div>
        <div>
          <span>Latency</span>
          <strong>{renderMetric(activeSource?.latencyMs, " ms")}</strong>
        </div>
      </div>

      <div className="program-switcher-audio-placeholder" role="img" aria-label="Audio telemetry unavailable">
        <div className="program-switcher-audio-title-row">
          <span>Audio Telemetry</span>
          <strong>No audio meter data available</strong>
        </div>
        <div className="program-switcher-audio-bars">
          <span className="program-switcher-audio-bar" />
          <span className="program-switcher-audio-bar" />
          <span className="program-switcher-audio-bar" />
          <span className="program-switcher-audio-bar" />
          <span className="program-switcher-audio-bar" />
          <span className="program-switcher-audio-bar" />
          <span className="program-switcher-audio-bar" />
          <span className="program-switcher-audio-bar" />
        </div>
      </div>

      <div className="program-switcher-output-ready">
        <div>
          <span>Broadcast Engine</span>
          <strong>{hasActiveBroadcast ? "Live" : "No active broadcast"}</strong>
        </div>
        <div>
          <span>RTMP Output</span>
          <strong>{broadcastState?.rtmpStatus || "No output configured"}</strong>
        </div>
        <div>
          <span>SRT Output</span>
          <strong>{broadcastState?.srtStatus || "No output configured"}</strong>
        </div>
        <div>
          <span>FFmpeg PID</span>
          <strong>{broadcastState?.ffmpegPid || "—"}</strong>
        </div>
        <div>
          <span>Engine Bitrate</span>
          <strong>{renderMetric(broadcastState?.bitrateKbps, " kbps")}</strong>
        </div>
        <div>
          <span>Engine FPS</span>
          <strong>{renderMetric(broadcastState?.fps)}</strong>
        </div>
      </div>
    </section>
  );
}
