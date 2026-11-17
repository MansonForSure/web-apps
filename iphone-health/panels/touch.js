import { h, button } from '../lib/dom.js';
import { CoverageGrid } from '../lib/grid.js';

export default function mountTouch(ctx) {
  const map = h('canvas', { class: 'coverage-map', width: 120, height: 240, 'aria-hidden': 'true' });
  const mapCaption = h('p', { class: 'map-caption' });
  const lastRun = h('div', { class: 'result-card coverage-result', hidden: true }, map, h('div', {}, h('p', { class: 'result-title' }, 'Last run'), mapCaption));
  const start = button('Start touch test', { kind: 'primary', iconName: 'play', wide: true, onClick: run });

  ctx.body.append(
    h('p', { class: 'panel-lede' }, 'The screen turns into a grid of squares. Drag one finger until every square lights up. A square that won’t light up points to a dead zone.'),
    h('ol', { class: 'steps' },
      h('li', {}, 'Cover the edges and corners too.'),
      h('li', {}, 'Drag straight across the Finish button; it won’t stop you.'),
      h('li', {}, 'Tap Finish when you’re done. It also ends on its own at 100%.')),
    start,
    lastRun,
    ctx.checklist(),
  );

  function drawMap(grid) {
    const g = map.getContext('2d');
    const ratio = grid.width / grid.height;
    map.width = 120;
    map.height = Math.round(120 / ratio);
    const sx = map.width / grid.width;
    const sy = map.height / grid.height;
    g.clearRect(0, 0, map.width, map.height);
    for (let i = 0; i < grid.total; i += 1) {
      const r = grid.cellRect(i);
      g.fillStyle = grid.cells[i] ? '#2fbf83' : '#e5483b';
      g.fillRect(r.x * sx + 0.5, r.y * sy + 0.5, Math.max(1, r.w * sx - 1), Math.max(1, r.h * sy - 1));
    }
  }

  function run() {
    const layer = ctx.immersive({ className: 'touch-test', blockGestures: true });
    const canvas = h('canvas', { class: 'touch-canvas', 'aria-label': 'Touch test grid' });
    const pct = h('span', { class: 'touch-pct' }, '0%');
    const finish = h('button', { type: 'button', class: 'touch-finish' }, pct, h('span', {}, 'Finish'));
    const intro = h('p', { class: 'touch-intro' }, 'Paint every square');
    layer.el.append(canvas, intro, finish);

    const rect = layer.el.getBoundingClientRect();
    const width = rect.width || window.innerWidth;
    const height = rect.height || window.innerHeight;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const g = canvas.getContext('2d');
    g.scale(dpr, dpr);
    const grid = new CoverageGrid(width, height, 42);
    let done = false;

    g.fillStyle = '#0b0e0d';
    g.fillRect(0, 0, width, height);
    g.strokeStyle = 'rgba(255,255,255,0.14)';
    g.lineWidth = 1;
    for (let i = 0; i < grid.total; i += 1) {
      const r = grid.cellRect(i);
      g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    }

    const paint = (cells) => {
      if (!cells.length) return;
      g.fillStyle = '#2fbf83';
      for (const index of cells) {
        const r = grid.cellRect(index);
        g.fillRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3);
      }
      pct.textContent = `${Math.floor(grid.coverage * 100)}%`;
      intro.classList.add('hidden');
      if (grid.complete) end(true);
    };

    const last = new Map();
    const point = (event) => [event.clientX - rect.left, event.clientY - rect.top];
    canvas.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      try { canvas.setPointerCapture(event.pointerId); } catch { /* not supported */ }
      const [x, y] = point(event);
      last.set(event.pointerId, [x, y]);
      paint(grid.markSegment(x, y, x, y));
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!last.has(event.pointerId)) return;
      const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
      for (const item of events.length ? events : [event]) {
        const [x0, y0] = last.get(event.pointerId);
        const [x1, y1] = point(item);
        paint(grid.markSegment(x0, y0, x1, y1));
        last.set(event.pointerId, [x1, y1]);
      }
    });
    const release = (event) => last.delete(event.pointerId);
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    finish.addEventListener('click', () => end(false));

    function end(complete) {
      if (done) return;
      done = true;
      const percent = Math.floor(grid.coverage * 100);
      const missed = grid.total - grid.filled;
      drawMap(grid);
      lastRun.hidden = false;
      if (complete) {
        mapCaption.textContent = `All ${grid.total} squares responded.`;
        ctx.setItem('coverage', 'yes', { auto: true, detail: '100% responded' });
        layer.el.classList.add('success');
        intro.textContent = 'Every square responded';
        intro.classList.remove('hidden');
        setTimeout(() => layer.close(), 900);
      } else {
        mapCaption.textContent = missed
          ? `${missed} of ${grid.total} squares (red) weren’t painted. If you tried them and they didn’t respond, mark an issue below. Squares hidden behind Safari’s toolbar can’t be reached; open Checkup from your Home Screen to test those.`
          : `All ${grid.total} squares responded.`;
        if (percent > 0) ctx.setDetail(`${percent}% painted`);
        layer.close();
      }
    }
  }
}
