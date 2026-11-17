import { h, button, setLabel, statusLine, explainMediaError } from '../lib/dom.js';
import { getAudioContext, setAudioSession } from '../lib/audio.js';

const RECORD_SECONDS = 5;
const VOICE_DB = -40;

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  const options = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
  if (typeof MediaRecorder.isTypeSupported !== 'function') return '';
  return options.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

export default function mountMicrophone(ctx) {
  let stream = null;
  let nodes = [];
  let raf = 0;
  let recorder = null;
  let countdown = 0;
  let url = null;
  let player = null;
  let peak = -90;
  let loudFrames = 0;
  let detected = Boolean(ctx.result && ctx.result.items && ctx.result.items.level === 'yes');
  const mime = pickMime();

  const fill = h('span', { class: 'meter-fill' });
  const peakMark = h('span', { class: 'meter-peak' });
  const meter = h('div', { class: 'meter', role: 'meter', 'aria-label': 'Microphone level', 'aria-valuemin': '-90', 'aria-valuemax': '0', 'aria-valuenow': '-90' }, fill, peakMark);
  const db = h('span', { class: 'meter-db' }, '— dB');
  const status = statusLine('Microphone is off.');
  const toggle = button('Turn on microphone', { kind: 'primary', iconName: 'mic', wide: true, onClick: () => (stream ? stopMic('Microphone is off.') : startMic()) });
  const record = button(`Record ${RECORD_SECONDS} seconds`, { kind: 'secondary', iconName: 'record', onClick: startRecording, disabled: mime === null ? true : null });
  const play = button('Play recording', { kind: 'secondary', iconName: 'play', onClick: playRecording, disabled: true });

  ctx.body.append(
    h('p', { class: 'panel-lede' }, 'Speak normally, about an arm’s length from the phone. The meter should jump when you talk.'),
    h('div', { class: 'meter-wrap' }, meter, db),
    status,
    toggle,
    h('div', { class: 'button-row two' }, record, play),
    h('p', { class: 'fine' }, mime === null
      ? 'This browser can’t record audio, so only the live meter is available.'
      : 'Recordings stay in this tab’s memory and are discarded when you close the test. iOS chooses which built-in mic Safari uses; test the others by recording a video with each camera.'),
    ctx.checklist(),
  );

  async function startMic() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      status.textContent = 'This browser can’t use the microphone. Open the page in Safari.';
      return false;
    }
    setAudioSession('play-and-record');
    const audioReady = getAudioContext().catch(() => null);
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (error) {
      setAudioSession('playback');
      status.textContent = explainMediaError(error, 'microphone');
      return false;
    }
    const audio = await audioReady;
    if (audio) {
      const source = audio.createMediaStreamSource(stream);
      const analyser = audio.createAnalyser();
      analyser.fftSize = 2048;
      const sink = audio.createGain();
      sink.gain.value = 0;
      source.connect(analyser);
      analyser.connect(sink);
      sink.connect(audio.destination);
      nodes = [source, analyser, sink];
      const buffer = new Float32Array(analyser.fftSize);
      const loop = () => {
        if (typeof analyser.getFloatTimeDomainData === 'function') analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
        const rms = Math.sqrt(sum / buffer.length);
        const level = Math.max(-90, Math.min(0, 20 * Math.log10(rms || 1e-9)));
        peak = Math.max(level, peak - 0.6);
        fill.style.transform = `scaleX(${Math.max(0, (level + 75) / 75)})`;
        peakMark.style.left = `${Math.max(0, (peak + 75) / 75) * 100}%`;
        meter.setAttribute('aria-valuenow', String(Math.round(level)));
        db.textContent = `${Math.round(level)} dB`;
        if (level > VOICE_DB) loudFrames += 1;
        if (!detected && loudFrames > 8) {
          detected = true;
          status.textContent = 'Sound detected. The microphone is picking you up.';
          ctx.setItem('level', 'yes', { auto: true });
        }
        raf = requestAnimationFrame(loop);
      };
      loop();
    }
    stream.getAudioTracks().forEach((track) => track.addEventListener('ended', () => stopMic('The microphone was turned off by the system.')));
    setLabel(toggle, 'Turn off microphone');
    toggle.classList.remove('primary');
    toggle.classList.add('secondary');
    if (!recorder) status.textContent = detected ? 'Listening.' : 'Listening… say something.';
    return true;
  }

  function stopMic(message) {
    cancelAnimationFrame(raf);
    raf = 0;
    if (recorder && recorder.state === 'recording') recorder.stop();
    clearInterval(countdown);
    nodes.forEach((node) => { try { node.disconnect(); } catch { /* ignore */ } });
    nodes = [];
    if (stream) stream.getTracks().forEach((track) => track.stop());
    stream = null;
    fill.style.transform = 'scaleX(0)';
    db.textContent = '— dB';
    setAudioSession('playback');
    setLabel(toggle, 'Turn on microphone');
    toggle.classList.add('primary');
    toggle.classList.remove('secondary');
    if (message) status.textContent = message;
  }

  async function startRecording() {
    if (recorder && recorder.state === 'recording') return;
    if (!stream && !(await startMic())) return;
    const chunks = [];
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch (error) {
      status.textContent = `Recording isn’t available here (${error.message}).`;
      return;
    }
    recorder.addEventListener('dataavailable', (event) => { if (event.data && event.data.size) chunks.push(event.data); });
    recorder.addEventListener('stop', () => {
      clearInterval(countdown);
      record.disabled = false;
      setLabel(record, 'Record again');
      const type = (recorder && recorder.mimeType) || mime || 'audio/mp4';
      recorder = null;
      if (!chunks.length) {
        status.textContent = 'Nothing was recorded. Try again.';
        return;
      }
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(new Blob(chunks, { type }));
      player = new Audio(url);
      player.addEventListener('ended', () => { status.textContent = 'Did that sound clear, without crackle or muffling?'; setLabel(play, 'Play recording'); });
      play.disabled = false;
      // Release the mic first so playback uses the loudspeaker at full volume.
      stopMic('Recording ready. Tap Play recording.');
    });
    let left = RECORD_SECONDS;
    record.disabled = true;
    setLabel(record, `Recording… ${left}`);
    status.textContent = 'Recording. Say a sentence or count to five.';
    recorder.start();
    countdown = setInterval(() => {
      left -= 1;
      if (left > 0) setLabel(record, `Recording… ${left}`);
      else {
        clearInterval(countdown);
        if (recorder && recorder.state === 'recording') recorder.stop();
      }
    }, 1000);
  }

  function playRecording() {
    if (!player) return;
    if (!player.paused) {
      player.pause();
      player.currentTime = 0;
      setLabel(play, 'Play recording');
      return;
    }
    setAudioSession('playback');
    player.currentTime = 0;
    player.play().then(() => {
      setLabel(play, 'Stop');
      status.textContent = 'Playing your recording…';
    }).catch((error) => { status.textContent = `Couldn’t play the recording (${error.message}).`; });
  }

  const cleanup = () => {
    stopMic();
    if (player) player.pause();
    if (url) URL.revokeObjectURL(url);
    url = null;
    player = null;
  };
  ctx.onHidden(() => stopMic('Microphone turned off because you left the page.'));
  ctx.onCleanup(cleanup);
}
