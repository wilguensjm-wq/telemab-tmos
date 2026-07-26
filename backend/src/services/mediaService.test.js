import test from "node:test";
import assert from "node:assert/strict";
import { MediaService } from "./mediaService.js";

function createHarness() {
  const rooms = [];
  const participants = [];
  const audits = [];

  const mediaProviderRegistry = {
    listCapabilities: () => [{ key: "livekit", capabilities: { provider: "livekit" } }],
    get: () => ({
      createRoom: async ({ roomName, roomType, metadata }) => ({
        providerRoomId: `provider-room-${roomName}`,
        roomName,
        roomType,
        metadata,
        status: "active",
      }),
      joinSession: async ({ roomName, participantIdentity }) => ({
        providerParticipantId: `provider-participant-${participantIdentity}`,
        roomName,
        participantIdentity,
        connectionDetails: { token: "dev-token", wsUrl: "wss://livekit.example/ws", provider: "livekit" },
      }),
      leaveSession: async () => ({ status: "left" }),
      updateDeviceSelection: async ({ deviceSelection }) => ({ status: "updated", deviceSelection }),
      setPublisherState: async ({ enabled }) => ({ status: "updated", publisherEnabled: enabled }),
      applyProducerControl: async ({ action, value }) => ({ status: "applied", action, value }),
    }),
  };

  const mediaRepository = {
    async listRooms() {
      return rooms;
    },
    async createRoom(payload) {
      const room = {
        id: `room-${rooms.length + 1}`,
        providerKey: payload.providerKey,
        providerRoomId: payload.providerRoomId,
        name: payload.name,
        roomType: payload.roomType,
        status: payload.status,
        metadata: payload.metadata,
        createdBy: payload.createdBy,
      };
      rooms.push(room);
      return room;
    },
    async findRoomById(roomId) {
      return rooms.find((room) => room.id === roomId) || null;
    },
    async listParticipantsByRoom(roomId) {
      return participants.filter((item) => item.roomId === roomId);
    },
    async createParticipant(payload) {
      const participant = {
        id: `participant-${participants.length + 1}`,
        connectionStatus: "connected",
        publisherEnabled: true,
        subscriberEnabled: true,
        muted: false,
        metadata: {},
        ...payload,
      };
      participants.push(participant);
      return participant;
    },
    async findParticipantById(participantId) {
      return participants.find((item) => item.id === participantId) || null;
    },
    async markParticipantLeft(participantId) {
      const participant = participants.find((item) => item.id === participantId);
      if (!participant) return null;
      participant.connectionStatus = "left";
      return participant;
    },
    async updateParticipant(participantId, patch) {
      const participant = participants.find((item) => item.id === participantId);
      if (!participant) return null;
      Object.assign(participant, patch);
      return participant;
    },
  };

  const auditService = {
    async record(entry) {
      audits.push(entry);
      return entry;
    },
  };

  const service = new MediaService({ mediaProviderRegistry, mediaRepository, auditService });
  return { service, rooms, participants, audits };
}

test("MediaService creates room through provider abstraction", async () => {
  const { service, rooms, audits } = createHarness();

  const room = await service.createRoom({
    actor: "producer",
    correlationId: "corr-media-room",
    payload: {
      providerKey: "livekit",
      roomName: "morning-control",
      roomType: "control-room",
      metadata: { assignmentId: "asg-1" },
    },
  });

  assert.equal(room.name, "morning-control");
  assert.equal(rooms.length, 1);
  assert.equal(audits.some((entry) => entry.action === "media.session.create"), true);
  assert.equal(audits.some((entry) => entry.action === "media.provider.selected"), true);
});

test("MediaService joins and leaves media session", async () => {
  const { service, participants, audits } = createHarness();

  const room = await service.createRoom({
    actor: "producer",
    correlationId: "corr-room",
    payload: {
      providerKey: "livekit",
      roomName: "room-a",
    },
  });

  const joined = await service.joinSession({
    actor: "reporter",
    user: { id: "user-1", username: "reporter" },
    correlationId: "corr-join",
    payload: {
      roomId: room.id,
      participantIdentity: "reporter-identity",
      participantRole: "reporter",
    },
  });

  assert.equal(Boolean(joined.connectionDetails?.token), true);
  assert.equal(participants.length, 1);

  const left = await service.leaveSession({
    actor: "reporter",
    correlationId: "corr-leave",
    participantId: joined.participant.id,
  });

  assert.equal(left.connectionStatus, "left");
  assert.equal(audits.some((entry) => entry.action === "media.session.join"), true);
  assert.equal(audits.some((entry) => entry.action === "media.session.leave"), true);
});

test("MediaService normalizes LiveKit connection aliases to token and wsUrl", async () => {
  const rooms = [];
  const participants = [];
  const audits = [];

  const mediaProviderRegistry = {
    listCapabilities: () => [{ key: "livekit", capabilities: { provider: "livekit" } }],
    get: () => ({
      createRoom: async ({ roomName, roomType, metadata }) => ({
        providerRoomId: `provider-room-${roomName}`,
        roomName,
        roomType,
        metadata,
        status: "active",
      }),
      joinSession: async ({ roomName, participantIdentity }) => ({
        providerParticipantId: `provider-participant-${participantIdentity}`,
        roomName,
        participantIdentity,
        connectionDetails: { accessToken: "alias-token", serverUrl: "wss://alias.example/ws", provider: "livekit" },
      }),
      leaveSession: async () => ({ status: "left" }),
      updateDeviceSelection: async ({ deviceSelection }) => ({ status: "updated", deviceSelection }),
      setPublisherState: async ({ enabled }) => ({ status: "updated", publisherEnabled: enabled }),
      applyProducerControl: async ({ action, value }) => ({ status: "applied", action, value }),
    }),
  };

  const mediaRepository = {
    async listRooms() {
      return rooms;
    },
    async createRoom(payload) {
      const room = {
        id: `room-${rooms.length + 1}`,
        providerKey: payload.providerKey,
        providerRoomId: payload.providerRoomId,
        name: payload.name,
        roomType: payload.roomType,
        status: payload.status,
        metadata: payload.metadata,
        createdBy: payload.createdBy,
      };
      rooms.push(room);
      return room;
    },
    async findRoomById(roomId) {
      return rooms.find((room) => room.id === roomId) || null;
    },
    async listParticipantsByRoom(roomId) {
      return participants.filter((item) => item.roomId === roomId);
    },
    async createParticipant(payload) {
      const participant = {
        id: `participant-${participants.length + 1}`,
        connectionStatus: "connected",
        publisherEnabled: true,
        subscriberEnabled: true,
        muted: false,
        metadata: {},
        ...payload,
      };
      participants.push(participant);
      return participant;
    },
    async findParticipantById(participantId) {
      return participants.find((item) => item.id === participantId) || null;
    },
    async markParticipantLeft(participantId) {
      const participant = participants.find((item) => item.id === participantId);
      if (!participant) return null;
      participant.connectionStatus = "left";
      return participant;
    },
    async updateParticipant(participantId, patch) {
      const participant = participants.find((item) => item.id === participantId);
      if (!participant) return null;
      Object.assign(participant, patch);
      return participant;
    },
  };

  const auditService = {
    async record(entry) {
      audits.push(entry);
      return entry;
    },
  };

  const service = new MediaService({ mediaProviderRegistry, mediaRepository, auditService });

  const room = await service.createRoom({
    actor: "producer",
    correlationId: "corr-room-alias",
    payload: {
      providerKey: "livekit",
      roomName: "room-alias",
    },
  });

  const joined = await service.joinSession({
    actor: "reporter",
    user: { id: "user-alias", username: "reporter" },
    correlationId: "corr-join-alias",
    payload: {
      roomId: room.id,
      participantIdentity: "reporter-alias",
      participantRole: "reporter",
    },
  });

  assert.equal(joined.connectionDetails.token, "alias-token");
  assert.equal(joined.connectionDetails.wsUrl, "wss://alias.example/ws");
  assert.equal(joined.connectionDetails.provider, "livekit");
});

test("MediaService applies producer control and updates participant state", async () => {
  const { service } = createHarness();

  const room = await service.createRoom({
    actor: "producer",
    correlationId: "corr-room-2",
    payload: {
      providerKey: "livekit",
      roomName: "room-b",
    },
  });

  const joined = await service.joinSession({
    actor: "reporter",
    user: { id: "user-2", username: "reporter2" },
    correlationId: "corr-join-2",
    payload: {
      roomId: room.id,
      participantIdentity: "reporter2",
      participantRole: "reporter",
    },
  });

  const updated = await service.applyProducerControl({
    actor: "producer",
    correlationId: "corr-control",
    participantId: joined.participant.id,
    action: "mute",
    value: true,
  });

  assert.equal(updated.muted, true);
  assert.equal(Boolean(updated.metadata?.lastProducerControl), true);
});
