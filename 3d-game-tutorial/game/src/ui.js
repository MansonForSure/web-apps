// ui.js — everything HTML: HUD, toasts, menus. The 3D code never touches the DOM directly.
const $ = (sel) => document.querySelector(sel);
const HEART = '<path d="M12 20.5s-7.6-4.7-9.4-9.3C1.3 7.8 3.4 4.5 6.8 4.5c2.2 0 3.9 1.3 5.2 3 1.3-1.7 3-3 5.2-3 3.4 0 5.5 3.3 4.2 6.7-1.8 4.6-9.4 9.3-9.4 9.3Z"/>';

export function formatTime(t) {
  if (t === undefined || t === null || !Number.isFinite(t)) return '–:––.–';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

export class UI {
  constructor() {
    this.screens = {};
    for (const el of document.querySelectorAll('.screen')) this.screens[el.id.replace('screen-', '')] = el;
    this.hud = $('#hud');
    this.toastEl = $('#toast');
    this.flashEl = $('#flash');
    this.heartsEl = $('#hearts');
    this.coresEl = $('#cores');
    this.coresText = $('#cores-text');
    this.timerEl = $('#timer');
    this.lastHearts = null;
    this.lastTimerText = '';
    this.toastTimer = 0;
    this.current = 'loading';
  }

  /** One click handler for every [data-action] button in the document. */
  // #region bind
  bind(handlers) {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action], [data-quality]');
      if (!btn) return;
      if (btn.dataset.quality) handlers.quality?.(btn.dataset.quality);
      else handlers[btn.dataset.action]?.();
      // Keep keyboard focus from staying on HUD buttons (Space would "click" them again).
      if (btn.closest('#hud')) btn.blur();
    });
  }
  // #endregion

  show(name) {
    for (const [key, el] of Object.entries(this.screens)) el.classList.toggle('open', key === name);
    this.current = name;
    document.body.classList.toggle('playing', name === null);
    if (name) {
      const primary = this.screens[name]?.querySelector('[data-primary]');
      // Focus the main button so Enter / Space works, without scrolling on phones.
      requestAnimationFrame(() => primary?.focus({ preventScroll: true }));
    } else {
      document.activeElement?.blur?.();
    }
  }

  setLoading(k) {
    const pct = Math.round(k * 100);
    $('#load-bar').style.width = `${pct}%`;
    $('#load-text').textContent = `Waking up the robot… ${pct}%`;
  }

  showError(message) {
    if (message) $('#error-text').textContent = message;
    this.show('error');
  }

  setHudVisible(on) {
    this.hud.hidden = !on;
  }

  setLevel(n, name) {
    $('#hud-level').textContent = `Level ${n}`;
    $('#hud-name').textContent = name;
  }

  setHearts(n, max) {
    const prev = this.lastHearts;
    this.lastHearts = n;
    let html = '';
    for (let i = 0; i < max; i++) {
      const cls = i < n ? 'full' : 'empty';
      const lost = prev !== null && i >= n && i < prev ? ' lost' : '';
      html += `<svg viewBox="0 0 24 24" class="${cls}${lost}">${HEART}</svg>`;
    }
    this.heartsEl.innerHTML = html;
    this.heartsEl.setAttribute('aria-label', `${Math.max(0, n)} of ${max} hearts`);
  }

  setCores(n, total, pop = false) {
    this.coresText.textContent = `${n}/${total}`;
    this.coresEl.classList.toggle('all', n === total && total > 0);
    if (pop) {
      this.coresEl.classList.remove('pop');
      void this.coresEl.offsetWidth; // restart the CSS animation
      this.coresEl.classList.add('pop');
    }
  }

  setTimer(t) {
    const text = formatTime(t);
    if (text !== this.lastTimerText) {
      this.timerEl.textContent = text;
      this.lastTimerText = text;
    }
  }

  toast(html, ms = 2000) {
    this.toastEl.innerHTML = html;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  hideToast() {
    clearTimeout(this.toastTimer);
    this.toastEl.classList.remove('show');
  }

  flash(kind) {
    this.flashEl.className = 'flash';
    void this.flashEl.offsetWidth;
    this.flashEl.className = `flash ${kind}`;
  }

  setMuted(muted) {
    $('#mute-btn').setAttribute('aria-pressed', String(muted));
    $('#mute-btn').setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
    for (const el of document.querySelectorAll('.mute-label')) el.textContent = `Sound: ${muted ? 'off' : 'on'}`;
  }

  setQuality(mode, actual) {
    for (const b of document.querySelectorAll('#quality-seg button')) b.classList.toggle('on', b.dataset.quality === mode);
    if (actual) $('#quality-info').textContent = `Rendering: ${actual}${mode === 'auto' ? ' (auto-adjusts to keep it smooth)' : ''}`;
  }

  renderLevelList(levels, save, onPick) {
    const list = $('#level-list');
    list.innerHTML = '';
    levels.forEach((lv, i) => {
      const b = document.createElement('button');
      b.className = 'level-btn';
      const locked = i + 1 > save.unlocked;
      b.disabled = locked;
      const best = save.best[lv.id];
      b.innerHTML = `<span class="n">LEVEL ${i + 1}</span><span class="nm">${lv.name}</span><span class="t">${best !== undefined ? `best ${formatTime(best)}` : locked ? '🔒 locked' : 'not cleared'}</span>`;
      b.addEventListener('click', () => onPick(i));
      list.append(b);
    });
  }

  showComplete(r) {
    $('#complete-eyebrow').textContent = `Level ${r.level} complete`;
    $('#complete-name').textContent = r.name;
    $('#complete-time').textContent = formatTime(r.time);
    $('#complete-best').textContent = formatTime(r.best);
    $('#complete-hearts').textContent = '♥'.repeat(Math.max(0, r.hearts)) || '0';
    $('#complete-record').hidden = !r.record;
    this.show('complete');
  }

  showVictory({ levels, best, total, bestRun }) {
    $('#victory-times').innerHTML = levels
      .map((lv, i) => `<li><span>${i + 1}. ${lv.name}</span><b>${formatTime(best[lv.id])}</b></li>`)
      .join('');
    $('#victory-total').textContent = total !== null
      ? `Full run: ${formatTime(total)} · best run ${formatTime(bestRun)}`
      : 'Play all three levels in a row from Level 1 to record a full-run time.';
    this.show('victory');
  }
}
