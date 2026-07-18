import { TmosError } from "../../errors/TmosError.js";

export class Provider {
  constructor(key) {
    this.key = key;
  }

  async connect() {
    throw new TmosError({ code: "INTERNAL_ERROR", message: "connect() not implemented", status: 501 });
  }

  async health() {
    throw new TmosError({ code: "INTERNAL_ERROR", message: "health() not implemented", status: 501 });
  }

  async status(_resourceId) {
    throw new TmosError({ code: "INTERNAL_ERROR", message: "status() not implemented", status: 501 });
  }

  async metrics(_resourceId) {
    throw new TmosError({ code: "INTERNAL_ERROR", message: "metrics() not implemented", status: 501 });
  }

  async start(_resourceId, _options) {
    throw new TmosError({ code: "INTERNAL_ERROR", message: "start() not implemented", status: 501 });
  }

  async stop(_resourceId, _options) {
    throw new TmosError({ code: "INTERNAL_ERROR", message: "stop() not implemented", status: 501 });
  }

  async restart(_resourceId, _options) {
    throw new TmosError({ code: "INTERNAL_ERROR", message: "restart() not implemented", status: 501 });
  }

  async logs(_resourceId, _options) {
    throw new TmosError({ code: "INTERNAL_ERROR", message: "logs() not implemented", status: 501 });
  }

  async events(_options) {
    throw new TmosError({ code: "INTERNAL_ERROR", message: "events() not implemented", status: 501 });
  }

  async networkReadiness() {
    return {
      provider: this.key,
      compliant: true,
      networkPath: "unknown",
      status: "skipped",
      reason: "provider_does_not_define_network_rules",
    };
  }

  capabilities() {
    return {
      canReadStatus: false,
      canReadMetrics: false,
      canReadLogs: false,
      canStart: false,
      canStop: false,
      canRestart: false,
    };
  }
}