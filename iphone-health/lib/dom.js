// Small DOM helpers and the app's inline line icons.

const ICONS = {
  display: '<rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M10.5 5.2h3"/><path d="M9 10h6M9 13.5h6M9 17h3.5"/>',
  touch: '<path d="M9.5 12V5.6a1.6 1.6 0 0 1 3.2 0V11"/><path d="M12.7 10.2a1.6 1.6 0 0 1 3.2 0V12"/><path d="M15.9 11.2a1.6 1.6 0 0 1 3.1.4v3.2a6.6 6.6 0 0 1-6.6 6.6h-.5a5.6 5.6 0 0 1-4.5-2.3L5 15.9a1.6 1.6 0 0 1 2.5-2l2 2.1"/>',
  multitouch: '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><circle cx="12" cy="16.5" r="3"/>',
  speaker: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
  camera: '<path d="M4 8h3l1.6-2.2h6.8L17 8h3v11H4z"/><circle cx="12" cy="13.2" r="3.4"/>',
  motion: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  haptics: '<rect x="8" y="4" width="8" height="16" rx="2.2"/><path d="M4.8 8.5v7M2.5 10.5v3M19.2 8.5v7M21.5 10.5v3"/>',
  location: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  performance: '<path d="M4.4 17.5a8.5 8.5 0 1 1 15.2 0"/><path d="m12 13.5 3.6-4.2"/><circle cx="12" cy="13.6" r="1.1"/>',
  network: '<path d="M3 9.5a13 13 0 0 1 18 0M6 12.8a8.5 8.5 0 0 1 12 0M9 16a4 4 0 0 1 6 0"/><circle cx="12" cy="19" r=".9"/>',
  battery: '<rect x="2.5" y="7" width="17" height="10" rx="2.6"/><path d="M22 10.5v3"/><path d="M6 10v4M9.5 10v4M13 10v4"/>',
  buttons: '<rect x="7" y="2.5" width="10" height="19" rx="2.6"/><path d="M4.3 6.5v3M4.3 11.5v3M19.7 7.5v5"/>',
  faceid: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9.5v1M15 9.5v1M12 9.5V13h-1M9.5 15.8a3.6 3.6 0 0 0 5 0"/>',
  charging: '<path d="M13 2.5 5.5 13.5H12l-1 8 7.5-11H12z"/>',
  calls: '<path d="M6.6 3.5h2.6l1.4 4-2 1.3a11 11 0 0 0 6.6 6.6l1.3-2 4 1.4v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z"/>',
  wireless: '<path d="M12 12.5V21M8.5 21h7"/><circle cx="12" cy="10" r="1.6"/><path d="M8.3 6.3a5.3 5.3 0 0 0 0 7.4M15.7 6.3a5.3 5.3 0 0 1 0 7.4M5.5 3.5a9.3 9.3 0 0 0 0 13M18.5 3.5a9.3 9.3 0 0 1 0 13"/>',
  service: '<path d="M12 3 5 6v5.5c0 4.4 3 8 7 9.5 4-1.5 7-5.1 7-9.5V6z"/><path d="m9 12 2 2 4-4"/>',
  software: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4.5V9h-4.5"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  chevron: '<path d="m9.5 6 6 6-6 6"/>',
  check: '<path d="m5.5 12.5 4 4 9-9"/>',
  cross: '<path d="M7 7l10 10M17 7 7 17"/>',
  share: '<path d="M12 3.5v11M8 7.5l4-4 4 4"/><path d="M6.5 11H5.5v9h13v-9h-1"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
  flash: '<path d="M8 3h8l-1.5 5h-5z"/><path d="M9.5 8h5v11.5a1.5 1.5 0 0 1-1.5 1.5h-2a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M12 12v2.5"/>',
  record: '<circle cx="12" cy="12" r="6.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4.5V9h4.5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.7v.1"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
};

export function icon(name, className = '') {
  const span = document.createElement('span');
  span.className = `icon ${className}`.trim();
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">${ICONS[name] || ''}</svg>`;
  return span;
}

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'style' && typeof value === 'object') {
      for (const [prop, propValue] of Object.entries(value)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, propValue);
        else el.style[prop] = propValue;
      }
    }
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function button(label, { kind = 'secondary', iconName = null, wide = false, onClick = null, ...rest } = {}) {
  const el = h('button', { type: 'button', class: `button ${kind}${wide ? ' wide' : ''}`, ...rest }, iconName ? icon(iconName) : null, h('span', { class: 'button-label' }, label));
  if (onClick) el.addEventListener('click', onClick);
  return el;
}

export function setLabel(buttonEl, label) {
  const target = buttonEl.querySelector('.button-label');
  if (target) target.textContent = label;
  else buttonEl.textContent = label;
}

export function setIcon(buttonEl, name) {
  const current = buttonEl.querySelector('.icon');
  if (current) current.replaceWith(icon(name));
}

export function statusLine(text = '') {
  return h('p', { class: 'status-line', role: 'status', 'aria-live': 'polite' }, text);
}

export function notice(text, tone = 'info') {
  return h('div', { class: `notice notice-${tone}` }, icon(tone === 'bad' ? 'info' : 'info'), h('p', {}, text));
}

export function explainMediaError(error, kind = 'camera') {
  const name = (error && error.name) || '';
  const Kind = kind.charAt(0).toUpperCase() + kind.slice(1);
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return `${Kind} access is blocked. In Safari, open the page menu beside the address bar, choose Website Settings and set ${Kind} to Allow. Then try again.`;
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') {
    return `No ${kind} was found. If you know your iPhone has one, it may need service.`;
  }
  if (name === 'NotReadableError' || name === 'AbortError' || name === 'TrackStartError') {
    return `The ${kind} is busy or didn’t start. Close other apps or calls that use it, then try again. If it keeps failing, restart your iPhone.`;
  }
  return (error && error.message) || `The ${kind} couldn’t start.`;
}
