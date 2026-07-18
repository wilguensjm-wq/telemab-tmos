export class PlatformConfigService {
  constructor({ configRepository }) {
    this.configRepository = configRepository;
  }

  async persistRuntimeConfig(config) {
    const entries = [
      { key: "auth", value: { adminUser: config.auth.adminUser, accessTokenTtl: config.auth.accessTokenTtl, refreshTokenTtl: config.auth.refreshTokenTtl } },
      { key: "connectivity", value: config.connectivity },
      { key: "providers.proxmox", value: { enabled: config.proxmox.enabled, baseUrl: config.proxmox.baseUrl } },
      { key: "providers.docker", value: { enabled: config.docker.enabled, socketAvailable: config.docker.socketAvailable } },
      { key: "providers.uptimeKuma", value: { enabled: config.uptimeKuma.enabled, containerName: config.uptimeKuma.containerName } },
      { key: "providers.nginxProxyManager", value: { enabled: config.nginxProxyManager.enabled, containerName: config.nginxProxyManager.containerName } },
      { key: "runtime", value: { nodeEnv: config.nodeEnv, port: config.port, providerTimeoutMs: config.providerTimeoutMs } },
    ];

    await this.configRepository.upsertMany(entries);
  }

  async list() {
    return this.configRepository.list();
  }
}
