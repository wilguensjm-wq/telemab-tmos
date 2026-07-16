import { TmosError } from "../../errors/TmosError.js";

export class ProviderRegistry {
  constructor() {
    this.providers = new Map();
  }

  register(key, provider) {
    this.providers.set(key, provider);
  }

  get(key) {
    const provider = this.providers.get(key);
    if (!provider) {
      throw new TmosError({
        code: "PROVIDER_UNAVAILABLE",
        message: `Provider '${key}' is not registered`,
        status: 404,
      });
    }
    return provider;
  }

  listCapabilities() {
    return [...this.providers.entries()].map(([key, provider]) => ({
      key,
      capabilities: provider.capabilities(),
    }));
  }
}