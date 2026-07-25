import { useMemo, useState } from "react";

function canJoin(identity, roomName) {
  return String(identity || "").trim().length > 0 && String(roomName || "").trim().length > 0;
}

export default function LiveKitRoomManager({
  roomState,
  onJoin,
  onLeave,
  onToggleCamera,
  onToggleMicrophone,
  onRefresh,
  busy = false,
}) {
  const [roomName, setRoomName] = useState(roomState?.roomName || "tmos-live-sources");
  const [identity, setIdentity] = useState("");
  const [role, setRole] = useState("reporter");

  const disabledJoin = useMemo(() => busy || !canJoin(identity, roomName), [busy, identity, roomName]);

  return (
    <article className="panel livekit-room-manager">
      <div className="panel-title-row">
        <div>
          <h3 className="panel-title">LiveKit Room Manager</h3>
          <p className="panel-caption">Create/join rooms and control local camera and microphone publishing.</p>
        </div>
      </div>

      <div className="livekit-room-form-grid">
        <label className="livekit-field">
          <span>Room Name</span>
          <input
            value={roomName}
            onChange={(event) => setRoomName(event.target.value)}
            placeholder="tmos-live-sources"
          />
        </label>

        <label className="livekit-field">
          <span>Identity</span>
          <input
            value={identity}
            onChange={(event) => setIdentity(event.target.value)}
            placeholder="Enter participant identity"
          />
        </label>

        <label className="livekit-field">
          <span>Role</span>
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="reporter">Reporter</option>
            <option value="producer">Producer</option>
            <option value="guest">Guest</option>
          </select>
        </label>
      </div>

      <div className="livekit-room-actions">
        <button
          type="button"
          className="action-button"
          disabled={disabledJoin}
          onClick={() => onJoin({ roomName, identity, role })}
        >
          Join Room
        </button>

        <button
          type="button"
          className="ghost-button"
          disabled={!roomState?.isJoined || busy}
          onClick={onLeave}
        >
          Leave Room
        </button>

        <button
          type="button"
          className="ghost-button"
          disabled={!roomState?.isJoined || busy}
          onClick={() => onToggleCamera(!roomState?.cameraEnabled)}
        >
          {roomState?.cameraEnabled ? "Stop Camera" : "Publish Camera"}
        </button>

        <button
          type="button"
          className="ghost-button"
          disabled={!roomState?.isJoined || busy}
          onClick={() => onToggleMicrophone(!roomState?.microphoneEnabled)}
        >
          {roomState?.microphoneEnabled ? "Mute Microphone" : "Publish Microphone"}
        </button>

        <button type="button" className="ghost-button" onClick={onRefresh} disabled={busy}>
          Refresh Participants
        </button>
      </div>

      <div className="livekit-room-status-grid">
        <div>
          <span>Room</span>
          <strong>{roomState?.roomName || "Not joined"}</strong>
        </div>
        <div>
          <span>Connection</span>
          <strong>{roomState?.connectionState || "disconnected"}</strong>
        </div>
        <div>
          <span>Network Quality</span>
          <strong>{roomState?.networkQuality || "Unknown"}</strong>
        </div>
        <div>
          <span>Participants</span>
          <strong>{String(roomState?.participants?.length || 0)}</strong>
        </div>
      </div>

      {roomState?.lastError ? <p className="livekit-error-text">{roomState.lastError}</p> : null}
    </article>
  );
}
