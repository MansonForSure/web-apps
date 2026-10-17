# Pulse — Live BPM Meter

A dependency-free browser app that estimates the tempo of live music through a microphone.

**Live app:** https://mansonforsure.github.io/web-apps/bpm-meter/

## Use

Open the app directly in a recent Chrome, Edge, Firefox, or Safari browser. Select **Start listening** and allow microphone access. Play a steady section of music near the microphone. Allow roughly 6–15 seconds for a useful estimate; the reading continues to update as the music plays.

Use **½ time** or **2× time** if the app selects a different musical pulse than the one you hear. **Tap the beat**, or keyboard **T**, provides a separate manual estimate. **Try a demo** sends a synthetic 120 BPM drum pattern through the same audio-analysis pipeline, without opening the microphone. Demo sound is optional.

Select **Stop listening** to release the microphone. Listening also stops on tab backgrounding, page navigation, processor failure, or microphone disconnection. Returning to the tab does not automatically restart it.

## Privacy

Microphone audio is processed entirely in browser memory. No audio is recorded to disk, uploaded, or sent to an external API. There are no analytics, remote fonts, or runtime dependencies. Only short rhythmic features are passed to a local Web Worker. GitHub serves the static site and may receive normal web request metadata.

Microphone access requires HTTPS or localhost and browser permission. Opening the site inside an embedded preview can block permission; open the GitHub Pages link directly instead.

## How it works

An AudioWorklet derives rhythmic onset and volume features using the audio sample clock, independent of display refresh timing. A Web Worker analyzes a rolling feature window to find plausible tempo periods and smooth the estimate. The canvas shows normalized recent rhythm activity, not a calibrated waveform. The input meter is relative digital sample level (dBFS), not acoustic sound-pressure level.

Confidence is a heuristic for rhythmic consistency, not a calibrated probability that the displayed musical tempo is correct. Music can legitimately be heard at half or double a detected pulse. Clear percussion usually works better than ambient music, free-time performances, conversation, syncopated rhythms, or rapidly changing tempo. The app is an estimate, not a professional measurement guarantee.

## Develop and check

The folder is the deployable site; no build step, package installation, or backend is required. Serve this directory over localhost or HTTPS rather than opening its ES modules with a file URL.

```sh
# From this folder, using Node.js 18+:
npm test
npm run check

# Optional local server, if Python is installed:
python3 -m http.server 8080
```

Keep all app URLs relative because this site is deployed under `/web-apps/bpm-meter/`. Publishing uses the existing repository-root GitHub Pages source on `gh-pages`. `main` and `gh-pages` must point to the same commit; sibling apps must remain unchanged.

Tests exercise the real feature extractor and tempo tracker with deterministic synthetic audio. These do not establish accuracy on a physical microphone or arbitrary live music; real-device testing remains necessary.

## Browser API and algorithm references

- [Microphone permission and secure contexts](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [AudioWorklet processing](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet)
- [Onset-envelope autocorrelation and tempo ambiguity](https://musicinformationretrieval.com/content/4_rhythm_tempo_beat/tempo_estimation.html)
