import test from "node:test";
import assert from "node:assert/strict";
import { ProviderOrchestrationService } from "./providerOrchestrationService.js";

test("vpnReadiness aggregates provider checks and reports degraded when blocked", async () => {
  const registry = {
    list: () => [
      {
        key: "proxmox",
        provider: {
          networkReadiness: async () => ({
            provider: "proxmox",
            compliant: false,
            networkPath: "unknown",
            status: "blocked",
            reason: "Provider endpoint must use tailnet or LAN path",
          }),
        },
      },
      {
        key: "docker",
        provider: {
          networkReadiness: async () => ({
            provider: "docker",
            compliant: true,
            networkPath: "unknown",
            status: "skipped",
          }),
        },
      },
    ],
  };

  const service = new ProviderOrchestrationService({ registry });
  const result = await service.vpnReadiness();

  assert.equal(result.status, "degraded");
  assert.equal(result.blocked, 1);
  assert.equal(result.checks.length, 2);
  assert.equal(result.checks[0].provider, "proxmox");
  assert.equal(result.checks[0].status, "blocked");
});
