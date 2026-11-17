import { h, icon, button } from '../lib/dom.js';

const SCREENS = [
  { name: 'White', color: '#ffffff', tip: 'Look for dark specks, a yellow or pink tint, or patches.' },
  { name: 'Black', color: '#000000', tip: 'Look for dots that stay lit.' },
  { name: 'Red', color: '#ff0000', tip: 'Look for any dot that isn’t red.' },
  { name: 'Green', color: '#00ff00', tip: 'Look for any dot that isn’t green.' },
  { name: 'Blue', color: '#0000ff', tip: 'Look for any dot that isn’t blue.' },
  { name: 'Grey', color: '#7f7f7f', tip: 'Look for faint shapes burned into the screen.' },
  { name: 'Dark grey', color: '#1e1e1e', tip: 'Look for blotches, bands, or a green or pink tint.' },
  { name: 'Gradients', color: '#000000', gradient: true, tip: 'Each bar should fade smoothly, without stripes.' },
];

export default function mountDisplay(ctx) {
  const start = button('Start colour test', { kind: 'primary', iconName: 'play', wide: true, onClick: run });

  ctx.body.append(
    h('p', { class: 'panel-lede' }, 'Your screen fills with a series of solid colours. Tap anywhere to move to the next one.'),
    h('ol', { class: 'steps' },
      h('li', {}, 'Turn brightness all the way up.'),
      h('li', {}, 'Wipe the screen so smudges don’t fool you.'),
      h('li', {}, 'Look closely, especially near the edges and corners.')),
    h('div', { class: 'swatches', 'aria-hidden': 'true' }, SCREENS.map((screen) => h('span', { class: screen.gradient ? 'swatch swatch-gradient' : 'swatch', style: screen.gradient ? {} : { background: screen.color } }))),
    start,
    h('p', { class: 'fine' }, 'Tip: add Checkup to your Home Screen for a truly edge-to-edge view without Safari’s toolbars.'),
    ctx.checklist(),
  );

  function run() {
    const layer = ctx.immersive({ className: 'colour-test' });
    let index = -1;
    let hintTimer = 0;
    const hint = h('div', { class: 'immersive-hint' });
    const exit = h('button', { type: 'button', class: 'immersive-exit', 'aria-label': 'Exit colour test' }, icon('close'));
    exit.addEventListener('click', (event) => {
      event.stopPropagation();
      layer.close();
    });
    layer.el.append(hint, exit);

    const showHint = () => {
      layer.el.classList.add('show-hint');
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => layer.el.classList.remove('show-hint'), 2600);
    };

    const next = () => {
      index += 1;
      if (index >= SCREENS.length) {
        layer.close();
        ctx.toast('Colour test finished. Record what you saw below.');
        return;
      }
      const screen = SCREENS[index];
      layer.setColor(screen.color);
      layer.el.classList.toggle('gradients', Boolean(screen.gradient));
      hint.replaceChildren(
        h('strong', {}, `${index + 1} of ${SCREENS.length} · ${screen.name}`),
        h('span', {}, screen.tip),
        h('span', { class: 'hint-small' }, index === SCREENS.length - 1 ? 'Tap to finish' : 'Tap for the next colour'),
      );
      showHint();
    };

    layer.el.addEventListener('click', next);
    layer.onKey((event) => {
      if (event.key === ' ' || event.key === 'ArrowRight' || event.key === 'Enter') next();
    });
    layer.onClose(() => clearTimeout(hintTimer));
    next();
  }
}
