import { Provider } from "../sdk/Provider.js";
import { TmosError } from "../../errors/TmosError.js";

export class DisabledProvider extends Provider {
  constructor(key, reason = "Provider is not configured") {
    super(key);
    this.reason = reason;
  }

  unavailable() {
    return new TmosError({
      code: "PROVIDER_UNAVAILABLE",
      message: `${this.key} provider unavailable: ${this.reason}`,
      status: 503,
    });
  }

  async connect() {
    throw this.unavailable();
  }

  async health() {
    return { provider: this.key, status: "unavailable", connected: false, reason: this.reason };
  }

  async status() {
    throw this.unavailable();
  }

  async metrics() {
    throw this.unavailable();
  }

  async start() {
    throw this.unavailable();
  }

  async stop() {
    throw this.unavailable();
  }

  async restart() {
    throw this.unavailable();
  }

  async logs() {
    throw this.unavailable();
  }

  async events() {
    return [];
  }

  capabilities() {
    return {
      canReadStatus: false,
      canReadMetrics: false,
      canReadLogs: false,
      canStart: false,
      canStop: false,
      canRestart: false,
      implemented: false,
      available: false,
    };
  }
}
