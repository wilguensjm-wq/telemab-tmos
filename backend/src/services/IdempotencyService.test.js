import test from "node:test";
import assert from "node:assert/strict";
import { IdempotencyService } from "./IdempotencyService.js";

function createHarness() {
  const operationKeys = [];

  const mediaRepository = {
    async findOperationKey(operationKey) {
      return operationKeys.find((item) => item.operationKey === operationKey) || null;
    },
    async createOperationKey(payload) {
      const created = {
        id: `op-${operationKeys.length + 1}`,
        operationKey: payload.operationKey,
        endpoint: payload.endpoint,
        actor: payload.actor,
        correlationId: payload.correlationId,
        requestHash: payload.requestHash,
        responseHash: null,
        responsePayload: null,
        createdAt: new Date().toISOString(),
        expiresAt: payload.expiresAt,
      };
      operationKeys.push(created);
      return created;
    },
    async completeOperationKey({ operationKey, responseHash, responsePayload }) {
      const existing = operationKeys.find((item) => item.operationKey === operationKey);
      if (!existing) return null;
      existing.responseHash = responseHash;
      existing.responsePayload = responsePayload;
      return existing;
    },
  };

  return {
    service: new IdempotencyService({ mediaRepository }),
    operationKeys,
  };
}

test("IdempotencyService creates and replays operation key", async () => {
  const { service } = createHarness();

  const first = await service.begin({
    idempotencyKey: "session-go-live-abc123",
    endpoint: "media.session.go_live",
    actor: "producer",
    correlationId: "corr-1",
    payload: { sessionId: "session-1", action: "go_live" },
  });

  assert.equal(first.replay, false);

  await service.complete({
    operationKey: "session-go-live-abc123",
    responsePayload: { session: { id: "session-1", status: "live" } },
  });

  const second = await service.begin({
    idempotencyKey: "session-go-live-abc123",
    endpoint: "media.session.go_live",
    actor: "producer",
    correlationId: "corr-2",
    payload: { sessionId: "session-1", action: "go_live" },
  });

  assert.equal(second.replay, true);
  assert.equal(second.operation.responsePayload.session.status, "live");
});

test("IdempotencyService rejects key reuse with different payload", async () => {
  const { service } = createHarness();

  await service.begin({
    idempotencyKey: "session-stop-live-abc123",
    endpoint: "media.session.stop_live",
    actor: "producer",
    correlationId: "corr-1",
    payload: { sessionId: "session-1", action: "stop_live" },
  });

  await assert.rejects(
    () => service.begin({
      idempotencyKey: "session-stop-live-abc123",
      endpoint: "media.session.stop_live",
      actor: "producer",
      correlationId: "corr-2",
      payload: { sessionId: "session-2", action: "stop_live" },
    }),
    (error) => error?.code === "VALIDATION_ERROR" && error?.status === 409,
  );
});
