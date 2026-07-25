import dns from "node:dns/promises";
import { isIP } from "node:net";
import { classifyAddressNetworkPath } from "../utils/networkPath.js";

function isLocalHostname(hostname) {
  const value = String(hostname || "").toLowerCase();
  if (!value) return true;
  if (value === "localhost") return true;
  if (value.endsWith(".local")) return true;
  return false;
}

async function resolveHostAddresses(hostname) {
  const addresses = [];
  const [v4, v6] = await Promise.allSettled([dns.resolve4(hostname), dns.resolve6(hostname)]);
  if (v4.status === "fulfilled") {
    addresses.push(...v4.value);
  }
  if (v6.status === "fulfilled") {
    addresses.push(...v6.value);
  }
  return [...new Set(addresses)];
}

export async function validateRemoteReporterDeployment(config) {
  const nodeEnv = String(config?.nodeEnv || "development").toLowerCase();
  const isProduction = nodeEnv === "production";
  const mediaEnabled = Boolean(config?.media?.livekit?.enabled);
  const wsUrlRaw = String(config?.media?.livekit?.wsUrl || "").trim();

  if (!mediaEnabled) {
    return {
      valid: true,
      reason: "livekit_disabled",
    };
  }

  if (!wsUrlRaw) {
    return {
      valid: false,
      reason: "missing_livekit_ws_url",
      message: "TMOS_MEDIA_LIVEKIT_WS_URL is required when TMOS_MEDIA_LIVEKIT_ENABLED=true",
    };
  }

  let parsed;
  try {
    parsed = new URL(wsUrlRaw);
  } catch {
    return {
      valid: false,
      reason: "invalid_livekit_ws_url",
      message: "TMOS_MEDIA_LIVEKIT_WS_URL must be a valid ws:// or wss:// URL",
    };
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "ws:" && protocol !== "wss:") {
    return {
      valid: false,
      reason: "invalid_livekit_ws_protocol",
      message: "TMOS_MEDIA_LIVEKIT_WS_URL must use ws:// or wss://",
    };
  }

  if (isProduction && protocol !== "wss:") {
    return {
      valid: false,
      reason: "insecure_livekit_ws_protocol",
      message: "Production deployment requires TMOS_MEDIA_LIVEKIT_WS_URL to use wss://",
    };
  }

  const hostname = parsed.hostname;
  if (isLocalHostname(hostname)) {
    return {
      valid: false,
      reason: "local_livekit_hostname",
      message: "LiveKit URL must be publicly reachable for remote reporters; localhost/.local is not allowed",
    };
  }

  const hostIsIp = isIP(hostname) !== 0;
  if (hostIsIp) {
    const networkPath = classifyAddressNetworkPath(hostname);
    if (networkPath !== "public") {
      return {
        valid: false,
        reason: "non_public_livekit_ip",
        message: "LiveKit URL host resolves to non-public IP space; remote reporters require public internet reachability",
        details: { hostname, networkPath },
      };
    }

    return {
      valid: true,
      reason: "public_livekit_ip",
      details: { hostname },
    };
  }

  const resolvedAddresses = await resolveHostAddresses(hostname);
  if (resolvedAddresses.length === 0) {
    return {
      valid: false,
      reason: "unresolvable_livekit_hostname",
      message: "LiveKit hostname could not be resolved from backend runtime",
      details: { hostname },
    };
  }

  const classifications = resolvedAddresses.map((address) => classifyAddressNetworkPath(address));
  const hasNonPublic = classifications.some((classification) => classification !== "public");
  if (hasNonPublic) {
    return {
      valid: false,
      reason: "non_public_livekit_dns_resolution",
      message: "LiveKit hostname resolves to non-public address space; remote reporters require public internet reachability",
      details: {
        hostname,
        addresses: resolvedAddresses,
        classifications,
      },
    };
  }

  return {
    valid: true,
    reason: "public_livekit_hostname",
    details: {
      hostname,
      addresses: resolvedAddresses,
    },
  };
}