import test from "node:test";
import assert from "node:assert/strict";
import { enforceVpnStartupPolicy } from "./startupPolicyService.js";

function makeLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

test("enforceVpnStartupPolicy throws when policy is enforced and providers are blocked", async () => {
  const orchestration = {
    vpnReadiness: async () => ({
      policy: "provider_endpoints_must_be_tailnet_or_lan",
      status: "degraded",
      blocked: 1,
      checks: [{ provider: "proxmox", compliant: false, status: "blocked", reason: "public_wan_endpoint" }],
    }),
  };

  await assert.rejects(
    () => enforceVpnStartupPolicy({
      orchestration,
      connectivityConfig: { enforceVpnPolicyOnStartup: true, vpnPolicyEmergencyOverride: false },
      logger: makeLogger(),
    }),
    (error) => error?.code === "PROVIDER_UNAVAILABLE"
  );
});

test("enforceVpnStartupPolicy allows startup with emergency override", async () => {
  const readiness = {
    policy: "provider_endpoints_must_be_tailnet_or_lan",
    status: "degraded",
    blocked: 1,
    checks: [{ provider: "proxmox", compliant: false, status: "blocked", reason: "public_wan_endpoint" }],
  };

  const orchestration = { vpnReadiness: async () => readiness };
  const result = await enforceVpnStartupPolicy({
    orchestration,
    connectivityConfig: { enforceVpnPolicyOnStartup: true, vpnPolicyEmergencyOverride: true },
    logger: makeLogger(),
  });

  assert.equal(result.status, "degraded");
  assert.equal(result.blocked, 1);
});

test("enforceVpnStartupPolicy passes when no providers are blocked", async () => {
  const readiness = {
    policy: "provider_endpoints_must_be_tailnet_or_lan",
    status: "ready",
    blocked: 0,
    checks: [{ provider: "proxmox", compliant: true, status: "ready" }],
  };

  const orchestration = { vpnReadiness: async () => readiness };
  const result = await enforceVpnStartupPolicy({
    orchestration,
    connectivityConfig: { enforceVpnPolicyOnStartup: true, vpnPolicyEmergencyOverride: false },
    logger: makeLogger(),
  });

  assert.equal(result.status, "ready");
  assert.equal(result.blocked, 0);
});
