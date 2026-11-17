// Tracks which squares of the screen a finger has painted during the touch test.

export class CoverageGrid {
  constructor(width, height, targetCell = 42) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.cols = Math.max(4, Math.round(this.width / targetCell));
    this.rows = Math.max(6, Math.round(this.height / targetCell));
    this.cellW = this.width / this.cols;
    this.cellH = this.height / this.rows;
    this.cells = new Uint8Array(this.cols * this.rows);
    this.filled = 0;
  }

  get total() {
    return this.cells.length;
  }

  get coverage() {
    return this.filled / this.cells.length;
  }

  get complete() {
    return this.filled === this.cells.length;
  }

  indexAt(x, y) {
    if (!(x >= 0 && y >= 0 && x <= this.width && y <= this.height)) return -1;
    const col = Math.min(this.cols - 1, Math.floor(x / this.cellW));
    const row = Math.min(this.rows - 1, Math.floor(y / this.cellH));
    return row * this.cols + col;
  }

  mark(x, y) {
    const index = this.indexAt(x, y);
    if (index < 0 || this.cells[index]) return -1;
    this.cells[index] = 1;
    this.filled += 1;
    return index;
  }

  // Marks every cell along a finger movement so fast swipes leave no gaps.
  markSegment(x0, y0, x1, y1) {
    const distance = Math.hypot(x1 - x0, y1 - y0);
    const step = Math.min(this.cellW, this.cellH) / 3;
    const count = Math.max(1, Math.ceil(distance / step));
    const added = [];
    for (let i = 0; i <= count; i += 1) {
      const t = i / count;
      const index = this.mark(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
      if (index >= 0) added.push(index);
    }
    return added;
  }

  cellRect(index) {
    const col = index % this.cols;
    const row = Math.floor(index / this.cols);
    return { x: col * this.cellW, y: row * this.cellH, w: this.cellW, h: this.cellH };
  }

  missing() {
    const list = [];
    for (let i = 0; i < this.cells.length; i += 1) if (!this.cells[i]) list.push(i);
    return list;
  }
}
