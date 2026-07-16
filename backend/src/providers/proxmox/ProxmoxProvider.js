import axios from "axios";
import https from "node:https";
import { Provider } from "../sdk/Provider.js";
import { TmosError } from "../../errors/TmosError.js";
import { logger } from "../../logging/logger.js";

function fillPath(template, values = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] || "");
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.result)) return value.result;
  return [];
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toSeverity(status) {
  const token = String(status || "").toLowerCase();
  if (token.includes("error") || token.includes("fail")) return "critical";
  if (token.includes("warn")) return "warning";
  return "info";
}

function toEventStatus(status) {
  const token = String(status || "").toLowerCase();
  if (token.includes("error") || token.includes("fail")) return "failed";
  if (token.includes("run") || token.includes("active")) return "open";
  if (token.includes("ok") || token.includes("done") || token.includes("success")) return "resolved";
  return "acknowledged";
}

function toPercent(used, total) {
  const max = Math.max(toNumber(total, 1), 1);
  return (toNumber(used, 0) / max) * 100;
}

function stringifyBody(body) {
  if (body === undefined || body === null) return "";
  if (typeof body === "string") return body;

  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

export class ProxmoxProvider extends Provider {
  constructor({ config, timeoutMs }) {
    super("proxmox");

    if (!config.enabled || !config.baseUrl || !config.tokenId || !config.tokenSecret) {
      throw new TmosError({
        code: "PROVIDER_UNAVAILABLE",
        message: "Proxmox provider is not configured",
        status: 503,
      });
    }

    this.config = config;
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: timeoutMs,
      headers: {
        Authorization: `PVEAPIToken=${config.tokenId}=${config.tokenSecret}`,
        "Content-Type": "application/json",
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: config.rejectUnauthorized }),
    });
  }

  normalizeVm(item, index) {
    const maxMem = Math.max(toNumber(item.maxmem, 1), 1);
    const maxDisk = Math.max(toNumber(item.maxdisk, 1), 1);

    return {
      id: item.id || `vm-${index + 1}`,
      vmId: String(item.vmid || item.id || index + 1),
      name: item.name || item.vm || `vm-${index + 1}`,
      node: item.node || "",
      status: item.status || "unknown",
      cpuPct: toNumber(item.cpu, 0) * 100,
      memoryPct: (toNumber(item.mem, 0) / maxMem) * 100,
      storagePct: (toNumber(item.disk, 0) / maxDisk) * 100,
      networkMbps: toNumber(item.netin, 0),
      powerState: item.status === "running" ? "on" : "off",
    };
  }

  normalizeNode(item, index) {
    return {
      id: item.id || item.node || `node-${index + 1}`,
      node: item.node || item.id || `node-${index + 1}`,
      status: item.status || "unknown",
      cpuPct: toNumber(item.cpu, 0) * 100,
      memoryPct: toPercent(item.mem, item.maxmem),
      uptimeSec: toNumber(item.uptime, 0),
    };
  }

  normalizeStorage(item, index) {
    return {
      id: item.id || item.storage || `storage-${index + 1}`,
      storage: item.storage || item.id || `storage-${index + 1}`,
      node: item.node || "cluster",
      status: item.status || "unknown",
      usedPct: toPercent(item.disk, item.maxdisk),
      totalBytes: toNumber(item.maxdisk, 0),
      usedBytes: toNumber(item.disk, 0),
      kind: item.type || "unknown",
    };
  }

  normalizeTask(item, index) {
    return {
      id: item.upid || item.id || `task-${index + 1}`,
      node: item.node || "",
      user: item.user || "system",
      vmid: item.vmid || "",
      status: item.status || "unknown",
      type: item.type || "task",
      starttime: item.starttime || item.start || null,
      endtime: item.endtime || item.end || null,
    };
  }

  async connect() {
    await this.client.get(this.config.paths.vms);
  }

  async health() {
    try {
      await this.connect();
      return { provider: "proxmox", status: "healthy", connected: true };
    } catch (error) {
      try {
        await this.client.get("/api2/json/version");
      } catch (probeError) {
        logger.warn("provider.proxmox.version_probe_failed", {
          url: `${this.config.baseUrl}/api2/json/version`,
          status: probeError?.response?.status || null,
          statusText: probeError?.response?.statusText || null,
          body: stringifyBody(probeError?.response?.data),
          code: probeError?.code || null,
        });
      }

      logger.warn("provider.proxmox.health_failed", {
        url: `${this.config.baseUrl}${this.config.paths.vms}`,
        status: error?.response?.status || null,
        statusText: error?.response?.statusText || null,
        code: error?.code || null,
      });
      return { provider: "proxmox", status: "unhealthy", connected: false };
    }
  }

  async status(vmId) {
    const vms = await this.listVms();
    if (!vmId) return vms;

    const vm = vms.find((item) => String(item.vmId) === String(vmId));
    if (!vm) {
      throw new TmosError({ code: "PROVIDER_BAD_RESPONSE", message: `VM ${vmId} not found`, status: 404 });
    }

    return vm;
  }

  async metrics(vmId) {
    const vm = await this.status(vmId);
    return {
      vmId: vm.vmId,
      cpuPct: vm.cpuPct,
      memoryPct: vm.memoryPct,
      storagePct: vm.storagePct,
      networkMbps: vm.networkMbps,
    };
  }

  async listVms() {
    const response = await this.client.get(this.config.paths.vms);
    const payload = response?.data?.data || response?.data || [];
    return asArray(payload).map((item, index) => this.normalizeVm(item, index));
  }

  async nodes() {
    const response = await this.client.get(this.config.paths.nodes);
    const payload = response?.data?.data || response?.data || [];
    return asArray(payload).map((item, index) => this.normalizeNode(item, index));
  }

  async storage() {
    const response = await this.client.get(this.config.paths.storage);
    const payload = response?.data?.data || response?.data || [];
    return asArray(payload).map((item, index) => this.normalizeStorage(item, index));
  }

  async tasks() {
    const response = await this.client.get(this.config.paths.tasks);
    const payload = response?.data?.data || response?.data || [];
    return asArray(payload).map((item, index) => this.normalizeTask(item, index));
  }

  async clusterOverview() {
    const [nodes, vms, storage, tasks, alerts] = await Promise.all([
      this.nodes(),
      this.listVms(),
      this.storage(),
      this.tasks(),
      this.events(),
    ]);

    return { nodes, vms, storage, tasks, alerts };
  }

  async start(vmId) {
    return this.vmAction("start", vmId, this.config.paths.start);
  }

  async stop(vmId) {
    return this.vmAction("stop", vmId, this.config.paths.stop);
  }

  async restart(vmId) {
    return this.vmAction("restart", vmId, this.config.paths.restart);
  }

  async vmAction(action, vmId, template) {
    const vm = await this.status(vmId);
    const path = fillPath(template, { node: vm.node, vmid: vm.vmId });
    const response = await this.client.post(path);

    return {
      action,
      vmId: vm.vmId,
      accepted: true,
      providerTask: response?.data?.data || response?.data || null,
      message: `VM ${action} request accepted`,
    };
  }

  async logs() {
    const response = await this.client.get(this.config.paths.logs);
    const payload = response?.data?.data || response?.data || [];
    return asArray(payload).map((item, index) => ({
      id: item.id || `log-${index + 1}`,
      level: item.level || "info",
      message: item.msg || item.message || "Proxmox log",
      timestamp: item.t || item.timestamp || new Date().toISOString(),
    }));
  }

  async events() {
    const response = await this.client.get(this.config.paths.alerts);
    const payload = response?.data?.data || response?.data || [];

    return asArray(payload).map((item, index) => {
      const eventStatus = item.status || item.type || "unknown";
      return {
        id: item.upid || item.id || `evt-${index + 1}`,
        timestamp: item.endtime || item.starttime || item.timestamp || new Date().toISOString(),
        provider: "proxmox",
        resource: item.id || item.vmid || item.node || "cluster",
        action: item.type || item.action || "task",
        severity: toSeverity(eventStatus),
        status: toEventStatus(eventStatus),
        operator: item.user || "system",
        correlationId: item.upid || "n/a",
        metadata: {
          node: item.node || "",
          vmid: item.vmid || "",
          rawStatus: eventStatus,
          description: item.id || item.message || "",
        },
      };
    });
  }

  capabilities() {
    return {
      canReadStatus: true,
      canReadMetrics: true,
      canReadLogs: true,
      canStart: true,
      canStop: true,
      canRestart: true,
      implemented: true,
    };
  }
}