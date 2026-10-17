export function makeDemoBuffer(context, bpm = 120) {
  const duration = 16 * 60 / bpm;
  const buffer = context.createBuffer(1, Math.round(duration * context.sampleRate), context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 17;
  for (let beat = 0; beat < 16; beat++) {
    const start = Math.round(beat * 60 / bpm * context.sampleRate);
    const length = Math.round(0.15 * context.sampleRate);
    for (let i = 0; i < length && start + i < data.length; i++) {
      const time = i / context.sampleRate;
      seed = (1664525 * seed + 1013904223) >>> 0;
      const noise = seed / 4294967296 * 2 - 1;
      const kick = Math.sin(2 * Math.PI * (65 * time + 1.3 * (1 - Math.exp(-30 * time)))) * Math.exp(-time * 32);
      const hat = noise * Math.exp(-time * 170);
      data[start + i] += (kick * 0.55 + hat * 0.2) * (beat % 4 === 0 ? 1 : 0.85);
    }
  }
  return buffer;
}
