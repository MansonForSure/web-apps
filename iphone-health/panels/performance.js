import { h, button, setLabel, statusLine } from '../lib/dom.js';
import { scoreFromRates, frameStats } from '../lib/bench.js';

const FRAME_MS = 2500;
const ROUNDS = 5;
const ROUND_MS = 700;

function measureFrames(duration, spinner, isCancelled) {
  return new Promise((resolve) => {
    const stamps = [];
    const step = (time) => {
      if (isCancelled()) { resolve(null); return; }
      stamps.push(time);
      spinner.style.transform = `rotate(${(time / 4) % 360}deg)`;
      if (time - stamps[0] < duration) requestAnimationFrame(step);
      else resolve(frameStats(stamps));
    };
    requestAnimationFrame(step);
  });
}

function runBenchmark(onRound, register) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL('../lib/bench-worker.js', import.meta.url));
    } catch (error) {
      reject(error);
      return;
    }
    register(worker);
    const guard = setTimeout(() => { worker.terminate(); reject(new Error('The benchmark took too long.')); }, ROUNDS * ROUND_MS + 8000);
    worker.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === 'round') onRound(data.round);
      if (data.type === 'done') {
        clearTimeout(guard);
        worker.terminate();
        resolve(data.rates);
      }
    };
    worker.onerror = (event) => {
      clearTimeout(guard);
      worker.terminate();
      reject(new Error(event.message || 'The benchmark failed to start.'));
    };
    worker.postMessage({ rounds: ROUNDS, ms: ROUND_MS });
  });
}

export default function mountPerformance(ctx) {
  let running = false;
  let cancelled = false;
  let worker = null;
  const previous = (ctx.result && ctx.result.data) || null;

  const spinner = h('span', { class: 'perf-spinner', 'aria-hidden': 'true' });
  const values = {
    score: h('span', { class: 'stat-value' }, previous ? previous.score.toLocaleString('en-US') : '—'),
    fps: h('span', { class: 'stat-value' }, previous ? `${previous.fps}` : '—'),
    smooth: h('span', { class: 'stat-value' }, previous ? `${previous.smooth}%` : '—'),
    steady: h('span', { class: 'stat-value' }, previous ? (previous.steady ? 'Steady' : 'Dropped') : '—'),
  };
  const tile = (label, value, unit = '') => h('div', { class: 'stat-tile' }, h('span', { class: 'stat-label' }, label), h('span', { class: 'stat-line' }, value, unit ? h('span', { class: 'stat-unit' }, unit) : null));
  const progress = h('div', { class: 'progress', 'aria-hidden': 'true' }, h('span', { class: 'progress-fill' }));
  const status = statusLine(previous ? `Last run: score ${previous.score.toLocaleString('en-US')}${previous.best && previous.best > previous.score ? `, best ${previous.best.toLocaleString('en-US')}` : ''}.` : 'Takes about 6 seconds. Keep the screen on.');
  const notes = h('div', { class: 'perf-notes' });
  const run = button(previous ? 'Run again' : 'Run performance test', { kind: 'primary', iconName: 'play', wide: true, onClick: begin });

  ctx.body.append(
    h('p', { class: 'panel-lede' }, 'Measures how smoothly Safari draws frames and how fast the processor runs a fixed workload. A sudden drop between runs can point to overheating or a worn battery.'),
    h('div', { class: 'perf-head' }, spinner, progress),
    h('div', { class: 'stat-grid' }, tile('Speed score', values.score), tile('Frame rate', values.fps, 'fps'), tile('On-time frames', values.smooth), tile('Speed over time', values.steady)),
    status,
    notes,
    run,
    h('p', { class: 'fine' }, 'The score is relative. Compare it with your own earlier runs in the same browser, not with other phones. Safari limits web pages to about 60 fps even on 120 Hz ProMotion screens.'),
  );

  function setProgress(fraction) {
    progress.firstChild.style.transform = `scaleX(${fraction})`;
  }

  async function begin() {
    if (running) return;
    running = true;
    cancelled = false;
    run.disabled = true;
    setLabel(run, 'Running…');
    notes.replaceChildren();
    setProgress(0.02);
    status.textContent = 'Measuring frame rate…';
    const frames = await measureFrames(FRAME_MS, spinner, () => cancelled || document.hidden);
    if (!frames) { abort('Stopped because the page was hidden.'); return; }
    values.fps.textContent = String(frames.fps);
    values.smooth.textContent = `${frames.smooth}%`;
    setProgress(0.3);
    status.textContent = 'Testing processor speed…';
    let rates;
    try {
      rates = await runBenchmark((round) => setProgress(0.3 + ((round + 1) / ROUNDS) * 0.7), (instance) => { worker = instance; });
    } catch (error) {
      abort(error.message);
      return;
    }
    worker = null;
    if (cancelled) { abort('Stopped.'); return; }
    const cpu = scoreFromRates(rates);
    values.score.textContent = cpu.score.toLocaleString('en-US');
    values.steady.textContent = cpu.steady ? 'Steady' : `−${Math.round(cpu.drop * 100)}%`;
    setProgress(1);

    const tips = [];
    if (frames.fps && frames.fps < 45) tips.push(`Frame rate is ${frames.fps} fps. Around 30 fps usually means Low Power Mode is on, which halves web animation. Turn it off and run again.`);
    if (!cpu.steady) tips.push('Speed dropped during the test. This can happen when the phone is warm or charging. Let it cool and run again; a repeat drop may point to a worn battery.');
    if (previous && previous.score && cpu.score < previous.score * 0.75) tips.push(`This run is well below your last score (${previous.score.toLocaleString('en-US')}). Close other apps and try again.`);
    notes.replaceChildren(...tips.map((text) => h('p', { class: 'notice notice-warn' }, text)));

    const best = Math.max(cpu.score, (previous && previous.best) || 0);
    status.textContent = tips.length ? 'Done, with notes below.' : 'Done. Everything ran smoothly.';
    ctx.setResult({
      status: 'pass',
      summary: `Score ${cpu.score.toLocaleString('en-US')} · ${frames.fps} fps`,
      data: { score: cpu.score, fps: frames.fps, smooth: frames.smooth, steady: cpu.steady, best },
    });
    running = false;
    run.disabled = false;
    setLabel(run, 'Run again');
  }

  function abort(message) {
    running = false;
    run.disabled = false;
    setLabel(run, 'Run performance test');
    setProgress(0);
    status.textContent = message;
  }

  ctx.onCleanup(() => {
    cancelled = true;
    if (worker) worker.terminate();
    worker = null;
  });
}
