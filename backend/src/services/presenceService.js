import { TmosError } from "../errors/TmosError.js";

const VALID_STATUSES = new Set(["Offline", "Connecting", "Online", "Ready", "Live", "Disconnected"]);

function clampPercent(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function sanitizeStatus(status, fallback = null) {
  if (!status) {
    return fallback;
  }

  const normalized = String(status).trim();
  return VALID_STATUSES.has(normalized) ? normalized : fallback;
}

export class PresenceService {
  constructor({ presenceRepository, reporterRepository, assignmentRepository, studioRepository, auditService, heartbeatTimeoutMs = 30000, heartbeatSweepMs = 5000 }) {
    this.presenceRepository = presenceRepository;
    this.reporterRepository = reporterRepository;
    this.assignmentRepository = assignmentRepository;
    this.studioRepository = studioRepository;
    this.auditService = auditService;
    this.heartbeatTimeoutMs = heartbeatTimeoutMs;
    this.heartbeatSweepMs = heartbeatSweepMs;
    this.broadcastFn = null;
    this.timeoutHandle = null;
  }

  setBroadcaster(broadcastFn) {
    this.broadcastFn = typeof broadcastFn === "function" ? broadcastFn : null;
  }

  async emitUpdate(reason = "presence.updated") {
    if (!this.broadcastFn) {
      return;
    }

    const snapshot = await this.list();
    await this.broadcastFn({ type: "presence.snapshot", reason, data: snapshot });
  }

  async startHeartbeatMonitor() {
    if (this.timeoutHandle) {
      return;
    }

    this.timeoutHandle = setInterval(async () => {
      try {
        await this.handleHeartbeatTimeouts();
      } catch {
        // Timeout sweeps must never crash the process.
      }
    }, this.heartbeatSweepMs);
  }

  stopHeartbeatMonitor() {
    if (!this.timeoutHandle) {
      return;
    }

    clearInterval(this.timeoutHandle);
    this.timeoutHandle = null;
  }

  async list() {
    return this.presenceRepository.list();
  }

  async getByReporterId(reporterId) {
    const presence = await this.presenceRepository.findByReporterId(reporterId);
    if (!presence) {
      throw new TmosError({
        code: "RESOURCE_NOT_FOUND",
        message: "Presence record not found",
        status: 404,
        details: { reporterId },
      });
    }

    return presence;
  }

  async assertReporterExists(reporterId) {
    const reporter = await this.reporterRepository.findById(reporterId);
    if (!reporter) {
      throw new TmosError({
        code: "VALIDATION_ERROR",
        message: "Reporter reference is invalid",
        status: 400,
        details: { field: "reporterId", reporterId },
      });
    }
  }

  async assertAssignmentExists(assignmentId) {
    if (!assignmentId) {
      return;
    }

    const assignment = await this.assignmentRepository.findById(assignmentId);
    if (!assignment) {
      throw new TmosError({
        code: "VALIDATION_ERROR",
        message: "Assignment reference is invalid",
        status: 400,
        details: { field: "currentAssignmentId", assignmentId },
      });
    }
  }

  async assertStudioExists(studioId) {
    if (!studioId) {
      return;
    }

    const studio = await this.studioRepository.findById(studioId);
    if (!studio) {
      throw new TmosError({
        code: "VALIDATION_ERROR",
        message: "Studio reference is invalid",
        status: 400,
        details: { field: "currentStudioId", studioId },
      });
    }
  }

  normalizePayload(payload = {}, { defaultStatus = null } = {}) {
    return {
      connectionStatus: sanitizeStatus(payload.connectionStatus, defaultStatus),
      currentAssignmentId: payload.currentAssignmentId || null,
      currentStudioId: payload.currentStudioId || null,
      deviceType: payload.deviceType ? String(payload.deviceType).trim() : null,
      operatingSystem: payload.operatingSystem ? String(payload.operatingSystem).trim() : null,
      appVersion: payload.appVersion ? String(payload.appVersion).trim() : null,
      cameraReady: payload.cameraReady === undefined ? undefined : Boolean(payload.cameraReady),
      microphoneReady: payload.microphoneReady === undefined ? undefined : Boolean(payload.microphoneReady),
      speakerReady: payload.speakerReady === undefined ? undefined : Boolean(payload.speakerReady),
      internetQuality: payload.internetQuality ? String(payload.internetQuality).trim() : null,
      signalStrength: clampPercent(payload.signalStrength),
      batteryLevel: clampPercent(payload.batteryLevel),
      isCharging: payload.isCharging === undefined ? undefined : Boolean(payload.isCharging),
      sessionId: payload.sessionId ? String(payload.sessionId) : null,
    };
  }

  async connectReporter({ reporterId, actor, correlationId, payload = {} }) {
    await this.assertReporterExists(reporterId);

    const normalized = this.normalizePayload(payload, { defaultStatus: "Online" });
    await this.assertAssignmentExists(normalized.currentAssignmentId);
    await this.assertStudioExists(normalized.currentStudioId);

    const nowIso = new Date().toISOString();
    const presence = await this.presenceRepository.upsert(reporterId, {
      ...normalized,
      connectionStatus: normalized.connectionStatus || "Online",
      loginTime: nowIso,
      lastHeartbeat: nowIso,
      disconnectedAt: null,
    });

    await this.auditService.record({
      actor,
      action: "reporter.connected",
      target: reporterId,
      result: "success",
      provider: "tmos",
      correlationId,
      metadata: {
        reporterId,
        deviceType: presence.deviceType,
        operatingSystem: presence.operatingSystem,
        appVersion: presence.appVersion,
      },
    });

    await this.emitUpdate("reporter.connected");
    return presence;
  }

  async heartbeat({ reporterId, actor, correlationId, payload = {} }) {
    await this.assertReporterExists(reporterId);

    const normalized = this.normalizePayload(payload, { defaultStatus: "Online" });
    await this.assertAssignmentExists(normalized.currentAssignmentId);
    await this.assertStudioExists(normalized.currentStudioId);

    const nowIso = new Date().toISOString();
    const presence = await this.presenceRepository.upsert(reporterId, {
      ...normalized,
      connectionStatus: normalized.connectionStatus || "Online",
      lastHeartbeat: nowIso,
      disconnectedAt: null,
    });

    await this.auditService.record({
      actor,
      action: "presence.changed",
      target: reporterId,
      result: "success",
      provider: "tmos",
      correlationId,
      metadata: {
        reporterId,
        source: "heartbeat",
        connectionStatus: presence.connectionStatus,
        internetQuality: presence.internetQuality,
        signalStrength: presence.signalStrength,
      },
    });

    await this.emitUpdate("presence.heartbeat");
    return presence;
  }

  async disconnectReporter({ reporterId, actor, correlationId, reason = "client_disconnect" }) {
    await this.assertReporterExists(reporterId);
    const presence = await this.presenceRepository.upsert(reporterId, {
      connectionStatus: "Disconnected",
      disconnectedAt: new Date().toISOString(),
      sessionId: null,
    });

    await this.auditService.record({
      actor,
      action: "reporter.disconnected",
      target: reporterId,
      result: "success",
      provider: "tmos",
      correlationId,
      metadata: {
        reporterId,
        reason,
      },
    });

    await this.emitUpdate("reporter.disconnected");
    return presence;
  }

  async overridePresence({ reporterId, actor, correlationId, payload = {} }) {
    await this.assertReporterExists(reporterId);

    const normalized = this.normalizePayload(payload);
    await this.assertAssignmentExists(normalized.currentAssignmentId);
    await this.assertStudioExists(normalized.currentStudioId);

    const presence = await this.presenceRepository.upsert(reporterId, {
      ...normalized,
      connectionStatus: normalized.connectionStatus || undefined,
    });

    await this.auditService.record({
      actor,
      action: "presence.override",
      target: reporterId,
      result: "success",
      provider: "tmos",
      correlationId,
      metadata: {
        reporterId,
        override: payload,
      },
    });

    await this.emitUpdate("presence.override");
    return presence;
  }

  async handleHeartbeatTimeouts() {
    const cutoff = new Date(Date.now() - this.heartbeatTimeoutMs).toISOString();
    const staleReporterIds = await this.presenceRepository.listStaleConnected(cutoff);
    if (!staleReporterIds.length) {
      return [];
    }

    const timedOut = [];
    for (const reporterId of staleReporterIds) {
      const presence = await this.presenceRepository.upsert(reporterId, {
        connectionStatus: "Disconnected",
        disconnectedAt: new Date().toISOString(),
        sessionId: null,
      });

      await this.auditService.record({
        actor: "system",
        action: "presence.heartbeat.timeout",
        target: reporterId,
        result: "success",
        provider: "tmos",
        correlationId: `presence-timeout-${Date.now()}`,
        metadata: {
          reporterId,
          timeoutMs: this.heartbeatTimeoutMs,
        },
      });

      timedOut.push(presence);
    }

    await this.emitUpdate("presence.timeout");
    return timedOut;
  }
}
