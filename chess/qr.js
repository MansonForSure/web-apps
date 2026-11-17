// QR codes: rendered as crisp SVG, scanned with the camera via jsQR (loaded
// only when the scanner opens).

import qrcode from './vendor/qrcode.mjs';
import { loadScript } from './net.js';

export function renderQr(container, text, { ecc = 'M', label = 'QR code' } = {}) {
  const qr = qrcode(0, ecc);
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const quiet = 4;
  const size = count + quiet * 2;
  let path = '';
  for (let row = 0; row < count; row += 1) {
    let run = 0;
    for (let col = 0; col <= count; col += 1) {
      const dark = col < count && qr.isDark(row, col);
      if (dark) {
        run += 1;
      } else if (run) {
        path += `M${col - run + quiet} ${row + quiet}h${run}v1h-${run}z`;
        run = 0;
      }
    }
  }
  container.innerHTML =
    `<svg viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="${label}">` +
    `<rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#111"/></svg>`;
  container.dataset.modules = String(count);
  return count;
}

async function loadJsQr() {
  await loadScript(new URL('./vendor/jsQR.min.js', import.meta.url).href);
  if (typeof window.jsQR !== 'function') throw new Error('QR scanner failed to load');
  return window.jsQR;
}

export class Scanner {
  constructor(video) {
    this.video = video;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.stream = null;
    this.raf = 0;
    this.running = false;
    this.last = 0;
  }
  async start(onResult) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera access is not available in this browser. Paste the code instead.');
    }
    const [jsQR, stream] = await Promise.all([
      loadJsQr(),
      navigator.mediaDevices
        .getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        .catch((error) => {
          if (error?.name === 'NotAllowedError') {
            throw new Error('Camera permission was denied. Allow it in browser settings, or paste the code instead.');
          }
          throw new Error('Could not open the camera. Paste the code instead.');
        }),
    ]);
    this.stream = stream;
    this.running = true;
    this.video.srcObject = stream;
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    await this.video.play().catch(() => {});
    const tick = (now) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      if (now - this.last < 110) return;
      this.last = now;
      const { videoWidth: w, videoHeight: h } = this.video;
      if (!w || !h) return;
      const side = Math.min(w, h);
      const scale = Math.min(1, 900 / side);
      const out = Math.round(side * scale);
      this.canvas.width = out;
      this.canvas.height = out;
      this.ctx.drawImage(this.video, (w - side) / 2, (h - side) / 2, side, side, 0, 0, out, out);
      const image = this.ctx.getImageData(0, 0, out, out);
      const code = jsQR(image.data, out, out, { inversionAttempts: 'dontInvert' });
      if (code?.data && onResult(code.data) === true) this.stop();
    };
    this.raf = requestAnimationFrame(tick);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    for (const track of this.stream?.getTracks() || []) track.stop();
    this.stream = null;
    this.video.srcObject = null;
  }
}
