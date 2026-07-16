import { TmosError } from "../errors/TmosError.js";
import { auditService } from "./auditService.js";
import { eventService } from "./eventService.js";

function actionToAudit(action) {
  if (action === "start") return "infrastructure.startVm";
  if (action === "stop") return "infrastructure.stopVm";
  if (action === "restart") return "infrastructure.rebootVm";
  return `infrastructure.${action}`;
}

export class ProviderOrchestrationService {
  constructor({ registry }) {
    this.registry = registry;
  }

  capabilities() {
    return this.registry.listCapabilities();
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

  async invokeAction({ providerKey, action, resourceId, operator, correlationId }) {
    const provider = this.registry.get(providerKey);
    if (!["start", "stop", "restart"].includes(action)) {
      throw new TmosError({ code: "VALIDATION_ERROR", message: `Unsupported action '${action}'`, status: 400 });
    }

    try {
      const result = await provider[action](resourceId);

      const audit = auditService.record({
        actor: operator,
        action: actionToAudit(action),
        target: resourceId,
        result: "success",
        provider: providerKey,
        correlationId,
        metadata: result,
      });

      const event = eventService.publish({
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
      const failureAudit = auditService.record({
        actor: operator,
        action: actionToAudit(action),
        target: resourceId,
        result: "failure",
        provider: providerKey,
        correlationId,
        metadata: { message: error?.message || "Action failed" },
      });

      const failureEvent = eventService.publish({
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