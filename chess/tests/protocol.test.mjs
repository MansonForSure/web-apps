import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyUci,
  capturedPieces,
  colorFor,
  describeOutcome,
  mergeGames,
  newGame,
  outcome,
  parseUci,
  rematchOf,
  replay,
  sameGame,
  sanitizeGame,
} from '../protocol.js';

const SCHOLARS_MATE = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'];

function game(moves, extra = {}) {
  return { id: 'g1', hostColor: 'w', moves, end: null, ...extra };
}

test('colours follow the host choice', () => {
  const g = newGame('b');
  assert.equal(colorFor('host', g), 'b');
  assert.equal(colorFor('guest', g), 'w');
  const r = rematchOf(g);
  assert.notEqual(r.id, g.id);
  assert.equal(r.hostColor, 'w');
  assert.deepEqual(r.moves, []);
});

test('UCI parsing rejects junk', () => {
  assert.deepEqual(parseUci('e7e8q'), { from: 'e7', to: 'e8', promotion: 'q' });
  assert.equal(parseUci('e9e4'), null);
  assert.equal(parseUci('e2e4k'), null);
  assert.equal(parseUci(42), null);
});

test('illegal moves are refused, legal ones applied', () => {
  const chess = replay(game([]));
  assert.equal(applyUci(chess, 'e2e5'), null);
  assert.equal(applyUci(chess, 'e2e4').san, 'e4');
});

test('checkmate is detected for both devices', () => {
  const g = game(SCHOLARS_MATE);
  const result = outcome(g, replay(g));
  assert.deepEqual(result, { reason: 'checkmate', winner: 'w' });
  assert.equal(describeOutcome(result, 'w').headline, 'You win');
  assert.equal(describeOutcome(result, 'b').headline, 'You lose');
});

test('sanitizeGame rejects tampered states', () => {
  assert.ok(sanitizeGame(game(['e2e4', 'e7e5'])));
  assert.equal(sanitizeGame(game(['e2e4', 'e2e4'])), null);
  assert.equal(sanitizeGame({ ...game([]), hostColor: 'x' }), null);
  assert.equal(sanitizeGame({ ...game([]), end: { reason: 'resign', winner: 'z' } }), null);
  assert.equal(sanitizeGame(null), null);
  // A resignation recorded after checkmate is discarded.
  assert.equal(sanitizeGame(game(SCHOLARS_MATE, { end: { reason: 'resign', winner: 'b' } })).end, null);
});

test('promotion requires and keeps the chosen piece', () => {
  // White pawn captures the rook on g8 and under-promotes to a knight.
  const moves = ['h2h4', 'g7g5', 'h4g5', 'g8f6', 'g5g6', 'f8g7', 'g6h7', 'h8g8', 'h7g8n'];
  const g = sanitizeGame(game(moves));
  assert.ok(g, 'promotion game is valid');
  assert.equal(replay(g).get('g8').type, 'n');
  assert.equal(sanitizeGame(game([...moves.slice(0, -1), 'h7g8'])), null);
});

test('merge: guest adopts a new host game (rematch)', () => {
  const local = game(['e2e4']);
  const remote = { ...game([]), id: 'g2', hostColor: 'b' };
  assert.equal(mergeGames(local, remote, false).id, 'g2');
  assert.equal(mergeGames(local, remote, true).id, 'g1');
});

test('merge: the longer move list wins when it extends the other', () => {
  const short = game(['e2e4']);
  const long = game(['e2e4', 'e7e5']);
  assert.deepEqual(mergeGames(short, long, true).moves, long.moves);
  assert.deepEqual(mergeGames(long, short, true).moves, long.moves);
  assert.deepEqual(mergeGames(short, long, false).moves, long.moves);
});

test('merge: conflicts resolve to the host', () => {
  const hostView = game(['e2e4', 'e7e5']);
  const guestView = game(['e2e4', 'c7c5']);
  assert.deepEqual(mergeGames(hostView, guestView, true).moves, hostView.moves);
  assert.deepEqual(mergeGames(guestView, hostView, false).moves, hostView.moves);
});

test('merge: endings recorded on either side survive', () => {
  const resigned = game(['e2e4'], { end: { reason: 'resign', winner: 'b' } });
  const plain = game(['e2e4']);
  assert.deepEqual(mergeGames(plain, resigned, true).end, resigned.end);
  assert.deepEqual(mergeGames(plain, resigned, false).end, resigned.end);
});

test('merge converges: both sides end up identical after one exchange', () => {
  const host = game(['e2e4', 'e7e5', 'g1f3']);
  const guest = game(['e2e4', 'e7e5']);
  const hostMerged = mergeGames(host, guest, true);
  const guestMerged = mergeGames(guest, hostMerged, false);
  assert.ok(sameGame(hostMerged, guestMerged));
});

test('captured pieces and material balance', () => {
  const g = game(['e2e4', 'd7d5', 'e4d5', 'd8d5']);
  const { lost, advantage } = capturedPieces(replay(g));
  assert.deepEqual(lost.w, ['p']);
  assert.deepEqual(lost.b, ['p']);
  assert.equal(advantage, 0);
});
