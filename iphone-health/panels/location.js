import { h, button, setLabel, statusLine } from '../lib/dom.js';

const LIMIT_MS = 30000;
const GOOD_METRES = 50;

export function formatDistance(metres) {
  if (!Number.isFinite(metres)) return '—';
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

export default function mountLocation(ctx) {
  let watch = null;
  let timer = 0;
  let started = 0;
  let firstFix = null;
  let best = Infinity;
  let samples = 0;
  let passed = Boolean(ctx.result && ctx.result.items && ctx.result.items.fix === 'yes');

  const ring = h('span', { class: 'accuracy-ring' });
  const big = h('span', { class: 'accuracy-value' }, '—');
  const visual = h('div', { class: 'accuracy', 'aria-hidden': 'true' }, ring, h('span', { class: 'accuracy-dot' }));
  const stats = {
    current: h('span', { class: 'reading-value' }, '—'),
    best: h('span', { class: 'reading-value' }, '—'),
    first: h('span', { class: 'reading-value' }, '—'),
    samples: h('span', { class: 'reading-value' }, '0'),
  };
  const reading = (label, value) => h('div', { class: 'reading' }, h('span', { class: 'reading-label' }, label), value);
  const status = statusLine('Location is off.');
  const start = button('Find my location', { kind: 'primary', iconName: 'location', wide: true, onClick: () => (watch !== null ? stop('Stopped.') : begin()) });

  ctx.body.append(
    h('p', { class: 'panel-lede' }, 'Checks that GPS and location services can pin you down. It works best outdoors or near a window.'),
    h('div', { class: 'accuracy-wrap' }, visual, h('div', {}, h('span', { class: 'accuracy-label' }, 'Accuracy'), big)),
    h('div', { class: 'readings' }, reading('Now', stats.current), reading('Best', stats.best), reading('First fix', stats.first), reading('Updates', stats.samples)),
    status,
    start,
    h('p', { class: 'fine' }, 'Your coordinates are never shown, saved or sent anywhere. Only the accuracy is used. Precise Location must be on for an accurate fix.'),
    ctx.checklist(),
  );

  function show(accuracy) {
    big.textContent = `±${formatDistance(accuracy)}`;
    stats.current.textContent = `±${formatDistance(accuracy)}`;
    stats.best.textContent = `±${formatDistance(best)}`;
    stats.samples.textContent = String(samples);
    const scale = Math.max(0.18, Math.min(1, Math.log10(Math.max(accuracy, 3)) / 3.3));
    ring.style.transform = `scale(${scale})`;
    visual.classList.toggle('good', accuracy <= GOOD_METRES);
  }

  function onPosition(position) {
    samples += 1;
    const accuracy = position.coords.accuracy;
    if (firstFix === null) {
      firstFix = (performance.now() - started) / 1000;
      stats.first.textContent = `${firstFix.toFixed(1)} s`;
    }
    best = Math.min(best, accuracy);
    show(accuracy);
    if (!passed && best <= GOOD_METRES) {
      passed = true;
      ctx.setItem('fix', 'yes', { auto: true, detail: `±${formatDistance(best)} in ${firstFix.toFixed(1)} s` });
    }
    status.textContent = best <= 15 ? 'Excellent fix.' : best <= GOOD_METRES ? 'Good fix. It may sharpen a little more.' : 'Rough fix so far. Keep the phone still, ideally outdoors.';
    if (best <= 10) stop('Excellent fix. GPS is working.');
  }

  function onError(error) {
    const messages = {
      1: 'Location access was declined. Allow it in Settings › Privacy & Security › Location Services › Safari Websites, then reload.',
      2: 'Location is unavailable. Check that Location Services is on in Settings › Privacy & Security.',
      3: 'No fix yet. Try again outdoors with a clear view of the sky.',
    };
    stop(messages[error.code] || `Location error: ${error.message}`);
  }

  function begin() {
    if (!('geolocation' in navigator)) {
      status.textContent = 'This browser can’t access location.';
      return;
    }
    started = performance.now();
    firstFix = null;
    best = Infinity;
    samples = 0;
    status.textContent = 'Searching… allow location access if asked.';
    setLabel(start, 'Stop');
    start.classList.replace('primary', 'secondary');
    visual.classList.add('searching');
    watch = navigator.geolocation.watchPosition(onPosition, onError, { enableHighAccuracy: true, maximumAge: 0, timeout: LIMIT_MS });
    timer = setTimeout(() => {
      if (best <= GOOD_METRES) stop('Done. GPS is working.');
      else if (Number.isFinite(best)) stop(`Only a rough fix (±${formatDistance(best)}). Precise Location may be off, or you’re indoors. Try again outside before marking an issue.`);
      else stop('No fix after 30 seconds. Try again outdoors.');
    }, LIMIT_MS);
  }

  function stop(message) {
    if (watch !== null) navigator.geolocation.clearWatch(watch);
    watch = null;
    clearTimeout(timer);
    visual.classList.remove('searching');
    setLabel(start, samples ? 'Try again' : 'Find my location');
    start.classList.replace('secondary', 'primary');
    if (message) status.textContent = message;
  }

  ctx.onHidden(() => { if (watch !== null) stop('Paused because you left the page.'); });
  ctx.onCleanup(() => stop());
}
