import { h, button } from '../lib/dom.js';

const TARGET = 5;
const COLOURS = ['#2fbf83', '#4aa3ff', '#f5a524', '#ef5da8', '#a78bfa', '#22d3ee', '#f97316', '#84cc16', '#e11d48', '#eab308'];

export default function mountMultitouch(ctx) {
  const start = button('Start multi-touch test', { kind: 'primary', iconName: 'play', wide: true, onClick: run });
  ctx.body.append(
    h('p', { class: 'panel-lede' }, `Place up to ${TARGET} fingers on the screen at the same time. Each one gets its own circle.`),
    h('ol', { class: 'steps' },
      h('li', {}, 'Lay the phone on a table so it doesn’t slip.'),
      h('li', {}, 'Touch with all five fingers of one hand, then slide them around.'),
      h('li', {}, 'Tap Done in the corner to finish.')),
    start,
    ctx.checklist(),
  );

  function run() {
    const layer = ctx.immersive({ className: 'multi-test', blockGestures: true });
    const count = h('span', { class: 'multi-count' }, '0');
    const label = h('span', { class: 'multi-label' }, `Place ${TARGET} fingers on the screen`);
    const best = h('span', { class: 'multi-best' }, `Best so far: 0 of ${TARGET}`);
    const done = h('button', { type: 'button', class: 'multi-done' }, 'Done');
    layer.el.append(h('div', { class: 'multi-counter', 'aria-live': 'polite' }, count, label, best), done);

    const pointers = new Map();
    let max = 0;
    let passed = false;
    done.addEventListener('pointerdown', (event) => event.stopPropagation());
    done.addEventListener('click', (event) => {
      event.stopPropagation();
      layer.close();
    });

    const update = () => {
      const n = pointers.size;
      max = Math.max(max, n);
      count.textContent = String(n);
      if (passed) label.textContent = n ? `${n} ${n === 1 ? 'finger' : 'fingers'}` : `All ${TARGET} detected`;
      else label.textContent = n ? `${n} ${n === 1 ? 'finger' : 'fingers'}` : `Place ${TARGET} fingers on the screen`;
      best.textContent = `Best so far: ${max} of ${TARGET}`;
      if (!passed && max >= TARGET) {
        passed = true;
        layer.el.classList.add('success');
        ctx.setItem('fingers', 'yes', { auto: true, detail: `${max} touches at once` });
      }
    };

    const place = (dot, event) => {
      dot.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
    };

    layer.el.addEventListener('pointerdown', (event) => {
      if (event.target === done) return;
      event.preventDefault();
      const colour = COLOURS[pointers.size % COLOURS.length];
      const dot = h('span', { class: 'touch-dot', style: { '--dot': colour } }, h('span', {}, String(pointers.size + 1)));
      layer.el.append(dot);
      place(dot, event);
      pointers.set(event.pointerId, dot);
      update();
    });
    layer.el.addEventListener('pointermove', (event) => {
      const dot = pointers.get(event.pointerId);
      if (dot) place(dot, event);
    });
    const lift = (event) => {
      const dot = pointers.get(event.pointerId);
      if (!dot) return;
      dot.remove();
      pointers.delete(event.pointerId);
      update();
    };
    layer.el.addEventListener('pointerup', lift);
    layer.el.addEventListener('pointercancel', lift);
    layer.onClose(() => {
      if (!passed && max > 0) ctx.setDetail(`Best: ${max} at once`);
    });
  }
}
