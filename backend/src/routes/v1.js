import express from "express";
import { ok } from "../utils/apiResponse.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { TmosError } from "../errors/TmosError.js";
import { authService } from "../services/authService.js";
import { auditService } from "../services/auditService.js";
import { eventService } from "../services/eventService.js";

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

export function createV1Router({ orchestration }) {
  const router = express.Router();

  router.get("/health", async (req, res, next) => {
    try {
      const proxmox = await orchestration.providerHealth("proxmox");
      return ok(res, req, {
        service: "tmos-backend",
        status: "ok",
        providers: { proxmox },
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/auth/login", (req, res, next) => {
    try {
      const { username, password } = req.body || {};
      const payload = authService.login({ username, password });
      auditService.record({
        actor: username || "unknown",
        action: "auth.login",
        target: "session",
        result: "success",
        provider: "tmos",
        correlationId: req.correlationId,
      });
      return ok(res, req, payload);
    } catch (error) {
      auditService.record({
        actor: req.body?.username || "unknown",
        action: "auth.login",
        target: "session",
        result: "failure",
        provider: "tmos",
        correlationId: req.correlationId,
        metadata: { reason: error?.message || "Authentication failed" },
      });
      return next(error);
    }
  });

  router.post("/auth/refresh", (req, res, next) => {
    try {
      const payload = authService.refresh(req.body?.refreshToken);
      return ok(res, req, payload);
    } catch (error) {
      return next(error);
    }
  });

  router.post("/auth/logout", requireAuth, (req, res, next) => {
    try {
      const authHeader = req.header("authorization") || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      const payload = authService.logout(token);
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

  router.post("/infrastructure/proxmox/vms/start", requireAuth, requireRole(["Administrator", "Operator"]), async (req, res, next) => {
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

  router.post("/infrastructure/proxmox/vms/stop", requireAuth, requireRole(["Administrator", "Operator"]), async (req, res, next) => {
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

  router.post("/infrastructure/proxmox/vms/reboot", requireAuth, requireRole(["Administrator", "Operator"]), async (req, res, next) => {
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

  router.post("/infrastructure/proxmox/vms/console", requireAuth, requireRole(["Administrator", "Operator"]), async (req, res) => {
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

  router.get("/auth/sessions", requireAuth, (req, res) => {
    return ok(res, req, [{ id: "sess-1", user: req.operator?.username || "operator", state: "active" }]);
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

  router.post("/providers/proxmox/vms/:vmId/:action", requireAuth, requireRole(["Administrator", "Operator"]), async (req, res, next) => {
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

  router.get("/iam/audit/logs", requireAuth, (req, res) => {
    return ok(res, req, auditService.list());
  });

  router.get("/operations/events", requireAuth, (req, res) => {
    return ok(res, req, eventService.list());
  });

  const unavailableGetRoutes = [
    ["/operations/overview", "operations-overview"],
    ["/operations/timeline", "operations-timeline"],
    ["/operations/changes", "operations-changes"],
    ["/broadcast/master-control/status", "broadcast-master-control"],
    ["/broadcast/playout/schedule", "broadcast-playout"],
    ["/streaming/endpoints/health", "streaming"],
    ["/streaming/obs/connections", "streaming"],
    ["/streaming/ffmpeg/jobs", "streaming"],
    ["/streaming/rtmp/endpoints", "streaming"],
    ["/streaming/hls/endpoints", "streaming"],
    ["/streaming/livekit/rooms", "streaming"],
    ["/streaming/alerts", "streaming"],
    ["/streaming/logs", "streaming"],
    ["/infrastructure/noc/overview", "infrastructure-noc"],
    ["/infrastructure/containers/status", "containers"],
    ["/infrastructure/containers/logs", "containers"],
    ["/infrastructure/containers/alerts", "containers"],
    ["/infrastructure/monitoring/checks", "monitoring"],
    ["/infrastructure/monitoring/incidents", "monitoring"],
    ["/infrastructure/monitoring/logs", "monitoring"],
    ["/infrastructure/proxy/routes", "nginx-proxy-manager"],
    ["/infrastructure/proxy/hosts", "nginx-proxy-manager"],
    ["/infrastructure/proxy/certificates", "nginx-proxy-manager"],
    ["/infrastructure/proxy/logs", "nginx-proxy-manager"],
    ["/infrastructure/proxy/alerts", "nginx-proxy-manager"],
    ["/infrastructure/ubuntu/servers", "ubuntu"],
    ["/infrastructure/storage/volumes", "storage"],
    ["/infrastructure/network/links", "network"],
    ["/infrastructure/ffmpeg/jobs", "ffmpeg"],
    ["/media/library/assets", "media-library"],
    ["/ai/operations/incidents", "ai-operations"],
    ["/ai/operations/recommendations", "ai-operations"],
    ["/iam/users", "iam-users"],
    ["/administration/settings", "administration-settings"],
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