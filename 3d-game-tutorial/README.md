# Cube→Game

A free, hands-on course that takes you from a spinning cube to **Skyhop**, a finished 3D
platformer that runs in the browser on desktop and phones. It's built with
[Three.js](https://threejs.org) r187 and plain JavaScript modules, with no bundler and no framework.

- **Course:** https://mansonforsure.github.io/web-apps/3d-game-tutorial/
- **Play Skyhop:** https://mansonforsure.github.io/web-apps/3d-game-tutorial/game/

## The curriculum

| Tier | Lessons |
| --- | --- |
| **1 · Foundations** | 01 Your first 3D scene · 02 Light, materials and shadows · 03 Input and motion · 04 A third-person chase camera |
| **2 · Gameplay** | 05 Gravity and jumping · 06 Platforms and collisions · 07 Collectibles and a HUD · 08 Real 3D models and animation · 09 Enemies and simple AI |
| **3 · Polish & ship** | 10 Game flow, levels and saving · 11 Juice · 12 Shaders · 13 Performance and mobile · 14 Ship it |

Every lesson has a live, editable demo (`lessons/NN-slug/demo.html`). The code shown in each lesson
is copied from the real demo or game files at build time, so the page and the running code always match.

## Run it locally

Browsers won't load JavaScript modules from `file://`, so start any static server in this folder:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then open the printed address. Each `demo.html` is a single self-contained page, so it's easy to copy and remix.

## Folder map

```
3d-game-tutorial/
├── index.html              course home (generated)
├── lessons/
│   ├── kit/            the small demo kit: stage, input, chase camera, physics, player, character
│   └── NN-slug/
│       ├── lesson.md       lesson source (edit this)
│       ├── index.html      lesson page (generated)
│       ├── demo.html       live demo
│       └── poster.jpg      demo thumbnail
├── game/                   Skyhop, the finished game
│   ├── index.html, styles.css
│   └── src/                one module per job: physics, player, enemy, level, camera, audio, ...
├── assets/                 site CSS/JS, fonts, robot model, vendored three.js
├── tools/
│   ├── build.py            lesson.md → index.html (Markdown + snippets + syntax highlighting)
│   ├── templates/          page templates
│   ├── add-region.py       mark a code block as a quotable `// #region`
│   └── check-levels.mjs    sanity-checks that every Skyhop level is completable
└── tests/                  browser-run unit tests for the physics kit
```

## Editing lessons

Lesson pages are generated from Markdown. After editing a `lesson.md`:

```bash
pip install markdown pygments
python3 tools/build.py --check
```

Inside a lesson you can write `::demo` to embed the lesson's demo, and
`::snippet game/src/enemy.js#fsm "caption"` to quote the code between `// #region fsm` and
`// #endregion` in that file. `--check` fails if a snippet or link is broken.

## Credits

- **Three.js** r187, MIT License, © three.js authors.
- **RobotExpressive** model, CC0, by Tomás Laulhé ([Quaternius](https://quaternius.com)), modifications by Don McCurdy.
- **Bricolage Grotesque** and **JetBrains Mono** fonts, SIL Open Font License 1.1.
- All sound effects are synthesized at runtime with the Web Audio API.
