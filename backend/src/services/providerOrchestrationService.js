import { TmosError } from "../errors/TmosError.js";

function actionToAudit(action) {
  if (action === "start") return "infrastructure.startVm";
  if (action === "stop") return "infrastructure.stopVm";
  if (action === "restart") return "infrastructure.rebootVm";
  return `infrastructure.${action}`;
}

export class ProviderOrchestrationService {
  constructor({ registry, auditService, eventService, providerStateService }) {
    this.registry = registry;
    this.auditService = auditService;
    this.eventService = eventService;
    this.providerStateService = providerStateService;
  }

  capabilities() {
    return this.registry.listCapabilities();
  }

  async vpnReadiness() {
    const checks = await Promise.all(this.registry.list().map(async ({ key, provider }) => {
      try {
        if (typeof provider.networkReadiness !== "function") {
          return {
            provider: key,
            compliant: true,
            networkPath: "unknown",
            status: "skipped",
            reason: "provider_does_not_define_network_rules",
          };
        }

        const result = await provider.networkReadiness();
        return {
          provider: key,
          compliant: Boolean(result?.compliant),
          networkPath: result?.networkPath || "unknown",
          status: result?.status || "unknown",
          reason: result?.reason || null,
          details: result?.details || null,
          endpoint: result?.endpoint || null,
        };
      } catch (error) {
        return {
          provider: key,
          compliant: false,
          networkPath: "unknown",
          status: "blocked",
          reason: error?.message || "network_readiness_failed",
        };
      }
    }));

    const blocked = checks.filter((item) => item.status === "blocked" || item.compliant === false).length;

    return {
      policy: "provider_endpoints_must_be_tailnet_or_lan",
      status: blocked > 0 ? "degraded" : "ready",
      blocked,
      checks,
    };
  }

  async providerHealth(providerKey) {
    const provider = this.registry.get(providerKey);
    return provider.health();
  }

  async status(providerKey, resourceId) {
    const provider = this.registry.get(providerKey);
    return provider.status(resourceId);
  }

  async metrics(providerKey, resourceId) {
    const provider = this.registry.get(providerKey);
    return provider.metrics(resourceId);
  }

  async logs(providerKey, resourceId) {
    const provider = this.registry.get(providerKey);
    return provider.logs(resourceId);
  }

  async events(providerKey, options) {
    const provider = this.registry.get(providerKey);
    return provider.events(options);
  }

  async providerMethod(providerKey, method, ...args) {
    const provider = this.registry.get(providerKey);
    if (typeof provider[method] !== "function") {
      throw new TmosError({
        code: "PROVIDER_UNAVAILABLE",
        message: `Provider '${providerKey}' does not implement '${method}'`,
        status: 503,
      });
    }
    return provider[method](...args);
  }

  async persistProviderState(providerKey, status, payload = {}, correlationId = null) {
    await this.providerStateService.upsert(providerKey, status, payload, correlationId);
  }

  async listProviderState() {
    return this.providerStateService.list();
  }

  async invokeAction({ providerKey, action, resourceId, operator, correlationId }) {
    const provider = this.registry.get(providerKey);
    const resolveNetworkPath = () => (typeof provider.getNetworkPath === "function" ? provider.getNetworkPath() : "unknown");
    if (!["start", "stop", "restart"].includes(action)) {
      throw new TmosError({ code: "VALIDATION_ERROR", message: `Unsupported action '${action}'`, status: 400 });
    }

    try {
      const result = await provider[action](resourceId);

      const audit = await this.auditService.record({
        actor: operator,
        action: actionToAudit(action),
        target: resourceId,
        result: "success",
        provider: providerKey,
        correlationId,
        networkPath: resolveNetworkPath(),
        metadata: result,
      });

      const event = await this.eventService.publish({
        provider: providerKey,
        resource: resourceId,
        action,
        severity: "info",
        status: "acknowledged",
        operator,
        correlationId,
        metadata: result,
      });

      return { result, audit, event };
    } catch (error) {
      const failureAudit = await this.auditService.record({
        actor: operator,
        action: actionToAudit(action),
        target: resourceId,
        result: "failure",
        provider: providerKey,
        correlationId,
        networkPath: resolveNetworkPath(),
        metadata: { message: error?.message || "Action failed" },
      });

      const failureEvent = await this.eventService.publish({
        provider: providerKey,
        resource: resourceId,
        action,
        severity: "critical",
        status: "failed",
        operator,
        correlationId,
        metadata: { message: error?.message || "Action failed" },
      });

      throw Object.assign(error, {
        tmosFailureAudit: failureAudit.id,
        tmosFailureEvent: failureEvent.id,
      });
    }
  }
}