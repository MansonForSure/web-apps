import { h, button, setLabel, setIcon, statusLine } from '../lib/dom.js';
import { getAudioContext, setAudioSession, hasAudioSession, playChime, playSweep } from '../lib/audio.js';

export default function mountSpeakers(ctx) {
  let active = null;
  let timer = 0;
  let raf = 0;

  const visual = h('div', { class: 'speaker-visual', 'aria-hidden': 'true' },
    h('span', { class: 'spk spk-left' }), h('span', { class: 'phone-landscape' }, h('span', { class: 'phone-island' })), h('span', { class: 'spk spk-right' }));
  const status = statusLine('Ready. Turn the volume up first.');
  const left = button('Left', { kind: 'secondary', onClick: () => chime(-1, 'left') });
  const both = button('Both', { kind: 'secondary', onClick: () => chime(0, 'both') });
  const right = button('Right', { kind: 'secondary', onClick: () => chime(1, 'right') });
  const sweepButton = button('Play frequency sweep', { kind: 'secondary', iconName: 'play', wide: true, onClick: toggleSweep });
  const freq = h('p', { class: 'sweep-freq', 'aria-hidden': 'true' }, ' ');

  ctx.body.append(
    h('p', { class: 'panel-lede' }, 'Turn the volume up and hold your iPhone sideways, so one speaker is on each side.'),
    visual,
    h('div', { class: 'button-row three' }, left, both, right),
    status,
    h('div', { class: 'sub-card' },
      h('p', { class: 'sub-title' }, 'Rattle check'),
      h('p', { class: 'sub-text' }, 'A tone glides from deep bass to a high whistle over 7 seconds. Listen for buzzing, rattling or crackling.'),
      sweepButton,
      freq),
    h('p', { class: 'fine' }, hasAudioSession()
      ? 'Sounds play even if Silent mode is on. The earpiece speaker joins in as the second stereo speaker on most models.'
      : 'If you hear nothing, turn off Silent mode and raise the volume.'),
    ctx.checklist(),
  );

  function setActive(side) {
    visual.dataset.active = side || '';
  }

  function stopAll() {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    if (active) active.stop();
    active = null;
    setActive(null);
    setLabel(sweepButton, 'Play frequency sweep');
    setIcon(sweepButton, 'play');
    sweepButton.classList.remove('is-active');
    freq.textContent = ' ';
  }

  async function chime(pan, side) {
    setAudioSession('playback');
    let audio;
    try {
      audio = await getAudioContext();
    } catch (error) {
      status.textContent = error.message;
      return;
    }
    stopAll();
    const sound = playChime(audio, { pan });
    active = sound;
    setActive(side);
    status.textContent = side === 'both' ? 'Playing on both speakers…' : `Playing on the ${side} speaker only…`;
    timer = setTimeout(() => {
      if (active === sound) {
        active = null;
        setActive(null);
        status.textContent = side === 'both' ? 'Did both sides play evenly?' : `Did the ${side} side play clearly?`;
      }
    }, Math.max(0, (sound.end - audio.currentTime) * 1000));
  }

  async function toggleSweep() {
    if (active && active.frequencyAt) {
      stopAll();
      status.textContent = 'Sweep stopped.';
      return;
    }
    setAudioSession('playback');
    let audio;
    try {
      audio = await getAudioContext();
    } catch (error) {
      status.textContent = error.message;
      return;
    }
    stopAll();
    const sweep = playSweep(audio);
    active = sweep;
    setActive('both');
    setLabel(sweepButton, 'Stop sweep');
    setIcon(sweepButton, 'stop');
    sweepButton.classList.add('is-active');
    status.textContent = 'Listening for rattles…';
    const tick = () => {
      if (active !== sweep) return;
      const now = audio.currentTime;
      const f = sweep.frequencyAt(now);
      freq.textContent = f >= 1000 ? `${(f / 1000).toFixed(1)} kHz` : `${Math.round(f)} Hz`;
      if (now >= sweep.end) {
        stopAll();
        status.textContent = 'Sweep finished. Was it clean all the way up?';
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  ctx.onHidden(stopAll);
  ctx.onCleanup(stopAll);
}
