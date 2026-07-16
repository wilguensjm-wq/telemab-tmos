import { API_CONFIG } from "../../constants/api";
import { modeToSource } from "../../services/sourceState";

function toIsoNow() {
  return new Date().toISOString();
}

function isUnimplemented(error) {
  const status = error?.response?.status;
  return status === 404 || status === 501 || status === 503;
}

async function safeArrayRequest(requestFn) {
  try {
    const response = await requestFn();
    const payload = response?.data?.data || response?.data || [];
    return Array.isArray(payload) ? payload : [];
  } catch (error) {
    if (isUnimplemented(error)) {
      return [];
    }
    throw error;
  }
}

export class StreamingAdapter {
  constructor({ apiClient }) {
    this.apiClient = apiClient;
  }

  async getObsConnections() {
    return safeArrayRequest(() => this.apiClient.get(API_CONFIG.endpoints.streaming.obs));
  }

  async getFfmpegJobs() {
    return safeArrayRequest(() => this.apiClient.get(API_CONFIG.endpoints.streaming.ffmpeg));
  }

  async getRtmpEndpoints() {
    return safeArrayRequest(() => this.apiClient.get(API_CONFIG.endpoints.streaming.rtmp));
  }

  async getHlsEndpoints() {
    return safeArrayRequest(() => this.apiClient.get(API_CONFIG.endpoints.streaming.hls));
  }

  async getLiveKitRooms() {
    return safeArrayRequest(() => this.apiClient.get(API_CONFIG.endpoints.streaming.livekit));
  }

  async getAlerts() {
    return safeArrayRequest(() => this.apiClient.get(API_CONFIG.endpoints.streaming.alerts));
  }

  async getLogs() {
    return safeArrayRequest(() => this.apiClient.get(API_CONFIG.endpoints.streaming.logs));
  }

  async getOperationalState() {
    const [obs, ffmpeg, rtmp, hls, livekit, alerts, logs] = await Promise.all([
      this.getObsConnections(),
      this.getFfmpegJobs(),
      this.getRtmpEndpoints(),
      this.getHlsEndpoints(),
      this.getLiveKitRooms(),
      this.getAlerts(),
      this.getLogs(),
    ]);

    const channels = [
      ...obs.map((item) => ({ id: item.id, name: item.node, status: item.status, metric: item.output })),
      ...rtmp.map((item) => ({ id: item.id, name: item.endpoint, status: item.status, metric: `${item.bitrateMbps || 0} Mbps` })),
      ...hls.map((item) => ({ id: item.id, name: item.endpoint, status: item.status, metric: `${item.viewers || 0} viewers` })),
      ...livekit.map((item) => ({ id: item.id, name: item.room, status: item.status, metric: `${item.participants || 0} participants` })),
    ];

    return {
      provider: "streaming",
      source: modeToSource(),
      fallbackActive: false,
      fallbackReason: "",
      telemetry: {
        obsConnections: obs.length,
        ffmpegJobs: ffmpeg.length,
        rtmpEndpoints: rtmp.length,
        hlsEndpoints: hls.length,
        livekitRooms: livekit.length,
      },
      health: channels,
      alerts: alerts.map((item, index) => ({
        id: item.id || `STREAM-ALERT-${index + 1}`,
        severity: item.severity || "warning",
        message: item.message || item.detail || "Streaming alert",
        status: item.status || "open",
        timestamp: item.timestamp || toIsoNow(),
      })),
      logs: logs.map((item, index) => ({
        id: item.id || `STREAM-LOG-${index + 1}`,
        level: item.level || "info",
        message: item.message || "Streaming log",
        timestamp: item.timestamp || toIsoNow(),
      })),
      actions: [
        {
          id: "streaming-failover",
          label: "Run streaming failover",
          action: "failover",
          enabled: true,
        },
      ],
    };
  }
}
