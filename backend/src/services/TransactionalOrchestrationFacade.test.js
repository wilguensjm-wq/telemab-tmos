import test from "node:test";
import assert from "node:assert/strict";
import { TransactionalOrchestrationFacade } from "./TransactionalOrchestrationFacade.js";

test("TransactionalOrchestrationFacade uses fallback dependencies without db transaction", async () => {
  const mediaRepository = { name: "media-repo" };
  const auditService = { name: "audit-service" };
  const facade = new TransactionalOrchestrationFacade({ mediaRepository, auditService });

  const result = await facade.execute(async ({ mediaRepository: repo, auditService: audit }) => ({ repo, audit }));

  assert.equal(result.repo, mediaRepository);
  assert.equal(result.audit, auditService);
});

test("TransactionalOrchestrationFacade executes inside db transaction when available", async () => {
  const db = {
    async withTransaction(work) {
      const tx = {
        async query() {
          return { rows: [], rowCount: 0 };
        },
      };
      return work(tx);
    },
  };

  const facade = new TransactionalOrchestrationFacade({
    db,
    mediaRepository: { sentinel: true },
    auditService: { sentinel: true },
  });

  const result = await facade.execute(async ({ mediaRepository, auditService }) => ({
    hasMediaRepo: Boolean(mediaRepository),
    hasAuditService: Boolean(auditService),
    txBacked: typeof mediaRepository.listSessions === "function",
  }));

  assert.equal(result.hasMediaRepo, true);
  assert.equal(result.hasAuditService, true);
  assert.equal(result.txBacked, true);
});
