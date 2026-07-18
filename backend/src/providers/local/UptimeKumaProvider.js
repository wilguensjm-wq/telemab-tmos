import { Provider } from "../sdk/Provider.js";
import { TmosError } from "../../errors/TmosError.js";
import { runCommand } from "../../utils/commandRunner.js";

function parseRows(text, columns) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|");
      return Object.fromEntries(columns.map((column, index) => [column, parts[index] ?? ""]));
    });
}

function toMonitorStatus(value) {
  if (String(value) === "1") return "Healthy";
  if (String(value) === "0") return "Warning";
  return "Unknown";
}

export class UptimeKumaProvider extends Provider {
  constructor({ config, timeoutMs }) {
    super("uptime-kuma");
    this.config = config;
    this.timeoutMs = timeoutMs;
  }

  async query(sql) {
    const result = await runCommand("docker", ["exec", this.config.containerName, "sqlite3", this.config.databasePath, sql], {
      timeout: this.timeoutMs,
    });
    return result.stdout;
  }

  async monitors() {
    if (!this.config.enabled) {
      throw new TmosError({ code: "PROVIDER_UNAVAILABLE", message: "Uptime Kuma provider is disabled", status: 503 });
    }

    const monitorText = await this.query("select id,name,active,type from monitor order by id;");
    const heartbeatText = await this.query("select m.id, coalesce(h.status, 0), coalesce(h.ping, 0), coalesce(h.time, '') from monitor m left join heartbeat h on h.id = (select id from heartbeat where monitor_id = m.id order by time desc limit 1) order by m.id;");
    const uptimeText = await this.query("select m.id, round(avg(case when h.status = 1 then 100.0 else 0 end), 2) from monitor m left join heartbeat h on h.monitor_id = m.id and h.time > datetime('now','-1 day') group by m.id order by m.id;");

    const monitors = parseRows(monitorText, ["id", "name", "active", "type"]);
    const heartbeatMap = new Map(parseRows(heartbeatText, ["id", "status", "ping", "time"]).map((row) => [row.id, row]));
    const uptimeMap = new Map(parseRows(uptimeText, ["id", "uptimePct"]).map((row) => [row.id, row]));

    return monitors.map((monitor) => {
      const heartbeat = heartbeatMap.get(monitor.id) || {};
      const uptime = uptimeMap.get(monitor.id) || {};
      return {
        id: monitor.id,
        name: monitor.name,
        status: toMonitorStatus(heartbeat.status),
        latencyMs: Number(heartbeat.ping || 0),
        uptimePct: Number(uptime.uptimePct || 0),
        incidentCount: String(heartbeat.status) === "1" ? 0 : 1,
        type: monitor.type || "http",
        lastCheckedAt: heartbeat.time || null,
      };
    });
  }

  async health() {
    try {
      const monitors = await this.monitors();
      return { provider: "uptime-kuma", status: "healthy", connected: true, monitorCount: monitors.length };
    } catch (error) {
      return { provider: "uptime-kuma", status: "unhealthy", connected: false, reason: error?.message || "uptime kuma unavailable" };
    }
  }

  async status(resourceId) {
    const monitors = await this.monitors();
    if (!resourceId) return monitors;
    const match = monitors.find((item) => String(item.id) === String(resourceId));
    if (!match) {
      throw new TmosError({ code: "PROVIDER_BAD_RESPONSE", message: `Monitor ${resourceId} not found`, status: 404 });
    }
    return match;
  }

  async logs() {
    const heartbeatText = await this.query("select monitor_id,status,ping,time from heartbeat order by time desc limit 50;");
    return parseRows(heartbeatText, ["monitorId", "status", "ping", "time"]).map((row, index) => ({
      id: `uk-log-${index + 1}`,
      level: String(row.status) === "1" ? "info" : "warning",
      message: `Monitor ${row.monitorId} status ${row.status === "1" ? "up" : "down"} (${row.ping || 0} ms)`,
      timestamp: row.time || new Date().toISOString(),
    }));
  }

  async events() {
    const monitors = await this.monitors();
    return monitors
      .filter((item) => item.status !== "Healthy")
      .map((item) => ({
        id: `uk-inc-${item.id}`,
        monitor: item.name,
        severity: "warning",
        status: "open",
        detail: `Latest health check is degraded (${item.latencyMs} ms, ${item.uptimePct}% uptime)`,
        createdAt: item.lastCheckedAt || new Date().toISOString(),
      }));
  }

  capabilities() {
    return {
      canReadStatus: true,
      canReadMetrics: false,
      canReadLogs: true,
      canStart: false,
      canStop: false,
      canRestart: false,
      implemented: true,
    };
  }
}
