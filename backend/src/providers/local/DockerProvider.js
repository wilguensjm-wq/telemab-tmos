import { Provider } from "../sdk/Provider.js";
import { TmosError } from "../../errors/TmosError.js";
import { runCommand } from "../../utils/commandRunner.js";

function parseJsonLines(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function parsePercentage(value) {
  return Number.parseFloat(String(value || "0").replace("%", "")) || 0;
}

function parseMemoryUsageMb(value) {
  const used = String(value || "").split("/")[0]?.trim() || "0MiB";
  const match = used.match(/^([\d.]+)\s*([KMG]i?B|B)$/i);
  if (!match) return 0;

  const amount = Number.parseFloat(match[1]) || 0;
  const unit = match[2].toLowerCase();
  if (unit === "gib" || unit === "gb") return amount * 1024;
  if (unit === "mib" || unit === "mb") return amount;
  if (unit === "kib" || unit === "kb") return amount / 1024;
  return amount / (1024 * 1024);
}

function normalizeContainerStatus(item) {
  const state = String(item.State || "").toLowerCase();
  const status = String(item.Status || "").toLowerCase();
  if (state === "running" && status.includes("healthy")) return "Healthy";
  if (state === "running") return "Healthy";
  if (state === "exited") return "Warning";
  if (state === "paused") return "Warning";
  return item.Status || item.State || "Unknown";
}

export class DockerProvider extends Provider {
  constructor({ config, timeoutMs }) {
    super("docker");
    this.config = config;
    this.timeoutMs = timeoutMs;
  }

  async listContainers() {
    if (!this.config.enabled) {
      throw new TmosError({ code: "PROVIDER_UNAVAILABLE", message: "Docker provider is disabled", status: 503 });
    }

    const [psResult, statsResult] = await Promise.all([
      runCommand("docker", ["ps", "-a", "--no-trunc", "--format", "{{json .}}"], { timeout: this.timeoutMs }),
      runCommand("docker", ["stats", "--no-stream", "--no-trunc", "--format", "{{json .}}"], { timeout: this.timeoutMs }).catch(() => ({ stdout: "" })),
    ]);

    const containers = parseJsonLines(psResult.stdout);
    const stats = new Map(parseJsonLines(statsResult.stdout).map((item) => [item.ID || item.Container, item]));

    return containers.map((item, index) => {
      const stat = stats.get(item.ID) || {};
      return {
        id: item.ID || `container-${index + 1}`,
        name: item.Names || `container-${index + 1}`,
        status: normalizeContainerStatus(item),
        health: String(item.Status || "").includes("healthy") ? "healthy" : item.State || "unknown",
        cpuPct: parsePercentage(stat.CPUPerc),
        memoryMb: parseMemoryUsageMb(stat.MemUsage),
        restartSupported: true,
        image: item.Image || "",
        state: item.State || "unknown",
      };
    });
  }

  async health() {
    try {
      const items = await this.listContainers();
      return { provider: "docker", status: "healthy", connected: true, containerCount: items.length };
    } catch (error) {
      return { provider: "docker", status: "unhealthy", connected: false, reason: error?.message || "docker unavailable" };
    }
  }

  async status(resourceId) {
    const items = await this.listContainers();
    if (!resourceId) return items;
    const match = items.find((item) => item.id.startsWith(String(resourceId)) || item.name === resourceId);
    if (!match) {
      throw new TmosError({ code: "PROVIDER_BAD_RESPONSE", message: `Container ${resourceId} not found`, status: 404 });
    }
    return match;
  }

  async logs(resourceId) {
    const targets = resourceId ? [await this.status(resourceId)] : (await this.listContainers()).slice(0, 5);
    const logs = [];

    for (const target of targets) {
      try {
        const result = await runCommand("docker", ["logs", "--tail", "20", target.id], { timeout: this.timeoutMs });
        const lines = `${result.stdout}\n${result.stderr}`.split("\n").filter(Boolean);
        logs.push(...lines.map((line, index) => ({
          id: `${target.id}-log-${index + 1}`,
          level: "info",
          message: line,
          timestamp: new Date().toISOString(),
        })));
      } catch {
        // Keep partial logs for available containers only.
      }
    }

    return logs;
  }

  async events() {
    const items = await this.listContainers();
    return items
      .filter((item) => item.state !== "running")
      .map((item) => ({
        id: `evt-docker-${item.id}`,
        timestamp: new Date().toISOString(),
        provider: "docker",
        resource: item.id,
        action: "container-state",
        severity: item.state === "exited" ? "critical" : "warning",
        status: item.state === "exited" ? "failed" : "open",
        operator: "system",
        correlationId: "docker-runtime",
        metadata: { name: item.name, state: item.state, status: item.status },
      }));
  }

  async start(resourceId) {
    await runCommand("docker", ["start", resourceId], { timeout: this.timeoutMs });
    return { accepted: true, message: "Container start request accepted", containerId: resourceId };
  }

  async stop(resourceId) {
    await runCommand("docker", ["stop", resourceId], { timeout: this.timeoutMs });
    return { accepted: true, message: "Container stop request accepted", containerId: resourceId };
  }

  async restart(resourceId) {
    await runCommand("docker", ["restart", resourceId], { timeout: this.timeoutMs });
    return { accepted: true, message: "Container restart request accepted", containerId: resourceId };
  }

  capabilities() {
    return {
      canReadStatus: true,
      canReadMetrics: false,
      canReadLogs: true,
      canStart: true,
      canStop: true,
      canRestart: true,
      implemented: true,
    };
  }
}
