# Keyroom

A dependency-free, polyphonic browser piano. Live at https://mansonforsure.github.io/web-apps/piano/.

## Play

Press **R for C4 (middle C)**, **5 for C♯4**, and **E for B3**. **4 produces no sound.** The letter row plays G3 through D5:

`Q G3 · W A3 · E B3 · R C4 · T D4 · Y E4 · U F4 · I G4 · O A4 · P B4 · [ C5 · ] D5`

The sharps are `2 G♯3 · 3 A♯3 · 5 C♯4 · 6 D♯4 · 8 F♯4 · 9 G♯4 · 0 A♯4 · = C♯5`. Keys 1, 4, 7 and minus are intentionally silent. Physical keyboard codes preserve the mapping with Shift or Caps Lock. Other keys do not play notes.

Hold multiple computer keys or touch multiple piano/shortcut buttons to play chords. Drag across keys for glissando. On small screens, swipe the horizontal strip under the piano to move around the keyboard; shortcuts also scroll. Some physical keyboards have hardware key-rollover limitations.

Transpose changes every input by -12 to +12 semitones. The piano highlights the **actual output pitch**; shortcut buttons show the resulting pitch while fingering stays unchanged. Touching a labeled piano key plays that pitch plus the selected transpose. The initial G2–D6 display expands if an edge touch produces an output outside that range. Changing transpose releases held inputs so notes cannot get stuck.

Hold **Space** for pedal sustain or tap **Sustain** to latch it. **Escape / All notes off** silences the piano. Volume, transpose and key-label preferences are saved locally where browser storage is available. Blur, hidden-page and navigation events release all notes and sustain.

The first musical key, touch or **Enable sound** unlocks browser audio. If sound remains blocked, tap Enable sound and check browser/tab/device volume. This is a synthesized piano-like instrument rather than a sampled acoustic piano. No microphone, uploads, account, analytics, backend or external runtime libraries.

## Run locally

Serve the repository with any HTTP server, for example `python3 -m http.server 8000`, then open `http://localhost:8000/piano/`. ES modules require HTTP rather than opening the HTML with a file URL. There is no build step. All assets are relative to this app directory for GitHub Pages project-site compatibility.

Manrope and Instrument Serif are bundled from Google Fonts under the SIL Open Font License; licenses are included in `assets/fonts/`.
