// Compact, URL-safe encoding for WebRTC session descriptions, plus small
// helpers for room codes. Used by the zero-server QR pairing mode, where the
// "signaling" step is two QR codes carried between devices by the players.
//
// Token format: <codec><kind><base64url payload>
//   codec: "c" = compact binary (only the fields WebRTC needs; the SDP is
//               rebuilt from a standard data-channel template on arrival)
//          "z" = deflate-raw compressed SDP (fallback for unusual SDPs)
//          "p" = plain SDP (fallback for browsers without CompressionStream)
//   kind:  "o" = offer (STUN allowed), "l" = offer (strict local, no servers),
//          "a" = answer

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0/O, 1/I/L
const CODE_LENGTH = 6;
const MAX_CANDIDATES = 8;
const SETUPS = ['actpass', 'active', 'passive'];
const CANDIDATE_TYPES = ['host', 'srflx', 'prflx', 'relay'];
const DEFAULT_PRIORITY = { host: 2113937151, srflx: 1677729535, prflx: 1845501695, relay: 41885439 };
const MDNS = /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\.local$/i;

export function slimSdp(sdp) {
  // Keep the browser's own SDP (robust across engines), but drop TCP
  // candidates and cap the candidate count so the QR code stays scannable.
  const out = [];
  let candidates = 0;
  for (const line of String(sdp).split(/\r?\n/)) {
    if (!line) continue;
    if (line.startsWith('a=candidate:')) {
      if (/\stcp\s/i.test(line)) continue;
      if (candidates >= MAX_CANDIDATES) continue;
      candidates += 1;
    }
    out.push(line);
  }
  return out.join('\r\n') + '\r\n';
}

function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pipeBytes(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function supportsDeflateRaw() {
  if (typeof CompressionStream !== 'function') return false;
  try {
    new CompressionStream('deflate-raw');
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- compact codec

function parseIPv4(text) {
  const parts = text.split('.');
  if (parts.length !== 4) return null;
  const bytes = parts.map(Number);
  return bytes.every((b, i) => /^\d{1,3}$/.test(parts[i]) && b <= 255) ? bytes : null;
}

function parseIPv6(text) {
  if (!/^[0-9a-f:]+$/i.test(text) || text.split('::').length > 2) return null;
  const [head, tail] = text.includes('::') ? text.split('::') : [text, null];
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const missing = 8 - left.length - right.length;
  if (tail === null ? left.length !== 8 : missing < 1) return null;
  const groups = [...left, ...Array(tail === null ? 0 : missing).fill('0'), ...right];
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return null;
  const bytes = [];
  for (const g of groups) {
    const v = parseInt(g, 16);
    bytes.push(v >> 8, v & 255);
  }
  return bytes;
}

function formatIPv6(bytes) {
  const groups = [];
  for (let i = 0; i < 16; i += 2) groups.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
  return groups.join(':');
}

function hex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

class Writer {
  constructor() {
    this.bytes = [];
  }
  u8(v) {
    this.bytes.push(v & 255);
  }
  u16(v) {
    this.bytes.push((v >> 8) & 255, v & 255);
  }
  u32(v) {
    this.bytes.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  }
  raw(list) {
    for (const b of list) this.u8(b);
  }
  str(text) {
    const data = new TextEncoder().encode(text);
    if (data.length > 255) throw new Error('field too long');
    this.u8(data.length);
    this.raw(data);
  }
}

class Reader {
  constructor(bytes) {
    this.bytes = bytes;
    this.i = 0;
  }
  take(n) {
    if (this.i + n > this.bytes.length) throw new Error('truncated');
    const out = this.bytes.subarray(this.i, this.i + n);
    this.i += n;
    return out;
  }
  u8() {
    return this.take(1)[0];
  }
  u16() {
    const b = this.take(2);
    return (b[0] << 8) | b[1];
  }
  u32() {
    const b = this.take(4);
    return ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
  }
  str() {
    return new TextDecoder().decode(this.take(this.u8()));
  }
}

// Returns compact bytes, or null when the SDP is not the plain single
// data-channel shape this codec understands (then the caller falls back).
export function packSdp(sdp) {
  const lines = String(sdp).split(/\r?\n/).filter(Boolean);
  const value = (prefix) => {
    const found = lines.filter((l) => l.startsWith(prefix));
    return found.length === 1 ? found[0].slice(prefix.length).trim() : null;
  };
  if (lines.filter((l) => l.startsWith('m=')).length !== 1) return null;
  if (!/^m=application \d+ UDP\/DTLS\/SCTP webrtc-datachannel$/.test(value('m=') === null ? '' : `m=${value('m=')}`)) return null;
  const ufrag = value('a=ice-ufrag:');
  const pwd = value('a=ice-pwd:');
  const fingerprint = value('a=fingerprint:');
  const setup = SETUPS.indexOf(value('a=setup:'));
  const mid = value('a=mid:');
  const sctpPort = value('a=sctp-port:');
  if (!ufrag || !pwd || !fingerprint || setup < 0 || mid === null || sctpPort !== '5000') return null;
  const fp = fingerprint.match(/^sha-256 ((?:[0-9A-F]{2}:){31}[0-9A-F]{2})$/i);
  if (!fp) return null;

  const candidates = [];
  for (const line of lines) {
    if (!line.startsWith('a=candidate:')) continue;
    const parts = line.slice('a=candidate:'.length).split(' ');
    const [, component, protocol, priority, address, port, typ, type] = parts;
    if (component !== '1' || protocol.toLowerCase() !== 'udp' || typ !== 'typ') continue;
    const typeIndex = CANDIDATE_TYPES.indexOf(type);
    if (typeIndex < 0 || !/^\d+$/.test(port) || !/^\d+$/.test(priority)) continue;
    let kind;
    let addr;
    if ((addr = parseIPv4(address))) kind = 0;
    else if ((addr = parseIPv6(address))) kind = 1;
    else if (MDNS.test(address)) {
      kind = 2;
      const hexText = address.slice(0, 36).replace(/-/g, '');
      addr = Array.from({ length: 16 }, (_, i) => parseInt(hexText.slice(i * 2, i * 2 + 2), 16));
    } else if (address.length < 200) {
      kind = 3;
      addr = address;
    } else continue;
    candidates.push({ typeIndex, kind, addr, port: Number(port), priority: Number(priority) });
    if (candidates.length >= MAX_CANDIDATES) break;
  }

  const w = new Writer();
  w.u8(1); // format version
  w.u8(setup);
  w.str(ufrag);
  w.str(pwd);
  w.raw(fp[1].split(':').map((h) => parseInt(h, 16)));
  w.str(mid);
  w.u8(candidates.length);
  for (const c of candidates) {
    const usual = DEFAULT_PRIORITY[CANDIDATE_TYPES[c.typeIndex]] === c.priority;
    w.u8(c.typeIndex | (c.kind << 2) | (usual ? 0 : 16));
    if (!usual) w.u32(c.priority);
    if (c.kind === 3) w.str(c.addr);
    else w.raw(c.addr);
    w.u16(c.port);
  }
  return new Uint8Array(w.bytes);
}

export function unpackSdp(bytes) {
  const r = new Reader(bytes);
  if (r.u8() !== 1) throw new Error('unsupported version');
  const setup = SETUPS[r.u8()];
  const ufrag = r.str();
  const pwd = r.str();
  const fp = Array.from(r.take(32), (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
  const mid = r.str();
  const count = r.u8();
  if (!setup || !ufrag || !pwd || !/^[\w.-]{1,32}$/.test(mid) || count > MAX_CANDIDATES) throw new Error('bad fields');
  const candidates = [];
  for (let i = 0; i < count; i += 1) {
    const head = r.u8();
    const type = CANDIDATE_TYPES[head & 3];
    const kind = (head >> 2) & 3;
    const priority = head & 16 ? r.u32() : DEFAULT_PRIORITY[type];
    let address;
    if (kind === 0) address = Array.from(r.take(4)).join('.');
    else if (kind === 1) address = formatIPv6(r.take(16));
    else if (kind === 2) {
      const h = hex(r.take(16));
      address = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}.local`;
    } else {
      address = r.str();
      if (!/^[\w.:-]+$/.test(address)) throw new Error('bad address');
    }
    const port = r.u16();
    const related = type === 'host' ? '' : ' raddr 0.0.0.0 rport 0';
    candidates.push(`a=candidate:${i + 1} 1 udp ${priority} ${address} ${port} typ ${type}${related} generation 0`);
  }
  const session = String(Math.floor(Math.random() * 9e15) + 1e15);
  return [
    'v=0',
    `o=- ${session} 2 IN IP4 127.0.0.1`,
    's=-',
    't=0 0',
    `a=group:BUNDLE ${mid}`,
    'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    ...candidates,
    `a=ice-ufrag:${ufrag}`,
    `a=ice-pwd:${pwd}`,
    'a=ice-options:trickle',
    `a=fingerprint:sha-256 ${fp}`,
    `a=setup:${setup}`,
    `a=mid:${mid}`,
    'a=sctp-port:5000',
    'a=max-message-size:262144',
    '',
  ].join('\r\n');
}

export async function encodeSignal({ type, sdp }, { strictLocal = false } = {}) {
  if (type !== 'offer' && type !== 'answer') throw new Error('Unknown description type');
  const kind = type === 'answer' ? 'a' : strictLocal ? 'l' : 'o';
  let compact = null;
  try {
    compact = packSdp(sdp);
  } catch {
    compact = null;
  }
  if (compact) return 'c' + kind + toBase64Url(compact);
  const bytes = new TextEncoder().encode(slimSdp(sdp));
  if (supportsDeflateRaw()) {
    try {
      return 'z' + kind + toBase64Url(await pipeBytes(bytes, new CompressionStream('deflate-raw')));
    } catch {
      // Fall through to the uncompressed form.
    }
  }
  return 'p' + kind + toBase64Url(bytes);
}

// Accepts a raw token, an invite/reply URL, or text that contains one.
export function extractToken(text) {
  const value = String(text || '').trim();
  const match = value.match(/[#&?](offer|answer)=([A-Za-z0-9_-]+)/);
  if (match) return match[2];
  const bare = value.replace(/\s+/g, '');
  return /^[zpc][ola][A-Za-z0-9_-]{20,}$/.test(bare) ? bare : null;
}

export async function decodeSignal(text) {
  const token = extractToken(text);
  if (!token) throw new Error('That does not look like a Duet Chess code.');
  const codec = token[0];
  const kind = token[1];
  let bytes;
  if (codec === 'c') {
    try {
      const sdp = unpackSdp(fromBase64Url(token.slice(2)));
      return { type: kind === 'a' ? 'answer' : 'offer', sdp, strictLocal: kind === 'l' };
    } catch {
      throw new Error('The code is incomplete or damaged. Try scanning it again.');
    }
  }
  try {
    bytes = fromBase64Url(token.slice(2));
    if (codec === 'z') {
      if (typeof DecompressionStream !== 'function') {
        throw new Error('This browser cannot read compressed codes. Please update it.');
      }
      bytes = await pipeBytes(bytes, new DecompressionStream('deflate-raw'));
    }
  } catch (error) {
    if (/update it/.test(error.message)) throw error;
    throw new Error('The code is incomplete or damaged. Try scanning it again.');
  }
  const sdp = new TextDecoder().decode(bytes);
  if (!sdp.startsWith('v=0')) throw new Error('The code is incomplete or damaged.');
  return { type: kind === 'a' ? 'answer' : 'offer', sdp, strictLocal: kind === 'l' };
}

export function randomCode(length = CODE_LENGTH) {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  let code = '';
  for (const value of values) code += CODE_ALPHABET[value % CODE_ALPHABET.length];
  return code;
}

export function randomId(prefix = '') {
  const values = new Uint32Array(3);
  crypto.getRandomValues(values);
  return prefix + Array.from(values, (v) => v.toString(36)).join('');
}

// Accepts "k7qf2m", "K7Q-F2M", or a full invite link containing #join=CODE.
export function normalizeCode(input) {
  const text = String(input || '').trim();
  const fromLink = text.match(/[#&?]join=([A-Za-z0-9-]+)/);
  const raw = (fromLink ? fromLink[1] : text).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const pattern = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);
  return pattern.test(raw) ? raw : null;
}

export function peerIdFor(code) {
  return `duet-chess-v1-${code.toLowerCase()}`;
}
