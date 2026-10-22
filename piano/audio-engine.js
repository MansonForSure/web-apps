/**
 * Small Web Audio piano engine for a static app.
 *
 * `unlock()` must be called directly from a user-gesture handler.  It invokes
 * AudioContext.resume() before its first await so browser autoplay policies can
 * associate the call with that gesture.
 */
export class PianoAudio {
  static MAX_VOICES = 64;

  constructor() {
    this._context = null;
    this._masterGain = null;
    this._compressor = null;
    this._periodicWave = null;

    this._voices = new Set();
    this._voicesByToken = new Map();
    this._serial = 0;
    this._sustain = false;
    this._volume = 0.72;
    this._disposed = false;
  }

  /** True only when a usable context is actively running. */
  get ready() {
    return !this._disposed && this._context?.state === "running";
  }

  /** Includes held notes and normal release tails. */
  get activeVoiceCount() {
    return this._voices.size;
  }

  /**
   * Creates and unlocks the audio graph. Call this from a click, keydown, or
   * pointerdown handler; do not put an await before this call in that handler.
   */
  async unlock() {
    if (this._disposed) {
      throw new Error("PianoAudio has been disposed and cannot be unlocked.");
    }

    if (!this._context) {
      const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error("Web Audio is not supported by this browser.");
      }

      try {
        this._context = new AudioContextCtor({ latencyHint: "interactive" });
        this._buildGraph();
      } catch (error) {
        const detail = error instanceof Error ? `: ${error.message}` : "";
        this._discardContext();
        throw new Error(`Could not create the piano audio engine${detail}`);
      }
    }

    if (this._context.state === "closed") {
      throw new Error("The piano audio context is closed. Create a new PianoAudio instance.");
    }

    // Intentionally invoke resume synchronously, before the first await below.
    let resumeResult;
    try {
      resumeResult = this._context.resume();
    } catch (error) {
      const detail = error instanceof Error ? `: ${error.message}` : "";
      throw new Error(`Could not resume piano audio${detail}`);
    }

    try {
      await resumeResult;
    } catch (error) {
      const detail = error instanceof Error ? `: ${error.message}` : "";
      throw new Error(
        `Piano audio could not be unlocked. Interact with the page and try again${detail}`,
      );
    }

    if (this._context.state !== "running") {
      throw new Error("Piano audio did not enter the running state after resume().");
    }

    return this;
  }

  /**
   * Starts one note associated with an arbitrary input token (for example a
   * KeyboardEvent.code or a pointer id). A token has at most one current voice.
   */
  noteOn(token, midi, velocity = 0.8) {
    if (!this.ready) return false;

    const midiNumber = Number(midi);
    if (!Number.isFinite(midiNumber) || midiNumber < 0 || midiNumber > 127) {
      return false;
    }

    const parsedVelocity = Number(velocity);
    const normalizedVelocity = Number.isFinite(parsedVelocity)
      ? clamp(parsedVelocity, 0, 1)
      : 0.8;
    const note = Math.round(midiNumber);
    const now = this._now();

    try {
      // Repeated keydown/pointer input for one token replaces its old voice
      // rather than allowing duplicate voices from one physical input.
      const priorVoice = this._voicesByToken.get(token);
      if (priorVoice) this._stealVoice(priorVoice, now);

      // Stealing removes a voice from the bookkeeping immediately while it
      // fades for a few milliseconds. Thus the tracked pool never exceeds 64,
      // including normal sustained/release tails.
      while (this._voices.size >= PianoAudio.MAX_VOICES) {
        const oldest = this._oldestVoice();
        if (!oldest) return false;
        this._stealVoice(oldest, now);
      }

      const voice = this._createVoice(token, note, normalizedVelocity, now);
      if (!voice) return false;

      this._voices.add(voice);
      this._voicesByToken.set(token, voice);
      return true;
    } catch {
      // A failed node/scheduling operation should never take down UI input.
      return false;
    }
  }

  /** Releases the current voice for an input token, or defers it under pedal. */
  noteOff(token) {
    const voice = this._voicesByToken.get(token);
    if (!voice) return false;

    this._voicesByToken.delete(token);
    if (this._sustain) {
      voice.sustained = true;
      return true;
    }

    this._releaseVoice(voice, this._now(), 0.11);
    return true;
  }

  /** Enables/disables sustain. Lifting the pedal releases deferred notes. */
  setSustain(enabled) {
    const next = Boolean(enabled);
    if (this._sustain === next) return this._sustain;

    this._sustain = next;
    if (!next) {
      const now = this._now();
      for (const voice of [...this._voices]) {
        if (voice.sustained && !voice.releasing) {
          voice.sustained = false;
          this._releaseVoice(voice, now, 0.13);
        }
      }
    }
    return this._sustain;
  }

  /** Sets the master level; invalid values leave the current value unchanged. */
  setVolume(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this._volume;

    this._volume = clamp(numeric, 0, 1);
    const gain = this._masterGain?.gain;
    if (!gain || !this._context) return this._volume;

    const now = this._now();
    try {
      gain.cancelScheduledValues(now);
      gain.setTargetAtTime(this._volume, now, 0.015);
    } catch {
      // A direct assignment is a safe last resort for unusual Web Audio mocks.
      try {
        gain.value = this._volume;
      } catch {
        // Deliberately ignore audio-node failures.
      }
    }
    return this._volume;
  }

  /** Fast, click-free release of every held, sustained, and tail voice. */
  panic() {
    const now = this._now();
    for (const voice of [...this._voices]) {
      this._stealVoice(voice, now);
    }
    this._voicesByToken.clear();
    this._sustain = false;
  }

  /** Releases nodes and closes the context when the app is torn down. */
  dispose() {
    if (this._disposed) return;
    this.panic();
    this._disposed = true;

    try {
      this._masterGain?.disconnect();
      this._compressor?.disconnect();
    } catch {
      // Nothing else is required if a browser has already disconnected nodes.
    }

    const context = this._context;
    this._context = null;
    this._masterGain = null;
    this._compressor = null;
    this._periodicWave = null;

    try {
      const closeResult = context?.close();
      // Avoid an unhandled rejection without making disposal asynchronous.
      closeResult?.catch?.(() => {});
    } catch {
      // Closing an already-closed context is harmless for the application.
    }
  }

  _buildGraph() {
    const context = this._context;
    if (!context) throw new Error("Audio context was not created.");

    const masterGain = context.createGain();
    const compressor = context.createDynamicsCompressor();

    setAudioParam(compressor.threshold, -18, context.currentTime);
    setAudioParam(compressor.knee, 20, context.currentTime);
    setAudioParam(compressor.ratio, 7, context.currentTime);
    setAudioParam(compressor.attack, 0.003, context.currentTime);
    setAudioParam(compressor.release, 0.2, context.currentTime);
    setAudioParam(masterGain.gain, this._volume, context.currentTime);

    masterGain.connect(compressor);
    compressor.connect(context.destination);

    this._masterGain = masterGain;
    this._compressor = compressor;
    this._periodicWave = this._makePianoWave(context);
  }

  _makePianoWave(context) {
    if (typeof context.createPeriodicWave !== "function") return null;

    // Sine partials: a warm fundamental, octave, fifth/third coloration, and
    // progressively quieter upper harmonics. Browser normalization prevents
    // this spectrum from becoming unexpectedly loud.
    const real = new Float32Array(10);
    const imag = new Float32Array(10);
    imag[1] = 1;
    imag[2] = 0.48;
    imag[3] = 0.23;
    imag[4] = 0.14;
    imag[5] = 0.08;
    imag[6] = 0.055;
    imag[7] = 0.035;
    imag[8] = 0.02;
    imag[9] = 0.012;

    try {
      return context.createPeriodicWave(real, imag, { disableNormalization: false });
    } catch {
      try {
        // Older implementations omit the options argument.
        return context.createPeriodicWave(real, imag);
      } catch {
        return null;
      }
    }
  }

  _createVoice(token, midi, velocity, now) {
    const context = this._context;
    if (!context || !this._masterGain) return null;

    let oscillator;
    let gainNode;
    try {
      oscillator = context.createOscillator();
      gainNode = context.createGain();

      const frequency = 440 * 2 ** ((midi - 69) / 12);
      setAudioParam(oscillator.frequency, frequency, now);
      if (this._periodicWave && typeof oscillator.setPeriodicWave === "function") {
        oscillator.setPeriodicWave(this._periodicWave);
      } else {
        oscillator.type = "sine";
      }

      oscillator.connect(gainNode);
      gainNode.connect(this._masterGain);

      const peak = 0.025 + velocity * 0.075;
      const body = Math.max(0.00015, peak * (0.28 + velocity * 0.16));
      const attackEnd = now + 0.004 + (1 - velocity) * 0.004;
      const settleAt = attackEnd + 0.12;
      const naturalDecay = clamp(2.4 + (100 - midi) * 0.035, 2.4, 6.0);
      const envelope = gainNode.gain;

      envelope.setValueAtTime(MIN_GAIN, now);
      envelope.exponentialRampToValueAtTime(peak, attackEnd);
      envelope.exponentialRampToValueAtTime(body, settleAt);
      envelope.setTargetAtTime(MIN_GAIN, settleAt, naturalDecay);

      const voice = {
        token,
        oscillator,
        gainNode,
        startedAt: now,
        serial: ++this._serial,
        peak,
        body,
        attackEnd,
        settleAt,
        naturalDecay,
        sustained: false,
        releasing: false,
        finalized: false,
        cleanupTimer: null,
      };

      oscillator.onended = () => this._finalizeVoice(voice);
      oscillator.start(now);
      return voice;
    } catch {
      try {
        oscillator?.stop();
        oscillator?.disconnect();
        gainNode?.disconnect();
      } catch {
        // Ignore partial-node cleanup failures.
      }
      return null;
    }
  }

  _releaseVoice(voice, now, releaseTime) {
    if (!voice || voice.finalized || voice.releasing) return;
    voice.releasing = true;
    voice.sustained = false;
    if (this._voicesByToken.get(voice.token) === voice) {
      this._voicesByToken.delete(voice.token);
    }
    this._fadeAndStop(voice, now, releaseTime);
  }

  /** Quickly but smoothly retires a voice to make room for a newer one. */
  _stealVoice(voice, now) {
    if (!voice || voice.finalized) return;
    voice.releasing = true;
    voice.sustained = false;
    if (this._voicesByToken.get(voice.token) === voice) {
      this._voicesByToken.delete(voice.token);
    }
    // Remove now, rather than at onended, so release tails count toward the
    // normal cap but a deliberately stolen voice can never block a new note.
    this._voices.delete(voice);
    this._fadeAndStop(voice, now, 0.012);
  }

  _fadeAndStop(voice, now, releaseTime) {
    const envelope = voice.gainNode?.gain;
    try {
      let held = false;
      if (typeof envelope?.cancelAndHoldAtTime === "function") {
        try {
          envelope.cancelAndHoldAtTime(now);
          held = true;
        } catch {
          held = false;
        }
      }

      if (!held) {
        envelope?.cancelScheduledValues?.(now);
        // Keeping the estimated instantaneous level avoids a discontinuity on
        // implementations without cancelAndHoldAtTime.
        envelope?.setValueAtTime?.(this._estimateEnvelope(voice, now), now);
      }
      envelope?.setTargetAtTime?.(MIN_GAIN, now, releaseTime);
    } catch {
      // Continue to stop/disconnect even if an envelope method failed.
    }

    const stopAt = now + Math.max(0.035, releaseTime * 7 + 0.02);
    voice.stopAt = stopAt;
    try {
      voice.oscillator?.stop(stopAt);
    } catch {
      // A source may already have been stopped; finalization remains safe.
    }
    this._armFinalizer(voice, stopAt);
  }

  _estimateEnvelope(voice, now) {
    if (now <= voice.attackEnd) {
      const portion = clamp((now - voice.startedAt) / (voice.attackEnd - voice.startedAt), 0, 1);
      return Math.max(MIN_GAIN, MIN_GAIN * (voice.peak / MIN_GAIN) ** portion);
    }
    if (now <= voice.settleAt) {
      const portion = clamp((now - voice.attackEnd) / (voice.settleAt - voice.attackEnd), 0, 1);
      return Math.max(MIN_GAIN, voice.peak * (voice.body / voice.peak) ** portion);
    }
    return Math.max(
      MIN_GAIN,
      MIN_GAIN + (voice.body - MIN_GAIN) * Math.exp(-(now - voice.settleAt) / voice.naturalDecay),
    );
  }

  _armFinalizer(voice, stopAt) {
    if (voice.cleanupTimer) clearTimeout(voice.cleanupTimer);
    const milliseconds = Math.max(0, Math.ceil((stopAt - this._now()) * 1000) + 100);
    voice.cleanupTimer = setTimeout(() => this._finalizeVoice(voice), milliseconds);
    // Do not keep a non-browser test process alive purely for a release tail.
    voice.cleanupTimer?.unref?.();
  }

  _finalizeVoice(voice) {
    if (!voice || voice.finalized) return;
    voice.finalized = true;
    if (voice.cleanupTimer) clearTimeout(voice.cleanupTimer);
    voice.cleanupTimer = null;
    this._voices.delete(voice);
    if (this._voicesByToken.get(voice.token) === voice) {
      this._voicesByToken.delete(voice.token);
    }

    try {
      voice.oscillator.onended = null;
      voice.oscillator.disconnect();
      voice.gainNode.disconnect();
    } catch {
      // Nodes may already have been released by the audio implementation.
    }
  }

  _oldestVoice() {
    let oldest = null;
    for (const voice of this._voices) {
      if (!oldest || voice.startedAt < oldest.startedAt || (
        voice.startedAt === oldest.startedAt && voice.serial < oldest.serial
      )) {
        oldest = voice;
      }
    }
    return oldest;
  }

  _now() {
    const currentTime = Number(this._context?.currentTime);
    return Number.isFinite(currentTime) ? currentTime : 0;
  }

  _discardContext() {
    try {
      const closeResult = this._context?.close();
      closeResult?.catch?.(() => {});
    } catch {
      // Context construction/graph setup already failed; nothing more to do.
    }
    this._context = null;
    this._masterGain = null;
    this._compressor = null;
    this._periodicWave = null;
  }
}

const MIN_GAIN = 0.0001;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function setAudioParam(parameter, value, time) {
  if (!parameter) return;
  if (typeof parameter.setValueAtTime === "function") {
    parameter.setValueAtTime(value, time);
  } else {
    parameter.value = value;
  }
}
