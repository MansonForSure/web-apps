import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeSignal, encodeSignal, extractToken, normalizeCode, packSdp, peerIdFor, randomCode, slimSdp } from '../codec.js';

const SDP = [
  'v=0',
  'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'a=extmap-allow-mixed',
  'a=msid-semantic: WMS',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=candidate:1 1 udp 2113937151 3a1f0f9e-0f3c-4bd9-a7d5-6a0a5b9c4e11.local 54400 typ host generation 0 network-cost 999',
  'a=candidate:2 1 tcp 1518280447 192.168.1.20 9 typ host tcptype active generation 0',
  'a=candidate:3 1 udp 1677729535 203.0.113.7 54400 typ srflx raddr 0.0.0.0 rport 0 generation 0',
  'a=ice-ufrag:Q3xS',
  'a=ice-pwd:4zN9lJ0p4Gm8VvQyR2b1c0dS',
  'a=ice-options:trickle',
  'a=fingerprint:sha-256 6B:8B:5D:EA:59:04:20:23:29:C8:87:1C:CD:9D:84:3C:D5:7F:76:22:9A:AB:1B:30:39:17:47:9C:15:8B:4F:55',
  'a=setup:actpass',
  'a=mid:0',
  'a=sctp-port:5000',
  'a=max-message-size:262144',
  '',
].join('\r\n');

test('slimSdp drops TCP candidates and keeps everything else', () => {
  const slim = slimSdp(SDP);
  assert.ok(!slim.includes(' tcp '));
  assert.ok(slim.includes('typ srflx'));
  assert.ok(slim.includes('a=fingerprint:sha-256'));
  assert.ok(slim.endsWith('\r\n'));
});

test('slimSdp caps the candidate count', () => {
  const many = SDP.replace(
    'a=ice-ufrag',
    Array.from({ length: 20 }, (_, i) => `a=candidate:${i + 10} 1 udp 1 10.0.0.${i} 5000 typ host`).join('\r\n') + '\r\na=ice-ufrag',
  );
  const count = slimSdp(many).split('\r\n').filter((l) => l.startsWith('a=candidate:')).length;
  assert.equal(count, 8);
});

test('standard data-channel SDPs use the compact codec', async () => {
  const offer = await encodeSignal({ type: 'offer', sdp: SDP });
  assert.match(offer, /^co[A-Za-z0-9_-]+$/);
  assert.ok(offer.length < 200, `compact token is ${offer.length} chars`);
  const decoded = await decodeSignal(offer);
  assert.equal(decoded.type, 'offer');
  assert.equal(decoded.strictLocal, false);
  const sdp = decoded.sdp;
  assert.ok(sdp.startsWith('v=0\r\n'));
  assert.ok(sdp.includes('a=ice-ufrag:Q3xS\r\n'));
  assert.ok(sdp.includes('a=ice-pwd:4zN9lJ0p4Gm8VvQyR2b1c0dS\r\n'));
  assert.ok(sdp.includes('a=fingerprint:sha-256 6B:8B:5D:EA:59:04:20:23:29:C8:87:1C:CD:9D:84:3C:D5:7F:76:22:9A:AB:1B:30:39:17:47:9C:15:8B:4F:55'));
  assert.ok(sdp.includes('a=setup:actpass'));
  assert.ok(sdp.includes('a=mid:0'));
  assert.ok(sdp.includes(' 3a1f0f9e-0f3c-4bd9-a7d5-6a0a5b9c4e11.local 54400 typ host'));
  assert.ok(sdp.includes(' 203.0.113.7 54400 typ srflx raddr 0.0.0.0 rport 0'));
  assert.ok(!sdp.includes(' tcp '));
  // Re-packing the rebuilt SDP gives the same bytes (stable round trip).
  assert.deepEqual(packSdp(sdp), packSdp(SDP));

  const answer = await encodeSignal({ type: 'answer', sdp: SDP.replace('a=setup:actpass', 'a=setup:active') });
  assert.equal(answer.slice(0, 2), 'ca');
  const decodedAnswer = await decodeSignal(answer);
  assert.equal(decodedAnswer.type, 'answer');
  assert.ok(decodedAnswer.sdp.includes('a=setup:active'));

  const strict = await encodeSignal({ type: 'offer', sdp: SDP }, { strictLocal: true });
  assert.equal(strict[1], 'l');
  assert.equal((await decodeSignal(strict)).strictLocal, true);
});

test('IPv6 and unusual priorities survive the compact codec', async () => {
  const sdp = SDP.replace(
    'a=ice-ufrag',
    'a=candidate:9 1 udp 2122262783 2001:db8::7:1 50000 typ host generation 0\r\na=candidate:10 1 udp 12345 198.51.100.4 3478 typ relay raddr 1.2.3.4 rport 9\r\na=ice-ufrag',
  );
  const decoded = (await decodeSignal(await encodeSignal({ type: 'offer', sdp }))).sdp;
  assert.ok(decoded.includes(' udp 2122262783 2001:db8:0:0:0:0:7:1 50000 typ host'));
  assert.ok(decoded.includes(' udp 12345 198.51.100.4 3478 typ relay raddr 0.0.0.0 rport 0'));
});

test('unusual SDPs fall back to compressed full SDP', async () => {
  const audio = SDP.replace('m=application', 'm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=mid:1\r\nm=application');
  assert.equal(packSdp(audio), null);
  const token = await encodeSignal({ type: 'offer', sdp: audio });
  assert.match(token, /^zo/);
  assert.equal((await decodeSignal(token)).sdp, slimSdp(audio));
  const sha1 = SDP.replace(/a=fingerprint:sha-256 [^\r]+/, 'a=fingerprint:sha-1 00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33');
  assert.equal(packSdp(sha1), null);
});

test('tokens can be read from invite and reply links', async () => {
  const token = await encodeSignal({ type: 'offer', sdp: SDP });
  assert.equal(extractToken(`https://example.com/web-apps/chess/#offer=${token}`), token);
  assert.equal(extractToken(`  ${token}\n`), token);
  assert.equal(extractToken('https://example.com/#answer=abc'), 'abc');
  assert.equal(extractToken('hello world'), null);
});

test('damaged codes produce a friendly error', async () => {
  const token = await encodeSignal({ type: 'offer', sdp: SDP });
  await assert.rejects(decodeSignal(token.slice(0, 40)), /incomplete or damaged/);
  const zipped = await encodeSignal({ type: 'offer', sdp: SDP.replace('m=application', 'm=audio 9 RTP/AVP 0\r\nm=application') });
  await assert.rejects(decodeSignal(zipped.slice(0, 40)), /incomplete or damaged/);
  await assert.rejects(decodeSignal('not a code'), /does not look like/);
});

test('room codes avoid ambiguous characters and normalise input', () => {
  for (let i = 0; i < 200; i += 1) {
    const code = randomCode();
    assert.match(code, /^[2-9A-HJKMNP-Z]{6}$/);
    assert.equal(normalizeCode(code.toLowerCase()), code);
  }
  assert.equal(normalizeCode('k7q f2m'), 'K7QF2M');
  assert.equal(normalizeCode('https://x.test/chess/#join=K7QF2M'), 'K7QF2M');
  assert.equal(normalizeCode('K0QF2M'), null);
  assert.equal(normalizeCode('ABC'), null);
  assert.match(peerIdFor('K7QF2M'), /^[A-Za-z0-9]+(?:[ _-][A-Za-z0-9]+)*$/);
});
