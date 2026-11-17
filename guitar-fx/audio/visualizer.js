// Output visualizer. The spectrum and waveform are drawn by a WebGL2 fragment
// shader on the GPU, keeping the main thread free for the audio controls. Falls
// back to Canvas 2D when WebGL2 is unavailable.

const VERTEX = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uSpectrum;
uniform sampler2D uWave;
uniform vec2 uResolution;
uniform vec3 uColor;
uniform float uNyquist;
uniform float uLive;
out vec4 fragColor;

float spectrumAt(float x) {
  float hz = 30.0 * pow(16000.0 / 30.0, clamp(x, 0.0, 1.0));
  return texture(uSpectrum, vec2(clamp(hz / uNyquist, 0.0, 1.0), 0.5)).r;
}
float waveAt(float x) {
  return 0.5 + (texture(uWave, vec2(clamp(x, 0.0, 1.0), 0.5)).r - 0.5) * 1.7;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 color = vec3(0.045, 0.05, 0.058) + vec3(0.03, 0.03, 0.035) * uv.y;
  vec2 cell = fract(uv * vec2(12.0, 4.0));
  vec2 px = vec2(12.0, 4.0) / uResolution;
  float grid = step(cell.x, px.x) + step(cell.y, px.y);
  color += vec3(0.035) * min(grid, 1.0);

  float level = spectrumAt(uv.x) * uLive;
  float height = level * 0.92;
  if (uv.y < height) {
    float t = uv.y / max(height, 0.001);
    color = mix(color, uColor * (0.16 + 0.5 * t * t), 0.9);
  }
  float rim = 1.0 - smoothstep(0.0, 2.5, abs(uv.y - height) * uResolution.y);
  color += uColor * rim * 0.85 * step(0.004, level);
  color += uColor * 0.10 * level * (1.0 - uv.y);

  float dx = 1.0 / uResolution.x;
  float w0 = waveAt(uv.x - dx), w1 = waveAt(uv.x), w2 = waveAt(uv.x + dx);
  float lo = min(w0, min(w1, w2)), hi = max(w0, max(w1, w2));
  float dist = max(lo - uv.y, uv.y - hi) * uResolution.y;
  float line = 1.0 - smoothstep(0.6, 2.2, dist);
  color = mix(color, vec3(0.95, 0.94, 0.9), line * (0.28 + 0.62 * uLive));
  fragColor = vec4(color, 1.0);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Shader failed');
  return shader;
}

function hexToRgb(hex) {
  const value = parseInt(hex.replace('#', ''), 16);
  return [(value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255];
}

export class Visualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.mode = 'canvas';
    this.gl = null;
    this.idleSpectrum = new Uint8Array(1024);
    this.idleWave = new Uint8Array(1024).fill(128);
    try { this.initGL(); } catch { this.gl = null; }
    if (!this.gl) this.ctx2d = canvas.getContext('2d');
    this.resize();
  }

  initGL() {
    const gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
    if (!gl) return;
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Link failed');
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const texture = unit => {
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    };
    this.textures = [texture(0), texture(1)];
    this.uniforms = Object.fromEntries(['uSpectrum', 'uWave', 'uResolution', 'uColor', 'uNyquist', 'uLive']
      .map(name => [name, gl.getUniformLocation(program, name)]));
    gl.uniform1i(this.uniforms.uSpectrum, 0);
    gl.uniform1i(this.uniforms.uWave, 1);
    this.gl = gl;
    this.mode = 'webgl2';
    this.canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.lost = true; });
    this.canvas.addEventListener('webglcontextrestored', () => { this.lost = false; try { this.initGL(); } catch { this.gl = null; } });
  }

  resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
  }

  upload(unit, data) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[unit]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, data.length, 1, 0, gl.RED, gl.UNSIGNED_BYTE, data);
  }

  draw({ spectrum = this.idleSpectrum, wave = this.idleWave, nyquist = 24000, live = 0, color = '#f4b942' } = {}) {
    this.resize();
    if (this.gl && !this.lost) {
      const gl = this.gl;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this.upload(0, spectrum);
      this.upload(1, wave);
      gl.uniform2f(this.uniforms.uResolution, this.canvas.width, this.canvas.height);
      gl.uniform3fv(this.uniforms.uColor, hexToRgb(color));
      gl.uniform1f(this.uniforms.uNyquist, nyquist);
      gl.uniform1f(this.uniforms.uLive, live);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return;
    }
    this.draw2d(spectrum, wave, nyquist, live, color);
  }

  draw2d(spectrum, wave, nyquist, live, color) {
    const ctx = this.ctx2d;
    if (!ctx) return;
    const { width, height } = this.canvas;
    ctx.fillStyle = '#0c0e10';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.55;
    const bars = 96;
    for (let i = 0; i < bars; i++) {
      const hz = 30 * (16000 / 30) ** (i / bars);
      const bin = Math.min(spectrum.length - 1, Math.round((hz / nyquist) * spectrum.length));
      const h = (spectrum[bin] / 255) * height * 0.92 * live;
      ctx.fillRect((i / bars) * width, height - h, width / bars - 1, h);
    }
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = '#f1efe9';
    ctx.lineWidth = Math.max(1, width / 600);
    ctx.beginPath();
    for (let i = 0; i < wave.length; i++) {
      const x = (i / (wave.length - 1)) * width;
      const y = height * (0.5 - ((wave[i] - 128) / 255) * 1.7);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
