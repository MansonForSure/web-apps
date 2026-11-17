# Stompbox — Live Guitar Effects

A static, dependency-free pedalboard that processes a guitar (or any audio input) in real time in the browser. Live at https://mansonforsure.github.io/web-apps/guitar-fx/.

## What it does

Eleven effects run in a fixed, guitar-friendly order: **Noise Gate → Compressor → Auto-Wah → Drive (OD / DIST / FUZZ) → Amp EQ → Cabinet → Phaser → Chorus → Tremolo → Delay → Reverb**, followed by Master volume and an output safety limiter. Each pedal has a footswitch, a quick switch in the chain strip, and knobs. Seven presets (Clean, Crunch, Lead, Funk, Ambient, Surf, Psych Fuzz) are starting points. Any change marks the preset as edited, and tapping the preset again restores it. Settings are saved in local browser storage.

Knobs: on touch screens, swipe a knob **sideways** (vertical swipes keep scrolling the page). With a mouse, drag up/down or sideways, and hold Shift for fine control. Arrow keys, Page Up/Down, Home/End and Delete (reset) work with the keyboard. Double-tap or double-click resets a knob. The Delay pedal has tap tempo. **Bypass all** compares against the dry signal.

**Play demo riff** feeds a clearly labeled synthetic plucked-string riff (generated locally with Karplus–Strong synthesis) through the board without using the microphone.

## Connecting a guitar

- **Electric guitar:** use a guitar audio interface (USB-C or Lightning, such as an iRig-style adapter or a USB interface) and monitor with **wired headphones**. A phone's built-in mic picks up only the faint acoustic sound of an unplugged electric guitar.
- **Acoustic guitar:** the built-in microphone works. Still use headphones: a speaker next to the microphone will feed back and howl.
- **Two-input interfaces:** choose *Input 1 (left)* or *Input 2 (right)* under Channel. *Mono mix* averages both inputs.
- **Gain staging:** raise *Input* until hard playing peaks around −12 dB without CLIP, then set *Master*. The output limiter holds peaks at −1 dBFS.
- **Bluetooth headphones** add a large delay (often 150 ms or more) that makes real-time playing hard. The latency readout shows what the browser reports. It does not include Bluetooth or interface conversion delay, and some browsers (notably Safari) report only part of the path.

Echo cancellation, noise suppression and automatic gain control are requested **off**, so the guitar is not processed by speech filters. Browsers may ignore these preferences.

## Privacy

Audio is processed only in browser memory on your device. Nothing is recorded, uploaded or sent to an API. There are no analytics, remote fonts or third-party runtime dependencies. GitHub Pages serves the static files and may receive normal web request metadata. Audio stops and the input is released when you tap Stop, switch away from the page, or the input disconnects.

Microphone access requires HTTPS (or localhost) and permission. Embedded in-app previews can block permission, so open the GitHub Pages link directly in Safari or Chrome.

## How it works, and where the GPU fits

All audio runs on the browser's **real-time audio rendering thread**, the lowest-latency path available to a web page:

- Native Web Audio nodes: biquad filters (EQ, cabinet, tone, phaser all-pass stages), a 4× oversampled `WaveShaperNode` (drive), modulated `DelayNode`s (chorus, delay), `ConvolverNode` with a generated stereo impulse response (reverb), and LFO oscillators (phaser, chorus, tremolo).
- `AudioWorklet` processors (`audio/worklet.js`) for the noise gate, the feed-forward compressor, the envelope-following auto-wah (TPT state-variable filter) and the output limiter. None uses lookahead, so they add no latency.
- Bypassed pedals crossfade in about 12 ms (click-free) and are disconnected afterwards to save CPU.

**GPU use:** the live spectrum and waveform display is rendered by a **WebGL2 fragment shader** on the phone's GPU, falling back to Canvas 2D. The audio DSP itself deliberately stays on the audio thread. Browsers process audio in 128-sample blocks (about 2.7 ms). AudioWorklet code cannot access WebGPU or WebGL, and moving each block to the GPU and back from the main thread would add buffering and scheduling delay far larger than the compute it saves. A real-time effects chain like this needs only a small fraction of a modern phone CPU.

## Develop and check

The folder is the deployable site. There is no build step, and no package install or backend is needed. Serve it over localhost or HTTPS; ES modules and AudioWorklet do not load from a `file://` URL.

```sh
# From this folder, with Node.js 18+:
npm test
npm run check
# Optional local server (from the repository root):
python3 -m http.server 8080   # then open http://localhost:8080/guitar-fx/
```

All URLs are relative because the site is deployed under `/web-apps/guitar-fx/`. Publishing uses the repository's existing `gh-pages` source; `main` and `gh-pages` point to the same commit.

The tests run the real AudioWorklet processors, DSP helpers, presets, settings sanitizing and demo generator in Node with synthetic signals. They do not prove how it sounds or feels with a physical guitar, a specific interface, or a specific phone. Real-device listening and latency checks are still needed.

## References

- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) and [AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet)
- [Microphone permission and secure contexts](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [Karplus–Strong string synthesis](https://ccrma.stanford.edu/~jos/pasp/Karplus_Strong_Algorithm.html)
- [Topology-preserving state-variable filter (Andrew Simper, Cytomic)](https://cytomic.com/files/dsp/SvfLinearTrapOptimised2.pdf)
