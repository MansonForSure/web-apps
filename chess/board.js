// Board view: tap-to-move and drag-to-move with pointer events, legal-move
// hints, last-move and check highlights, and short move animations.

const FILES = 'abcdefgh';
const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

export function pieceUrl(color, type) {
  return new URL(`./assets/pieces/${color}${type.toUpperCase()}.svg`, import.meta.url).href;
}

export class Board {
  constructor(root, { onMove }) {
    this.root = root;
    this.onMove = onMove;
    this.orientation = 'w';
    this.squares = new Map();
    this.position = new Map();
    this.legal = new Map();
    this.selected = null;
    this.drag = null;
    this.interactive = false;
    this.myColor = 'w';
    this.ghost = document.createElement('img');
    this.ghost.className = 'drag-ghost';
    this.ghost.alt = '';
    this.ghost.draggable = false;
    this.build();
    root.addEventListener('pointerdown', (e) => this.pointerDown(e));
    root.addEventListener('pointermove', (e) => this.pointerMove(e));
    root.addEventListener('pointerup', (e) => this.pointerUp(e));
    root.addEventListener('pointercancel', () => this.cancelDrag());
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  build() {
    this.root.textContent = '';
    this.squares.clear();
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const square = this.squareFor(row, col);
        const el = document.createElement('div');
        const fileIndex = FILES.indexOf(square[0]);
        const rank = Number(square[1]);
        el.className = `sq ${(fileIndex + rank) % 2 === 1 ? 'light' : 'dark'}`;
        el.dataset.square = square;
        if (row === 7) el.insertAdjacentHTML('beforeend', `<span class="coord file">${square[0]}</span>`);
        if (col === 0) el.insertAdjacentHTML('beforeend', `<span class="coord rank">${square[1]}</span>`);
        this.squares.set(square, el);
        this.root.append(el);
      }
    }
    this.root.append(this.ghost);
    this.position.clear();
  }

  squareFor(row, col) {
    return this.orientation === 'w' ? FILES[col] + (8 - row) : FILES[7 - col] + (row + 1);
  }

  cell(square) {
    const file = FILES.indexOf(square[0]);
    const rank = Number(square[1]);
    return this.orientation === 'w' ? { col: file, row: 8 - rank } : { col: 7 - file, row: rank - 1 };
  }

  setOrientation(color) {
    if (color === this.orientation) return;
    this.orientation = color;
    this.build();
  }

  // state: { board (chess.board()), moves (legal verbose moves for me or []),
  //          lastMove {from,to}|null, check square|null, interactive, myColor }
  update(state, { animate = [] } = {}) {
    this.interactive = state.interactive;
    this.myColor = state.myColor;
    this.legal.clear();
    for (const move of state.moves) {
      if (!this.legal.has(move.from)) this.legal.set(move.from, []);
      this.legal.get(move.from).push(move);
    }
    if (this.selected && !this.legal.has(this.selected)) this.selected = null;

    const next = new Map();
    for (const row of state.board) {
      for (const piece of row) if (piece) next.set(piece.square, piece);
    }
    for (const [square, el] of this.squares) {
      const piece = next.get(square);
      const current = this.position.get(square);
      if (!piece) {
        el.querySelector('img.pc')?.remove();
      } else if (!current || current.color !== piece.color || current.type !== piece.type) {
        let img = el.querySelector('img.pc');
        if (!img) {
          img = document.createElement('img');
          img.className = 'pc';
          img.draggable = false;
          el.append(img);
        }
        img.src = pieceUrl(piece.color, piece.type);
        img.alt = `${piece.color === 'w' ? 'White' : 'Black'} ${PIECE_NAMES[piece.type]}`;
      }
      el.classList.toggle('last', Boolean(state.lastMove && (state.lastMove.from === square || state.lastMove.to === square)));
      el.classList.toggle('check', state.check === square);
      el.classList.toggle('mine', Boolean(piece && piece.color === this.myColor && this.interactive));
    }
    this.position = next;
    this.paintSelection();
    for (const { from, to } of animate) this.animate(from, to);
  }

  paintSelection() {
    const targets = new Map();
    for (const move of this.legal.get(this.selected) || []) targets.set(move.to, move);
    for (const [square, el] of this.squares) {
      el.classList.toggle('sel', square === this.selected);
      const move = targets.get(square);
      el.classList.toggle('dest', Boolean(move && !move.captured));
      el.classList.toggle('cap', Boolean(move && move.captured));
    }
  }

  animate(from, to) {
    const img = this.squares.get(to)?.querySelector('img.pc');
    if (!img || typeof img.animate !== 'function') return;
    const a = this.cell(from);
    const b = this.cell(to);
    const dx = (a.col - b.col) * 100;
    const dy = (a.row - b.row) * 100;
    img.classList.add('moving');
    const anim = img.animate(
      [{ transform: `translate(${dx}%, ${dy}%)` }, { transform: 'translate(0, 0)' }],
      { duration: 190, easing: 'cubic-bezier(.2,.7,.2,1)' },
    );
    anim.onfinish = anim.oncancel = () => img.classList.remove('moving');
  }

  squareAt(x, y) {
    const rect = this.root.getBoundingClientRect();
    const col = Math.floor(((x - rect.left) / rect.width) * 8);
    const row = Math.floor(((y - rect.top) / rect.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    return this.squareFor(row, col);
  }

  select(square) {
    this.selected = square;
    this.paintSelection();
  }

  tryMove(from, to, dragged = false) {
    const moves = (this.legal.get(from) || []).filter((m) => m.to === to);
    if (!moves.length) return false;
    this.selected = null;
    this.paintSelection();
    this.onMove(from, to, moves, dragged);
    return true;
  }

  pointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const square = this.squareAt(event.clientX, event.clientY);
    if (!square || !this.interactive) return;
    event.preventDefault();
    if (this.selected && this.selected !== square && this.tryMove(this.selected, square)) return;
    if (this.legal.has(square)) {
      const wasSelected = this.selected === square;
      this.select(square);
      const piece = this.position.get(square);
      this.drag = {
        from: square,
        startX: event.clientX,
        startY: event.clientY,
        active: false,
        wasSelected,
        pointerId: event.pointerId,
        piece,
      };
      try {
        this.root.setPointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    } else {
      this.select(null);
    }
  }

  pointerMove(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const rect = this.root.getBoundingClientRect();
    const size = rect.width / 8;
    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < Math.max(6, size * 0.12)) return;
      drag.active = true;
      this.ghost.src = pieceUrl(drag.piece.color, drag.piece.type);
      this.ghost.style.width = `${size}px`;
      this.ghost.style.height = `${size}px`;
      this.ghost.classList.add('on');
      this.squares.get(drag.from)?.classList.add('lifted');
    }
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2 - (event.pointerType === 'touch' ? size * 0.35 : 0);
    this.ghost.style.transform = `translate(${x}px, ${y}px) scale(1.12)`;
    const over = this.squareAt(event.clientX, event.clientY);
    for (const [square, el] of this.squares) el.classList.toggle('hover', square === over && square !== drag.from);
  }

  pointerUp(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const target = this.squareAt(event.clientX, event.clientY);
    const wasActive = drag.active;
    this.cancelDrag();
    if (wasActive) {
      if (target && target !== drag.from) this.tryMove(drag.from, target, true);
    } else if (drag.wasSelected && target === drag.from) {
      this.select(null);
    }
  }

  cancelDrag() {
    if (!this.drag) return;
    try {
      this.root.releasePointerCapture(this.drag.pointerId);
    } catch {
      // ignore
    }
    this.squares.get(this.drag.from)?.classList.remove('lifted');
    for (const el of this.squares.values()) el.classList.remove('hover');
    this.ghost.classList.remove('on');
    this.drag = null;
  }

  clearSelection() {
    this.cancelDrag();
    this.select(null);
  }
}
