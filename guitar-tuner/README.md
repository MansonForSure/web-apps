# Pitch — a pocket guitar tuner

A self-contained six-string guitar tuner with automatic string selection, manual targets, a cents meter, input-level feedback, reference tones, and an explicitly labelled demo mode.

Standard tuning, lowest string first: **E2 · A2 · D3 · G3 · B3 · E4**, with A4 = 440 Hz. A reading within ±5 cents is shown as in tune. Pluck one string at a time and mute the others. This version detects one note, not chords or polyphonic input.

## Privacy and microphone use

Audio is analysed in memory in your browser. The app does not record, upload, or save audio. It has no analytics, accounts, external runtime dependencies, or API credentials. Reference tones are generated locally. Demo mode uses synthetic signals, never microphone recordings.

Microphone tuning requires permission and HTTPS (or localhost for development). Open the app in a standalone browser tab; some embedded and social-app browsers block microphone access. If access was denied, allow the microphone in the browser's website settings. A quiet electric guitar may need an audio interface or a microphone placed appropriately. Stop tuning, switch tabs, or leave the page to release the microphone.

## Development

Run these commands from this `guitar-tuner/` folder, using a current Node.js release and Python 3:

```sh
npm ci
npm run check
npm test
npm run build
npm run preview
```

Visit `http://127.0.0.1:8092/guitar-tuner/`.

- `src/`: pitch calculations and browser audio lifecycle.
- `site/guitar-tuner/`: static HTML, CSS, and favicon sources.
- `tests/`: deterministic pitch tests and mocked audio-lifecycle regression tests.
- `scripts/build.mjs`: bundles all runtime dependencies and writes the ready-to-serve files into this app folder. It never modifies sibling apps.
- `index.html`, `app.js`, `style.css`, `favicon.svg`, `licenses.txt`: deployable app files. No production server is required.

## Publication

This is one app in the shared `MansonForSure/web-apps` repository. Preserve the `sight-reading/` app and all other siblings.

GitHub Pages is already configured to serve **`gh-pages`, repository root**. Do not switch it to `/docs` or `main`. Fetch both branches, commit on top of current history, and fast-forward **both `main` and `gh-pages` to the same commit**, without force-pushing. Prefer one atomic push. A push to `main` alone does not update the public site.

The app's public route is `/web-apps/guitar-tuner/` on the account's GitHub Pages domain. Every runtime asset uses an app-relative path. Never include credentials, dependency caches, or machine configuration in Git.

## Pitch detection and attribution

Pitch detection uses the [Pitchy](https://github.com/ianprime0509/pitchy) npm 4.1.0 distribution and the McLeod Pitch Method. Its FFT dependency is bundled too. Distributed license texts are included in `licenses.txt`; a latest upstream repository license can differ from a pinned package release.

Synthetic test signals and mocked audio devices verify calculations and lifecycle logic. They do not substitute for testing your own phone, microphone, room, and guitar. No claim of professional hardware-tuner accuracy is made.
