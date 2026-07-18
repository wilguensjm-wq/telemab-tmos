import { randomUUID } from "node:crypto";

export class MediaRepository {
  constructor({ db }) {
    this.db = db;
  }

  mapSession(row) {
    return {
      id: row.id,
      roomId: row.room_id,
      programName: row.program_name,
      assignmentId: row.assignment_id,
      studioId: row.studio_id,
      producerUserId: row.producer_user_id,
      producerUsername: row.producer_username,
      status: row.status,
      recordingEnabled: row.recording_enabled,
      notes: row.notes,
      startedAt: row.started_at ? row.started_at.toISOString() : null,
      endedAt: row.ended_at ? row.ended_at.toISOString() : null,
      version: row.version === undefined || row.version === null ? 0 : Number(row.version),
      metadata: row.metadata || {},
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  mapRoom(row) {
    return {
      id: row.id,
      providerKey: row.provider_key,
      providerRoomId: row.provider_room_id,
      name: row.name,
      roomType: row.room_type,
      status: row.status,
      metadata: row.metadata || {},
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  mapParticipant(row) {
    return {
      id: row.id,
      roomId: row.room_id,
      sessionId: row.session_id || null,
      providerParticipantId: row.provider_participant_id,
      userId: row.user_id,
      username: row.username,
      reporterId: row.reporter_id,
      participantRole: row.participant_role,
      connectionStatus: row.connection_status,
      lifecycleState: row.lifecycle_state,
      isProducer: row.is_producer,
      invitedBy: row.invited_by,
      promotedAt: row.promoted_at ? row.promoted_at.toISOString() : null,
      demotedAt: row.demoted_at ? row.demoted_at.toISOString() : null,
      version: row.version === undefined || row.version === null ? 0 : Number(row.version),
      publisherEnabled: row.publisher_enabled,
      subscriberEnabled: row.subscriber_enabled,
      muted: row.muted,
      deviceSelection: row.device_selection || {},
      joinedAt: row.joined_at.toISOString(),
      leftAt: row.left_at ? row.left_at.toISOString() : null,
      metadata: row.metadata || {},
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async listRooms() {
    const result = await this.db.query(
      `SELECT id, provider_key, provider_room_id, name, room_type, status, metadata, created_by, created_at, updated_at
       FROM media_rooms
       ORDER BY created_at DESC`,
    );

    return result.rows.map((row) => this.mapRoom(row));
  }

  async findRoomById(roomId) {
    const result = await this.db.query(
      `SELECT id, provider_key, provider_room_id, name, room_type, status, metadata, created_by, created_at, updated_at
       FROM media_rooms
       WHERE id = $1`,
      [roomId],
    );

    if (!result.rowCount) {
      return null;
    }

    return this.mapRoom(result.rows[0]);
  }

  async createRoom({ id = randomUUID(), providerKey, providerRoomId, name, roomType = "control-room", status = "active", metadata = {}, createdBy }) {
    const result = await this.db.query(
      `INSERT INTO media_rooms(id, provider_key, provider_room_id, name, room_type, status, metadata, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       RETURNING id, provider_key, provider_room_id, name, room_type, status, metadata, created_by, created_at, updated_at`,
      [id, providerKey, providerRoomId, name, roomType, status, JSON.stringify(metadata || {}), createdBy],
    );

    return this.mapRoom(result.rows[0]);
  }

  async listParticipantsByRoom(roomId) {
    const result = await this.db.query(
      `SELECT id, room_id, session_id, provider_participant_id, user_id, username, reporter_id, participant_role, connection_status,
              lifecycle_state, is_producer, invited_by, promoted_at, demoted_at,
              version, publisher_enabled, subscriber_enabled, muted, device_selection, joined_at, left_at, metadata, updated_at
       FROM media_participants
       WHERE room_id = $1
       ORDER BY joined_at DESC`,
      [roomId],
    );

    return result.rows.map((row) => this.mapParticipant(row));
  }

  async findParticipantById(participantId) {
    const result = await this.db.query(
      `SELECT id, room_id, session_id, provider_participant_id, user_id, username, reporter_id, participant_role, connection_status,
              lifecycle_state, is_producer, invited_by, promoted_at, demoted_at,
              version, publisher_enabled, subscriber_enabled, muted, device_selection, joined_at, left_at, metadata, updated_at
       FROM media_participants
       WHERE id = $1`,
      [participantId],
    );

    if (!result.rowCount) {
      return null;
    }

    return this.mapParticipant(result.rows[0]);
  }

  async createParticipant({ id = randomUUID(), roomId, sessionId = null, providerParticipantId, userId = null, username, reporterId = null, participantRole, connectionStatus = "connected", lifecycleState = "connected", isProducer = false, invitedBy = null, publisherEnabled = true, subscriberEnabled = true, muted = false, deviceSelection = {}, metadata = {} }) {
    const result = await this.db.query(
      `INSERT INTO media_participants(
        id, room_id, session_id, provider_participant_id, user_id, username, reporter_id, participant_role, connection_status,
        lifecycle_state, is_producer, invited_by,
        publisher_enabled, subscriber_enabled, muted, device_selection, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12,
        $13, $14, $15, $16::jsonb, $17::jsonb
      )
      RETURNING id, room_id, session_id, provider_participant_id, user_id, username, reporter_id, participant_role, connection_status,
                lifecycle_state, is_producer, invited_by, promoted_at, demoted_at,
                version, publisher_enabled, subscriber_enabled, muted, device_selection, joined_at, left_at, metadata, updated_at`,
      [
        id,
        roomId,
        sessionId,
        providerParticipantId,
        userId,
        username,
        reporterId,
        participantRole,
        connectionStatus,
        lifecycleState,
        Boolean(isProducer),
        invitedBy,
        publisherEnabled,
        subscriberEnabled,
        muted,
        JSON.stringify(deviceSelection || {}),
        JSON.stringify(metadata || {}),
      ],
    );

    return this.mapParticipant(result.rows[0]);
  }

  async markParticipantLeft(participantId) {
    const result = await this.db.query(
      `UPDATE media_participants
       SET connection_status = 'left',
           lifecycle_state = 'disconnected',
           left_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, room_id, session_id, provider_participant_id, user_id, username, reporter_id, participant_role, connection_status,
                 lifecycle_state, is_producer, invited_by, promoted_at, demoted_at,
                 version, publisher_enabled, subscriber_enabled, muted, device_selection, joined_at, left_at, metadata, updated_at`,
      [participantId],
    );

    if (!result.rowCount) {
      return null;
    }

    return this.mapParticipant(result.rows[0]);
  }

  async updateParticipant(participantId, payload = {}) {
    const expectedVersion = payload.expectedVersion;
    const values = [
      participantId,
      payload.publisherEnabled === undefined ? null : Boolean(payload.publisherEnabled),
      payload.subscriberEnabled === undefined ? null : Boolean(payload.subscriberEnabled),
      payload.muted === undefined ? null : Boolean(payload.muted),
      payload.deviceSelection === undefined ? null : JSON.stringify(payload.deviceSelection),
      payload.metadata === undefined ? null : JSON.stringify(payload.metadata),
      payload.lifecycleState === undefined ? null : payload.lifecycleState,
      payload.connectionStatus === undefined ? null : payload.connectionStatus,
      payload.isProducer === undefined ? null : Boolean(payload.isProducer),
      payload.invitedBy === undefined ? null : payload.invitedBy,
      payload.promotedAt === undefined ? null : payload.promotedAt,
      payload.demotedAt === undefined ? null : payload.demotedAt,
    ];

    let sql = `UPDATE media_participants
       SET publisher_enabled = COALESCE($2, publisher_enabled),
           subscriber_enabled = COALESCE($3, subscriber_enabled),
           muted = COALESCE($4, muted),
           device_selection = COALESCE($5::jsonb, device_selection),
           metadata = COALESCE($6::jsonb, metadata),
           lifecycle_state = COALESCE($7, lifecycle_state),
           connection_status = COALESCE($8, connection_status),
           is_producer = COALESCE($9, is_producer),
           invited_by = COALESCE($10, invited_by),
           promoted_at = COALESCE($11, promoted_at),
           demoted_at = COALESCE($12, demoted_at),
           version = version + 1,
           updated_at = NOW()
       WHERE id = $1`;

    if (expectedVersion !== undefined && expectedVersion !== null) {
      values.push(Number(expectedVersion));
      sql += ` AND version = $${values.length}`;
    }

    sql += `
       RETURNING id, room_id, session_id, provider_participant_id, user_id, username, reporter_id, participant_role, connection_status,
                 lifecycle_state, is_producer, invited_by, promoted_at, demoted_at,
                 version, publisher_enabled, subscriber_enabled, muted, device_selection, joined_at, left_at, metadata, updated_at`;

    const result = await this.db.query(sql, values);

    if (!result.rowCount) {
      return null;
    }

    return this.mapParticipant(result.rows[0]);
  }

  async listParticipantsBySession(sessionId) {
    const result = await this.db.query(
      `SELECT id, room_id, session_id, provider_participant_id, user_id, username, reporter_id, participant_role, connection_status,
              lifecycle_state, is_producer, invited_by, promoted_at, demoted_at,
              version, publisher_enabled, subscriber_enabled, muted, device_selection, joined_at, left_at, metadata, updated_at
       FROM media_participants
       WHERE session_id = $1
       ORDER BY joined_at ASC`,
      [sessionId],
    );

    return result.rows.map((row) => this.mapParticipant(row));
  }

  async createSession({ id = randomUUID(), roomId, programName, assignmentId = null, studioId = null, producerUserId = null, producerUsername, status = "active", recordingEnabled = false, notes = null, startedAt = null, endedAt = null, metadata = {} }) {
    const result = await this.db.query(
      `INSERT INTO media_sessions(
         id, room_id, program_name, assignment_id, studio_id, producer_user_id, producer_username,
         status, recording_enabled, notes, started_at, ended_at, metadata
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, COALESCE($11::timestamptz, NOW()), $12::timestamptz, $13::jsonb
       )
       RETURNING id, room_id, program_name, assignment_id, studio_id, producer_user_id, producer_username,
                 status, recording_enabled, notes, started_at, ended_at, version, metadata, created_at, updated_at`,
      [
        id,
        roomId,
        programName,
        assignmentId,
        studioId,
        producerUserId,
        producerUsername,
        status,
        Boolean(recordingEnabled),
        notes,
        startedAt,
        endedAt,
        JSON.stringify(metadata || {}),
      ],
    );

    return this.mapSession(result.rows[0]);
  }

  async listSessions() {
    const result = await this.db.query(
      `SELECT id, room_id, program_name, assignment_id, studio_id, producer_user_id, producer_username,
              status, recording_enabled, notes, started_at, ended_at, version, metadata, created_at, updated_at
       FROM media_sessions
       ORDER BY created_at DESC`,
    );

    return result.rows.map((row) => this.mapSession(row));
  }

  async findSessionById(sessionId) {
    const result = await this.db.query(
      `SELECT id, room_id, program_name, assignment_id, studio_id, producer_user_id, producer_username,
              status, recording_enabled, notes, started_at, ended_at, version, metadata, created_at, updated_at
       FROM media_sessions
       WHERE id = $1`,
      [sessionId],
    );

    if (!result.rowCount) {
      return null;
    }

    return this.mapSession(result.rows[0]);
  }

  async updateSession(sessionId, payload = {}) {
    const expectedVersion = payload.expectedVersion;
    const values = [
      sessionId,
      payload.programName === undefined ? null : payload.programName,
      payload.assignmentId === undefined ? null : payload.assignmentId,
      payload.studioId === undefined ? null : payload.studioId,
      payload.producerUserId === undefined ? null : payload.producerUserId,
      payload.producerUsername === undefined ? null : payload.producerUsername,
      payload.status === undefined ? null : payload.status,
      payload.recordingEnabled === undefined ? null : Boolean(payload.recordingEnabled),
      payload.notes === undefined ? null : payload.notes,
      payload.startedAt === undefined ? null : payload.startedAt,
      payload.endedAt === undefined ? null : payload.endedAt,
      payload.metadata === undefined ? null : JSON.stringify(payload.metadata),
    ];

    let sql = `UPDATE media_sessions
       SET program_name = COALESCE($2, program_name),
           assignment_id = COALESCE($3, assignment_id),
           studio_id = COALESCE($4, studio_id),
           producer_user_id = COALESCE($5, producer_user_id),
           producer_username = COALESCE($6, producer_username),
           status = COALESCE($7, status),
           recording_enabled = COALESCE($8, recording_enabled),
           notes = COALESCE($9, notes),
           started_at = COALESCE($10::timestamptz, started_at),
           ended_at = COALESCE($11::timestamptz, ended_at),
           metadata = COALESCE($12::jsonb, metadata),
           version = version + 1,
           updated_at = NOW()
       WHERE id = $1`;

    if (expectedVersion !== undefined && expectedVersion !== null) {
      values.push(Number(expectedVersion));
      sql += ` AND version = $${values.length}`;
    }

    sql += `
       RETURNING id, room_id, program_name, assignment_id, studio_id, producer_user_id, producer_username,
                 status, recording_enabled, notes, started_at, ended_at, version, metadata, created_at, updated_at`;

    const result = await this.db.query(sql, values);

    if (!result.rowCount) {
      return null;
    }

    return this.mapSession(result.rows[0]);
  }

  async createParticipantStateTransition({ id = randomUUID(), participantId, sessionId, fromState = null, toState, reason = null, actor, correlationId, metadata = {} }) {
    await this.db.query(
      `INSERT INTO media_participant_state_transitions(
         id, participant_id, session_id, from_state, to_state, reason, actor, correlation_id, metadata
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb
       )`,
      [
        id,
        participantId,
        sessionId,
        fromState,
        toState,
        reason,
        actor,
        correlationId,
        JSON.stringify(metadata || {}),
      ],
    );

    return {
      id,
      participantId,
      sessionId,
      fromState,
      toState,
      reason,
      actor,
      correlationId,
      metadata,
    };
  }

  async upsertSessionReadiness({ sessionId, participantId, cameraReady, microphoneReady, speakerReady, networkQuality = "fair", metadata = {} }) {
    const result = await this.db.query(
      `INSERT INTO media_session_readiness(
         id, session_id, participant_id, camera_ready, microphone_ready, speaker_ready,
         network_quality, metadata, last_reported_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8::jsonb, NOW(), NOW()
       )
       ON CONFLICT (session_id, participant_id)
       DO UPDATE SET
         camera_ready = EXCLUDED.camera_ready,
         microphone_ready = EXCLUDED.microphone_ready,
         speaker_ready = EXCLUDED.speaker_ready,
         network_quality = EXCLUDED.network_quality,
         metadata = EXCLUDED.metadata,
         last_reported_at = NOW(),
         updated_at = NOW()
       RETURNING id, session_id, participant_id, camera_ready, microphone_ready, speaker_ready,
                 network_quality, metadata, last_reported_at, created_at, updated_at`,
      [randomUUID(), sessionId, participantId, cameraReady, microphoneReady, speakerReady, networkQuality, JSON.stringify(metadata || {})],
    );

    const row = result.rows[0];
    return {
      id: row.id,
      sessionId: row.session_id,
      participantId: row.participant_id,
      cameraReady: row.camera_ready,
      microphoneReady: row.microphone_ready,
      speakerReady: row.speaker_ready,
      networkQuality: row.network_quality,
      metadata: row.metadata || {},
      lastReportedAt: row.last_reported_at.toISOString(),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async listSessionReadiness(sessionId) {
    const result = await this.db.query(
      `SELECT r.id, r.session_id, r.participant_id, r.camera_ready, r.microphone_ready, r.speaker_ready,
              r.network_quality, r.metadata, r.last_reported_at, r.created_at, r.updated_at,
              p.username
       FROM media_session_readiness r
       INNER JOIN media_participants p ON p.id = r.participant_id
       WHERE r.session_id = $1
       ORDER BY r.last_reported_at DESC`,
      [sessionId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      participantId: row.participant_id,
      username: row.username,
      cameraReady: row.camera_ready,
      microphoneReady: row.microphone_ready,
      speakerReady: row.speaker_ready,
      networkQuality: row.network_quality,
      metadata: row.metadata || {},
      lastReportedAt: row.last_reported_at.toISOString(),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async findOperationKey(operationKey) {
    const result = await this.db.query(
      `SELECT id, operation_key, endpoint, actor, correlation_id, request_hash, response_hash, response_json, created_at, expires_at
       FROM media_operation_keys
       WHERE operation_key = $1
         AND expires_at > NOW()`,
      [operationKey],
    );

    if (!result.rowCount) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      operationKey: row.operation_key,
      endpoint: row.endpoint,
      actor: row.actor,
      correlationId: row.correlation_id,
      requestHash: row.request_hash,
      responseHash: row.response_hash,
      responsePayload: row.response_json || null,
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
    };
  }

  async createOperationKey({ operationKey, endpoint, actor, correlationId, requestHash, expiresAt }) {
    const result = await this.db.query(
      `INSERT INTO media_operation_keys(
         id, operation_key, endpoint, actor, correlation_id, request_hash, expires_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7::timestamptz
       )
       RETURNING id, operation_key, endpoint, actor, correlation_id, request_hash, response_hash, response_json, created_at, expires_at`,
      [randomUUID(), operationKey, endpoint, actor, correlationId, requestHash, expiresAt],
    );

    const row = result.rows[0];
    return {
      id: row.id,
      operationKey: row.operation_key,
      endpoint: row.endpoint,
      actor: row.actor,
      correlationId: row.correlation_id,
      requestHash: row.request_hash,
      responseHash: row.response_hash,
      responsePayload: row.response_json || null,
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
    };
  }

  async completeOperationKey({ operationKey, responseHash, responsePayload }) {
    const result = await this.db.query(
      `UPDATE media_operation_keys
       SET response_hash = $2,
           response_json = $3::jsonb
       WHERE operation_key = $1
       RETURNING id, operation_key, endpoint, actor, correlation_id, request_hash, response_hash, response_json, created_at, expires_at`,
      [operationKey, responseHash, JSON.stringify(responsePayload || null)],
    );

    if (!result.rowCount) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      operationKey: row.operation_key,
      endpoint: row.endpoint,
      actor: row.actor,
      correlationId: row.correlation_id,
      requestHash: row.request_hash,
      responseHash: row.response_hash,
      responsePayload: row.response_json || null,
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
    };
  }
}
