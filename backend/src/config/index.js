import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(configDir, "../../.env");
const dotenvResult = dotenv.config({ path: envPath });

export const envDiagnostics = {
  envPath,
  loaded: !dotenvResult.error,
};

function bool(value, fallback = false) {
  if (value === undefined) return fallback;
  return String(value).toLowerCase() === "true";
}

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: num(process.env.PORT, 8080),
  auth: {
    jwtSecret: process.env.TMOS_JWT_SECRET || "dev-secret",
    adminUser: process.env.TMOS_ADMIN_USER || "operator",
    adminPass: process.env.TMOS_ADMIN_PASS || "operator",
    accessTokenTtl: process.env.TMOS_ACCESS_TOKEN_TTL || "15m",
    refreshTokenTtl: process.env.TMOS_REFRESH_TOKEN_TTL || "7d",
  },
  providerTimeoutMs: num(process.env.TMOS_PROVIDER_TIMEOUT_MS, 10000),
  proxmox: {
    enabled: bool(process.env.PROXMOX_ENABLED, false),
    baseUrl: process.env.PROXMOX_URL || "",
    tokenId: process.env.PROXMOX_TOKEN_ID || "",
    tokenSecret: process.env.PROXMOX_TOKEN_SECRET || "",
    rejectUnauthorized: bool(process.env.PROXMOX_TLS_STRICT, true),
    paths: {
      nodes: process.env.PROXMOX_NODES_PATH || "/api2/json/nodes",
      vms: process.env.PROXMOX_VMS_PATH || "/api2/json/cluster/resources?type=vm",
      storage: process.env.PROXMOX_STORAGE_PATH || "/api2/json/cluster/resources?type=storage",
      tasks: process.env.PROXMOX_TASKS_PATH || "/api2/json/cluster/tasks?limit=50",
      alerts: process.env.PROXMOX_ALERTS_PATH || "/api2/json/cluster/tasks?errors=1&limit=50",
      logs: process.env.PROXMOX_LOGS_PATH || "/api2/json/nodes/log",
      start: process.env.PROXMOX_START_PATH || "/api2/json/nodes/{node}/qemu/{vmid}/status/start",
      stop: process.env.PROXMOX_STOP_PATH || "/api2/json/nodes/{node}/qemu/{vmid}/status/stop",
      restart: process.env.PROXMOX_RESTART_PATH || "/api2/json/nodes/{node}/qemu/{vmid}/status/reboot",
    },
  },
};