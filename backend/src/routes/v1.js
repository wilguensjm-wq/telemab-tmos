import express from "express";
import { ok } from "../utils/apiResponse.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { TmosError } from "../errors/TmosError.js";
import { isPublicRoute, resolveRequiredPermission } from "../auth/routeAuthorization.js";

function unavailableRoute({ integration, endpoint }) {
  return () => {
    throw new TmosError({
      code: "PROVIDER_UNAVAILABLE",
      message: "Live connection not configured",
      status: 503,
      details: { integration, endpoint },
    });
  };
}

async function safeProviderRead(readOperation, fallbackValue) {
  try {
    return {
      ok: true,
      data: await readOperation(),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      data: fallbackValue,
      error: {
        code: error?.code || "PROVIDER_UNAVAILABLE",
        message: error?.message || "Provider read failed",
      },
    };
  }
}

export function createV1Router({ orchestration, authService, auditService, eventService, platformConfigService, databaseService }) {
  const router = express.Router();

  const emptyArray = (_req, res) => ok(res, _req, []);

  router.use((req, res, next) => {
    if (isPublicRoute(req.method, req.path)) {
      return next();
    }

    return requireAuth(req, res, (authError) => {
      if (authError) {
        return next(authError);
      }

      const permissionKey = resolveRequiredPermission(req.method, req.path);
      return requirePermission(permissionKey)(req, res, next);
    });
  });

  router.get("/health", async (req, res, next) => {
    try {
      const proxmox = await orchestration.providerHealth("proxmox");
      const vpnReadiness = await orchestration.vpnReadiness();
      const database = await databaseService.health();
      return ok(res, req, {
        service: "tmos-backend",
        status: "ok",
        database,
        providers: { proxmox },
        connectivity: { vpnReadiness },
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/connectivity/vpn/readiness", requireAuth, async (req, res, next) => {
    try {
      const data = await orchestration.vpnReadiness();
      return ok(res, req, data);
    } catch (error) {
      return next(error);
    }
  });

  router.post("/auth/login", async (req, res, next) => {
    try {
      const { username, password } = req.body || {};
      const payload = await authService.login({ username, password });
      await auditService.record({
        actor: username || "unknown",
        action: "auth.login",
        target: "session",
        result: "success",
        provider: "tmos",
        correlationId: req.correlationId,
      });
      await eventService.publish({
        provider: "tmos-auth",
        resource: username || "unknown",
        action: "login",
        severity: "info",
        status: "acknowledged",
        operator: username || "unknown",
        correlationId: req.correlationId,
        metadata: { result: "success" },
      });
      return ok(res, req, payload);
    } catch (error) {
      try {
        await auditService.record({
          actor: req.body?.username || "unknown",
          action: "auth.login",
          target: "session",
          result: "failure",
          provider: "tmos",
          correlationId: req.correlationId,
          metadata: { reason: error?.message || "Authentication failed" },
        });
      } catch {
        // Preserve original authentication error.
      }
      try {
        await eventService.publish({
          provider: "tmos-auth",
          resource: req.body?.username || "unknown",
          action: "login",
          severity: "warning",
          status: "failed",
          operator: req.body?.username || "unknown",
          correlationId: req.correlationId,
          metadata: { result: "failure", reason: error?.message || "Authentication failed" },
        });
      } catch {
        // Preserve original authentication error.
      }
      return next(error);
    }
  });

  router.post("/auth/refresh", async (req, res, next) => {
    try {
      const payload = await authService.refresh(req.body?.refreshToken);
      return ok(res, req, payload);
    } catch (error) {
      return next(error);
    }
  });

  router.post("/auth/logout", requireAuth, async (req, res, next) => {
    try {
      const authHeader = req.header("authorization") || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      const payload = await authService.logout(token, req.body?.refreshToken);
      return ok(res, req, payload);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/providers/capabilities", requireAuth, (req, res) => {
    return ok(res, req, orchestration.capabilities());
  });

  router.get("/providers/proxmox/vms", requireAuth, async (req, res, next) => {
    try {
      const data = await orchestration.status("proxmox");
      return ok(res, req, data);
    } catch (error) {
      return next(error);
    }
  });

  // Frontend-compatible infrastructure aliases.
  router.get("/infrastructure/proxmox/vms", requireAuth, async (req, res, next) => {
    try {
      const data = await orchestration.status("proxmox");
      return ok(res, req, data);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/infrastructure/proxmox/nodes", requireAuth, async (req, res, next) => {
    try {
      const data = await orchestration.providerMethod("proxmox", "nodes");
      return ok(res, req, data);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/infrastructure/proxmox/storage", requireAuth, async (req, res, next) => {
    try {
      const data = await orchestration.providerMethod("proxmox", "storage");
      return ok(res, req, data);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/infrastructure/proxmox/tasks", requireAuth, async (req, res, next) => {
    try {
      const data = await orchestration.providerMethod("proxmox", "tasks");
      return ok(res, req, data);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/infrastructure/proxmox/cluster", requireAuth, async (req, res, next) => {
    try {
      const data = await orchestration.providerMethod("proxmox", "clusterOverview");
      return ok(res, req, data);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/infrastructure/proxmox/logs", requireAuth, async (req, res, next) => {
    try {
      const data = await orchestration.logs("proxmox");
      return ok(res, req, data);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/infrastructure/proxmox/alerts", requireAuth, async (req, res, next) => {
    try {
      const data = await orchestration.events("proxmox");
      return ok(res, req, data);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/infrastructure/containers/status", requireAuth, async (req, res, next) => {
    try {
      const data = await orchestration.status("docker");
      return ok(res, req, data);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/infrastructure/containers/logs", requireAuth, async (req, res, next) => {
    try {
      const data = await orchestration.logs("docker");
      return ok(res, req, data);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/infrastructure/containers/alerts", requireAuth, async (req, res, next) => {
    try {
      const data = await orchestration.events("docker");
      return ok(res, req, data);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/infrastructure/monitoring/checks", requireAuth, async (req, res, next) => {
    try {
      const data = await orchestration.status("uptime-kuma");
      return ok(res, req, data);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/infrastructure/monitoring/incidents", requireAuth, async (req, res, next) => {
    try {
      const data = await orchestration.events("uptime-kuma");
      return ok(res, req, data);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/infrastructure/monitoring/logs", requireAuth, async (req, res, next) => {
    try {
      const data = await orchestration.logs("uptime-kuma");
      return ok(res, req, data);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/infrastructure/proxy/routes", requireAuth, async (req, res, next) => {
    try {
      const data = await orchestration.status("nginx-proxy-manager");
      return ok(res, req, data);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/infrastructure/proxy/hosts", requireAuth, async (req, res, next) => {
    try {
      const data = await orchestration.status("nginx-proxy-manager");
      return ok(res, req, data);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/infrastructure/proxy/certificates", requireAuth, async (req, res, next) => {
    try {
      const data = await orchestration.providerMethod("nginx-proxy-manager", "certificates");
      return ok(res, req, data);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/infrastructure/proxy/logs", requireAuth, async (req, res, next) => {
    try {
      const data = await orchestration.logs("nginx-proxy-manager");
      return ok(res, req, data);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/infrastructure/proxy/alerts", requireAuth, async (req, res, next) => {
    try {
      const data = await orchestration.events("nginx-proxy-manager");
      return ok(res, req, data);
    } catch (error) {
      return next(error);
    }
  });

  router.post("/infrastructure/proxmox/vms/start", requireAuth, async (req, res, next) => {
    try {
      const vmId = req.body?.vmId;
      const data = await orchestration.invokeAction({
        providerKey: "proxmox",
        action: "start",
        resourceId: vmId,
        operator: req.operator?.username || req.operator?.name || "operator",
        correlationId: req.correlationId,
      });
      return ok(res, req, data);
    } catch (error) {
      return next(error);
    }
  });

  router.post("/infrastructure/proxmox/vms/stop", requireAuth, async (req, res, next) => {
    try {
      const vmId = req.body?.vmId;
      const data = await orchestration.invokeAction({
        providerKey: "proxmox",
        action: "stop",
        resourceId: vmId,
        operator: req.operator?.username || req.operator?.name || "operator",
        correlationId: req.correlationId,
      });
      return ok(res, req, data);
    } catch (error) {
      return next(error);
    }
  });

  router.post("/infrastructure/proxmox/vms/reboot", requireAuth, async (req, res, next) => {
    try {
      const vmId = req.body?.vmId;
      const data = await orchestration.invokeAction({
        providerKey: "proxmox",
        action: "restart",
        resourceId: vmId,
        operator: req.operator?.username || req.operator?.name || "operator",
        correlationId: req.correlationId,
      });
      return ok(res, req, data);
    } catch (error) {
      return next(error);
    }
  });

  router.post("/infrastructure/proxmox/vms/console", requireAuth, async (req, res) => {
    throw new TmosError({
      code: "PROVIDER_UNAVAILABLE",
      message: "Live connection not configured",
      status: 503,
      details: { integration: "proxmox-console" },
    });
  });

  // Frontend auth compatibility aliases.
  router.get("/auth/profile", requireAuth, (req, res) => {
    return ok(res, req, req.operator);
  });

  router.get("/auth/sessions", requireAuth, async (req, res, next) => {
    try {
      const sessions = await authService.listSessions(req.operator?.id);
      return ok(res, req, sessions);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/auth/policies", requireAuth, (req, res) => {
    return ok(res, req, [
      { policy: "RBAC", state: "enforced" },
      { policy: "Token session", state: "enforced" },
    ]);
  });

  router.get("/providers/proxmox/vms/:vmId", requireAuth, async (req, res, next) => {
    try {
      const data = await orchestration.status("proxmox", req.params.vmId);
      return ok(res, req, data);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/providers/proxmox/vms/:vmId/metrics", requireAuth, async (req, res, next) => {
    try {
      const data = await orchestration.metrics("proxmox", req.params.vmId);
      return ok(res, req, data);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/providers/proxmox/logs", requireAuth, async (req, res, next) => {
    try {
      const data = await orchestration.logs("proxmox");
      return ok(res, req, data);
    } catch (error) {
      return next(error);
    }
  });

  router.post("/providers/proxmox/vms/:vmId/:action", requireAuth, async (req, res, next) => {
    try {
      if (!["start", "stop", "restart"].includes(req.params.action)) {
        return next(new TmosError({
          code: "VALIDATION_ERROR",
          message: "Unsupported proxmox action",
          status: 400,
        }));
      }
      const response = await orchestration.invokeAction({
        providerKey: "proxmox",
        action: req.params.action,
        resourceId: req.params.vmId,
        operator: req.operator?.username || req.operator?.name || "operator",
        correlationId: req.correlationId,
      });
      return ok(res, req, response);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/iam/audit/logs", requireAuth, async (req, res, next) => {
    try {
      return ok(res, req, await auditService.list());
    } catch (error) {
      return next(error);
    }
  });

  router.get("/operations/events", requireAuth, async (req, res, next) => {
    try {
      return ok(res, req, await eventService.list());
    } catch (error) {
      return next(error);
    }
  });

  router.get("/operations/overview", requireAuth, async (req, res) => {
    const [proxmox, containers, monitoring, proxy] = await Promise.all([
      safeProviderRead(() => orchestration.status("proxmox"), []),
      safeProviderRead(() => orchestration.status("docker"), []),
      safeProviderRead(() => orchestration.status("uptime-kuma"), []),
      safeProviderRead(() => orchestration.status("nginx-proxy-manager"), []),
    ]);

    const providerState = {
      proxmox: {
        available: proxmox.ok,
        count: Array.isArray(proxmox.data) ? proxmox.data.length : 0,
        error: proxmox.error,
      },
      docker: {
        available: containers.ok,
        count: Array.isArray(containers.data) ? containers.data.length : 0,
        error: containers.error,
      },
      "uptime-kuma": {
        available: monitoring.ok,
        count: Array.isArray(monitoring.data) ? monitoring.data.length : 0,
        error: monitoring.error,
      },
      "nginx-proxy-manager": {
        available: proxy.ok,
        count: Array.isArray(proxy.data) ? proxy.data.length : 0,
        error: proxy.error,
      },
    };

    const hasLiveData = Object.values(providerState).some((provider) => provider.count > 0);

    await Promise.all([
      orchestration.persistProviderState("proxmox", proxmox.ok ? "ready" : "degraded", { count: providerState.proxmox.count }, req.correlationId),
      orchestration.persistProviderState("docker", containers.ok ? "ready" : "degraded", { count: providerState.docker.count }, req.correlationId),
      orchestration.persistProviderState("uptime-kuma", monitoring.ok ? "ready" : "degraded", { count: providerState["uptime-kuma"].count }, req.correlationId),
      orchestration.persistProviderState("nginx-proxy-manager", proxy.ok ? "ready" : "degraded", { count: providerState["nginx-proxy-manager"].count }, req.correlationId),
    ]);

    return ok(res, req, {
      hasLiveData,
      providers: providerState,
      data: {
        proxmoxVms: proxmox.data,
        containers: containers.data,
        monitoringChecks: monitoring.data,
        proxyHosts: proxy.data,
        events: await eventService.list(),
        timeline: [],
        changes: [],
      },
    });
  });

  router.get("/providers/state", requireAuth, async (req, res, next) => {
    try {
      return ok(res, req, await orchestration.listProviderState());
    } catch (error) {
      return next(error);
    }
  });

  router.get("/administration/settings", requireAuth, async (req, res, next) => {
    try {
      return ok(res, req, await platformConfigService.list());
    } catch (error) {
      return next(error);
    }
  });

  router.get("/operations/timeline", requireAuth, emptyArray);
  router.get("/operations/changes", requireAuth, emptyArray);
  router.get("/streaming/endpoints/health", requireAuth, emptyArray);
  router.get("/streaming/obs/connections", requireAuth, emptyArray);
  router.get("/streaming/ffmpeg/jobs", requireAuth, emptyArray);
  router.get("/streaming/rtmp/endpoints", requireAuth, emptyArray);
  router.get("/streaming/hls/endpoints", requireAuth, emptyArray);
  router.get("/streaming/livekit/rooms", requireAuth, emptyArray);
  router.get("/streaming/alerts", requireAuth, emptyArray);
  router.get("/streaming/logs", requireAuth, emptyArray);

  const unavailableGetRoutes = [
    ["/broadcast/master-control/status", "broadcast-master-control"],
    ["/broadcast/playout/schedule", "broadcast-playout"],
    ["/infrastructure/noc/overview", "infrastructure-noc"],
    ["/infrastructure/ubuntu/servers", "ubuntu"],
    ["/infrastructure/storage/volumes", "storage"],
    ["/infrastructure/network/links", "network"],
    ["/infrastructure/ffmpeg/jobs", "ffmpeg"],
    ["/media/library/assets", "media-library"],
    ["/ai/operations/incidents", "ai-operations"],
    ["/ai/operations/recommendations", "ai-operations"],
    ["/iam/users", "iam-users"],
  ];

  const unavailablePostRoutes = [
    ["/broadcast/master-control/takeover", "broadcast-master-control"],
    ["/streaming/endpoints/failover", "streaming"],
    ["/streaming/endpoints/refresh", "streaming"],
    ["/infrastructure/containers/start", "containers"],
    ["/infrastructure/containers/stop", "containers"],
    ["/infrastructure/containers/restart", "containers"],
    ["/infrastructure/monitoring/pause", "monitoring"],
    ["/infrastructure/monitoring/resume", "monitoring"],
    ["/infrastructure/monitoring/refresh", "monitoring"],
    ["/infrastructure/monitoring/acknowledge", "monitoring"],
    ["/infrastructure/proxy/hosts/toggle", "nginx-proxy-manager"],
    ["/infrastructure/proxy/certificates/renew", "nginx-proxy-manager"],
    ["/infrastructure/proxy/reload", "nginx-proxy-manager"],
  ];

  for (const [path, integration] of unavailableGetRoutes) {
    router.get(path, requireAuth, unavailableRoute({ integration, endpoint: path }));
  }

  for (const [path, integration] of unavailablePostRoutes) {
    router.post(path, requireAuth, unavailableRoute({ integration, endpoint: path }));
  }

  return router;
}