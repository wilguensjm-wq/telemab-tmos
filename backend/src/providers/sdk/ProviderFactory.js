import { logger } from "../../logging/logger.js";
import { ProxmoxProvider } from "../proxmox/ProxmoxProvider.js";
import { NotImplementedProvider } from "../placeholders/NotImplementedProvider.js";
import { DisabledProvider } from "../placeholders/DisabledProvider.js";

export function buildProviderRegistry({ registry, config }) {
  const providers = [
    ["docker", () => new NotImplementedProvider("docker")],
    ["portainer", () => new NotImplementedProvider("portainer")],
    ["uptime-kuma", () => new NotImplementedProvider("uptime-kuma")],
    ["nginx-proxy-manager", () => new NotImplementedProvider("nginx-proxy-manager")],
  ];

  try {
    registry.register("proxmox", new ProxmoxProvider({ config: config.proxmox, timeoutMs: config.providerTimeoutMs }));
    logger.info("provider.registered", { provider: "proxmox" });
  } catch (error) {
    registry.register("proxmox", new DisabledProvider("proxmox", error.message));
    logger.warn("provider.disabled", { provider: "proxmox", reason: error.message });
  }

  for (const [key, builder] of providers) {
    registry.register(key, builder());
  }

  return registry;
}