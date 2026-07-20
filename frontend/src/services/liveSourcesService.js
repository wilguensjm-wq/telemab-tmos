const SOURCE_FIXTURES = [
  {
    id: "source-reporter-1",
    name: "Field Reporter Alpha",
    type: "Reporter",
    connectionStatus: "Connected",
    resolution: "1920x1080",
    bitrateKbps: 6200,
    latencyMs: 38,
    audioLevel: 74,
    recordingStatus: "Recording",
    previewLabel: "Live preview",
    location: "Downtown field location",
    providerHint: "LiveKit-ready reporter feed",
  },
  {
    id: "source-studio-cam-1",
    name: "Studio Camera 2",
    type: "Studio Camera",
    connectionStatus: "Connected",
    resolution: "3840x2160",
    bitrateKbps: 12800,
    latencyMs: 24,
    audioLevel: 58,
    recordingStatus: "Standby",
    previewLabel: "Preview feed",
    location: "Main studio floor",
    providerHint: "Preview slot reserved for LiveKit track",
  },
  {
    id: "source-guest-1",
    name: "Guest Remote Feed",
    type: "Guest",
    connectionStatus: "Degraded",
    resolution: "1280x720",
    bitrateKbps: 2400,
    latencyMs: 92,
    audioLevel: 44,
    recordingStatus: "Not Recording",
    previewLabel: "Remote guest preview",
    location: "Remote contributor",
    providerHint: "Guest session ingest placeholder",
  },
  {
    id: "source-weather-1",
    name: "Weather Camera North",
    type: "Weather Camera",
    connectionStatus: "Connected",
    resolution: "1920x1080",
    bitrateKbps: 4800,
    latencyMs: 41,
    audioLevel: 31,
    recordingStatus: "Not Recording",
    previewLabel: "Weather cam preview",
    location: "North rooftop",
    providerHint: "Future LiveKit weather source",
  },
  {
    id: "source-guest-2",
    name: "Remote Guest B",
    type: "Guest",
    connectionStatus: "Offline",
    resolution: "N/A",
    bitrateKbps: 0,
    latencyMs: null,
    audioLevel: 0,
    recordingStatus: "Not Available",
    previewLabel: "No preview available",
    location: "Awaiting connection",
    providerHint: "Placeholder for future guest source",
  },
];

function cloneSource(source) {
  return {
    ...source,
    bitrate: source.bitrateKbps,
    latency: source.latencyMs,
  };
}

export const liveSourcesService = {
  async listSources() {
    return SOURCE_FIXTURES.map(cloneSource);
  },
};
