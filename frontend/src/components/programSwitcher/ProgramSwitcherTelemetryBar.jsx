function renderMetric(value, suffix = "") {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return `${value}${suffix}`;
}

export default function ProgramSwitcherTelemetryBar({
  runtimeState,
  activeSource,
  integrationContracts,
}) {
  const liveKitTransport = integrationContracts?.liveKit?.inputInterface?.transport || "wss";

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

      <div className="program-switcher-audio-placeholder" role="img" aria-label="Audio meter placeholder for future integration">
        <div className="program-switcher-audio-title-row">
          <span>Audio Meter Placeholder</span>
          <strong>Ready for LiveKit track levels</strong>
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
          <span>LiveKit Input Interface</span>
          <strong>{liveKitTransport.toUpperCase()} adapter prepared</strong>
        </div>
        <div>
          <span>RTMP Output</span>
          <strong>{integrationContracts.outputs.rtmp.enabled ? "Enabled" : "Prepared"}</strong>
        </div>
        <div>
          <span>SRT Output</span>
          <strong>{integrationContracts.outputs.srt.enabled ? "Enabled" : "Prepared"}</strong>
        </div>
      </div>
    </section>
  );
}
