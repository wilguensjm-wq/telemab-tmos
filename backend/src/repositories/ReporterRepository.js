import { randomUUID } from "node:crypto";

export class ReporterRepository {
  constructor({ db }) {
    this.db = db;
  }

  async list() {
    const result = await this.db.query(
      `SELECT id, full_name, email, phone, status, notes, created_at, updated_at
       FROM reporters
       ORDER BY full_name ASC`,
    );

    return result.rows.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async findById(id) {
    const result = await this.db.query(
      `SELECT id, full_name, email, phone, status, notes, created_at, updated_at
       FROM reporters
       WHERE id = $1`,
      [id],
    );

    if (!result.rowCount) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async create({ id = randomUUID(), fullName, email, phone = null, status = "active", notes = null }) {
    const result = await this.db.query(
      `INSERT INTO reporters(id, full_name, email, phone, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, full_name, email, phone, status, notes, created_at, updated_at`,
      [id, fullName, email, phone, status, notes],
    );

    const row = result.rows[0];
    return {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async update(id, { fullName, email, phone, status, notes }) {
    const result = await this.db.query(
      `UPDATE reporters
       SET full_name = COALESCE($2, full_name),
           email = COALESCE($3, email),
           phone = COALESCE($4, phone),
           status = COALESCE($5, status),
           notes = COALESCE($6, notes),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, full_name, email, phone, status, notes, created_at, updated_at`,
      [id, fullName, email, phone, status, notes],
    );

    if (!result.rowCount) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async delete(id) {
    const result = await this.db.query(
      `DELETE FROM reporters
       WHERE id = $1
       RETURNING id, full_name, email, phone, status, notes, created_at, updated_at`,
      [id],
    );

    if (!result.rowCount) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
