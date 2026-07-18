import test from "node:test";
import assert from "node:assert/strict";
import { MediaPolicyEngine } from "./MediaPolicyEngine.js";

test("MediaPolicyEngine validates readiness payload", () => {
  const engine = new MediaPolicyEngine();
  const validated = engine.validateReadinessPayload({
    cameraReady: true,
    microphoneReady: true,
    speakerReady: true,
    networkQuality: "good",
  });

  assert.equal(validated.cameraReady, true);
  assert.equal(validated.networkQuality, "good");
});

test("MediaPolicyEngine evaluates blockers and go-live readiness", () => {
  const engine = new MediaPolicyEngine();
  const summary = engine.evaluateSessionReadiness({
    readinessRows: [
      { participantId: "p1", username: "reporter-1", cameraReady: true, microphoneReady: true, speakerReady: true, networkQuality: "good" },
      { participantId: "p2", username: "reporter-2", cameraReady: true, microphoneReady: false, speakerReady: true, networkQuality: "fair" },
    ],
  });

  assert.equal(summary.requiredParticipants, 2);
  assert.equal(summary.readyParticipants, 1);
  assert.equal(summary.blockers.length, 1);
  assert.equal(summary.canGoLive, false);
});

test("MediaPolicyEngine asserts stop-live state", () => {
  const engine = new MediaPolicyEngine();
  assert.throws(
    () => engine.assertCanStopLive({ session: { id: "s1", status: "active" } }),
    (error) => error?.code === "VALIDATION_ERROR" && error?.status === 400,
  );
});
