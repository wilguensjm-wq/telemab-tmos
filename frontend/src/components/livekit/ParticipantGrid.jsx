import VideoTile from "./VideoTile";

export default function ParticipantGrid({ participants = [] }) {
  if (participants.length === 0) {
    return (
      <div className="livekit-empty-state">
        <p>No LiveKit participants are active yet.</p>
      </div>
    );
  }

  return (
    <section className="livekit-participant-grid">
      {participants.map((participant) => (
        <VideoTile
          key={participant.key || participant.participantId || participant.identity}
          participant={participant}
        />
      ))}
    </section>
  );
}
