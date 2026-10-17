export class TapTempo {
  constructor() { this.reset(); }
  reset() { this.times = []; }
  tap(time) {
    const last = this.times.at(-1);
    if (last !== undefined && time - last < 140) return this.result();
    if (last !== undefined && (time <= last || time - last > 2500)) this.reset();
    this.times.push(time);
    this.times = this.times.slice(-12);
    return this.result();
  }
  result() {
    if (this.times.length < 3) return { bpm: null, count: this.times.length };
    const intervals = this.times.slice(1).map((time, index) => time - this.times[index]);
    const sorted = [...intervals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const clean = intervals.filter(interval => Math.abs(interval - median) < median * 0.3);
    const average = clean.reduce((sum, value) => sum + value, 0) / clean.length;
    return { bpm: 60000 / average, count: this.times.length };
  }
}
