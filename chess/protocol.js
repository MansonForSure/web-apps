// Pure game-state helpers shared by both devices. A game is a tiny object:
//   { id, hostColor: 'w' | 'b', moves: ['e2e4', ...], end: null | { reason, winner } }
// Both devices replay the same move list with chess.js, so either side can
// verify every move. `end` only records outcomes that the board cannot show
// (resignation or an agreed draw).

import { Chess } from './vendor/chess.js';
import { randomId } from './codec.js';

export const PROTOCOL_VERSION = 1;
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

export const other = (color) => (color === 'w' ? 'b' : 'w');

export function newGame(hostColor, id = randomId('g')) {
  if (hostColor !== 'w' && hostColor !== 'b') throw new Error('hostColor must be w or b');
  return { id, hostColor, moves: [], end: null };
}

export function rematchOf(game) {
  return newGame(other(game.hostColor));
}

export function colorFor(role, game) {
  return role === 'host' ? game.hostColor : other(game.hostColor);
}

export function parseUci(uci) {
  if (typeof uci !== 'string' || !UCI.test(uci)) return null;
  const move = { from: uci.slice(0, 2), to: uci.slice(2, 4) };
  if (uci[4]) move.promotion = uci[4];
  return move;
}

export function toUci(move) {
  return move.from + move.to + (move.promotion || '');
}

// Applies a UCI move to a chess.js instance. Returns the verbose move or null.
export function applyUci(chess, uci) {
  const move = parseUci(uci);
  if (!move) return null;
  try {
    return chess.move(move);
  } catch {
    return null;
  }
}

export function replay(game) {
  const chess = new Chess();
  for (const uci of game.moves) {
    if (!applyUci(chess, uci)) return null;
  }
  return chess;
}

export function outcome(game, chess) {
  if (game.end) return game.end;
  if (chess.isCheckmate()) return { reason: 'checkmate', winner: other(chess.turn()) };
  if (chess.isStalemate()) return { reason: 'stalemate', winner: null };
  if (chess.isInsufficientMaterial()) return { reason: 'insufficient', winner: null };
  if (chess.isThreefoldRepetition()) return { reason: 'repetition', winner: null };
  if (chess.isDrawByFiftyMoves()) return { reason: 'fifty', winner: null };
  return null;
}

function validEnd(end) {
  if (end === null) return true;
  if (!end || typeof end !== 'object') return false;
  if (end.reason === 'resign') return end.winner === 'w' || end.winner === 'b';
  if (end.reason === 'agreement') return end.winner === null;
  return false;
}

// Returns a clean copy of a remote game if it is well-formed and every move is
// legal; otherwise null.
export function sanitizeGame(value) {
  if (!value || typeof value !== 'object') return null;
  const { id, hostColor, moves, end = null } = value;
  if (typeof id !== 'string' || id.length < 2 || id.length > 64) return null;
  if (hostColor !== 'w' && hostColor !== 'b') return null;
  if (!Array.isArray(moves) || moves.length > 1200) return null;
  if (!moves.every((m) => typeof m === 'string' && UCI.test(m))) return null;
  if (!validEnd(end)) return null;
  const game = { id, hostColor, moves: moves.slice(), end: end ? { ...end } : null };
  const chess = replay(game);
  if (!chess) return null;
  if (game.end) {
    // A resignation or draw agreement cannot follow a finished position.
    const board = outcome({ ...game, end: null }, chess);
    if (board) game.end = null;
  }
  return game;
}

function isPrefix(shorter, longer) {
  if (shorter.length > longer.length) return false;
  return shorter.every((move, i) => longer[i] === move);
}

export function sameGame(a, b) {
  if (!a || !b) return a === b;
  return (
    a.id === b.id &&
    a.hostColor === b.hostColor &&
    a.moves.length === b.moves.length &&
    a.moves.every((m, i) => b.moves[i] === m) &&
    JSON.stringify(a.end) === JSON.stringify(b.end)
  );
}

// Host-authoritative merge used when devices (re)connect or detect a mismatch.
// - Different game ids: the host's game wins (new game / rematch).
// - Same game: the longer move list wins when one extends the other, so a
//   move made while the opponent was offline is never lost.
// - Genuine conflict: the host's version wins.
export function mergeGames(local, remote, localIsHost) {
  if (!remote) return local;
  if (!local) return { ...remote, moves: remote.moves.slice() };
  if (local.id !== remote.id) {
    return localIsHost ? local : { ...remote, moves: remote.moves.slice() };
  }
  const host = localIsHost ? local : remote;
  const guest = localIsHost ? remote : local;
  let base;
  if (isPrefix(local.moves, remote.moves) && remote.moves.length > local.moves.length) {
    base = remote;
  } else if (isPrefix(remote.moves, local.moves) && local.moves.length > remote.moves.length) {
    base = local;
  } else if (isPrefix(local.moves, remote.moves)) {
    // Same moves: keep any recorded ending; the host breaks ties.
    const end = host.end || guest.end || null;
    return { id: host.id, hostColor: host.hostColor, moves: host.moves.slice(), end };
  } else {
    base = host;
  }
  return {
    id: host.id,
    hostColor: host.hostColor,
    moves: base.moves.slice(),
    end: base.end ? { ...base.end } : null,
  };
}

export function describeOutcome(result, myColor) {
  if (!result) return null;
  const name = (c) => (c === 'w' ? 'White' : 'Black');
  const youWon = result.winner && result.winner === myColor;
  const headline = result.winner ? (youWon ? 'You win' : 'You lose') : 'Draw';
  const detail = {
    checkmate: `Checkmate · ${name(result.winner)} wins`,
    resign: `${name(other(result.winner))} resigned`,
    agreement: 'Draw agreed',
    stalemate: 'Stalemate',
    insufficient: 'Insufficient material',
    repetition: 'Threefold repetition',
    fifty: 'Fifty-move rule',
  }[result.reason];
  return { headline, detail, youWon: Boolean(youWon), draw: !result.winner };
}

// Material captured from each side, derived from the current board.
export function capturedPieces(chess) {
  const start = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const counts = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece && piece.type !== 'k') counts[piece.color][piece.type] += 1;
    }
  }
  const values = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  const lost = { w: [], b: [] };
  const material = { w: 0, b: 0 };
  for (const color of ['w', 'b']) {
    for (const type of ['q', 'r', 'b', 'n', 'p']) {
      material[color] += counts[color][type] * values[type];
      const missing = Math.max(0, start[type] - counts[color][type]);
      for (let i = 0; i < missing; i += 1) lost[color].push(type);
    }
  }
  // lost.w are white pieces captured by black, and vice versa.
  return { lost, advantage: material.w - material.b };
}
