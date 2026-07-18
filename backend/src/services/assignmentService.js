import { TmosError } from "../errors/TmosError.js";

function requireNonEmpty(value, field) {
  if (!value || !String(value).trim()) {
    throw new TmosError({
      code: "VALIDATION_ERROR",
      message: `${field} is required`,
      status: 400,
      details: { field },
    });
  }
}

export class AssignmentService {
  constructor({ assignmentRepository, reporterRepository, studioRepository }) {
    this.assignmentRepository = assignmentRepository;
    this.reporterRepository = reporterRepository;
    this.studioRepository = studioRepository;
  }

  async list() {
    return this.assignmentRepository.list();
  }

  async getById(id) {
    const assignment = await this.assignmentRepository.findById(id);
    if (!assignment) {
      throw new TmosError({
        code: "RESOURCE_NOT_FOUND",
        message: "Assignment not found",
        status: 404,
        details: { assignmentId: id },
      });
    }

    return assignment;
  }

  async ensureReferences({ reporterId, studioId }) {
    const [reporter, studio] = await Promise.all([
      reporterId ? this.reporterRepository.findById(reporterId) : Promise.resolve(null),
      studioId ? this.studioRepository.findById(studioId) : Promise.resolve(null),
    ]);

    if (reporterId && !reporter) {
      throw new TmosError({
        code: "VALIDATION_ERROR",
        message: "Reporter reference is invalid",
        status: 400,
        details: { field: "reporterId", reporterId },
      });
    }

    if (studioId && !studio) {
      throw new TmosError({
        code: "VALIDATION_ERROR",
        message: "Studio reference is invalid",
        status: 400,
        details: { field: "studioId", studioId },
      });
    }
  }

  async create(payload = {}) {
    requireNonEmpty(payload.title, "title");
    requireNonEmpty(payload.reporterId, "reporterId");
    requireNonEmpty(payload.studioId, "studioId");

    await this.ensureReferences({ reporterId: payload.reporterId, studioId: payload.studioId });

    return this.assignmentRepository.create({
      title: String(payload.title).trim(),
      reporterId: String(payload.reporterId),
      studioId: String(payload.studioId),
      assignmentStatus: payload.assignmentStatus ? String(payload.assignmentStatus).trim() : "scheduled",
      priority: payload.priority ? String(payload.priority).trim() : "normal",
      scheduledStart: payload.scheduledStart || null,
      scheduledEnd: payload.scheduledEnd || null,
      notes: payload.notes ? String(payload.notes).trim() : null,
    });
  }

  async update(id, payload = {}) {
    await this.ensureReferences({
      reporterId: payload.reporterId || null,
      studioId: payload.studioId || null,
    });

    const updated = await this.assignmentRepository.update(id, {
      title: payload.title ? String(payload.title).trim() : null,
      reporterId: payload.reporterId ? String(payload.reporterId) : null,
      studioId: payload.studioId ? String(payload.studioId) : null,
      assignmentStatus: payload.assignmentStatus ? String(payload.assignmentStatus).trim() : null,
      priority: payload.priority ? String(payload.priority).trim() : null,
      scheduledStart: payload.scheduledStart || null,
      scheduledEnd: payload.scheduledEnd || null,
      notes: payload.notes ? String(payload.notes).trim() : null,
    });

    if (!updated) {
      throw new TmosError({
        code: "RESOURCE_NOT_FOUND",
        message: "Assignment not found",
        status: 404,
        details: { assignmentId: id },
      });
    }

    return updated;
  }

  async remove(id) {
    const deleted = await this.assignmentRepository.delete(id);
    if (!deleted) {
      throw new TmosError({
        code: "RESOURCE_NOT_FOUND",
        message: "Assignment not found",
        status: 404,
        details: { assignmentId: id },
      });
    }

    return deleted;
  }
}
