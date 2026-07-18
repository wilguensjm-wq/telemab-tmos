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

export class StudioService {
  constructor({ studioRepository }) {
    this.studioRepository = studioRepository;
  }

  async list() {
    return this.studioRepository.list();
  }

  async getById(id) {
    const studio = await this.studioRepository.findById(id);
    if (!studio) {
      throw new TmosError({
        code: "RESOURCE_NOT_FOUND",
        message: "Studio not found",
        status: 404,
        details: { studioId: id },
      });
    }

    return studio;
  }

  async create(payload = {}) {
    requireNonEmpty(payload.name, "name");
    requireNonEmpty(payload.location, "location");

    const capacity = payload.capacity === undefined ? 1 : Number(payload.capacity);
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new TmosError({
        code: "VALIDATION_ERROR",
        message: "capacity must be an integer >= 1",
        status: 400,
        details: { field: "capacity" },
      });
    }

    return this.studioRepository.create({
      name: String(payload.name).trim(),
      location: String(payload.location).trim(),
      capacity,
      status: payload.status ? String(payload.status).trim() : "available",
      notes: payload.notes ? String(payload.notes).trim() : null,
    });
  }

  async update(id, payload = {}) {
    let capacity = null;
    if (payload.capacity !== undefined) {
      capacity = Number(payload.capacity);
      if (!Number.isInteger(capacity) || capacity < 1) {
        throw new TmosError({
          code: "VALIDATION_ERROR",
          message: "capacity must be an integer >= 1",
          status: 400,
          details: { field: "capacity" },
        });
      }
    }

    const updated = await this.studioRepository.update(id, {
      name: payload.name ? String(payload.name).trim() : null,
      location: payload.location ? String(payload.location).trim() : null,
      capacity,
      status: payload.status ? String(payload.status).trim() : null,
      notes: payload.notes ? String(payload.notes).trim() : null,
    });

    if (!updated) {
      throw new TmosError({
        code: "RESOURCE_NOT_FOUND",
        message: "Studio not found",
        status: 404,
        details: { studioId: id },
      });
    }

    return updated;
  }

  async remove(id) {
    const deleted = await this.studioRepository.delete(id);
    if (!deleted) {
      throw new TmosError({
        code: "RESOURCE_NOT_FOUND",
        message: "Studio not found",
        status: 404,
        details: { studioId: id },
      });
    }

    return deleted;
  }
}
