import dns from "node:dns/promises";
import { isIP } from "node:net";

function parseIpv4(address) {
  const parts = String(address || "").split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  if (octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return null;
  return octets;
}

function isIpv4InRange(address, [a, b, c, d], maskBits) {
  const octets = parseIpv4(address);
  if (!octets) return false;

  const toInt = (values) => (((values[0] << 24) >>> 0) + (values[1] << 16) + (values[2] << 8) + values[3]) >>> 0;
  const ipInt = toInt(octets);
  const networkInt = toInt([a, b, c, d]);
  const mask = maskBits === 0 ? 0 : (0xffffffff << (32 - maskBits)) >>> 0;
  return (ipInt & mask) === (networkInt & mask);
}

function classifyIpv4(address) {
  if (isIpv4InRange(address, [100, 64, 0, 0], 10)) return "tailnet";
  if (isIpv4InRange(address, [10, 0, 0, 0], 8)) return "lan";
  if (isIpv4InRange(address, [172, 16, 0, 0], 12)) return "lan";
  if (isIpv4InRange(address, [192, 168, 0, 0], 16)) return "lan";
  if (isIpv4InRange(address, [127, 0, 0, 0], 8)) return "lan";
  if (isIpv4InRange(address, [169, 254, 0, 0], 16)) return "lan";
  return "public";
}

function classifyIpv6(address) {
  const value = String(address || "").toLowerCase();
  if (value === "::1") return "lan";
  if (value.startsWith("fd7a:115c:a1e0:")) return "tailnet";
  if (value.startsWith("fc") || value.startsWith("fd")) return "lan";
  if (value.startsWith("fe80:")) return "lan";
  return "public";
}

export function classifyAddressNetworkPath(address) {
  const kind = isIP(address);
  if (kind === 4) return classifyIpv4(address);
  if (kind === 6) return classifyIpv6(address);
  return "unknown";
}

export async function analyzeProviderEndpoint(baseUrl) {
  let parsed;

  try {
    parsed = new URL(baseUrl);
  } catch {
    return {
      allowed: false,
      networkPath: "unknown",
      reason: "invalid_url",
      hostname: "",
      addresses: [],
    };
  }

  const hostname = parsed.hostname;
  const addresses = [];

  if (isIP(hostname)) {
    addresses.push(hostname);
  } else {
    const [v4, v6] = await Promise.allSettled([dns.resolve4(hostname), dns.resolve6(hostname)]);
    if (v4.status === "fulfilled") addresses.push(...v4.value);
    if (v6.status === "fulfilled") addresses.push(...v6.value);
  }

  const uniqueAddresses = [...new Set(addresses)];
  const classifications = uniqueAddresses.map((address) => classifyAddressNetworkPath(address));

  if (classifications.includes("public")) {
    return {
      allowed: false,
      networkPath: "unknown",
      reason: "public_wan_endpoint",
      hostname,
      addresses: uniqueAddresses,
    };
  }

  if (classifications.includes("tailnet")) {
    return {
      allowed: true,
      networkPath: "tailnet",
      reason: "tailnet_endpoint",
      hostname,
      addresses: uniqueAddresses,
    };
  }

  if (classifications.includes("lan")) {
    return {
      allowed: true,
      networkPath: "lan",
      reason: "lan_endpoint",
      hostname,
      addresses: uniqueAddresses,
    };
  }

  return {
    allowed: true,
    networkPath: "unknown",
    reason: uniqueAddresses.length ? "unclassified_endpoint" : "dns_unresolved",
    hostname,
    addresses: uniqueAddresses,
  };
}