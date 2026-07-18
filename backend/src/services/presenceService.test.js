import test from "node:test";
import assert from "node:assert/strict";
import { PresenceService } from "./presenceService.js";

function createHarness() {
  const state = new Map();
  const auditEntries = [];

  const presenceRepository = {
    async list() {
      return [...state.values()];
    },
    async findByReporterId(reporterId) {
      return state.get(reporterId) || null;
    },
    async upsert(reporterId, payload) {
      const previous = state.get(reporterId) || {
        reporterId,
        connectionStatus: "Offline",
        cameraReady: false,
        microphoneReady: false,
        speakerReady: false,
      };
      const next = {
        ...previous,
        ...payload,
        reporterId,
      };
      state.set(reporterId, next);
      return next;
    },
    async listStaleConnected() {
      return [...state.values()]
        .filter((item) => ["Connecting", "Online", "Ready", "Live"].includes(item.connectionStatus))
        .map((item) => item.reporterId);
    },
  };

  const reporterRepository = {
    async findById(reporterId) {
      if (reporterId.startsWith("rep-")) {
        return { id: reporterId };
      }
      return null;
    },
  };

  const assignmentRepository = {
    async findById(assignmentId) {
      if (!assignmentId) return null;
      return assignmentId.startsWith("asg-") ? { id: assignmentId } : null;
    },
  };

  const studioRepository = {
    async findById(studioId) {
      if (!studioId) return null;
      return studioId.startsWith("stu-") ? { id: studioId } : null;
    },
  };

  const auditService = {
    async record(entry) {
      auditEntries.push(entry);
      return entry;
    },
  };

  const service = new PresenceService({
    presenceRepository,
    reporterRepository,
    assignmentRepository,
    studioRepository,
    auditService,
    heartbeatTimeoutMs: 100,
    heartbeatSweepMs: 50,
  });

  return { service, state, auditEntries };
}

test("PresenceService connects reporter and stores readiness context", async () => {
  const { service, state, auditEntries } = createHarness();

  const connected = await service.connectReporter({
    reporterId: "rep-1",
    actor: "operator",
    correlationId: "corr-connect",
    payload: {
      deviceType: "mobile",
      operatingSystem: "ios",
      appVersion: "3.2.0",
      currentAssignmentId: "asg-1",
      currentStudioId: "stu-1",
      cameraReady: true,
    },
  });

  assert.equal(connected.reporterId, "rep-1");
  assert.equal(connected.connectionStatus, "Online");
  assert.equal(state.get("rep-1").deviceType, "mobile");
  assert.equal(auditEntries.some((entry) => entry.action === "reporter.connected"), true);
});

test("PresenceService heartbeat timeout marks stale reporters disconnected", async () => {
  const { service, state, auditEntries } = createHarness();

  await service.connectReporter({
    reporterId: "rep-2",
    actor: "operator",
    correlationId: "corr-connect-2",
    payload: {
      connectionStatus: "Ready",
      deviceType: "tablet",
    },
  });

  const timedOut = await service.handleHeartbeatTimeouts();

  assert.equal(timedOut.length, 1);
  assert.equal(state.get("rep-2").connectionStatus, "Disconnected");
  assert.equal(auditEntries.some((entry) => entry.action === "presence.heartbeat.timeout"), true);
});

test("PresenceService override validates reporter references", async () => {
  const { service } = createHarness();

  await assert.rejects(
    () => service.overridePresence({
      reporterId: "missing",
      actor: "producer",
      correlationId: "corr-override",
      payload: { connectionStatus: "Live" },
    }),
    (error) => error?.code === "VALIDATION_ERROR",
  );
});
