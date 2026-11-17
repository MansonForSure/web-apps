import { h, icon, button, setLabel, statusLine, explainMediaError } from '../lib/dom.js';

const PRETTY = {
  'Back Camera': 'Back · Wide',
  'Front Camera': 'Front',
  'Back Ultra Wide Camera': 'Ultra Wide',
  'Back Telephoto Camera': 'Telephoto',
  'Back Dual Wide Camera': 'Dual Wide (auto)',
  'Back Dual Camera': 'Dual (auto)',
  'Back Triple Camera': 'Triple (auto)',
};

export function prettyCameraLabel(label, index) {
  if (!label) return `Camera ${index + 1}`;
  return PRETTY[label] || label;
}

export default function mountCameras(ctx) {
  let stream = null;
  let track = null;
  let torch = false;
  let opening = 0;

  const video = h('video', { class: 'camera-video', playsinline: true, autoplay: true, muted: true, 'aria-label': 'Camera preview' });
  video.muted = true;
  video.setAttribute('webkit-playsinline', '');
  const placeholder = h('div', { class: 'camera-placeholder' }, icon('camera'), h('p', {}, 'Camera is off'));
  const stage = h('div', { class: 'camera-stage' }, video, placeholder);
  const lenses = h('div', { class: 'chip-row', role: 'group', 'aria-label': 'Choose a camera' });
  const info = h('p', { class: 'camera-info' });
  const status = statusLine('');
  const power = button('Turn on camera', { kind: 'primary', iconName: 'camera', wide: true, onClick: () => (stream ? stop('Camera is off.') : open({ facingMode: { ideal: 'environment' } })) });
  const flash = button('Flash', { kind: 'secondary', iconName: 'flash', onClick: toggleTorch, disabled: true });
  const flip = button('Flip', { kind: 'secondary', iconName: 'reset', onClick: flipCamera, disabled: true });

  ctx.body.append(
    h('p', { class: 'panel-lede' }, 'Check each lens. Point it at something detailed, then something close, and look for blur, spots or dust.'),
    stage,
    lenses,
    info,
    h('div', { class: 'button-row two' }, flip, flash),
    status,
    power,
    h('p', { class: 'fine' }, 'Nothing is recorded or uploaded. The camera turns off when you close this test or leave the page.'),
    ctx.checklist(),
  );

  async function listCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === 'videoinput');
    } catch {
      return [];
    }
  }

  function renderLenses(cameras) {
    const currentId = track && track.getSettings ? track.getSettings().deviceId : null;
    lenses.replaceChildren(...cameras.map((camera, index) => {
      const chip = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(camera.deviceId === currentId) }, prettyCameraLabel(camera.label, index));
      chip.addEventListener('click', () => open({ deviceId: { exact: camera.deviceId } }));
      return chip;
    }));
  }

  function describe() {
    if (!track) return;
    const settings = track.getSettings ? track.getSettings() : {};
    const facing = settings.facingMode || (/front/i.test(track.label) ? 'user' : 'environment');
    video.classList.toggle('mirrored', facing === 'user');
    const size = settings.width && settings.height ? `${settings.width} × ${settings.height}` : '';
    info.textContent = [track.label || 'Camera', size].filter(Boolean).join(' · ');
    let caps = {};
    try { caps = track.getCapabilities ? track.getCapabilities() : {}; } catch { caps = {}; }
    const hasTorch = Boolean(caps && caps.torch);
    flash.disabled = !hasTorch;
    flash.title = hasTorch ? '' : 'Flash control isn’t available for this lens. Try the back camera.';
    setLabel(flash, hasTorch ? 'Flash' : 'No flash');
    flash.setAttribute('aria-pressed', String(hasTorch && torch));
    flash.classList.toggle('is-active', torch);
  }

  async function open(constraints) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      status.textContent = 'This browser can’t open the camera. Open the page in Safari.';
      return false;
    }
    const attempt = ++opening;
    release();
    status.textContent = 'Opening camera…';
    try {
      const next = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...constraints, width: { ideal: 1920 }, height: { ideal: 1440 } } });
      if (attempt !== opening) { next.getTracks().forEach((t) => t.stop()); return false; }
      stream = next;
      track = stream.getVideoTracks()[0];
      video.srcObject = stream;
      stage.classList.add('live');
      await video.play().catch(() => {});
      track.addEventListener('ended', () => stop('The camera was turned off by the system.'));
      const cameras = await listCameras();
      renderLenses(cameras);
      flip.disabled = cameras.length < 2;
      describe();
      status.textContent = cameras.length > 2 ? 'Try every lens in the list.' : '';
      setLabel(power, 'Turn off camera');
      power.classList.replace('primary', 'secondary');
      return true;
    } catch (error) {
      if (attempt !== opening) return false;
      stop();
      status.textContent = explainMediaError(error, 'camera');
      return false;
    }
  }

  async function flipCamera() {
    const settings = track && track.getSettings ? track.getSettings() : {};
    const facing = settings.facingMode === 'user' ? 'environment' : 'user';
    if (!(await open({ facingMode: { exact: facing } }))) await open({ facingMode: facing });
  }

  async function toggleTorch() {
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch }] });
      torch = !torch;
      status.textContent = torch ? 'Flash should be on now. Is it lit?' : 'Flash off.';
    } catch (error) {
      status.textContent = `Couldn’t switch the flash (${error.message}). Try the flashlight in Control Center.`;
    }
    describe();
  }

  function release() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    track = null;
    torch = false;
    video.srcObject = null;
    stage.classList.remove('live');
  }

  function stop(message) {
    opening += 1;
    release();
    flash.disabled = true;
    setLabel(flash, 'Flash');
    flip.disabled = true;
    info.textContent = '';
    lenses.querySelectorAll('.chip').forEach((chip) => chip.setAttribute('aria-pressed', 'false'));
    setLabel(power, 'Turn on camera');
    power.classList.replace('secondary', 'primary');
    if (message) status.textContent = message;
  }

  ctx.onHidden(() => { if (stream) stop('Camera turned off because you left the page.'); });
  ctx.onCleanup(() => stop());
}
