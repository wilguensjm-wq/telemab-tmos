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
  database: {
    url: process.env.TMOS_DATABASE_URL || "",
    ssl: bool(process.env.TMOS_DATABASE_SSL, false),
    maxPoolSize: num(process.env.TMOS_DATABASE_MAX_POOL, 10),
    idleTimeoutMs: num(process.env.TMOS_DATABASE_IDLE_TIMEOUT_MS, 30000),
    required: bool(process.env.TMOS_DATABASE_REQUIRED, true),
  },
  connectivity: {
    enforceVpnPolicyOnStartup: bool(process.env.TMOS_ENFORCE_VPN_POLICY_ON_STARTUP, true),
    vpnPolicyEmergencyOverride: bool(process.env.TMOS_VPN_POLICY_EMERGENCY_OVERRIDE, false),
  },
  auth: {
    jwtSecret: process.env.TMOS_JWT_SECRET || "dev-secret",
    adminUser: process.env.TMOS_ADMIN_USER || "operator",
    adminPass: process.env.TMOS_ADMIN_PASS || "operator",
    accessTokenTtl: process.env.TMOS_ACCESS_TOKEN_TTL || "15m",
    refreshTokenTtl: process.env.TMOS_REFRESH_TOKEN_TTL || "7d",
  },
  providerTimeoutMs: num(process.env.TMOS_PROVIDER_TIMEOUT_MS, 10000),
  docker: {
    enabled: bool(process.env.DOCKER_ENABLED, true),
    socketAvailable: process.env.DOCKER_SOCKET_PATH || "/var/run/docker.sock",
  },
  uptimeKuma: {
    enabled: bool(process.env.UPTIME_KUMA_ENABLED, true),
    containerName: process.env.UPTIME_KUMA_CONTAINER || "uptime-kuma",
    databasePath: process.env.UPTIME_KUMA_DATABASE_PATH || "/app/data/kuma.db",
  },
  nginxProxyManager: {
    enabled: bool(process.env.NPM_ENABLED, true),
    containerName: process.env.NPM_CONTAINER || "nginx-proxy-manager",
    databasePath: process.env.NPM_DATABASE_PATH || "/data/database.sqlite",
  },
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
      tasks: process.env.PROXMOX_TASKS_PATH || "/api2/json/cluster/tasks",
      alerts: process.env.PROXMOX_ALERTS_PATH || "/api2/json/cluster/tasks",
      logs: process.env.PROXMOX_LOGS_PATH || "/api2/json/nodes/log",
      start: process.env.PROXMOX_START_PATH || "/api2/json/nodes/{node}/qemu/{vmid}/status/start",
      stop: process.env.PROXMOX_STOP_PATH || "/api2/json/nodes/{node}/qemu/{vmid}/status/stop",
      restart: process.env.PROXMOX_RESTART_PATH || "/api2/json/nodes/{node}/qemu/{vmid}/status/reboot",
    },
  },
  media: {
    defaultProviderKey: process.env.TMOS_MEDIA_PROVIDER || "livekit",
    livekit: {
      enabled: bool(process.env.TMOS_MEDIA_LIVEKIT_ENABLED, false),
      wsUrl: process.env.TMOS_MEDIA_LIVEKIT_WS_URL || "",
      apiKey: process.env.TMOS_MEDIA_LIVEKIT_API_KEY || "",
      apiSecret: process.env.TMOS_MEDIA_LIVEKIT_API_SECRET || "",
      tokenTtlSeconds: num(process.env.TMOS_MEDIA_LIVEKIT_TOKEN_TTL_SECONDS, 3600),
    },
  },
};