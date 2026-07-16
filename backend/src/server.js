import { config, envDiagnostics } from "./config/index.js";
import { logger } from "./logging/logger.js";
import { createApp } from "./app.js";
import { ProviderRegistry } from "./providers/sdk/ProviderRegistry.js";
import { buildProviderRegistry } from "./providers/sdk/ProviderFactory.js";
import { ProviderOrchestrationService } from "./services/providerOrchestrationService.js";

const registry = buildProviderRegistry({ registry: new ProviderRegistry(), config });
const orchestration = new ProviderOrchestrationService({ registry });
const app = createApp({ orchestration });

app.listen(config.port, () => {
  logger.info("config.env.loaded", {
    envPath: envDiagnostics.envPath,
    envLoaded: envDiagnostics.loaded,
  });
  logger.info("provider.proxmox.config", {
    proxmoxUrl: config.proxmox.baseUrl,
    proxmoxTokenId: config.proxmox.tokenId,
    proxmoxTokenSecretSet: Boolean(config.proxmox.tokenSecret),
  });
  logger.info("server.started", {
    port: config.port,
    env: config.nodeEnv,
  });
});