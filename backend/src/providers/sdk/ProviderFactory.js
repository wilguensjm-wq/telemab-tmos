import { logger } from "../../logging/logger.js";
import { ProxmoxProvider } from "../proxmox/ProxmoxProvider.js";
import { DockerProvider } from "../local/DockerProvider.js";
import { UptimeKumaProvider } from "../local/UptimeKumaProvider.js";
import { NginxProxyManagerProvider } from "../local/NginxProxyManagerProvider.js";
import { NotImplementedProvider } from "../placeholders/NotImplementedProvider.js";
import { DisabledProvider } from "../placeholders/DisabledProvider.js";

export function buildProviderRegistry({ registry, config }) {
  const providers = [
    ["docker", () => new DockerProvider({ config: config.docker, timeoutMs: config.providerTimeoutMs })],
    ["portainer", () => new NotImplementedProvider("portainer")],
    ["uptime-kuma", () => new UptimeKumaProvider({ config: config.uptimeKuma, timeoutMs: config.providerTimeoutMs })],
    ["nginx-proxy-manager", () => new NginxProxyManagerProvider({ config: config.nginxProxyManager, timeoutMs: config.providerTimeoutMs })],
  ];

  try {
    registry.register("proxmox", new ProxmoxProvider({ config: config.proxmox, timeoutMs: config.providerTimeoutMs }));
    logger.info("provider.registered", { provider: "proxmox" });
  } catch (error) {
    registry.register("proxmox", new DisabledProvider("proxmox", error.message));
    logger.warn("provider.disabled", { provider: "proxmox", reason: error.message });
  }

  for (const [key, builder] of providers) {
    try {
      registry.register(key, builder());
      logger.info("provider.registered", { provider: key });
    } catch (error) {
      registry.register(key, new DisabledProvider(key, error.message));
      logger.warn("provider.disabled", { provider: key, reason: error.message });
    }
  }

  return registry;
}