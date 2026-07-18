import { MediaRepository } from "../repositories/MediaRepository.js";
import { AuditRepository } from "../repositories/AuditRepository.js";
import { AuditService } from "./auditService.js";

export class TransactionalOrchestrationFacade {
  constructor({ db = null, mediaRepository, auditService }) {
    this.db = db;
    this.mediaRepository = mediaRepository;
    this.auditService = auditService;
  }

  async execute(work) {
    if (!this.db || typeof this.db.withTransaction !== "function") {
      return work({
        mediaRepository: this.mediaRepository,
        auditService: this.auditService,
      });
    }

    return this.db.withTransaction(async (tx) => {
      const txMediaRepository = new MediaRepository({ db: tx });
      const txAuditService = new AuditService({
        auditRepository: new AuditRepository({ db: tx }),
      });

      return work({
        mediaRepository: txMediaRepository,
        auditService: txAuditService,
      });
    });
  }
}
