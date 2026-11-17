// Scores a short processor benchmark. The score is relative: compare it with
// your own earlier runs, not with other phones or browsers.

export const BENCH_SCALE = 0.1;

export function median(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function scoreFromRates(rates) {
  const valid = rates.filter((rate) => Number.isFinite(rate) && rate > 0);
  if (!valid.length) return { score: 0, drop: 0, steady: false };
  const score = Math.round(median(valid) * BENCH_SCALE);
  const first = valid[0];
  const last = valid[valid.length - 1];
  const drop = first > 0 ? Math.max(0, (first - last) / first) : 0;
  return { score, drop, steady: drop < 0.15 };
}

export function frameStats(timestamps) {
  if (timestamps.length < 3) return { fps: 0, smooth: 0 };
  const deltas = [];
  for (let i = 1; i < timestamps.length; i += 1) deltas.push(timestamps[i] - timestamps[i - 1]);
  const elapsed = timestamps[timestamps.length - 1] - timestamps[0];
  const fps = elapsed > 0 ? Math.round((deltas.length / elapsed) * 1000) : 0;
  const typical = median(deltas);
  const onTime = deltas.filter((delta) => delta <= typical * 1.5).length;
  return { fps, smooth: Math.round((onTime / deltas.length) * 100), frameMs: typical };
}
