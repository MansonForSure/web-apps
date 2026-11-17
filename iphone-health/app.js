import { TESTS, GROUPS, getTest, testsInGroup } from './lib/catalog.js';
import { createStore } from './lib/store.js';
import { composeResult, summarize, buildReport, nextTestId, statusOf, STATUS_LABELS } from './lib/report.js';
import { describeDevice } from './lib/device.js';
import { createLayers } from './lib/layers.js';
import { h, icon, button } from './lib/dom.js';
import mountDisplay from './panels/display.js';
import mountTouch from './panels/touch.js';
import mountMultitouch from './panels/multitouch.js';
import mountSpeakers from './panels/speakers.js';
import mountMicrophone from './panels/microphone.js';
import mountCameras from './panels/cameras.js';
import mountMotion from './panels/motion.js';
import mountHaptics from './panels/haptics.js';
import mountLocation from './panels/location.js';
import mountPerformance from './panels/performance.js';
import mountNetwork from './panels/network.js';
import mountBattery from './panels/battery.js';
import mountChecklist from './panels/checklist.js';

const PANELS = {
  display: mountDisplay,
  touch: mountTouch,
  multitouch: mountMultitouch,
  speakers: mountSpeakers,
  microphone: mountMicrophone,
  cameras: mountCameras,
  motion: mountMotion,
  haptics: mountHaptics,
  location: mountLocation,
  performance: mountPerformance,
  network: mountNetwork,
  battery: mountBattery,
};

const $ = (id) => document.getElementById(id);
const els = {
  notices: $('notices'),
  summary: $('summary'),
  device: $('deviceCard'),
  lists: { hardware: $('hardwareList'), settings: $('settingsList') },
  share: $('shareButton'),
  reset: $('resetButton'),
  sheet: $('sheet'),
  sheetPanel: $('sheetPanel'),
  sheetEyebrow: $('sheetEyebrow'),
  sheetTitle: $('sheetTitle'),
  sheetBody: $('sheetBody'),
  sheetFooter: $('sheetFooter'),
  sheetClose: $('sheetClose'),
  immersive: $('immersive'),
  toast: $('toast'),
};

function readEnvironment() {
  const media = (query) => {
    try { return window.matchMedia(query).matches; } catch { return false; }
  };
  return {
    ua: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints || 0,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    dpr: window.devicePixelRatio || 1,
    p3: media('(color-gamut: p3)'),
    hdr: media('(dynamic-range: high)'),
    standalone: navigator.standalone === true || media('(display-mode: standalone)'),
  };
}

const store = createStore();
const device = describeDevice(readEnvironment());
const layers = createLayers(window);
const getResult = (id) => store.get(id);
let current = null;
let lastFocus = null;
let toastTimer = 0;

/* ---------- Main page ---------- */

function ringMarkup(summary) {
  const circumference = 2 * Math.PI * 42;
  let offset = 0;
  const segments = [];
  for (const [key, colour] of [['pass', 'var(--accent)'], ['fail', 'var(--bad)'], ['skip', 'var(--skip)']]) {
    const length = (summary[key] / summary.total) * circumference;
    if (length > 0) {
      segments.push(`<circle cx="50" cy="50" r="42" fill="none" style="stroke:${colour}" stroke-width="9" stroke-dasharray="${length.toFixed(2)} ${(circumference - length).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 50 50)"/>`);
      offset += length;
    }
  }
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" fill="none" style="stroke:var(--track)" stroke-width="9"/>${segments.join('')}</svg>`;
}

function renderSummary() {
  const summary = summarize(TESTS, getResult);
  const ring = h('div', { class: 'ring' });
  ring.innerHTML = ringMarkup(summary);
  ring.append(h('div', { class: 'ring-label' }, h('span', { class: 'ring-count' }, String(summary.done)), h('span', { class: 'ring-total' }, `of ${summary.total}`)));
  const stat = (label, value, tone) => h('div', { class: `stat stat-${tone}` }, h('span', { class: 'stat-number' }, String(value)), h('span', { class: 'stat-name' }, label));
  const next = nextTestId(TESTS, getResult);
  let action;
  if (summary.done === 0 && !summary.partial) action = button('Start checkup', { kind: 'primary', iconName: 'arrow', wide: true, onClick: () => openTest(next || TESTS[0].id) });
  else if (next) action = button('Continue checkup', { kind: 'primary', iconName: 'arrow', wide: true, onClick: () => openTest(next) });
  else action = button('Share report', { kind: 'primary', iconName: 'share', wide: true, onClick: shareReport });
  els.summary.dataset.tone = summary.tone;
  els.summary.replaceChildren(
    h('div', { class: 'summary-top' }, ring, h('div', { class: 'summary-text' },
      h('p', { class: 'summary-headline' }, summary.headline),
      h('p', { class: 'summary-message' }, summary.message))),
    h('div', { class: 'stat-row' },
      stat('Passed', summary.pass, 'pass'),
      stat(summary.fail === 1 ? 'Issue' : 'Issues', summary.fail, 'fail'),
      stat('Skipped', summary.skip, 'skip'),
      stat('To do', summary.total - summary.done, 'none')),
    action,
  );
}

function renderLists() {
  for (const [group, list] of Object.entries(els.lists)) {
    list.replaceChildren(...testsInGroup(group).map((test) => {
      const result = getResult(test.id);
      const status = statusOf(result);
      const row = h('button', { type: 'button', class: `test-row status-${status}`, 'aria-label': `${test.title}: ${STATUS_LABELS[status]}` },
        h('span', { class: 'tile' }, icon(test.icon), status === 'pass' || status === 'fail' ? h('span', { class: 'tile-badge' }, icon(status === 'pass' ? 'check' : 'cross')) : null),
        h('span', { class: 'row-text' }, h('span', { class: 'row-title' }, test.title), h('span', { class: 'row-sub' }, (result && result.summary) || test.blurb)),
        h('span', { class: `pill pill-${status}` }, STATUS_LABELS[status]),
        icon('chevron', 'row-chevron'));
      row.addEventListener('click', () => openTest(test.id));
      return h('li', {}, row);
    }));
  }
}

function renderDevice() {
  const rows = [];
  if (device.model) rows.push(['Model', device.model.label]);
  else rows.push(['Device', device.kindLabel]);
  rows.push(['Software', device.osLabel]);
  rows.push(['Browser', device.browserLabel]);
  rows.push(['Screen', device.screenLabel]);
  rows.push(['Colour', device.colourLabel]);
  if (device.touchPoints) rows.push(['Touch points', `Up to ${device.touchPoints}`]);
  els.device.replaceChildren(
    h('div', { class: 'card-head' }, h('span', { class: 'tile tile-small' }, icon('display')), h('h2', {}, 'This device')),
    h('dl', { class: 'facts' }, rows.flatMap(([label, value]) => [h('dt', {}, label), h('dd', {}, value)])),
    device.model ? h('p', { class: 'fine' }, device.model.note) : null,
  );
}

function renderNotices() {
  const items = [];
  if (device.inApp) {
    const copy = button('Copy link', { kind: 'secondary', iconName: 'copy', onClick: async () => {
      try { await navigator.clipboard.writeText(location.href.split('#')[0]); toast('Link copied. Paste it into Safari.'); } catch { toast('Copy the address from the menu, then open it in Safari.'); }
    } });
    items.push(h('div', { class: 'notice notice-warn' }, icon('info'), h('div', {}, h('p', {}, 'You’re in an in-app browser. Open this page in Safari so the camera, microphone and motion tests can ask for permission.'), copy)));
  } else if (device.kind !== 'iphone') {
    items.push(h('div', { class: 'notice notice-info' }, icon('info'), h('p', {}, `Checkup is made for iPhone. You’re on ${/^[AEIOU]/.test(device.kindLabel) ? 'an' : 'a'} ${device.kindLabel}, so some tests won’t apply. Open this page in Safari on your iPhone for the full checkup.`)));
  }
  if (!store.persistent) items.push(h('div', { class: 'notice notice-info' }, icon('info'), h('p', {}, 'This browser isn’t saving data, so results last only until you close the tab.')));
  els.notices.replaceChildren(...items);
  els.notices.hidden = !items.length;
}

function refresh() {
  renderSummary();
  renderLists();
  if (current) {
    current.updaters.forEach((update) => update());
    renderSheetFooter();
  }
}

/* ---------- Sheet ---------- */

function teardownPanel() {
  if (!current) return;
  const { cleanups } = current;
  while (cleanups.length) {
    const fn = cleanups.pop();
    try { fn(); } catch (error) { console.error(error); }
  }
  current.updaters.clear();
}

function buildChecklist(ctx, panel) {
  const { test } = ctx;
  const rows = (test.items || []).map((item) => {
    const choices = [['yes', 'OK', 'check'], ['no', 'Issue', 'cross']];
    if (item.na) choices.push(['na', 'N/A', null]);
    const buttons = choices.map(([value, label, iconName]) => {
      const el = h('button', { type: 'button', class: `choice choice-${value}`, 'aria-pressed': 'false', 'data-value': value }, iconName ? icon(iconName) : null, label);
      el.addEventListener('click', () => {
        const answer = ctx.result && ctx.result.items ? ctx.result.items[item.id] : null;
        ctx.setItem(item.id, answer === value ? null : value);
      });
      return el;
    });
    const badge = h('span', { class: 'auto-badge', hidden: true }, 'Detected');
    const row = h('div', { class: 'check-row', role: 'listitem' },
      h('div', { class: 'check-text' }, h('p', { class: 'check-label' }, item.label, badge), item.hint ? h('p', { class: 'check-hint' }, item.hint) : null),
      h('div', { class: 'choices', role: 'group', 'aria-label': item.label }, buttons));
    return { item, row, buttons, badge };
  });
  const update = () => {
    const result = ctx.result || {};
    const answers = result.items || {};
    const auto = result.auto || {};
    for (const entry of rows) {
      const value = answers[entry.item.id] || '';
      entry.row.dataset.state = value;
      entry.buttons.forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.value === value)));
      entry.badge.hidden = !auto[entry.item.id];
    }
  };
  update();
  panel.updaters.add(update);
  return h('section', { class: 'checklist-wrap', 'aria-label': 'Your results' },
    h('h3', { class: 'section-label' }, rows.length > 1 ? 'What did you find?' : 'Result'),
    h('div', { class: 'checklist', role: 'list' }, rows.map((entry) => entry.row)));
}

function openImmersive({ className = '', blockGestures = false } = {}, panel) {
  const el = els.immersive;
  el.className = `immersive ${className}`.trim();
  el.replaceChildren();
  el.removeAttribute('style');
  el.hidden = false;
  document.documentElement.classList.add('immersive-open');
  clearTimeout(toastTimer);
  els.toast.classList.remove('show');
  els.toast.hidden = true;
  const meta = h('meta', { name: 'theme-color', content: '#000000' });
  document.head.prepend(meta);
  const closeHandlers = [];
  const keyHandlers = [];
  const onKey = (event) => keyHandlers.forEach((fn) => fn(event));
  document.addEventListener('keydown', onKey);
  // Stop Safari from scrolling, zooming or running three-finger edit gestures mid-test.
  const stopMove = (event) => { if (event.cancelable) event.preventDefault(); };
  const stopStart = (event) => {
    if (event.cancelable && !(event.target instanceof Element && event.target.closest('button'))) event.preventDefault();
  };
  el.addEventListener('touchmove', stopMove, { passive: false });
  if (blockGestures) el.addEventListener('touchstart', stopStart, { passive: false });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    el.removeEventListener('touchmove', stopMove);
    el.removeEventListener('touchstart', stopStart);
    el.hidden = true;
    el.replaceChildren();
    el.className = 'immersive';
    el.removeAttribute('style');
    meta.remove();
    document.documentElement.classList.remove('immersive-open');
    document.documentElement.style.removeProperty('background');
    closeHandlers.splice(0).forEach((fn) => { try { fn(); } catch (error) { console.error(error); } });
  };
  const layer = layers.push(close);
  panel.cleanups.push(() => { if (!closed) layers.dismiss(layer); });
  return {
    el,
    close: () => layers.pop(layer),
    onClose: (fn) => closeHandlers.push(fn),
    onKey: (fn) => keyHandlers.push(fn),
    setColor(colour) {
      el.style.background = colour;
      meta.setAttribute('content', colour);
      document.documentElement.style.background = colour;
    },
  };
}

function createContext(test) {
  const panel = current;
  const save = (next) => {
    if (!next || (!next.status && !next.detail && !next.data && !next.inputs)) store.set(test.id, null);
    else store.set(test.id, { ...next, updatedAt: Date.now() });
    refresh();
  };
  const ctx = {
    test,
    device,
    body: {
      append: (...nodes) => els.sheetBody.append(...nodes.flat(Infinity).filter((node) => node !== null && node !== undefined && node !== false)),
    },
    get result() { return store.get(test.id); },
    setItem(itemId, value, { auto = false, detail } = {}) {
      const previous = store.get(test.id) || {};
      const items = { ...(previous.items || {}) };
      const autoMap = { ...(previous.auto || {}) };
      if (value === null || value === undefined) { delete items[itemId]; delete autoMap[itemId]; }
      else { items[itemId] = value; if (auto) autoMap[itemId] = true; else delete autoMap[itemId]; }
      save(composeResult(test, previous, { items, auto: autoMap, detail: detail === undefined ? previous.detail : detail }));
    },
    setDetail(detail) {
      const previous = store.get(test.id) || {};
      save(composeResult(test, previous, { detail }));
    },
    setResult(result) {
      save(result ? { ...result } : null);
    },
    checklist: () => buildChecklist(ctx, panel),
    immersive: (options) => openImmersive(options, panel),
    toast,
    onCleanup(fn) { panel.cleanups.push(fn); },
    onHidden(fn) {
      const onVisibility = () => { if (document.visibilityState === 'hidden') fn(); };
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('pagehide', fn);
      panel.cleanups.push(() => {
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pagehide', fn);
      });
    },
  };
  return ctx;
}

function renderSheetFooter() {
  if (!current) return;
  if (!current.test) {
    els.sheetFooter.replaceChildren(button('Done', { kind: 'primary', wide: true, 'data-close': true }));
    return;
  }
  const { test } = current;
  const result = getResult(test.id);
  const nextId = nextTestId(TESTS, getResult, test.id);
  const nextTest = nextId ? getTest(nextId) : null;
  if (current.clearSlot) {
    if (result) {
      const clear = h('button', { type: 'button', class: 'text-button' }, icon('reset'), 'Clear this result');
      clear.addEventListener('click', () => { store.set(test.id, null); openTest(test.id, { keepScroll: true }); toast(`${test.title} result cleared.`); });
      current.clearSlot.replaceChildren(clear);
    } else {
      current.clearSlot.replaceChildren();
    }
  }
  const next = nextTest
    ? button(`Next: ${nextTest.title}`, { kind: 'primary', iconName: 'arrow', wide: true, onClick: () => openTest(nextTest.id) })
    : button('Back to summary', { kind: 'primary', wide: true, 'data-close': true });
  if (nextTest) next.classList.add('icon-end');
  els.sheetFooter.replaceChildren(next);
}

function showSheet() {
  lastFocus = document.activeElement;
  els.sheet.hidden = false;
  document.documentElement.classList.add('locked');
  requestAnimationFrame(() => requestAnimationFrame(() => els.sheet.classList.add('open')));
  setTimeout(() => els.sheetClose.focus({ preventScroll: true }), 60);
}

function hideSheet() {
  teardownPanel();
  current = null;
  els.sheet.classList.remove('open');
  document.documentElement.classList.remove('locked');
  setTimeout(() => {
    if (!els.sheet.classList.contains('open')) {
      els.sheet.hidden = true;
      els.sheetBody.replaceChildren();
    }
  }, 320);
  refresh();
  if (lastFocus && typeof lastFocus.focus === 'function' && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
}

function openSheet({ test = null, eyebrow, title, mount, keepScroll = false }) {
  const wasOpen = Boolean(current);
  const scroll = els.sheetBody.scrollTop;
  teardownPanel();
  current = { test, cleanups: [], updaters: new Set() };
  els.sheetEyebrow.textContent = eyebrow;
  els.sheetTitle.textContent = title;
  els.sheetBody.replaceChildren();
  try {
    mount(current);
  } catch (error) {
    console.error(error);
    els.sheetBody.append(h('p', { class: 'notice notice-bad' }, `This test couldn’t start: ${error.message}`));
  }
  if (test) {
    current.clearSlot = h('div', { class: 'clear-slot' });
    els.sheetBody.append(current.clearSlot);
  }
  renderSheetFooter();
  els.sheetBody.scrollTop = keepScroll ? scroll : 0;
  if (!wasOpen) {
    showSheet();
    layers.push(hideSheet);
  }
}

function openTest(id, { keepScroll = false } = {}) {
  const test = getTest(id);
  if (!test) return;
  const groupTests = testsInGroup(test.group);
  const position = groupTests.indexOf(test) + 1;
  openSheet({
    test,
    keepScroll,
    eyebrow: test.group === 'hardware' ? `Hardware test ${position} of ${groupTests.length}` : `Check on your iPhone · ${position} of ${groupTests.length}`,
    title: test.title,
    mount: () => {
      const ctx = createContext(test);
      (PANELS[test.id] || mountChecklist)(ctx);
    },
  });
}

/* ---------- Report ---------- */

function reportText() {
  return buildReport({ tests: TESTS, groups: GROUPS, getResult, device, date: new Date(), url: location.href.split('#')[0].split('?')[0] });
}

function showReport(text) {
  openSheet({
    eyebrow: 'Report',
    title: 'Your health report',
    mount: () => {
      const area = h('textarea', { class: 'report-text', readonly: true, rows: '16', 'aria-label': 'Report text' });
      area.value = text;
      const copy = button('Copy report', { kind: 'secondary', iconName: 'copy', wide: true, onClick: async () => {
        try { await navigator.clipboard.writeText(text); toast('Report copied.'); } catch { area.focus(); area.select(); toast('Select the text and copy it.'); }
      } });
      els.sheetBody.append(h('p', { class: 'panel-lede' }, 'Copy this summary to send it to a repair shop, a buyer or yourself.'), area, copy);
    },
  });
}

async function shareReport() {
  const text = reportText();
  if (navigator.share) {
    try {
      await navigator.share({ title: 'iPhone health report', text });
      return;
    } catch (error) {
      if (error && error.name === 'AbortError') return;
    }
  }
  showReport(text);
}

/* ---------- Toast ---------- */

function toast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  requestAnimationFrame(() => els.toast.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove('show');
    setTimeout(() => { if (!els.toast.classList.contains('show')) els.toast.hidden = true; }, 300);
  }, 2800);
}

/* ---------- Start ---------- */

function init() {
  if (window.history.state && window.history.state.checkupLayer) {
    try { window.history.replaceState(null, ''); } catch { /* ignore */ }
  }
  renderNotices();
  renderDevice();
  refresh();
  els.share.addEventListener('click', shareReport);
  els.reset.addEventListener('click', () => {
    if (window.confirm('Clear all Checkup results saved on this device?')) {
      store.clear();
      refresh();
      toast('All results cleared.');
    }
  });
  els.sheet.addEventListener('click', (event) => {
    if (event.target.closest('[data-close]')) layers.pop();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && layers.depth) layers.pop();
  });
  const match = window.location.hash.match(/^#([a-z]+)$/);
  if (match && getTest(match[1])) openTest(match[1]);
  window.addEventListener('hashchange', () => {
    const next = window.location.hash.match(/^#([a-z]+)$/);
    if (next && getTest(next[1]) && !layers.depth) openTest(next[1]);
  });
  document.documentElement.classList.add('ready');
}

init();
