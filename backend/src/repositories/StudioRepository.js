import { randomUUID } from "node:crypto";

export class StudioRepository {
  constructor({ db }) {
    this.db = db;
  }

  async list() {
    const result = await this.db.query(
      `SELECT id, name, location, capacity, status, notes, created_at, updated_at
       FROM studios
       ORDER BY name ASC`,
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      location: row.location,
      capacity: row.capacity,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async findById(id) {
    const result = await this.db.query(
      `SELECT id, name, location, capacity, status, notes, created_at, updated_at
       FROM studios
       WHERE id = $1`,
      [id],
    );

    if (!result.rowCount) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      location: row.location,
      capacity: row.capacity,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async create({ id = randomUUID(), name, location, capacity = 1, status = "available", notes = null }) {
    const result = await this.db.query(
      `INSERT INTO studios(id, name, location, capacity, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, location, capacity, status, notes, created_at, updated_at`,
      [id, name, location, capacity, status, notes],
    );

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      location: row.location,
      capacity: row.capacity,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async update(id, { name, location, capacity, status, notes }) {
    const result = await this.db.query(
      `UPDATE studios
       SET name = COALESCE($2, name),
           location = COALESCE($3, location),
           capacity = COALESCE($4, capacity),
           status = COALESCE($5, status),
           notes = COALESCE($6, notes),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, location, capacity, status, notes, created_at, updated_at`,
      [id, name, location, capacity, status, notes],
    );

    if (!result.rowCount) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      location: row.location,
      capacity: row.capacity,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async delete(id) {
    const result = await this.db.query(
      `DELETE FROM studios
       WHERE id = $1
       RETURNING id, name, location, capacity, status, notes, created_at, updated_at`,
      [id],
    );

    if (!result.rowCount) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      location: row.location,
      capacity: row.capacity,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
