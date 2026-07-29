import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { LiveKitProvider } from "./LiveKitProvider.js";

test("LiveKitProvider returns media capabilities in provider-agnostic shape", () => {
  const provider = new LiveKitProvider({
    config: { enabled: true, wsUrl: "wss://livekit.example/ws" },
  });

  const capabilities = provider.capabilities();
  assert.equal(capabilities.provider, "livekit");
  assert.equal(capabilities.features.rooms, true);
  assert.equal(capabilities.features.participants, true);
  assert.equal(capabilities.features.deviceSelection, true);
});

test("LiveKitProvider joinSession returns connection details without leaking SDK objects", async () => {
  const provider = new LiveKitProvider({
    config: {
      enabled: true,
      wsUrl: "wss://livekit.example/ws",
      apiKey: "key",
      apiSecret: "secret",
      tokenTtlSeconds: 300,
    },
  });

  const joined = await provider.joinSession({
    roomName: "control-room-a",
    participantIdentity: "reporter-1",
    role: "reporter",
    metadata: { assignmentId: "asg-1" },
  });

  assert.equal(Boolean(joined.providerParticipantId), true);
  assert.equal(joined.roomName, "control-room-a");
  assert.equal(joined.connectionDetails.provider, "livekit");
  assert.equal(typeof joined.connectionDetails.token, "string");

  const claims = jwt.decode(joined.connectionDetails.token);
  assert.equal(claims?.sub, "reporter-1");
  assert.equal(claims?.video?.room, "control-room-a");
  assert.equal(claims?.exp - claims?.iat, 300);
  assert.equal(claims?.iat <= claims?.nbf, true);
});

test("LiveKitProvider derives a client-safe wsUrl from request context when config wsUrl is unset", async () => {
  const provider = new LiveKitProvider({ config: { enabled: true, apiKey: "key", apiSecret: "secret" } });

  const joined = await provider.joinSession({
    roomName: "control-room-a",
    participantIdentity: "reporter-3",
    role: "reporter",
    requestContext: {
      forwardedHost: "reporter.telemab.com",
      xForwardedProto: "https",
      isHttps: true,
    },
  });

  assert.equal(joined.connectionDetails.wsUrl, "wss://reporter.telemab.com/ws/");
});

test("LiveKitProvider createRoom validates required room name", async () => {
  const provider = new LiveKitProvider({ config: { enabled: true } });

  await assert.rejects(
    () => provider.createRoom({ roomName: "" }),
    (error) => error?.code === "VALIDATION_ERROR",
  );
});

test("LiveKitProvider falls back to safe token TTL when configured value is invalid", async () => {
  const provider = new LiveKitProvider({
    config: {
      enabled: true,
      wsUrl: "wss://livekit.example/ws",
      apiKey: "key",
      apiSecret: "secret",
      tokenTtlSeconds: -1,
    },
  });

  const joined = await provider.joinSession({
    roomName: "control-room-a",
    participantIdentity: "reporter-2",
    role: "reporter",
  });

  const claims = jwt.decode(joined.connectionDetails.token);
  assert.equal(claims?.exp - claims?.iat, 3600);
});
