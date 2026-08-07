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

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export class ReporterService {
  constructor({ reporterRepository }) {
    this.reporterRepository = reporterRepository;
  }

  async list() {
    return this.reporterRepository.list();
  }

  async listPending() {
    return this.reporterRepository.listPending();
  }

  async getById(id) {
    const reporter = await this.reporterRepository.findById(id);
    if (!reporter) {
      throw new TmosError({
        code: "RESOURCE_NOT_FOUND",
        message: "Reporter not found",
        status: 404,
        details: { reporterId: id },
      });
    }

    return reporter;
  }

  async create(payload = {}) {
    requireNonEmpty(payload.fullName, "fullName");
    requireNonEmpty(payload.email, "email");

    return this.reporterRepository.create({
      fullName: String(payload.fullName).trim(),
      email: normalizeEmail(payload.email),
      phone: payload.phone ? String(payload.phone).trim() : null,
      status: payload.status ? String(payload.status).trim() : "active",
      notes: payload.notes ? String(payload.notes).trim() : null,
    });
  }

  async update(id, payload = {}) {
    const updated = await this.reporterRepository.update(id, {
      fullName: payload.fullName ? String(payload.fullName).trim() : null,
      email: payload.email ? normalizeEmail(payload.email) : null,
      phone: payload.phone ? String(payload.phone).trim() : null,
      status: payload.status ? String(payload.status).trim() : null,
      notes: payload.notes ? String(payload.notes).trim() : null,
    });

    if (!updated) {
      throw new TmosError({
        code: "RESOURCE_NOT_FOUND",
        message: "Reporter not found",
        status: 404,
        details: { reporterId: id },
      });
    }

    return updated;
  }

  async remove(id) {
    const deleted = await this.reporterRepository.delete(id);
    if (!deleted) {
      throw new TmosError({
        code: "RESOURCE_NOT_FOUND",
        message: "Reporter not found",
        status: 404,
        details: { reporterId: id },
      });
    }

    return deleted;
  }
}
