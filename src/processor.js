const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function scoreCandidate({ duration, start, end, transcript = "" }) {
  const clipDuration = Math.max(0, end - start);
  const ideal = clipDuration >= 20 && clipDuration <= 55 ? 1 : 0.55;
  const words = transcript.trim().split(/\s+/).filter(Boolean).length;
  const speech = clamp(words / 70, 0, 1);
  const position = duration > 0 ? 1 - Math.abs((start + end) / 2 / duration - 0.5) : 0.5;
  return Math.round((ideal * 0.45 + speech * 0.4 + position * 0.15) * 100);
}

export function buildCandidates(duration, transcript = "") {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const windows = [30, 45, 60];
  return windows
    .map((length, index) => {
      const safeLength = Math.min(length, duration);
      const maxStart = Math.max(0, duration - safeLength);
      const start = Math.min(index * Math.max(1, duration / 6), maxStart);
      const end = Math.min(duration, start + safeLength);
      return { id: index + 1, start, end, duration: end - start, score: scoreCandidate({ duration, start, end, transcript }) };
    })
    .filter((candidate) => candidate.duration >= 5)
    .sort((a, b) => b.score - a.score);
}

export function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}
