// Transports. Both modes end in the same place: an RTCDataChannel that goes
// straight from one browser to the other. They differ only in how the two
// browsers first exchange connection details ("signaling").
//
// - Online link: the free public PeerJS server introduces the devices.
// - Zero server: the players carry an offer and an answer across as QR codes.

import { decodeSignal, encodeSignal, peerIdFor } from './codec.js';

export const PUBLIC_STUN = [{ urls: 'stun:stun.l.google.com:19302' }];

class Emitter {
  constructor() {
    this.handlers = new Map();
  }
  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }
  emit(type, ...args) {
    for (const fn of this.handlers.get(type) || []) {
      try {
        fn(...args);
      } catch (error) {
        console.error(error);
      }
    }
  }
}

const scripts = new Map();
export function loadScript(src) {
  if (!scripts.has(src)) {
    scripts.set(
      src,
      new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = src;
        el.async = true;
        el.onload = () => resolve();
        el.onerror = () => {
          scripts.delete(src);
          reject(new Error(`Could not load ${src}`));
        };
        document.head.append(el);
      }),
    );
  }
  return scripts.get(src);
}

async function loadPeer() {
  await loadScript(new URL('./vendor/peerjs.min.js', import.meta.url).href);
  if (!window.Peer) throw new Error('PeerJS failed to load');
  return window.Peer;
}

// A uniform wrapper around a JSON message channel.
export class Link extends Emitter {
  constructor(kind) {
    super();
    this.kind = kind;
    this.isOpen = false;
    this.closed = false;
    this.pc = null;
  }
  _open() {
    if (this.isOpen || this.closed) return;
    this.isOpen = true;
    this.emit('open');
  }
  _message(data) {
    if (this.closed) return;
    let value = data;
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch {
        return;
      }
    }
    if (value && typeof value === 'object' && typeof value.t === 'string') this.emit('message', value);
  }
  _close(reason = 'closed') {
    if (this.closed) return;
    this.closed = true;
    this.isOpen = false;
    this.emit('close', reason);
  }
}

class PeerJsLink extends Link {
  constructor(conn) {
    super('online');
    this.conn = conn;
    conn.on('open', () => {
      this.pc = conn.peerConnection || null;
      this._watchPc();
      this._open();
    });
    conn.on('data', (data) => this._message(data));
    conn.on('close', () => this._close('closed'));
    conn.on('error', () => this._close('error'));
    if (conn.open) {
      this.pc = conn.peerConnection || null;
      this._open();
    }
  }
  _watchPc() {
    if (!this.pc) return;
    this.pc.addEventListener('connectionstatechange', () => {
      if (['failed', 'closed'].includes(this.pc.connectionState)) this.close();
    });
  }
  send(message) {
    if (!this.isOpen) return false;
    try {
      this.conn.send(message);
      return true;
    } catch {
      return false;
    }
  }
  close() {
    try {
      this.conn.close();
    } catch {
      // ignore
    }
    this._close('closed');
  }
}

class ChannelLink extends Link {
  constructor(pc) {
    super('local');
    this.pc = pc;
    this.channel = null;
    pc.addEventListener('connectionstatechange', () => {
      if (['failed', 'closed'].includes(pc.connectionState)) this.close();
    });
  }
  attach(channel) {
    this.channel = channel;
    channel.onopen = () => this._open();
    channel.onmessage = (event) => this._message(event.data);
    channel.onclose = () => this._close('closed');
    channel.onerror = () => this._close('error');
    if (channel.readyState === 'open') this._open();
  }
  send(message) {
    if (!this.isOpen || !this.channel || this.channel.readyState !== 'open') return false;
    try {
      this.channel.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }
  close() {
    try {
      this.channel?.close();
      this.pc.close();
    } catch {
      // ignore
    }
    this._close('closed');
  }
}

function peerErrorMessage(err) {
  switch (err?.type) {
    case 'browser-incompatible':
      return 'This browser does not support WebRTC data channels.';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'Cannot reach the public PeerJS service. Check your internet connection.';
    case 'unavailable-id':
      return 'This game code is busy on another device.';
    case 'peer-unavailable':
      return 'Game not found. Is the host’s page still open?';
    default:
      return err?.message || 'Connection problem.';
  }
}

// Hosts register a predictable peer id derived from the game code, so the
// guest can find them with only the code. Emits: status(state, text), link(Link).
export class OnlineHost extends Emitter {
  constructor(code) {
    super();
    this.code = code;
    this.peer = null;
    this.destroyed = false;
    this.retryTimer = 0;
    this.idRetries = 0;
  }
  async start() {
    this.Peer = await loadPeer();
    this._open();
  }
  _open() {
    if (this.destroyed) return;
    clearTimeout(this.retryTimer);
    this.emit('status', 'connecting', 'Registering game code…');
    const peer = new this.Peer(peerIdFor(this.code), { debug: 0 });
    this.peer = peer;
    peer.on('open', () => {
      this.idRetries = 0;
      this.emit('status', 'ready', 'Waiting for your opponent');
    });
    peer.on('connection', (conn) => {
      if (this.destroyed) return conn.close();
      this.emit('link', new PeerJsLink(conn));
    });
    peer.on('disconnected', () => {
      if (this.destroyed || peer !== this.peer) return;
      this.emit('status', 'connecting', 'Reconnecting to the PeerJS service…');
      this.retryTimer = setTimeout(() => {
        if (!peer.destroyed && peer.disconnected) peer.reconnect();
      }, 1500);
    });
    peer.on('error', (err) => {
      if (this.destroyed || peer !== this.peer) return;
      if (err.type === 'unavailable-id') {
        // After a reload the old registration can linger for a few seconds.
        this.idRetries += 1;
        if (this.idRetries > 8) {
          this.emit('status', 'error', peerErrorMessage(err));
          return;
        }
        this.emit('status', 'connecting', 'Reclaiming game code…');
        peer.destroy();
        this.retryTimer = setTimeout(() => this._open(), 2500);
        return;
      }
      if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
        this.emit('status', 'error', peerErrorMessage(err));
        peer.destroy();
        this.retryTimer = setTimeout(() => this._open(), 4000);
        return;
      }
      this.emit('status', 'warn', peerErrorMessage(err));
    });
  }
  wake() {
    if (this.destroyed || !this.peer) return;
    if (this.peer.destroyed) this._open();
    else if (this.peer.disconnected) this.peer.reconnect();
  }
  destroy() {
    this.destroyed = true;
    clearTimeout(this.retryTimer);
    try {
      this.peer?.destroy();
    } catch {
      // ignore
    }
  }
}

// Guests dial the host's predictable id and keep redialling while the page is
// visible and the link is down. Emits: status(state, text), link(Link).
export class OnlineGuest extends Emitter {
  constructor(code) {
    super();
    this.code = code;
    this.peer = null;
    this.link = null;
    this.destroyed = false;
    this.paused = false;
    this.timer = 0;
    this.attempt = 0;
  }
  async start() {
    this.Peer = await loadPeer();
    this._openPeer();
  }
  _openPeer() {
    if (this.destroyed) return;
    this.emit('status', 'connecting', 'Contacting the PeerJS service…');
    const peer = new this.Peer({ debug: 0 });
    this.peer = peer;
    peer.on('open', () => this.dial());
    peer.on('disconnected', () => {
      if (this.destroyed || peer !== this.peer) return;
      setTimeout(() => {
        if (!peer.destroyed && peer.disconnected) peer.reconnect();
      }, 1500);
    });
    peer.on('error', (err) => {
      if (this.destroyed || peer !== this.peer) return;
      if (err.type === 'peer-unavailable') {
        this.emit('status', 'waiting', peerErrorMessage(err));
        this._schedule();
        return;
      }
      if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
        this.emit('status', 'error', peerErrorMessage(err));
        peer.destroy();
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this._openPeer(), 4000);
        return;
      }
      this.emit('status', 'warn', peerErrorMessage(err));
      this._schedule();
    });
  }
  dial() {
    clearTimeout(this.timer);
    if (this.destroyed || this.paused) return;
    if (!this.peer || this.peer.destroyed) return this._openPeer();
    if (this.peer.disconnected) {
      this.peer.reconnect();
      return this._schedule();
    }
    const previous = this.link;
    this.link = null;
    if (previous && !previous.closed) previous.close();
    this.attempt += 1;
    this.emit('status', 'connecting', this.attempt > 1 ? 'Reconnecting to your opponent…' : 'Connecting to your opponent…');
    const conn = this.peer.connect(peerIdFor(this.code), { reliable: true, serialization: 'json' });
    const link = new PeerJsLink(conn);
    this.link = link;
    const giveUp = setTimeout(() => {
      if (!link.isOpen && !link.closed) link.close();
    }, 15000);
    link.on('open', () => {
      clearTimeout(giveUp);
      this.attempt = 0;
    });
    link.on('close', () => {
      clearTimeout(giveUp);
      if (link === this.link) this._schedule();
    });
    this.emit('link', link);
  }
  _schedule() {
    if (this.destroyed || this.paused) return;
    clearTimeout(this.timer);
    const delay = Math.min(8000, 1000 * 2 ** Math.min(this.attempt, 3));
    this.timer = setTimeout(() => this.dial(), delay);
  }
  wake() {
    if (this.destroyed || this.paused) return;
    if (!this.link || this.link.closed || !this.link.isOpen) this.dial();
  }
  stop() {
    this.paused = true;
    clearTimeout(this.timer);
  }
  destroy() {
    this.destroyed = true;
    clearTimeout(this.timer);
    try {
      this.link?.close();
      this.peer?.destroy();
    } catch {
      // ignore
    }
  }
}

function waitForIce(pc, maxMs = 5000) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    let srflxTimer = 0;
    const done = () => {
      clearTimeout(maxTimer);
      clearTimeout(srflxTimer);
      pc.removeEventListener('icegatheringstatechange', onState);
      pc.removeEventListener('icecandidate', onCandidate);
      resolve();
    };
    const onState = () => {
      if (pc.iceGatheringState === 'complete') done();
    };
    const onCandidate = (event) => {
      if (!event.candidate) return done();
      // Once a public (STUN) address is known, slow interfaces can be skipped.
      if (/\styp\ssrflx\s/.test(event.candidate.candidate) && !srflxTimer) {
        srflxTimer = setTimeout(done, 1200);
      }
    };
    const maxTimer = setTimeout(done, maxMs);
    pc.addEventListener('icegatheringstatechange', onState);
    pc.addEventListener('icecandidate', onCandidate);
  });
}

function rtcConfig(strictLocal) {
  return { iceServers: strictLocal ? [] : PUBLIC_STUN };
}

function assertWebRtc() {
  if (typeof RTCPeerConnection !== 'function') {
    throw new Error('This browser does not support WebRTC.');
  }
}

// Zero-server host: creates the offer (invite) and accepts the answer (reply).
export class ManualHost {
  constructor({ strictLocal = false } = {}) {
    this.strictLocal = strictLocal;
    this.pc = null;
    this.link = null;
  }
  async createInvite() {
    assertWebRtc();
    this.pc = new RTCPeerConnection(rtcConfig(this.strictLocal));
    this.link = new ChannelLink(this.pc);
    this.link.attach(this.pc.createDataChannel('duet-chess', { ordered: true }));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await waitForIce(this.pc);
    return encodeSignal(this.pc.localDescription, { strictLocal: this.strictLocal });
  }
  async acceptReply(text) {
    const description = await decodeSignal(text);
    if (description.type !== 'answer') {
      throw new Error('That is an invite code. Scan the reply shown on the other device.');
    }
    if (!this.pc || this.pc.signalingState !== 'have-local-offer') {
      throw new Error('This invite was already used. Create a new one.');
    }
    await this.pc.setRemoteDescription({ type: 'answer', sdp: description.sdp });
  }
  close() {
    this.link?.close();
  }
}

// Zero-server guest: turns an invite into a reply.
export class ManualGuest {
  constructor() {
    this.pc = null;
    this.link = null;
  }
  async acceptInvite(text) {
    assertWebRtc();
    const description = await decodeSignal(text);
    if (description.type !== 'offer') {
      throw new Error('That is a reply code. Scan the invite shown on the host’s device.');
    }
    this.pc = new RTCPeerConnection(rtcConfig(description.strictLocal));
    this.link = new ChannelLink(this.pc);
    this.pc.addEventListener('datachannel', (event) => this.link.attach(event.channel));
    await this.pc.setRemoteDescription({ type: 'offer', sdp: description.sdp });
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    await waitForIce(this.pc);
    return encodeSignal(this.pc.localDescription);
  }
  close() {
    this.link?.close();
  }
}

// Reports whether the live connection is direct (LAN / internet) or relayed.
export async function describeRoute(pc) {
  if (!pc || typeof pc.getStats !== 'function') return null;
  let stats;
  try {
    stats = await pc.getStats();
  } catch {
    return null;
  }
  let pair = null;
  stats.forEach((report) => {
    if (report.type === 'transport' && report.selectedCandidatePairId) {
      pair = stats.get(report.selectedCandidatePairId) || pair;
    }
  });
  if (!pair) {
    stats.forEach((report) => {
      if (report.type === 'candidate-pair' && (report.selected || (report.nominated && report.state === 'succeeded'))) {
        pair = pair || report;
      }
    });
  }
  if (!pair) return null;
  const local = stats.get(pair.localCandidateId);
  const remote = stats.get(pair.remoteCandidateId);
  const types = [local?.candidateType, remote?.candidateType];
  if (types.includes('relay')) return { kind: 'relay', label: 'Relayed via TURN server' };
  if (types.every((type) => type === 'host')) return { kind: 'lan', label: 'Direct · same network' };
  return { kind: 'p2p', label: 'Direct · peer-to-peer' };
}
