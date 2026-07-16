import { API_CONFIG } from "../../constants/api";
import { modeToSource } from "../../services/sourceState";

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toIsoNow() {
  return new Date().toISOString();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isUnimplemented(error) {
  const status = error?.response?.status;
  return status === 404 || status === 501 || status === 503;
}

async function safeArrayRequest(requestFn) {
  try {
    const response = await requestFn();
    return asArray(response?.data?.data || response?.data || []);
  } catch (error) {
    if (isUnimplemented(error)) {
      return [];
    }
    throw error;
  }
}

export class ProxmoxAdapter {
  constructor({ apiClient, providerConfig }) {
    this.apiClient = apiClient;
    this.providerConfig = providerConfig;
  }

  async getVmOverview() {
    return this.fetchViaApi();
  }

  async fetchViaApi() {
    const [payload, nodesPayload, storagePayload, tasksPayload, alertsPayload, logsPayload] = await Promise.all([
      safeArrayRequest(() => this.apiClient.get(API_CONFIG.endpoints.infrastructure.proxmoxVms)),
      safeArrayRequest(() => this.apiClient.get(API_CONFIG.endpoints.infrastructure.proxmoxNodes)),
      safeArrayRequest(() => this.apiClient.get(API_CONFIG.endpoints.infrastructure.proxmoxStorage)),
      safeArrayRequest(() => this.apiClient.get(API_CONFIG.endpoints.infrastructure.proxmoxTasks)),
      safeArrayRequest(() => this.apiClient.get(API_CONFIG.endpoints.infrastructure.proxmoxAlerts)),
      safeArrayRequest(() => this.apiClient.get(API_CONFIG.endpoints.infrastructure.proxmoxLogs)),
    ]);

    const items = this.normalize(payload);
    return {
      source: modeToSource(),
      fallbackActive: false,
      items,
      nodes: this.normalizeNodes(nodesPayload),
      storage: this.normalizeStorage(storagePayload),
      tasks: this.normalizeTasks(tasksPayload),
      alerts: alertsPayload,
      logs: logsPayload,
    };
  }

  buildOperationalState(data) {
    const items = data.items || [];
    const alerts = data.alerts || [];
    const logs = data.logs || [];

    return {
      provider: "proxmox",
      source: data.source,
      fallbackActive: Boolean(data.fallbackActive),
      fallbackReason: data.fallbackReason || "",
      telemetry: {
        vmCount: items.length,
        onlineVmCount: items.filter((item) => item.status === "running").length,
      },
      health: items.map((item) => ({
        id: item.id,
        name: item.vm,
        status: item.status,
        metric: `${item.cpuPct.toFixed(1)}% CPU / ${item.memoryPct.toFixed(1)}% MEM`,
      })),
      alerts,
      logs,
      actions: [
        {
          id: "reboot-vm",
          label: "Reboot VM",
          action: "reboot",
          enabled: true,
        },
      ],
    };
  }

  async getOperationalState() {
    const data = await this.getVmOverview();
    return this.buildOperationalState(data);
  }

  async rebootVm(vmId) {
    try {
      const response = await this.apiClient.post(API_CONFIG.endpoints.infrastructure.proxmoxRebootVm, { vmId });
      const payload = response?.data?.data || response?.data || {};
      return {
        success: true,
        provider: "proxmox",
        action: "reboot",
        targetId: vmId,
        source: modeToSource(),
        timestamp: payload.timestamp || toIsoNow(),
        message: payload.message || "VM reboot initiated",
        data: payload,
      };
    } catch (error) {
      return {
        success: false,
        provider: "proxmox",
        action: "reboot",
        targetId: vmId,
        source: modeToSource(),
        timestamp: toIsoNow(),
        message: error?.message || "Failed to reboot VM",
      };
    }
  }

  async startVm(vmId) {
    return this.vmPowerActionApi(API_CONFIG.endpoints.infrastructure.proxmoxVmStart, "start", vmId);
  }

  async stopVm(vmId) {
    return this.vmPowerActionApi(API_CONFIG.endpoints.infrastructure.proxmoxVmStop, "stop", vmId);
  }

  async openConsole(vmId) {
    return this.openConsoleApi(vmId);
  }

  async vmPowerActionApi(endpoint, action, vmId) {
    try {
      const response = await this.apiClient.post(endpoint, { vmId });
      const payload = response?.data?.data || response?.data || {};
      return {
        success: true,
        provider: "proxmox",
        action,
        targetId: vmId,
        source: modeToSource(),
        timestamp: payload.timestamp || toIsoNow(),
        message: payload.message || `VM ${action} initiated`,
        data: payload,
      };
    } catch (error) {
      return {
        success: false,
        provider: "proxmox",
        action,
        targetId: vmId,
        source: modeToSource(),
        timestamp: toIsoNow(),
        message: error?.message || `Failed to ${action} VM`,
      };
    }
  }

  async openConsoleApi(vmId) {
    try {
      const response = await this.apiClient.post(API_CONFIG.endpoints.infrastructure.proxmoxConsole, { vmId });
      const payload = response?.data?.data || response?.data || {};
      return {
        success: true,
        provider: "proxmox",
        action: "open-console",
        targetId: vmId,
        source: modeToSource(),
        timestamp: payload.timestamp || toIsoNow(),
        message: payload.message || "Console integration prepared",
        data: payload,
      };
    } catch (error) {
      return {
        success: false,
        provider: "proxmox",
        action: "open-console",
        targetId: vmId,
        source: modeToSource(),
        timestamp: toIsoNow(),
        message: error?.message || "Failed to prepare console integration",
      };
    }
  }

  normalize(payload) {
    return payload.map((item, index) => ({
      id: item.id || `${index}`,
      vm: item.vm || item.name || item.id || `vm-${index + 1}`,
      vmId: item.vmid || item.vmId || item.id || `${index}`,
      node: item.node || "",
      status: item.status || item.state || "Unknown",
      cpuPct: safeNumber(item.cpuPct || (safeNumber(item.cpu, 0) * 100), 0),
      memoryPct: safeNumber(item.memoryPct || (safeNumber(item.mem, 0) / Math.max(safeNumber(item.maxmem, 1), 1) * 100), 0),
      storagePct: safeNumber(item.storagePct || (safeNumber(item.disk, 0) / Math.max(safeNumber(item.maxdisk, 1), 1) * 100), 0),
      networkMbps: safeNumber(item.networkMbps || item.netin || 0),
      powerState: item.powerState || item.status || "unknown",
    }));
  }

  normalizeNodes(payload) {
    return payload.map((item, index) => ({
      id: item.id || item.node || `node-${index + 1}`,
      node: item.node || item.id || `node-${index + 1}`,
      status: item.status || "unknown",
      cpuPct: safeNumber(item.cpuPct || (safeNumber(item.cpu, 0) * 100), 0),
      memoryPct: safeNumber(item.memoryPct || ((safeNumber(item.mem, 0) / Math.max(safeNumber(item.maxmem, 1), 1)) * 100), 0),
      uptimeSec: safeNumber(item.uptimeSec || item.uptime || 0),
    }));
  }

  normalizeStorage(payload) {
    return payload.map((item, index) => ({
      id: item.id || item.storage || `storage-${index + 1}`,
      storage: item.storage || item.id || `storage-${index + 1}`,
      node: item.node || "cluster",
      status: item.status || "unknown",
      usedPct: safeNumber(item.usedPct || ((safeNumber(item.usedBytes || item.disk, 0) / Math.max(safeNumber(item.totalBytes || item.maxdisk, 1), 1)) * 100), 0),
      totalBytes: safeNumber(item.totalBytes || item.maxdisk || 0, 0),
      usedBytes: safeNumber(item.usedBytes || item.disk || 0, 0),
      kind: item.kind || item.type || "unknown",
    }));
  }

  normalizeTasks(payload) {
    return payload.map((item, index) => ({
      id: item.id || item.upid || `task-${index + 1}`,
      node: item.node || "",
      user: item.user || "system",
      vmid: item.vmid || "",
      status: item.status || "unknown",
      type: item.type || "task",
      starttime: item.starttime || null,
      endtime: item.endtime || null,
    }));
  }
}
