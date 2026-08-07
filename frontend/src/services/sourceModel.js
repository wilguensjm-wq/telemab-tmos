// Source model — the single abstraction all Producer UI components work against.
// Every input type maps to a Source. The UI never needs to know which type it is.

export const SourceType = Object.freeze({
  REPORTER:      "reporter",
  FIELD_UNIT:    "field-unit",
  STUDIO_CAMERA: "studio-camera",
  PTZ_CAMERA:    "ptz-camera",
  OBS:           "obs",
  NDI:           "ndi",
  SRT:           "srt",
  REMOTE_GUEST:  "remote-guest",
});

export const SourceStatus = Object.freeze({
  OFFLINE:  "offline",
  READY:    "ready",
  PREVIEW:  "preview",
  PROGRAM:  "program",
});

export const ConnectionQuality = Object.freeze({
  EXCELLENT: "excellent",
  GOOD:      "good",
  FAIR:      "fair",
  POOR:      "poor",
  UNKNOWN:   "unknown",
});

// Derive runtime status from switcher state.
export function resolveSourceStatus(sourceId, previewSourceId, programSourceId, hasParticipant) {
  const id = String(sourceId || "");
  if (String(programSourceId) === id) return SourceStatus.PROGRAM;
  if (String(previewSourceId) === id)  return SourceStatus.PREVIEW;
  if (hasParticipant)                  return SourceStatus.READY;
  return SourceStatus.OFFLINE;
}

export function pickPreferredPreviewSourceId(sources = [], currentSourceId = null, programSourceId = null) {
  const sourceList = Array.isArray(sources) ? sources : [];
  const currentId = String(currentSourceId || "").trim();
  const programId = String(programSourceId || "").trim();

  const sourceIds = sourceList
    .map((source) => String(source?.id || "").trim())
    .filter(Boolean);

  if (currentId && sourceIds.includes(currentId)) {
    return currentId;
  }

  if (programId && sourceIds.includes(programId)) {
    return programId;
  }

  const firstOnline = sourceList.find((source) => Boolean(source?.participant));
  if (firstOnline) {
    return String(firstOnline.id || "").trim() || null;
  }

  return sourceIds[0] || null;
}

function normalizeQuality(raw) {
  const token = String(raw || "").toLowerCase();
  if (token.includes("excellent"))          return ConnectionQuality.EXCELLENT;
  if (token.includes("good"))               return ConnectionQuality.GOOD;
  if (token.includes("fair"))               return ConnectionQuality.FAIR;
  if (token.includes("poor"))               return ConnectionQuality.POOR;
  return ConnectionQuality.UNKNOWN;
}

// Build a normalized Source from any internal participant/reporter composite.
// Call this whenever enriched reporter/participant data is converted for the UI.
export function buildSource(raw, previewSourceId, programSourceId) {
  const id = String(raw?.id || "");
  const hasParticipant = Boolean(raw?.participant);

  return {
    id,
    type:              raw?.type || raw?.sourceType?.toLowerCase().replace(/\s+/g, "-") || SourceType.REPORTER,
    name:              String(raw?.fullName || raw?.name || "Unknown Source").trim(),
    location:          String(raw?.location || "").trim(),
    status:            resolveSourceStatus(id, previewSourceId, programSourceId, hasParticipant),
    videoTrack:        raw?.participant?.videoTrackPublications
                         ? Array.from(raw.participant.videoTrackPublications.values()).find((p) => p?.track)?.track ?? null
                         : null,
    audioTrack:        raw?.participant?.audioTrackPublications
                         ? Array.from(raw.participant.audioTrackPublications.values()).find((p) => p?.track)?.track ?? null
                         : null,
    participant:       raw?.participant ?? null,
    connectionQuality: normalizeQuality(raw?.signal || raw?.networkQuality),
    isApproved:        Boolean(raw?.isVirtual) || String(raw?.approvalState || "").toLowerCase() === "approved",
    isLive:            String(programSourceId) === id,
    isInPreview:       String(previewSourceId) === id,
    cameraReady:       Boolean(raw?.cameraReady),
    audioReady:        Boolean(raw?.microphoneReady),
    isVirtual:         Boolean(raw?.isVirtual),
    availableForProgram: Boolean(raw?.availableForProgram),
  };
}
