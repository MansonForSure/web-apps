/**
 * Worker-safe tempo estimation from compact onset/rms feature frames.
 *
 * This module deliberately has no Worker, DOM, timer, or AudioContext side
 * effects. The caller supplies sample-clocked feature frames and decides where
 * to run the (more expensive) autocorrelation.
 */

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * clamp(fraction, 0, 1);
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

function medianStep(frames) {
  if (frames.length < 2) return 0.01;
  const steps = [];
  for (let index = 1; index < frames.length; index += 1) {
    const step = frames[index].time - frames[index - 1].time;
    if (Number.isFinite(step) && step > 0) steps.push(step);
  }
  return clamp(percentile(steps, 0.5) || 0.01, 0.005, 0.04);
}

/**
 * Real-time rolling tempo tracker.
 *
 * `update(frames)` returns null between analyses. At most once per
 * `analysisInterval` it returns an estimate object, whose bpm is null when the
 * input lacks reliable rhythmic evidence. This makes a missing beat estimate
 * explicit without preserving an old high-confidence tempo through silence.
 */
export class TempoTracker {
  constructor({
    windowSeconds = 12,
    analysisInterval = 0.5,
    minBpm = 40,
    maxBpm = 240,
  } = {}) {
    if (!Number.isFinite(windowSeconds) || windowSeconds < 6) {
      throw new TypeError('windowSeconds must be at least 6 seconds');
    }
    this.windowSeconds = windowSeconds;
    this.analysisInterval = analysisInterval;
    this.minBpm = minBpm;
    this.maxBpm = maxBpm;
    this.reset();
  }

  reset() {
    this._frames = [];
    this._nextAnalysisAt = null;
    this._lastTime = -Infinity;
    this._lastAudibleTime = -Infinity;
    this._lastReliableBpm = null;
  }

  update(frames) {
    if (!Array.isArray(frames) || frames.length === 0) return null;

    for (const input of frames) {
      if (!input || !Number.isFinite(input.time)) continue;
      const time = Number(input.time);
      // A new session should call reset, but failing safe here avoids blending
      // two unrelated AudioContext clocks if a caller forgets.
      if (time + 1e-6 < this._lastTime) this.reset();
      if (time <= this._lastTime) continue;

      const onset = clamp(Number.isFinite(input.onset) ? Number(input.onset) : 0, 0, 20);
      const rms = clamp(Number.isFinite(input.rms) ? Number(input.rms) : 0, 0, 4);
      this._frames.push({ time, onset, rms });
      this._lastTime = time;
      // This is intentionally low enough for quiet music but high enough to
      // ignore numerical silence. A recent audible frame must continue to
      // arrive; old history cannot keep signal true after a stopped mic.
      if (rms >= 0.003) this._lastAudibleTime = time;
    }

    if (!Number.isFinite(this._lastTime)) return null;
    const cutoff = this._lastTime - this.windowSeconds;
    while (this._frames.length && this._frames[0].time < cutoff) this._frames.shift();

    if (this._nextAnalysisAt === null) this._nextAnalysisAt = this._lastTime + this.analysisInterval;
    if (this._lastTime + 1e-9 < this._nextAnalysisAt) return null;

    // Advance from the planned schedule rather than using a timer; this stays
    // stable when feature batches arrive late or are larger than usual.
    do {
      this._nextAnalysisAt += this.analysisInterval;
    } while (this._nextAnalysisAt <= this._lastTime);

    return this._analyze();
  }

  _baseResult(signal) {
    const seconds = this._frames.length > 1
      ? Math.max(0, this._frames[this._frames.length - 1].time - this._frames[0].time)
      : 0;
    return { bpm: null, confidence: 0, candidates: [], signal, seconds };
  }

  _analyze() {
    const newestTime = this._lastTime;
    // 1.8 seconds accepts sparse 40 BPM percussive material, while promptly
    // clearing a genuinely stopped source instead of carrying old tempo.
    const signal = newestTime - this._lastAudibleTime <= 1.8;
    if (!signal) {
      this._lastReliableBpm = null;
      return this._baseResult(false);
    }

    const result = this._baseResult(true);
    const frames = this._frames;
    if (frames.length < 120) return result;

    const seconds = result.seconds;
    // Four seconds is enough for a provisional 60 BPM result (about 4-5
    // attacks including the initial one); longer windows improve confidence.
    if (seconds < 3.8) return result;

    const step = medianStep(frames);
    const values = frames.map((frame) => frame.onset);
    // Square-root compression and winsorising make correlation less dependent
    // on a single hard clap or gain bump.
    // At 40–60 BPM, attacks occupy about one percent of 100 Hz frames. A 98th
    // percentile cap would accidentally flatten every genuine attack into
    // background texture, so only winsorise the most extreme half-percent.
    const cap = Math.max(0.08, percentile(values, 0.995));
    const envelope = values.map((value) => Math.sqrt(Math.min(cap, value)));

    let weightedMean = 0;
    let weightSum = 0;
    for (let index = 0; index < envelope.length; index += 1) {
      const weight = 0.35 + 0.65 * (index / Math.max(1, envelope.length - 1));
      weightedMean += envelope[index] * weight;
      weightSum += weight;
    }
    weightedMean /= Math.max(weightSum, 1e-12);

    let variance = 0;
    for (let index = 0; index < envelope.length; index += 1) {
      const weight = 0.35 + 0.65 * (index / Math.max(1, envelope.length - 1));
      const centered = envelope[index] - weightedMean;
      variance += weight * centered * centered;
    }
    if (variance / Math.max(weightSum, 1e-12) < 1e-5) return result;

    const onsetThreshold = weightedMean + Math.sqrt(variance / Math.max(weightSum, 1e-12)) * 0.45;
    let eventCount = 0;
    let wasAbove = false;
    for (const value of envelope) {
      const above = value > onsetThreshold;
      if (above && !wasAbove) eventCount += 1;
      wasAbove = above;
    }
    if (eventCount < 4) return result;

    const minLag = Math.max(2, Math.floor((60 / this.maxBpm) / step));
    const maxLag = Math.min(envelope.length - 3, Math.ceil((60 / this.minBpm) / step));
    if (maxLag <= minLag + 2) return result;

    // A 100 Hz envelope represents 180 BPM as 33.333 frames/beat. Integer
    // lags would favor its exact three-beat (100-frame) harmonic, so search
    // quarter-frame delays with linear interpolation of the earlier sample.
    const lagStep = 0.25;
    const lagValues = [];
    const correlations = [];
    for (let lag = minLag; lag <= maxLag; lag += lagStep) {
      let cross = 0;
      let leftEnergy = 0;
      let rightEnergy = 0;
      const start = Math.ceil(lag);
      const fraction = lag - Math.floor(lag);
      for (let index = start; index < envelope.length; index += 1) {
        // A modest recent-data bias lets a 12-second rolling window adapt
        // after a tempo change without pretending the previous rhythm never
        // existed.
        const weight = 0.35 + 0.65 * (index / Math.max(1, envelope.length - 1));
        const left = envelope[index] - weightedMean;
        const source = index - lag;
        const low = Math.floor(source);
        const high = Math.min(envelope.length - 1, low + 1);
        const earlier = envelope[low] * (1 - fraction) + envelope[high] * fraction;
        const right = earlier - weightedMean;
        cross += weight * left * right;
        leftEnergy += weight * left * left;
        rightEnergy += weight * right * right;
      }
      lagValues.push(lag);
      correlations.push((leftEnergy > 1e-12 && rightEnergy > 1e-12)
        ? clamp(cross / Math.sqrt(leftEnergy * rightEnergy), -1, 1)
        : 0);
    }

    const correlationAt = (lag) => {
      if (lag < minLag || lag > maxLag) return 0;
      const position = (lag - minLag) / lagStep;
      const low = Math.floor(position);
      const high = Math.min(correlations.length - 1, Math.ceil(position));
      if (low === high) return correlations[low] || 0;
      const fraction = position - low;
      return (correlations[low] || 0) * (1 - fraction) + (correlations[high] || 0) * fraction;
    };

    const peaks = [];
    for (let position = 1; position < correlations.length - 1; position += 1) {
      const center = correlations[position];
      if (center <= 0 || center < correlations[position - 1] || center < correlations[position + 1]) continue;
      const left = correlations[position - 1];
      const right = correlations[position + 1];
      const curvature = left - 2 * center + right;
      const offset = curvature < -1e-9
        ? clamp(0.5 * (left - right) / curvature, -0.5, 0.5)
        : 0;
      const refinedLag = lagValues[position] + offset * lagStep;
      const bpm = 60 / (refinedLag * step);
      if (bpm < this.minBpm - 0.5 || bpm > this.maxBpm + 0.5) continue;

      // If an equally periodic shorter period exists, this peak is a slower
      // harmonic of it. Penalizing (rather than deleting) it resolves clean
      // click trains at 180/210 BPM while retaining half/double alternatives
      // for the UI and reducing certainty on genuinely ambiguous material.
      let subdivision = 0;
      // A 40 BPM candidate can be the sixth-period harmonic of a 240 BPM
      // click train, so cover every possible integer multiple in the stated
      // 40–240 BPM search range rather than just half/double alternatives.
      for (let divisor = 2; divisor <= 6; divisor += 1) {
        subdivision = Math.max(subdivision, correlationAt(refinedLag / divisor));
      }
      const harmonicPenalty = 1 - 0.60 * Math.max(0, subdivision);
      const primaryRangePrior = bpm < 70 ? 0.93 : (bpm > 190 ? 0.94 : 1);
      const score = clamp(center * harmonicPenalty * primaryRangePrior, 0, 1);
      peaks.push({ bpm, score, raw: center, subdivision });
    }

    if (peaks.length === 0) return result;
    peaks.sort((a, b) => b.score - a.score);

    // Report a compact, de-duplicated candidate list; nearby integer lags can
    // otherwise create multiple labels for one physical periodicity.
    const candidates = [];
    for (const peak of peaks) {
      if (candidates.some((item) => Math.abs(item.bpm - peak.bpm) < 2.5)) continue;
      candidates.push({ bpm: Number(peak.bpm.toFixed(1)), score: Number(peak.score.toFixed(3)) });
      if (candidates.length === 5) break;
    }
    result.candidates = candidates;

    const best = peaks[0];
    const durationFactor = clamp((seconds - 3.5) / 5, 0.35, 1);
    const eventFactor = clamp((eventCount - 2) / 7, 0.3, 1);
    const strengthFactor = clamp((best.raw - 0.35) / 0.55, 0, 1);
    const closeAlternative = peaks.find((peak, index) => index > 0
      && peak.score > best.score * 0.82
      && (peak.bpm / best.bpm > 1.35 || best.bpm / peak.bpm > 1.35));
    const ambiguityFactor = closeAlternative ? 0.76 : 1;
    const stable = this._lastReliableBpm === null
      || Math.abs(best.bpm - this._lastReliableBpm) / this._lastReliableBpm < 0.08;
    const stabilityFactor = stable ? 1 : 0.82;
    const confidence = clamp(
      0.12 + 0.84 * strengthFactor * durationFactor * eventFactor * ambiguityFactor * stabilityFactor,
      0,
      0.98,
    );

    // Never manufacture BPM from merely audible tone/noise. The raw
    // correlation threshold is deliberately separate from confidence so early
    // but clean four-second click patterns can be reported as provisional.
    if (best.raw < 0.5 || best.score < 0.31 || confidence < 0.28) {
      result.confidence = Number(Math.min(confidence, 0.27).toFixed(3));
      return result;
    }

    result.bpm = Number(best.bpm.toFixed(1));
    result.confidence = Number(confidence.toFixed(3));
    this._lastReliableBpm = best.bpm;
    return result;
  }
}
