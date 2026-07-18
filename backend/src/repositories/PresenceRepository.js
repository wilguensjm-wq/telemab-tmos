export class PresenceRepository {
  constructor({ db }) {
    this.db = db;
  }

  mapRow(row) {
    return {
      reporterId: row.reporter_id,
      reporterName: row.reporter_name,
      reporterEmail: row.reporter_email,
      connectionStatus: row.connection_status,
      lastHeartbeat: row.last_heartbeat ? row.last_heartbeat.toISOString() : null,
      loginTime: row.login_time ? row.login_time.toISOString() : null,
      disconnectedAt: row.disconnected_at ? row.disconnected_at.toISOString() : null,
      currentAssignmentId: row.current_assignment_id,
      currentAssignmentTitle: row.assignment_title,
      currentStudioId: row.current_studio_id,
      currentStudioName: row.studio_name,
      deviceType: row.device_type,
      operatingSystem: row.operating_system,
      appVersion: row.app_version,
      cameraReady: row.camera_ready,
      microphoneReady: row.microphone_ready,
      speakerReady: row.speaker_ready,
      internetQuality: row.internet_quality,
      signalStrength: row.signal_strength,
      batteryLevel: row.battery_level,
      isCharging: row.is_charging,
      sessionId: row.session_id,
      updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
    };
  }

  async list() {
    const result = await this.db.query(
      `SELECT p.reporter_id,
              r.full_name AS reporter_name,
              r.email AS reporter_email,
              p.connection_status,
              p.last_heartbeat,
              p.login_time,
              p.disconnected_at,
              p.current_assignment_id,
              a.title AS assignment_title,
              p.current_studio_id,
              s.name AS studio_name,
              p.device_type,
              p.operating_system,
              p.app_version,
              p.camera_ready,
              p.microphone_ready,
              p.speaker_ready,
              p.internet_quality,
              p.signal_strength,
              p.battery_level,
              p.is_charging,
              p.session_id,
              p.updated_at
       FROM reporter_presence p
       JOIN reporters r ON r.id = p.reporter_id
       LEFT JOIN assignments a ON a.id = p.current_assignment_id
       LEFT JOIN studios s ON s.id = p.current_studio_id
       ORDER BY r.full_name ASC`,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async findByReporterId(reporterId) {
    const result = await this.db.query(
      `SELECT p.reporter_id,
              r.full_name AS reporter_name,
              r.email AS reporter_email,
              p.connection_status,
              p.last_heartbeat,
              p.login_time,
              p.disconnected_at,
              p.current_assignment_id,
              a.title AS assignment_title,
              p.current_studio_id,
              s.name AS studio_name,
              p.device_type,
              p.operating_system,
              p.app_version,
              p.camera_ready,
              p.microphone_ready,
              p.speaker_ready,
              p.internet_quality,
              p.signal_strength,
              p.battery_level,
              p.is_charging,
              p.session_id,
              p.updated_at
       FROM reporter_presence p
       JOIN reporters r ON r.id = p.reporter_id
       LEFT JOIN assignments a ON a.id = p.current_assignment_id
       LEFT JOIN studios s ON s.id = p.current_studio_id
       WHERE p.reporter_id = $1`,
      [reporterId],
    );

    if (!result.rowCount) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  async upsert(reporterId, payload) {
    await this.db.query(
      `INSERT INTO reporter_presence(
        reporter_id,
        connection_status,
        last_heartbeat,
        login_time,
        disconnected_at,
        current_assignment_id,
        current_studio_id,
        device_type,
        operating_system,
        app_version,
        camera_ready,
        microphone_ready,
        speaker_ready,
        internet_quality,
        signal_strength,
        battery_level,
        is_charging,
        session_id,
        updated_at
      ) VALUES (
        $1,
        COALESCE($2, 'Offline'),
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        COALESCE($11, FALSE),
        COALESCE($12, FALSE),
        COALESCE($13, FALSE),
        $14,
        $15,
        $16,
        $17,
        $18,
        NOW()
      )
      ON CONFLICT(reporter_id)
      DO UPDATE SET
        connection_status = COALESCE(EXCLUDED.connection_status, reporter_presence.connection_status),
        last_heartbeat = COALESCE(EXCLUDED.last_heartbeat, reporter_presence.last_heartbeat),
        login_time = COALESCE(EXCLUDED.login_time, reporter_presence.login_time),
        disconnected_at = EXCLUDED.disconnected_at,
        current_assignment_id = COALESCE(EXCLUDED.current_assignment_id, reporter_presence.current_assignment_id),
        current_studio_id = COALESCE(EXCLUDED.current_studio_id, reporter_presence.current_studio_id),
        device_type = COALESCE(EXCLUDED.device_type, reporter_presence.device_type),
        operating_system = COALESCE(EXCLUDED.operating_system, reporter_presence.operating_system),
        app_version = COALESCE(EXCLUDED.app_version, reporter_presence.app_version),
        camera_ready = COALESCE(EXCLUDED.camera_ready, reporter_presence.camera_ready),
        microphone_ready = COALESCE(EXCLUDED.microphone_ready, reporter_presence.microphone_ready),
        speaker_ready = COALESCE(EXCLUDED.speaker_ready, reporter_presence.speaker_ready),
        internet_quality = COALESCE(EXCLUDED.internet_quality, reporter_presence.internet_quality),
        signal_strength = COALESCE(EXCLUDED.signal_strength, reporter_presence.signal_strength),
        battery_level = COALESCE(EXCLUDED.battery_level, reporter_presence.battery_level),
        is_charging = COALESCE(EXCLUDED.is_charging, reporter_presence.is_charging),
        session_id = COALESCE(EXCLUDED.session_id, reporter_presence.session_id),
        updated_at = NOW()`,
      [
        reporterId,
        payload.connectionStatus,
        payload.lastHeartbeat || null,
        payload.loginTime || null,
        payload.disconnectedAt || null,
        payload.currentAssignmentId || null,
        payload.currentStudioId || null,
        payload.deviceType || null,
        payload.operatingSystem || null,
        payload.appVersion || null,
        payload.cameraReady,
        payload.microphoneReady,
        payload.speakerReady,
        payload.internetQuality || null,
        payload.signalStrength ?? null,
        payload.batteryLevel ?? null,
        payload.isCharging ?? null,
        payload.sessionId || null,
      ],
    );

    return this.findByReporterId(reporterId);
  }

  async listStaleConnected(cutoffIso) {
    const result = await this.db.query(
      `SELECT reporter_id
       FROM reporter_presence
       WHERE connection_status IN ('Connecting', 'Online', 'Ready', 'Live')
         AND (last_heartbeat IS NULL OR last_heartbeat < $1::timestamptz)`,
      [cutoffIso],
    );

    return result.rows.map((row) => row.reporter_id);
  }

  async clearSession(sessionId) {
    const result = await this.db.query(
      `UPDATE reporter_presence
       SET session_id = NULL,
           connection_status = 'Disconnected',
           disconnected_at = NOW(),
           updated_at = NOW()
       WHERE session_id = $1
       RETURNING reporter_id`,
      [sessionId],
    );

    return result.rows.map((row) => row.reporter_id);
  }
}
