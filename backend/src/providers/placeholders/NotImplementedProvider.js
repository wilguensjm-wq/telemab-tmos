import { Provider } from "../sdk/Provider.js";
import { TmosError } from "../../errors/TmosError.js";

export class NotImplementedProvider extends Provider {
  constructor(key) {
    super(key);
  }

  async connect() {
    throw new TmosError({ code: "INTERNAL_ERROR", message: `${this.key} provider not implemented`, status: 501 });
  }

  async health() {
    return { provider: this.key, status: "not_implemented", connected: false };
  }

  async status() {
    throw new TmosError({ code: "INTERNAL_ERROR", message: `${this.key} provider not implemented`, status: 501 });
  }

  async metrics() {
    throw new TmosError({ code: "INTERNAL_ERROR", message: `${this.key} provider not implemented`, status: 501 });
  }

  async start() {
    throw new TmosError({ code: "INTERNAL_ERROR", message: `${this.key} provider not implemented`, status: 501 });
  }

  async stop() {
    throw new TmosError({ code: "INTERNAL_ERROR", message: `${this.key} provider not implemented`, status: 501 });
  }

  async restart() {
    throw new TmosError({ code: "INTERNAL_ERROR", message: `${this.key} provider not implemented`, status: 501 });
  }

  async logs() {
    return [];
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
    };
  }
}