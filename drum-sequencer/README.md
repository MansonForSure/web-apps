# Backbeat

Backbeat is a step sequencer for a real acoustic drum kit that runs in the browser. Live at https://mansonforsure.github.io/web-apps/drum-sequencer/.

## Sound

Every hit is a recording. The kit is the Wilkinson Audio **Naked Drums** library: a Yamaha Recording Custom kit with a 22″ kick, 10/12/13/14/16″ toms, two snares, and Sabian and Zildjian cymbals. It was recorded through Neve, BAE and API preamps. For this app, each stroke was mixed down from all of its original microphones into one stereo one-shot. The sources are direct mics, overheads, close room, far room, mid-side and the wide china pair. The mix follows the balance of the library's own default stereo preset, in drummer's perspective.

Realism comes from the way the samples are played back:

- **Velocity layers.** The four painted dynamics (ghost, soft, normal, accent) pick different recorded strokes, up to 5 layers per drum, so quiet notes also sound softer in tone, not just lower in level.
- **Round robins.** Repeated notes rotate through 2–6 different takes, never the same take twice in a row, and add a tiny ±0.2 % tuning drift. This avoids the "machine-gun" effect.
- **Natural behaviour.** Closed and foot hi-hats choke a ringing open or half-open hat. Each voice has a realistic polyphony limit. Flams add a soft grace note 26 ms early, and rolls split the step into two strokes.
- **Feel.** Swing shifts the off-16ths. Humanize adds small Gaussian timing (σ ≈ 2 ms at 35 %) and dynamics variation, like a player rather than a grid.
- **Mix bus.** A gentle glue compressor and a soft-clip stage feed a transparent peak limiter. There is also an optional extra room ambience; the recordings already contain the real room.

Sounds and features: kick, two snares, cross-stick, five hi-hat articulations (closed, tight, half-open, open, foot), five toms, ride, ride bell, two crashes, china and splash. You get four pattern slots (A–D) with chain mode, 8–32 steps, a 16th or triplet grid, and 15 groove presets. Each row has level, pan, mute and solo. Export writes a seamless-loop WAV (offline render through the same engine) or a General MIDI drum file (channel 10), and share links store the whole beat in the URL.

## Use

Pick a dynamic in the toolbar, then click or tap steps. Click a hit again (or Shift-click) to remove it. Drag across steps to paint with a mouse. Click a drum name to hear it, and use ⋯ for that row's sound, level, pan, quick fill and shift. Keyboard: Space plays and stops, T is tap tempo, 1–4 switch patterns, and the arrow keys plus Enter edit the grid. Patterns are saved in this browser's local storage.

On iPhone the first tap unlocks audio. iOS 17 and later play through the silent switch. On older iOS, turn the ring/silent switch off if you hear nothing.

## Run locally

Serve the repository with any HTTP server, for example `python3 -m http.server 8000`, then open `http://localhost:8000/drum-sequencer/`. ES modules need HTTP; opening the file directly won't work. There is no build step, and no runtime dependencies, backend, analytics or uploads. Run `npm test` for the unit tests (Node 18 or newer) and `npm run check` for syntax checks.

`tools/` holds the Python scripts that produced `samples/` from the original multi-mic FLAC library: `parse_sfz.py` builds the sample map from the SFZ files, and `build_kit.py` does the mixdown, trimming, fades and MP3 encoding. They need numpy, scipy, soundfile and ffmpeg, plus a local clone of the source library.

## Credits and licences

Drum samples: **Naked Drums** © Wilkinson Audio, licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). SFZ edition by kinwie and the [SFZ Instruments](https://github.com/sfzinstruments/WilkinsonAudio.NakedDrums) project. Changes made for this app: multi-mic mixdown to stereo, level balancing, silence trimming, tail fades, round-robin and velocity-layer selection, and MP3 encoding. See `samples/LICENSE.md`.

Manrope and Instrument Serif are bundled from Google Fonts under the SIL Open Font License; licenses are included in `assets/fonts/`.
