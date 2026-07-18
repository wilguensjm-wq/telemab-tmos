import { LiveKitProvider } from "./providers/LiveKitProvider.js";

export function buildMediaProviderRegistry({ registry, config }) {
  registry.register("livekit", new LiveKitProvider({
    config: {
      enabled: config.media.livekit.enabled,
      wsUrl: config.media.livekit.wsUrl,
      apiKey: config.media.livekit.apiKey,
      apiSecret: config.media.livekit.apiSecret,
      tokenTtlSeconds: config.media.livekit.tokenTtlSeconds,
    },
  }));

  return registry;
}
