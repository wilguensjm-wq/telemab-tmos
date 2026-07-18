import { randomUUID } from "node:crypto";

export class AssignmentRepository {
  constructor({ db }) {
    this.db = db;
  }

  async list() {
    const result = await this.db.query(
      `SELECT a.id,
              a.title,
              a.reporter_id,
              r.full_name AS reporter_name,
              a.studio_id,
              s.name AS studio_name,
              a.assignment_status,
              a.priority,
              a.scheduled_start,
              a.scheduled_end,
              a.notes,
              a.created_at,
              a.updated_at
       FROM assignments a
       JOIN reporters r ON r.id = a.reporter_id
       JOIN studios s ON s.id = a.studio_id
       ORDER BY a.created_at DESC`,
    );

    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      reporterId: row.reporter_id,
      reporterName: row.reporter_name,
      studioId: row.studio_id,
      studioName: row.studio_name,
      assignmentStatus: row.assignment_status,
      priority: row.priority,
      scheduledStart: row.scheduled_start ? row.scheduled_start.toISOString() : null,
      scheduledEnd: row.scheduled_end ? row.scheduled_end.toISOString() : null,
      notes: row.notes,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async findById(id) {
    const result = await this.db.query(
      `SELECT a.id,
              a.title,
              a.reporter_id,
              r.full_name AS reporter_name,
              a.studio_id,
              s.name AS studio_name,
              a.assignment_status,
              a.priority,
              a.scheduled_start,
              a.scheduled_end,
              a.notes,
              a.created_at,
              a.updated_at
       FROM assignments a
       JOIN reporters r ON r.id = a.reporter_id
       JOIN studios s ON s.id = a.studio_id
       WHERE a.id = $1`,
      [id],
    );

    if (!result.rowCount) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      title: row.title,
      reporterId: row.reporter_id,
      reporterName: row.reporter_name,
      studioId: row.studio_id,
      studioName: row.studio_name,
      assignmentStatus: row.assignment_status,
      priority: row.priority,
      scheduledStart: row.scheduled_start ? row.scheduled_start.toISOString() : null,
      scheduledEnd: row.scheduled_end ? row.scheduled_end.toISOString() : null,
      notes: row.notes,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async create({ id = randomUUID(), title, reporterId, studioId, assignmentStatus = "scheduled", priority = "normal", scheduledStart = null, scheduledEnd = null, notes = null }) {
    const result = await this.db.query(
      `INSERT INTO assignments(id, title, reporter_id, studio_id, assignment_status, priority, scheduled_start, scheduled_end, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [id, title, reporterId, studioId, assignmentStatus, priority, scheduledStart, scheduledEnd, notes],
    );

    return this.findById(result.rows[0].id);
  }

  async update(id, { title, reporterId, studioId, assignmentStatus, priority, scheduledStart, scheduledEnd, notes }) {
    const result = await this.db.query(
      `UPDATE assignments
       SET title = COALESCE($2, title),
           reporter_id = COALESCE($3, reporter_id),
           studio_id = COALESCE($4, studio_id),
           assignment_status = COALESCE($5, assignment_status),
           priority = COALESCE($6, priority),
           scheduled_start = COALESCE($7, scheduled_start),
           scheduled_end = COALESCE($8, scheduled_end),
           notes = COALESCE($9, notes),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [id, title, reporterId, studioId, assignmentStatus, priority, scheduledStart, scheduledEnd, notes],
    );

    if (!result.rowCount) {
      return null;
    }

    return this.findById(id);
  }

  async delete(id) {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    await this.db.query(`DELETE FROM assignments WHERE id = $1`, [id]);
    return existing;
  }
}
