// Duet Chess — app controller.
import { Board, pieceUrl } from './board.js';
import { extractToken, normalizeCode, randomCode, randomId } from './codec.js';
import { ManualGuest, ManualHost, OnlineGuest, OnlineHost, describeRoute } from './net.js';
import {
  PROTOCOL_VERSION,
  applyUci,
  capturedPieces,
  colorFor,
  describeOutcome,
  mergeGames,
  newGame,
  other,
  outcome,
  rematchOf,
  replay,
  sameGame,
  sanitizeGame,
} from './protocol.js';
import { Scanner, renderQr } from './qr.js';

const $ = (id) => document.getElementById(id);
const BASE = location.origin + location.pathname;
const STORE_KEY = 'duet-chess:v1';
const SIGNAL_CHANNEL = 'duet-chess-signal';
const colorName = (c) => (c === 'w' ? 'White' : 'Black');
const formatCode = (code) => (code ? `${code.slice(0, 3)} ${code.slice(3)}` : '');

// ---------------------------------------------------------------- storage
function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch {
    return {};
  }
}
function writeStore(data) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    // Private mode or storage disabled: the game still works, just not resumable.
  }
}
function updateStore(patch) {
  writeStore({ ...readStore(), ...patch });
}
function tabClientId() {
  // Per tab, so two tabs in one browser can play each other while testing.
  try {
    let id = sessionStorage.getItem('duet-chess:client');
    if (!id) {
      id = randomId('c');
      sessionStorage.setItem('duet-chess:client', id);
    }
    return id;
  } catch {
    return randomId('c');
  }
}

const prefs = readStore();
const S = {
  mode: null, // 'online' | 'local'
  role: null, // 'host' | 'guest'
  code: null,
  strictLocal: false,
  client: tabClientId(),
  game: null,
  chess: null,
  transport: null,
  link: null,
  connected: false,
  everConnected: false,
  lastSeen: 0,
  rtt: null,
  route: null,
  guestClient: null,
  offerIn: null, // 'draw' | 'rematch' offered by the opponent
  offerOut: null, // offer we sent
  bannerDismissed: false,
  stopped: null, // reason text when the session can no longer reconnect
  color: ['w', 'b', 'r'].includes(prefs.color) ? prefs.color : 'w',
  sound: prefs.sound !== false,
  inviteUrl: '',
  replyUrl: '',
  connectTimer: 0,
  signal: null,
};

function sessionKey(mode = S.mode, role = S.role, code = S.code) {
  return mode === 'online' ? `online:${role}:${code}` : `local:${role}`;
}
function saveSession() {
  if (!S.game || !S.mode) return;
  const data = readStore();
  data.sessions = data.sessions || {};
  const key = sessionKey();
  data.sessions[key] = {
    mode: S.mode,
    role: S.role,
    code: S.code,
    strictLocal: S.strictLocal,
    game: S.game,
    guestClient: S.guestClient,
    updated: Date.now(),
  };
  data.last = key;
  const keys = Object.keys(data.sessions).sort((a, b) => data.sessions[b].updated - data.sessions[a].updated);
  for (const old of keys.slice(6)) delete data.sessions[old];
  writeStore(data);
}
function loadSession(key) {
  const saved = readStore().sessions?.[key];
  if (!saved) return null;
  const game = sanitizeGame(saved.game);
  return game ? { ...saved, game } : null;
}
function dropSession(key = sessionKey()) {
  const data = readStore();
  if (data.sessions) delete data.sessions[key];
  if (data.last === key) delete data.last;
  writeStore(data);
}

// ---------------------------------------------------------------- ui helpers
function show(screen) {
  for (const id of ['lobby', 'pair', 'game']) $(id).hidden = id !== screen;
  document.body.dataset.screen = screen;
  window.scrollTo(0, 0);
}
function showPanel(id) {
  for (const el of document.querySelectorAll('#pair .panel')) el.hidden = el.id !== id;
  const back = $('pair-back');
  const canReturn = S.game && (S.everConnected || S.game.moves.length > 0) && id !== 'pair-relay';
  back.textContent = canReturn ? '← Back to game' : '← Back';
  show('pair');
}

let toastTimer = 0;
function toast(text, ms = 2400) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('on'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('on');
    toastTimer = setTimeout(() => (el.hidden = true), 250);
  }, ms);
}

function setStatusLine(id, state, text) {
  const el = $(id);
  el.hidden = false;
  el.dataset.state = state;
  const icon = { ok: '<i class="ok">✓</i>', error: '<i class="bad">!</i>', warn: '<i class="bad">!</i>' }[state] || '<i class="spin"></i>';
  el.innerHTML = `${icon}<span></span>`;
  el.querySelector('span').textContent = text;
}

async function copyText(text, done = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    try {
      document.execCommand('copy');
    } catch {
      // ignore
    }
    area.remove();
  }
  toast(done);
}

async function shareLink(url, text) {
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Duet Chess', text, url });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  copyText(url, 'Link copied');
}

// Two-tap confirmation for destructive buttons.
function confirmTap(button, label, action) {
  if (button.dataset.armed === '1') {
    button.dataset.armed = '';
    button.textContent = button.dataset.label;
    action();
    return;
  }
  button.dataset.label = button.textContent;
  button.dataset.armed = '1';
  button.textContent = label;
  setTimeout(() => {
    if (button.dataset.armed === '1') {
      button.dataset.armed = '';
      button.textContent = button.dataset.label;
    }
  }, 3000);
}

// ---------------------------------------------------------------- sound
let audio = null;
function unlockAudio() {
  if (!audio) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audio = new Ctx();
  }
  if (audio.state === 'suspended') audio.resume().catch(() => {});
}
function tone(freq, start, dur, gain, type = 'sine') {
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  amp.gain.setValueAtTime(gain, start);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(amp).connect(audio.destination);
  osc.start(start);
  osc.stop(start + dur + 0.03);
}
function knock(start, gain, freq) {
  const length = Math.floor(audio.sampleRate * 0.05);
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  const src = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const amp = audio.createGain();
  src.buffer = buffer;
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 1.2;
  amp.gain.value = gain;
  src.connect(filter).connect(amp).connect(audio.destination);
  src.start(start);
}
function playSound(kind) {
  if (!S.sound || !audio || audio.state !== 'running') return;
  const t = audio.currentTime + 0.01;
  if (kind === 'move') {
    knock(t, 0.9, 1500);
    tone(190, t, 0.07, 0.12);
  } else if (kind === 'capture') {
    knock(t, 1.2, 900);
    knock(t + 0.045, 0.6, 1300);
    tone(150, t, 0.09, 0.14);
  } else if (kind === 'check') {
    knock(t, 0.8, 1500);
    tone(880, t + 0.02, 0.12, 0.08, 'triangle');
    tone(660, t + 0.13, 0.16, 0.08, 'triangle');
  } else if (kind === 'notify') {
    tone(660, t, 0.12, 0.06, 'triangle');
    tone(990, t + 0.1, 0.16, 0.06, 'triangle');
  } else if (kind === 'end') {
    [523.25, 659.25, 783.99].forEach((f, i) => tone(f, t + i * 0.09, 0.5, 0.06, 'triangle'));
  }
}
function moveSound(move) {
  if (S.chess.isGameOver() || outcome(S.game, S.chess)) return playSound('end');
  if (S.chess.inCheck()) return playSound('check');
  playSound(move.captured ? 'capture' : 'move');
}
function renderSound() {
  const btn = $('sound-toggle');
  btn.setAttribute('aria-pressed', String(S.sound));
  btn.setAttribute('aria-label', S.sound ? 'Sound on' : 'Sound off');
  btn.classList.toggle('off', !S.sound);
}

// ---------------------------------------------------------------- game state
const board = new Board($('board'), { onMove: onBoardMove });

function myColor() {
  return S.game ? colorFor(S.role, S.game) : 'w';
}
function setGame(game) {
  S.game = game;
  S.chess = game ? replay(game) : null;
  if (game && !S.chess) {
    // Should not happen: games are validated before use.
    S.game = { ...game, moves: [], end: null };
    S.chess = replay(S.game);
  }
}
function currentOutcome() {
  return S.game && S.chess ? outcome(S.game, S.chess) : null;
}
function canMove() {
  return Boolean(S.game && S.chess && !currentOutcome() && S.chess.turn() === myColor());
}
function movePairs(move, dragged = false) {
  const pairs = dragged ? [] : [{ from: move.from, to: move.to }];
  const rank = move.from[1];
  if (move.flags.includes('k')) pairs.push({ from: `h${rank}`, to: `f${rank}` });
  if (move.flags.includes('q')) pairs.push({ from: `a${rank}`, to: `d${rank}` });
  return pairs;
}

function onBoardMove(from, to, moves, dragged) {
  unlockAudio();
  if (moves.some((m) => m.promotion)) askPromotion(from, to);
  else commitMove(from, to, '', dragged);
}

function commitMove(from, to, promotion, dragged) {
  if (!canMove()) return render();
  const uci = from + to + (promotion || '');
  const move = applyUci(S.chess, uci);
  if (!move) return render();
  S.game.moves.push(uci);
  S.offerIn = null;
  S.offerOut = null;
  saveSession();
  render({ animate: movePairs(move, dragged) });
  moveSound(move);
  send({ t: 'move', id: S.game.id, n: S.game.moves.length - 1, uci });
}

function askPromotion(from, to) {
  const color = myColor();
  const opts = $('promo-opts');
  opts.textContent = '';
  for (const type of ['q', 'r', 'b', 'n']) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.piece = type;
    const name = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[type];
    button.innerHTML = `<img src="${pieceUrl(color, type)}" alt="${name}" />`;
    button.addEventListener('click', () => {
      $('promo').hidden = true;
      commitMove(from, to, type, false);
    });
    opts.append(button);
  }
  $('promo').hidden = false;
}

function handleRemoteMove(msg) {
  if (!S.game || msg.id !== S.game.id || !Number.isInteger(msg.n)) return send({ t: 'sync' });
  if (msg.n < S.game.moves.length) {
    if (S.game.moves[msg.n] !== msg.uci) send({ t: 'sync' });
    return;
  }
  if (msg.n > S.game.moves.length || currentOutcome() || S.chess.turn() === myColor()) return send({ t: 'sync' });
  const move = applyUci(S.chess, msg.uci);
  if (!move) return send({ t: 'sync' });
  S.game.moves.push(msg.uci);
  S.offerIn = null;
  S.offerOut = null;
  $('promo').hidden = true;
  saveSession();
  render({ animate: movePairs(move) });
  moveSound(move);
  navigator.vibrate?.(25);
}

// Merge a game received from the opponent (hello / state / sync reply).
function handleState(raw, { replyHello = false } = {}) {
  const remote = raw ? sanitizeGame(raw) : null;
  if (raw && !remote) {
    console.warn('Ignoring an invalid game state from the opponent');
    return;
  }
  const before = S.game;
  const merged = mergeGames(before, remote, S.role === 'host');
  if (merged && !sameGame(merged, before)) {
    const newGameStarted = !before || before.id !== merged.id;
    const grewByOne = !newGameStarted && merged.moves.length === before.moves.length + 1;
    setGame(merged);
    if (newGameStarted) {
      S.offerIn = null;
      S.offerOut = null;
      S.bannerDismissed = false;
      if (before) toast(`New game · you play ${colorName(myColor())}`);
    }
    saveSession();
    if (document.body.dataset.screen !== 'game') enterGame();
    const verbose = S.chess.history({ verbose: true });
    const last = verbose[verbose.length - 1];
    render({ animate: grewByOne && last ? movePairs(last) : [] });
    if (grewByOne && last) moveSound(last);
    else if (merged.end && !before?.end && !newGameStarted) playSound('end');
  } else if (merged && document.body.dataset.screen !== 'game') {
    enterGame();
  }
  if (replyHello) sendHello();
  else if (merged && (!remote || !sameGame(merged, remote))) send({ t: 'state', game: merged });
}

function resign() {
  if (!S.game || currentOutcome()) return;
  S.game.end = { reason: 'resign', winner: other(myColor()) };
  S.offerIn = null;
  S.offerOut = null;
  saveSession();
  render();
  playSound('end');
  send({ t: 'state', game: S.game });
}

function offer(what) {
  if (!S.connected) return toast('Your opponent is offline');
  S.offerOut = what;
  send({ t: 'offer', what, id: S.game.id });
  toast(what === 'draw' ? 'Draw offered' : 'Rematch offered');
  render();
}

function acceptOffer() {
  const what = S.offerIn;
  S.offerIn = null;
  if (what === 'draw' && !currentOutcome()) {
    S.game.end = { reason: 'agreement', winner: null };
    saveSession();
    render();
    playSound('end');
    send({ t: 'state', game: S.game });
  } else if (what === 'rematch') {
    if (S.role === 'host') startRematch();
    else send({ t: 'accept-rematch', id: S.game.id });
    render();
  }
}

function declineOffer() {
  const what = S.offerIn;
  S.offerIn = null;
  send({ t: 'decline', what });
  render();
}

function requestRematch() {
  if (S.offerIn === 'rematch') return acceptOffer();
  offer('rematch');
}

function startRematch() {
  setGame(rematchOf(S.game));
  S.offerIn = null;
  S.offerOut = null;
  S.bannerDismissed = false;
  saveSession();
  render();
  toast(`New game · you play ${colorName(myColor())}`);
  send({ t: 'state', game: S.game });
}

// ---------------------------------------------------------------- messaging
function send(msg) {
  return Boolean(S.link && S.link.isOpen && S.link.send(msg));
}
function sendHello() {
  send({ t: 'hello', v: PROTOCOL_VERSION, role: S.role, client: S.client, game: S.game });
}

function onMessage(msg, link) {
  if (link !== S.link) return;
  S.lastSeen = Date.now();
  switch (msg.t) {
    case 'hello':
      if (msg.v !== PROTOCOL_VERSION) toast('Your opponent runs a different version. Reload both pages.', 4000);
      if (S.role === 'host') {
        S.guestClient = typeof msg.client === 'string' ? msg.client : null;
        handleState(msg.game, { replyHello: true });
      } else {
        handleState(msg.game);
      }
      break;
    case 'state':
      handleState(msg.game);
      break;
    case 'sync':
      if (S.game) send({ t: 'state', game: S.game });
      break;
    case 'move':
      handleRemoteMove(msg);
      break;
    case 'offer':
      if (!S.game || msg.id !== S.game.id) break;
      if (msg.what === 'rematch' && S.offerOut === 'rematch') {
        // Both asked at once.
        if (S.role === 'host') startRematch();
        else send({ t: 'accept-rematch', id: S.game.id });
        break;
      }
      if ((msg.what === 'draw' && !currentOutcome()) || (msg.what === 'rematch' && currentOutcome())) {
        S.offerIn = msg.what;
        render();
        playSound('notify');
      }
      break;
    case 'decline':
      if (S.offerOut === msg.what) {
        S.offerOut = null;
        toast(msg.what === 'draw' ? 'Draw offer declined' : 'Rematch declined');
        render();
      }
      break;
    case 'accept-rematch':
      if (S.role === 'host' && S.game && msg.id === S.game.id && currentOutcome()) startRematch();
      break;
    case 'ping':
      send({ t: 'pong', ts: msg.ts });
      break;
    case 'pong':
      if (typeof msg.ts === 'number') {
        S.rtt = Math.max(0, Math.round(performance.now() - msg.ts));
        renderConn();
      }
      break;
    case 'full':
      S.stopped = 'This game already has two players.';
      S.transport?.stop?.();
      setStatusLine('online-guest-status', 'error', S.stopped);
      link.close();
      render();
      break;
    case 'bye':
      // An online host keeps listening, so the opponent can still come back.
      S.stopped = S.role === 'guest' && S.mode === 'online' ? 'The host left this game.' : 'Your opponent left the game.';
      if (S.role === 'guest') S.transport?.stop?.();
      toast('Your opponent left the game', 3200);
      link.close();
      render();
      break;
    default:
      break;
  }
}

function onLinkOpen(link) {
  if (link !== S.link) return;
  clearTimeout(S.connectTimer);
  const wasConnected = S.everConnected;
  S.connected = true;
  S.everConnected = true;
  S.stopped = null;
  S.lastSeen = Date.now();
  S.rtt = null;
  S.route = null;
  setTimeout(refreshRoute, 800);
  setTimeout(refreshRoute, 3000);
  toast(wasConnected ? 'Reconnected' : 'Connected to your opponent');
  render();
}

function onLinkLost(link) {
  if (link !== S.link) return;
  const was = S.connected;
  S.link = null;
  S.connected = false;
  S.rtt = null;
  S.route = null;
  if (was && !S.stopped) {
    toast(S.mode === 'local' ? 'Connection lost · tap Reconnect to pair again' : 'Connection lost · reconnecting…', 3200);
  }
  render();
}

// Guests and zero-server hosts have exactly one link.
function wireLink(link) {
  S.link = link;
  link.on('open', () => {
    onLinkOpen(link);
    if (S.role === 'guest') sendHello();
  });
  link.on('message', (msg) => onMessage(msg, link));
  link.on('close', () => onLinkLost(link));
}

// Online hosts may see several incoming connections (reconnects, a third
// device). The first hello decides whether a connection takes the seat.
function wireCandidate(link) {
  link.on('message', (msg) => {
    if (link !== S.link) {
      if (msg.t !== 'hello') return;
      const current = S.link;
      const seatBusy =
        current && current.isOpen && S.connected && Date.now() - S.lastSeen < 6000 && msg.client !== S.guestClient;
      if (seatBusy) {
        link.send({ t: 'full' });
        setTimeout(() => link.close(), 500);
        return;
      }
      S.link = link;
      if (current && current !== link) current.close();
      onLinkOpen(link);
    }
    onMessage(msg, link);
  });
  link.on('close', () => onLinkLost(link));
}

async function refreshRoute() {
  if (!S.connected || !S.link?.pc) return;
  const route = await describeRoute(S.link.pc);
  if (route) S.route = route;
  renderConn();
}

setInterval(() => {
  if (!S.link || !S.connected) return;
  if (Date.now() - S.lastSeen > 9000) {
    const link = S.link;
    onLinkLost(link);
    link.close();
    return;
  }
  send({ t: 'ping', ts: performance.now() });
}, 2500);
setInterval(refreshRoute, 12000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  document.title = 'Duet Chess — two devices, no game server';
  if (S.connected) {
    // Give a backgrounded connection a moment to prove it is still alive.
    S.lastSeen = Math.min(S.lastSeen, Date.now() - 6000);
    send({ t: 'ping', ts: performance.now() });
  }
  S.transport?.wake?.();
});

// ---------------------------------------------------------------- rendering
function enterGame() {
  show('game');
  render();
}

function capturedHtml(types, color) {
  return types.map((type) => `<img src="${pieceUrl(color, type)}" alt="" />`).join('');
}

function render({ animate = [] } = {}) {
  renderChip();
  if (!S.game || !S.chess) return;
  const me = myColor();
  const opp = other(me);
  const result = currentOutcome();
  const history = S.chess.history({ verbose: true });
  const last = history[history.length - 1];
  const interactive = canMove();
  board.setOrientation(me);
  const check = S.chess.inCheck() ? S.chess.findPiece({ type: 'k', color: S.chess.turn() })[0] : null;
  board.update(
    {
      board: S.chess.board(),
      moves: interactive ? S.chess.moves({ verbose: true }) : [],
      lastMove: last ? { from: last.from, to: last.to } : null,
      check,
      interactive,
      myColor: me,
    },
    { animate },
  );
  if (!interactive) $('promo').hidden = true;

  $('me-swatch').className = `swatch ${me}`;
  $('opp-swatch').className = `swatch ${opp}`;
  $('bar-me').querySelector('.pname').textContent = `You · ${colorName(me)}`;
  $('bar-opp').querySelector('.pname').textContent = `Opponent · ${colorName(opp)}`;
  const turn = result ? null : S.chess.turn();
  $('bar-me').classList.toggle('turn', turn === me);
  $('bar-opp').classList.toggle('turn', turn === opp);

  const cap = capturedPieces(S.chess);
  const myAdvantage = me === 'w' ? cap.advantage : -cap.advantage;
  $('cap-me').innerHTML = capturedHtml(cap.lost[opp], opp) + (myAdvantage > 0 ? `<b>+${myAdvantage}</b>` : '');
  $('cap-opp').innerHTML = capturedHtml(cap.lost[me], me) + (myAdvantage < 0 ? `<b>+${-myAdvantage}</b>` : '');

  // Status line
  const status = $('status');
  let text;
  if (result) {
    const info = describeOutcome(result, me);
    text = `${info.headline} · ${info.detail}`;
    status.dataset.tone = info.draw ? 'draw' : info.youWon ? 'win' : 'lose';
  } else if (turn === me) {
    text = S.chess.inCheck() ? 'Check! Your move' : 'Your move';
    if (!S.connected) text += ' · sent when your opponent reconnects';
    status.dataset.tone = 'me';
  } else {
    text = S.connected ? 'Opponent’s move' : 'Opponent’s move · they are offline';
    status.dataset.tone = 'opp';
  }
  status.textContent = text;

  // Offer prompt
  const offerBox = $('offer');
  offerBox.hidden = !S.offerIn || !S.connected;
  $('offer-text').textContent = S.offerIn === 'draw' ? 'Your opponent offers a draw.' : 'Your opponent wants a rematch.';

  // Actions
  const live = !result;
  $('act-draw').hidden = !live;
  $('act-draw').disabled = !S.connected || S.offerOut === 'draw' || S.game.moves.length < 2;
  $('act-draw').textContent = S.offerOut === 'draw' ? 'Draw offered' : 'Offer draw';
  $('act-resign').hidden = !live;
  $('act-rematch').hidden = live;
  $('act-rematch').disabled = !S.connected || S.offerOut === 'rematch';
  $('act-rematch').textContent = S.offerOut === 'rematch' ? 'Rematch offered' : S.offerIn === 'rematch' ? 'Accept rematch' : 'Rematch';
  $('act-reconnect').hidden = S.mode !== 'local' || S.connected;

  // Result banner
  const banner = $('banner');
  if (result && !S.bannerDismissed) {
    const info = describeOutcome(result, me);
    $('banner-head').textContent = info.headline;
    $('banner-detail').textContent = info.detail;
    banner.dataset.tone = info.draw ? 'draw' : info.youWon ? 'win' : 'lose';
    $('banner-rematch').disabled = !S.connected || S.offerOut === 'rematch';
    $('banner-rematch').textContent = $('act-rematch').textContent;
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }

  // Move list
  const list = $('moves');
  const items = [];
  for (let i = 0; i < history.length; i += 2) {
    const white = history[i]?.san || '';
    const black = history[i + 1]?.san || '';
    items.push(`<li><span class="n">${i / 2 + 1}.</span><span>${white}</span><span>${black}</span></li>`);
  }
  list.innerHTML = items.join('') || '<li class="empty">No moves yet</li>';
  list.scrollLeft = list.scrollWidth;
  list.scrollTop = list.scrollHeight;

  renderConn();
  if (document.visibilityState === 'hidden' && turn === me) document.title = '● Your move — Duet Chess';
}

function renderConn() {
  const el = $('conn');
  let state;
  let label;
  if (S.connected) {
    state = 'connected';
    label = 'Online';
  } else if (S.stopped) {
    state = 'offline';
    label = 'Left';
  } else if (S.mode === 'local') {
    state = 'offline';
    label = 'Disconnected';
  } else if (S.role === 'host') {
    state = 'waiting';
    label = S.everConnected ? 'Offline' : 'Waiting';
  } else {
    state = 'connecting';
    label = 'Reconnecting';
  }
  el.dataset.state = state;
  el.querySelector('b').textContent = label;
  const parts = [S.mode === 'online' ? 'Paired via PeerJS' : S.strictLocal ? 'Paired by QR · strict local' : 'Paired by QR'];
  if (S.connected && S.route) parts.push(S.route.label);
  if (S.connected && S.rtt != null) parts.push(`${S.rtt} ms`);
  if (S.stopped) parts.push(S.stopped);
  $('route').textContent = parts.join(' · ');
}

function renderChip() {
  const chip = $('mode-chip');
  if (!S.mode || document.body.dataset.screen === 'lobby') {
    chip.hidden = true;
    return;
  }
  chip.hidden = false;
  chip.textContent = S.mode === 'online' ? `Code ${formatCode(S.code)}` : 'QR pairing';
  chip.classList.toggle('link', S.mode === 'online' && S.role === 'host');
}

// ---------------------------------------------------------------- session flows
function teardown() {
  clearTimeout(S.connectTimer);
  scanner.stop();
  $('scanner').hidden = true;
  try {
    S.link?.close();
  } catch {
    // ignore
  }
  try {
    if (typeof S.transport?.destroy === 'function') S.transport.destroy();
    else S.transport?.close?.();
  } catch {
    // ignore
  }
  S.signal?.close();
  S.signal = null;
  Object.assign(S, {
    transport: null,
    link: null,
    connected: false,
    everConnected: false,
    rtt: null,
    route: null,
    offerIn: null,
    offerOut: null,
    stopped: null,
    bannerDismissed: false,
  });
}

function pickColor() {
  if (S.color !== 'r') return S.color;
  return crypto.getRandomValues(new Uint8Array(1))[0] & 1 ? 'w' : 'b';
}

async function startOnlineHost(code = randomCode(), saved = null) {
  teardown();
  Object.assign(S, { mode: 'online', role: 'host', code, strictLocal: false, guestClient: saved?.guestClient || null });
  setGame(saved?.game || newGame(pickColor()));
  history.replaceState(null, '', `#host=${code}`);
  saveSession();
  S.inviteUrl = `${BASE}#join=${code}`;
  $('online-code').textContent = formatCode(code);
  $('host-color-label').textContent = colorName(myColor());
  renderQr($('qr-online'), S.inviteUrl, { ecc: 'M', label: 'Invite QR code' });
  if (S.game.moves.length) enterGame();
  else showPanel('pair-online-host');
  const transport = new OnlineHost(code);
  S.transport = transport;
  transport.on('status', (state, text) => {
    if (S.transport !== transport) return;
    setStatusLine('online-host-status', state === 'ready' ? 'waiting' : state, text);
    renderConn();
  });
  transport.on('link', (link) => {
    if (S.transport === transport) wireCandidate(link);
  });
  try {
    await transport.start();
  } catch (error) {
    setStatusLine('online-host-status', 'error', error.message);
  }
}

async function startOnlineGuest(code) {
  teardown();
  Object.assign(S, { mode: 'online', role: 'guest', code, strictLocal: false });
  setGame(loadSession(sessionKey('online', 'guest', code))?.game || null);
  history.replaceState(null, '', `#join=${code}`);
  $('guest-code').textContent = formatCode(code);
  setStatusLine('online-guest-status', 'connecting', 'Loading…');
  if (S.game) enterGame();
  else showPanel('pair-online-guest');
  const transport = new OnlineGuest(code);
  S.transport = transport;
  transport.on('status', (state, text) => {
    if (S.transport !== transport || S.stopped) return;
    setStatusLine('online-guest-status', state, text);
    renderConn();
  });
  transport.on('link', (link) => {
    if (S.transport === transport) wireLink(link);
  });
  try {
    await transport.start();
  } catch (error) {
    setStatusLine('online-guest-status', 'error', error.message);
  }
}

function listenForRelayedReplies(host) {
  if (typeof BroadcastChannel !== 'function') return;
  const channel = new BroadcastChannel(SIGNAL_CHANNEL);
  S.signal = channel;
  channel.onmessage = (event) => {
    const data = event.data || {};
    if (data.type !== 'answer' || S.transport !== host || S.connected) return;
    channel.postMessage({ type: 'ack', nonce: data.nonce });
    submitReply(data.token);
  };
}

async function startLocalHost({ game = null, strictLocal = false } = {}) {
  teardown();
  Object.assign(S, { mode: 'local', role: 'host', code: null, strictLocal, guestClient: null });
  setGame(game || newGame(pickColor()));
  history.replaceState(null, '', BASE);
  saveSession();
  $('local-color-label').textContent = colorName(myColor());
  $('qr-offer').innerHTML = '<p class="muted small center"><i class="spin"></i> Gathering network details…</p>';
  $('reply-input').value = '';
  $('local-host-status').hidden = true;
  $('offer-share').disabled = true;
  $('offer-copy').disabled = true;
  $('scan-reply').disabled = true;
  showPanel('pair-local-host');
  const host = new ManualHost({ strictLocal });
  S.transport = host;
  try {
    const token = await host.createInvite();
    if (S.transport !== host) return;
    wireLink(host.link);
    S.inviteUrl = `${BASE}#offer=${token}`;
    renderQr($('qr-offer'), S.inviteUrl, { ecc: 'M', label: 'Invite QR code' });
    $('offer-share').disabled = false;
    $('offer-copy').disabled = false;
    $('scan-reply').disabled = false;
    listenForRelayedReplies(host);
  } catch (error) {
    $('qr-offer').innerHTML = '';
    setStatusLine('local-host-status', 'error', error.message);
  }
}

async function submitReply(text) {
  const host = S.transport;
  if (!(host instanceof ManualHost)) return;
  setStatusLine('local-host-status', 'connecting', 'Connecting directly to the other device…');
  try {
    await host.acceptReply(text);
  } catch (error) {
    setStatusLine('local-host-status', 'error', error.message);
    return;
  }
  clearTimeout(S.connectTimer);
  S.connectTimer = setTimeout(() => {
    if (S.transport === host && !S.connected) {
      setStatusLine(
        'local-host-status',
        'error',
        S.strictLocal
          ? 'Could not connect. Both devices must be on the same Wi-Fi, and some networks block local discovery. Try again without Strict local.'
          : 'Could not connect directly. Some networks block peer-to-peer traffic. Try the same Wi-Fi, or use the Online link mode.',
      );
    }
  }, 20000);
}

async function startLocalGuest(text, { game } = {}) {
  teardown();
  Object.assign(S, { mode: 'local', role: 'guest', code: null, strictLocal: false });
  setGame(game !== undefined ? game : loadSession(sessionKey('local', 'guest'))?.game || null);
  history.replaceState(null, '', BASE);
  $('qr-answer').innerHTML = '<p class="muted small center"><i class="spin"></i> Preparing reply…</p>';
  $('answer-share').disabled = true;
  $('answer-copy').disabled = true;
  setStatusLine('local-guest-status', 'connecting', 'Preparing reply…');
  showPanel('pair-local-guest');
  const guest = new ManualGuest();
  S.transport = guest;
  try {
    const token = await guest.acceptInvite(text);
    if (S.transport !== guest) return;
    S.strictLocal = token && extractToken(text)?.[1] === 'l';
    wireLink(guest.link);
    S.replyUrl = `${BASE}#answer=${token}`;
    renderQr($('qr-answer'), S.replyUrl, { ecc: 'M', label: 'Reply QR code' });
    $('answer-share').disabled = false;
    $('answer-copy').disabled = false;
    setStatusLine('local-guest-status', 'waiting', 'Waiting for the host to scan this reply…');
  } catch (error) {
    $('qr-answer').innerHTML = '';
    setStatusLine('local-guest-status', 'error', error.message);
  }
}

// Opened from a reply QR scanned with the system camera: hand the reply to the
// waiting game tab in this browser.
function relayAnswer(token) {
  teardownScannerOnly();
  S.replyUrl = `${BASE}#answer=${token}`;
  history.replaceState(null, '', BASE);
  showPanel('pair-relay');
  setStatusLine('relay-status', 'connecting', 'Passing it to your game tab…');
  if (typeof BroadcastChannel !== 'function') {
    setStatusLine('relay-status', 'warn', 'This browser cannot pass it on automatically.');
    return;
  }
  const channel = new BroadcastChannel(SIGNAL_CHANNEL);
  const nonce = randomId('n');
  let acked = false;
  channel.onmessage = (event) => {
    if (event.data?.type === 'ack' && event.data.nonce === nonce) {
      acked = true;
      setStatusLine('relay-status', 'ok', 'Delivered. Switch back to your game tab — you can close this one.');
    }
  };
  channel.postMessage({ type: 'answer', token, nonce });
  setTimeout(() => {
    if (!acked) {
      setStatusLine('relay-status', 'warn', 'Sent. Switch back to your game tab. If it does not connect, copy the reply below.');
    }
  }, 2500);
}

function leave() {
  send({ t: 'bye' });
  const key = S.mode ? sessionKey() : null;
  setTimeout(() => {
    teardown();
    if (key) dropSession(key);
    S.mode = null;
    setGame(null);
    history.replaceState(null, '', BASE);
    showLobby();
  }, 120);
}

function showLobby() {
  show('lobby');
  renderChip();
  const data = readStore();
  const saved = data.last ? loadSession(data.last) : null;
  const fresh = saved && Date.now() - saved.updated < 3 * 24 * 3600 * 1000;
  const unfinished = fresh && !outcome(saved.game, replay(saved.game));
  const card = $('resume');
  card.hidden = !unfinished;
  if (unfinished) {
    const me = colorFor(saved.role, saved.game);
    const how = saved.mode === 'online' ? `online · code ${formatCode(saved.code)}` : 'QR pairing';
    $('resume-detail').textContent = `${how} · move ${Math.floor(saved.game.moves.length / 2) + 1} · you play ${colorName(me)}`;
    card.dataset.key = data.last;
  }
}

function resumeSaved() {
  const key = $('resume').dataset.key;
  const saved = key && loadSession(key);
  if (!saved) return showLobby();
  if (saved.mode === 'online' && saved.role === 'host') return startOnlineHost(saved.code, saved);
  if (saved.mode === 'online') return startOnlineGuest(saved.code);
  if (saved.role === 'host') return startLocalHost({ game: saved.game, strictLocal: saved.strictLocal });
  openScanner('Scan the host’s new invite', (text) => {
    const token = extractToken(text);
    if (!token) return 'Not a Duet Chess code.';
    if (token[1] === 'a') return 'That is a reply code. Scan the invite on the host’s device.';
    startLocalGuest(token, { game: saved.game });
    return true;
  });
}

// ---------------------------------------------------------------- scanner
const scanner = new Scanner($('scanner-video'));
let scanHandler = null;

function teardownScannerOnly() {
  scanner.stop();
  $('scanner').hidden = true;
}

function openScanner(title, handler) {
  scanHandler = handler;
  $('scanner-title').textContent = title;
  $('scanner-msg').textContent = 'Starting camera…';
  $('scanner-input').value = '';
  $('scanner-paste').open = false;
  $('scanner').hidden = false;
  scanner
    .start((text) => handleScanned(text))
    .then(() => {
      if (!$('scanner').hidden) $('scanner-msg').textContent = 'Point the camera at the QR code.';
    })
    .catch((error) => {
      $('scanner-msg').textContent = error.message;
      $('scanner-paste').open = true;
    });
}

function handleScanned(text) {
  if (!scanHandler) return true;
  const result = scanHandler(text);
  if (result === true) {
    closeScanner();
    return true;
  }
  if (typeof result === 'string') $('scanner-msg').textContent = result;
  return false;
}

function closeScanner() {
  scanner.stop();
  $('scanner').hidden = true;
  scanHandler = null;
}

function scanAnyInvite(text) {
  const token = extractToken(text);
  if (token) {
    if (token[1] === 'a') return 'That is a reply code. Scan the invite on the host’s device.';
    startLocalGuest(token);
    return true;
  }
  const code = /join=/.test(text) ? normalizeCode(text) : null;
  if (code) {
    startOnlineGuest(code);
    return true;
  }
  return 'That is not a Duet Chess QR code.';
}

function scanReply(text) {
  const token = extractToken(text);
  if (!token) return 'That is not a Duet Chess code.';
  if (token[1] !== 'a') return 'That is your own invite. Scan the reply on the other device.';
  submitReply(token);
  return true;
}

// ---------------------------------------------------------------- events
document.addEventListener('pointerdown', unlockAudio, { capture: true });

$('sound-toggle').addEventListener('click', () => {
  S.sound = !S.sound;
  updateStore({ sound: S.sound });
  renderSound();
  if (S.sound) {
    unlockAudio();
    setTimeout(() => playSound('move'), 30);
  }
});

for (const button of $('color-pick').querySelectorAll('button')) {
  button.addEventListener('click', () => {
    S.color = button.dataset.color;
    updateStore({ color: S.color });
    renderColorPick();
  });
}
function renderColorPick() {
  for (const button of $('color-pick').querySelectorAll('button')) {
    button.setAttribute('aria-checked', String(button.dataset.color === S.color));
  }
}

$('online-create').addEventListener('click', () => startOnlineHost());
$('join-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const code = normalizeCode($('join-code').value);
  if (!code) return toast('Enter the 6-character code from the host');
  startOnlineGuest(code);
});
$('local-create').addEventListener('click', () => startLocalHost({ strictLocal: $('strict-local').checked }));
$('scan-any').addEventListener('click', () => openScanner('Scan an invite', scanAnyInvite));
$('resume-go').addEventListener('click', resumeSaved);
$('resume-discard').addEventListener('click', () => {
  const key = $('resume').dataset.key;
  if (key) dropSession(key);
  showLobby();
});

$('pair-back').addEventListener('click', () => {
  if (S.game && (S.everConnected || S.game.moves.length > 0) && S.mode) return enterGame();
  const key = S.mode ? sessionKey() : null;
  teardown();
  if (key && S.game && !S.game.moves.length) dropSession(key);
  S.mode = null;
  setGame(null);
  history.replaceState(null, '', BASE);
  showLobby();
});
$('online-share').addEventListener('click', () => shareLink(S.inviteUrl, 'Play chess with me on Duet Chess'));
$('online-copy').addEventListener('click', () => copyText(S.inviteUrl, 'Link copied'));
$('offer-share').addEventListener('click', () => shareLink(S.inviteUrl, 'Duet Chess invite (zero-server)'));
$('offer-copy').addEventListener('click', () => copyText(S.inviteUrl, 'Invite copied'));
$('answer-share').addEventListener('click', () => shareLink(S.replyUrl, 'Duet Chess reply'));
$('answer-copy').addEventListener('click', () => copyText(S.replyUrl, 'Reply copied'));
$('relay-copy').addEventListener('click', () => copyText(S.replyUrl, 'Reply copied'));
$('scan-reply').addEventListener('click', () => openScanner('Scan the reply', scanReply));
$('reply-submit').addEventListener('click', () => {
  const value = $('reply-input').value;
  const result = scanReply(value);
  if (typeof result === 'string') setStatusLine('local-host-status', 'error', result);
});

$('scanner-close').addEventListener('click', closeScanner);
$('scanner-submit').addEventListener('click', () => handleScanned($('scanner-input').value));

$('mode-chip').addEventListener('click', () => {
  if (S.mode === 'online' && S.role === 'host') showPanel('pair-online-host');
});

$('act-draw').addEventListener('click', () => offer('draw'));
$('act-resign').addEventListener('click', (event) => confirmTap(event.currentTarget, 'Tap to confirm', resign));
$('act-rematch').addEventListener('click', requestRematch);
$('banner-rematch').addEventListener('click', requestRematch);
$('banner-close').addEventListener('click', () => {
  S.bannerDismissed = true;
  render();
});
$('act-leave').addEventListener('click', (event) => {
  if (!S.game || currentOutcome() || !S.game.moves.length) return leave();
  confirmTap(event.currentTarget, 'Tap to leave', leave);
});
$('act-reconnect').addEventListener('click', () => {
  if (S.role === 'host') return startLocalHost({ game: S.game, strictLocal: S.strictLocal });
  const game = S.game;
  openScanner('Scan the host’s new invite', (text) => {
    const token = extractToken(text);
    if (!token) return 'Not a Duet Chess code.';
    if (token[1] === 'a') return 'That is a reply code. Scan the invite on the host’s device.';
    startLocalGuest(token, { game });
    return true;
  });
});
$('offer-yes').addEventListener('click', acceptOffer);
$('offer-no').addEventListener('click', declineOffer);
$('promo').addEventListener('click', (event) => {
  if (event.target === $('promo')) {
    $('promo').hidden = true;
    render();
  }
});

window.addEventListener('hashchange', () => {
  if (/^#(join|host|offer|answer)=/.test(location.hash)) location.reload();
});

// ---------------------------------------------------------------- boot
function boot() {
  renderSound();
  renderColorPick();
  const hash = location.hash;
  let match;
  if ((match = hash.match(/^#join=([A-Za-z0-9-]+)/))) {
    const code = normalizeCode(match[1]);
    if (code) return startOnlineGuest(code);
  }
  if ((match = hash.match(/^#host=([A-Za-z0-9-]+)/))) {
    const code = normalizeCode(match[1]);
    const saved = code && loadSession(sessionKey('online', 'host', code));
    if (saved) return startOnlineHost(code, saved);
    if (code) return startOnlineGuest(code);
  }
  if (hash.startsWith('#offer=')) return startLocalGuest(hash.slice(7));
  if (hash.startsWith('#answer=')) return relayAnswer(hash.slice(8));
  history.replaceState(null, '', BASE);
  showLobby();
}

boot();

// Test hook (read-only snapshot) used by the automated two-browser tests.
window.__duetChess = {
  snapshot: () => ({
    mode: S.mode,
    role: S.role,
    code: S.code,
    connected: S.connected,
    color: S.game ? myColor() : null,
    game: S.game ? JSON.parse(JSON.stringify(S.game)) : null,
    route: S.route,
    hasPc: Boolean(S.link && S.link.pc),
    inviteUrl: S.inviteUrl,
    replyUrl: S.replyUrl,
  }),
};
