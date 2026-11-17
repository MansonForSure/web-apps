import { h, button, setLabel, statusLine } from '../lib/dom.js';
import { median } from '../lib/bench.js';

const PINGS = 6;

export function rateLatency(ms) {
  if (!Number.isFinite(ms)) return 'No response';
  if (ms < 120) return 'Excellent';
  if (ms < 300) return 'Good';
  if (ms < 800) return 'Fair';
  return 'Slow';
}

export default function mountNetwork(ctx) {
  let running = false;
  let cancelled = false;
  const values = {
    online: h('span', { class: 'stat-value' }, navigator.onLine === false ? 'Offline' : 'Online'),
    latency: h('span', { class: 'stat-value' }, '—'),
    rating: h('span', { class: 'stat-value' }, '—'),
    replies: h('span', { class: 'stat-value' }, '—'),
  };
  const tile = (label, value, unit = '') => h('div', { class: 'stat-tile' }, h('span', { class: 'stat-label' }, label), h('span', { class: 'stat-line' }, value, unit ? h('span', { class: 'stat-unit' }, unit) : null));
  const bars = h('div', { class: 'ping-bars', 'aria-hidden': 'true' });
  const status = statusLine('Sends six tiny requests to this site and times the replies.');
  const run = button('Check connection', { kind: 'primary', iconName: 'network', wide: true, onClick: begin });

  ctx.body.append(
    h('p', { class: 'panel-lede' }, 'Checks that your iPhone is online and how quickly it reaches the internet right now.'),
    h('div', { class: 'stat-grid' }, tile('Status', values.online), tile('Response time', values.latency, 'ms'), tile('Rating', values.rating), tile('Replies', values.replies)),
    bars,
    status,
    run,
    h('p', { class: 'fine' }, 'Safari doesn’t tell web pages whether you’re on Wi-Fi or cellular. Run this once on each to compare. For a full speed test, use a dedicated speed-test app.'),
  );

  async function begin() {
    if (running) return;
    running = true;
    cancelled = false;
    run.disabled = true;
    setLabel(run, 'Checking…');
    bars.replaceChildren();
    const online = navigator.onLine !== false;
    values.online.textContent = online ? 'Online' : 'Offline';
    const times = [];
    for (let i = 0; i < PINGS && !cancelled; i += 1) {
      status.textContent = `Request ${i + 1} of ${PINGS}…`;
      const started = performance.now();
      try {
        const response = await fetch(`./favicon.svg?ping=${Date.now()}-${i}`, { cache: 'no-store' });
        await response.arrayBuffer();
        if (!response.ok) throw new Error(String(response.status));
        const ms = performance.now() - started;
        times.push(ms);
        bars.append(h('span', { class: 'ping-bar', style: { '--h': `${Math.min(100, Math.max(8, ms / 6))}%` }, title: `${Math.round(ms)} ms` }));
      } catch {
        bars.append(h('span', { class: 'ping-bar failed', style: { '--h': '100%' } }));
      }
    }
    if (cancelled) return;
    const steady = times.length > 2 ? times.slice(1) : times;
    const ms = steady.length ? Math.round(median(steady)) : NaN;
    values.latency.textContent = Number.isFinite(ms) ? String(ms) : '—';
    values.rating.textContent = rateLatency(ms);
    values.replies.textContent = `${times.length}/${PINGS}`;
    running = false;
    run.disabled = false;
    setLabel(run, 'Check again');
    if (!times.length) {
      status.textContent = 'No replies. Check Wi-Fi or mobile data and try again.';
      ctx.setResult({ status: 'fail', summary: 'No connection' });
      return;
    }
    status.textContent = times.length < PINGS ? 'Some requests failed, so the connection is unstable.' : 'Connection is working.';
    ctx.setResult({
      status: times.length < PINGS / 2 ? 'fail' : 'pass',
      summary: `${rateLatency(ms)} · ${ms} ms${times.length < PINGS ? ` · ${PINGS - times.length} dropped` : ''}`,
    });
  }

  ctx.onCleanup(() => { cancelled = true; });
}
