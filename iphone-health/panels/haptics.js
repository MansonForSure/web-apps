import { h, button, notice } from '../lib/dom.js';
import { supportsSwitchHaptics } from '../lib/device.js';

export default function mountHaptics(ctx) {
  const probe = document.createElement('input');
  const supported = supportsSwitchHaptics(ctx.device, 'switch' in probe);
  const canVibrate = typeof navigator.vibrate === 'function';
  let flips = 0;

  const input = h('input', { type: 'checkbox', switch: true, id: 'hapticSwitch', class: 'haptic-input', 'aria-describedby': 'hapticCount' });
  const count = h('span', { class: 'flip-count', id: 'hapticCount' }, 'Tap the switch itself');
  input.addEventListener('change', () => {
    flips += 1;
    count.textContent = flips === 1 ? 'Flipped once. Did you feel a tap?' : `Flipped ${flips} times`;
  });

  ctx.body.append(
    h('p', { class: 'panel-lede' }, 'iPhone gives a light tap when you flip a system switch. Hold the phone normally and tap the switch a few times.'),
    h('div', { class: 'haptic-card' }, h('label', { class: 'haptic-title', for: 'hapticSwitch' }, 'Flip me'), input, count),
    supported ? null : notice(ctx.device.isIOS
      ? 'Web haptics need iOS 18 or later. Test the Taptic Engine by flipping Silent mode or pressing the Action button instead.'
      : 'This browser can’t trigger iPhone haptics. Open the page in Safari on your iPhone.', 'warn'),
    canVibrate ? button('Vibrate (Android)', { kind: 'secondary', wide: true, onClick: () => navigator.vibrate([80, 60, 80]) }) : null,
    h('p', { class: 'fine' }, 'Nothing happening? Check that Settings › Sounds & Haptics › System Haptics is on, and try flipping Silent mode, which always buzzes.'),
    ctx.checklist(),
  );
}
