export default function AudioLevelMeter({ value = 0 }) {
  const level = Math.max(0, Math.min(100, Number(value || 0)));

  return (
    <div className="livekit-audio-meter-wrap" aria-label={`Audio level ${level}%`}>
      <div className="livekit-audio-meter">
        <div className="livekit-audio-meter-fill" style={{ width: `${level}%` }} />
      </div>
      <strong>{level}%</strong>
    </div>
  );
}
