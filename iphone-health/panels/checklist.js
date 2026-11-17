import { h, notice } from '../lib/dom.js';

export default function mountChecklist(ctx) {
  const { test } = ctx;
  if (test.intro) ctx.body.append(h('p', { class: 'panel-lede' }, test.intro));

  if (test.id === 'faceid' && globalThis.PublicKeyCredential && typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
    const slot = h('div');
    ctx.body.append(slot);
    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .then((available) => {
        slot.replaceChildren(notice(available
          ? 'Safari reports that Face ID, Touch ID or your passcode is ready for sign-in. That shows it’s set up, but only unlocking proves the sensor works.'
          : 'Safari reports no Face ID, Touch ID or passcode for sign-in. Check Settings › Face ID & Passcode.', available ? 'info' : 'warn'));
      })
      .catch(() => {});
  }

  ctx.body.append(ctx.checklist());
}
