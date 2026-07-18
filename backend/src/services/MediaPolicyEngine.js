import { TmosError } from "../errors/TmosError.js";

const NETWORK_SCORES = Object.freeze({
  poor: 0,
  fair: 1,
  good: 2,
  excellent: 3,
});

function normalizeQuality(value) {
  const key = String(value || "fair").trim().toLowerCase();
  if (!Object.hasOwn(NETWORK_SCORES, key)) {
    throw new TmosError({
      code: "VALIDATION_ERROR",
      message: "networkQuality must be one of poor, fair, good, excellent",
      status: 400,
      details: { networkQuality: value },
    });
  }
  return key;
}

export class MediaPolicyEngine {
  validateReadinessPayload(payload = {}) {
    const requiredBooleanFields = ["cameraReady", "microphoneReady", "speakerReady"];
    for (const field of requiredBooleanFields) {
      if (typeof payload[field] !== "boolean") {
        throw new TmosError({
          code: "VALIDATION_ERROR",
          message: `${field} must be a boolean`,
          status: 400,
          details: { field },
        });
      }
    }

    return {
      cameraReady: payload.cameraReady,
      microphoneReady: payload.microphoneReady,
      speakerReady: payload.speakerReady,
      networkQuality: normalizeQuality(payload.networkQuality),
      metadata: payload.metadata || {},
    };
  }

  evaluateSessionReadiness({ readinessRows = [] }) {
    const requiredParticipants = readinessRows.length;
    let readyParticipants = 0;
    const blockers = [];

    for (const row of readinessRows) {
      const checks = {
        cameraReady: Boolean(row.cameraReady),
        microphoneReady: Boolean(row.microphoneReady),
        speakerReady: Boolean(row.speakerReady),
      };
      const networkQuality = normalizeQuality(row.networkQuality);
      const networkPass = NETWORK_SCORES[networkQuality] >= NETWORK_SCORES.fair;
      const participantReady = checks.cameraReady && checks.microphoneReady && checks.speakerReady && networkPass;

      if (participantReady) {
        readyParticipants += 1;
      } else {
        blockers.push({
          participantId: row.participantId,
          username: row.username,
          checks: {
            ...checks,
            networkQuality,
            networkPass,
          },
        });
      }
    }

    return {
      requiredParticipants,
      readyParticipants,
      blockers,
      canGoLive: requiredParticipants > 0 && blockers.length === 0,
    };
  }

  assertCanGoLive({ session, readinessSummary }) {
    if (!session) {
      throw new TmosError({
        code: "RESOURCE_NOT_FOUND",
        message: "Media session not found",
        status: 404,
      });
    }

    if (session.status === "closed") {
      throw new TmosError({
        code: "VALIDATION_ERROR",
        message: "Closed session cannot transition to live",
        status: 400,
        details: { sessionId: session.id, status: session.status },
      });
    }

    if (session.status === "live") {
      throw new TmosError({
        code: "VALIDATION_ERROR",
        message: "Session is already live",
        status: 400,
        details: { sessionId: session.id, status: session.status },
      });
    }

    if (!readinessSummary?.canGoLive) {
      throw new TmosError({
        code: "VALIDATION_ERROR",
        message: "Session readiness requirements are not satisfied",
        status: 409,
        details: {
          sessionId: session.id,
          blockers: readinessSummary?.blockers || [],
          requiredParticipants: readinessSummary?.requiredParticipants || 0,
          readyParticipants: readinessSummary?.readyParticipants || 0,
        },
      });
    }
  }

  assertCanStopLive({ session }) {
    if (!session) {
      throw new TmosError({
        code: "RESOURCE_NOT_FOUND",
        message: "Media session not found",
        status: 404,
      });
    }

    if (session.status !== "live") {
      throw new TmosError({
        code: "VALIDATION_ERROR",
        message: "Only live sessions can be stopped",
        status: 400,
        details: { sessionId: session.id, status: session.status },
      });
    }
  }
}
