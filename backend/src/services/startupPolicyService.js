import { TmosError } from "../errors/TmosError.js";

export async function enforceVpnStartupPolicy({ orchestration, connectivityConfig, logger }) {
  const readiness = await orchestration.vpnReadiness();
  const blockedChecks = readiness.checks.filter((check) => check.status === "blocked" || check.compliant === false);

  if (blockedChecks.length === 0) {
    logger.info("startup.vpn_policy.passed", {
      policy: readiness.policy,
      status: readiness.status,
      blocked: readiness.blocked,
    });
    return readiness;
  }

  if (connectivityConfig.vpnPolicyEmergencyOverride) {
    logger.warn("startup.vpn_policy.override_enabled", {
      policy: readiness.policy,
      blocked: blockedChecks.map((check) => ({
        provider: check.provider,
        status: check.status,
        reason: check.reason || null,
        endpoint: check.endpoint || null,
      })),
    });
    return readiness;
  }

  if (connectivityConfig.enforceVpnPolicyOnStartup) {
    throw new TmosError({
      code: "PROVIDER_UNAVAILABLE",
      message: "VPN policy startup gate blocked one or more providers",
      status: 503,
      details: {
        policy: readiness.policy,
        blocked: blockedChecks,
      },
    });
  }

  logger.warn("startup.vpn_policy.degraded_not_enforced", {
    policy: readiness.policy,
    blocked: blockedChecks.map((check) => ({
      provider: check.provider,
      status: check.status,
      reason: check.reason || null,
      endpoint: check.endpoint || null,
    })),
  });

  return readiness;
}
