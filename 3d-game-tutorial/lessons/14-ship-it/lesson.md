---
title: Ship it: publish your game
tier: 3
minutes: 35
summary: Take stock of the finished Skyhop game, check the files a player will need, and publish it on GitHub Pages. Then choose one small idea to make it your own.
learn: How the finished game's modules fit together; How an update reaches the renderer; How to check paths, phones and licences before release; How to publish and update a GitHub Pages site; Where to take your next game
---

You started with a cube. Now you have a robot, floating islands, energy cores, enemies, three levels and a game that remembers your best times. The last step isn't another effect: it's giving someone else a link they can open and play.

There's no separate demo in this lesson. Your project is the [finished Skyhop game](../../game/index.html). Play a level, pause it, change the graphics setting and return to the title screen. Notice how many small systems now work together without asking the player to think about them.

You'll take a tour of those systems, prepare a publishable copy and put it online. Keep your first release small: a working game with clear controls is enough.

## How Skyhop fits together

A **module** is a JavaScript file that exports something for other files to use. Modules make responsibilities easier to find: if a jump feels wrong, look in the player controller, not the menu code.

Here's the whole `game/src/` folder, plus the HTML entry page. The lesson column points to the main ideas; the files aren't unchanged copies of the demos.

| File | Job in one line | Lessons |
| --- | --- | --- |
| `index.html` | Supplies the canvas, screens, HUD, import map and module entry point. | 1, 7, 10, 13 |
| `main.js` | Checks WebGL 2, creates systems, loads the robot and starts the loop. | 1, 8, 10, 13 |
| `config.js` | Keeps player, rules, camera and quality settings together. | 3–6, 9, 13 |
| `stage.js` | Owns scene, renderer, lights, bloom, resizing and adaptive quality. | 1–2, 11, 13 |
| `input.js` | Turns keyboard, mouse and touch events into movement, jump and look intent. | 3–4, 13 |
| `physics.js` | Moves the player against box and cylinder colliders, including platform riding. | 5–6 |
| `player.js` | Handles steering, jumps, health, respawning and animation choices. | 3–6, 8–9, 11 |
| `camera.js` | Follows and orbits the player, with menu framing and screen shake. | 4, 11, 13 |
| `character.js` | Loads the GLB robot, sizes it and blends its animation clips. | 8 |
| `levels.js` | Describes all three levels as data: islands, cores, enemies and exits. | 6–7, 9–10 |
| `level.js` | Builds a level, updates its objects and disposes of its owned resources. | 6–7, 9–10, 13 |
| `world.js` | Builds low-poly scenery and batches repeated decoration into instances. | 2, 6, 13 |
| `pickups.js` | Draws and animates energy cores and the portal, including its shader. | 7, 11–12 |
| `enemy.js` | Builds Spikers and runs patrol, alert, chase, return and stomp behaviour. | 9 |
| `game.js` | Coordinates states, level rules, damage, completion, timing and saving. | 7, 9–11 |
| `ui.js` | Updates HTML screens, hearts, core counts, buttons and time displays. | 7, 10–11 |
| `audio.js` | Synthesises sound effects and unlocks audio after player input. | 11 |
| `particles.js` | Reuses particle slots and draws each particle system as one Points object. | 11–13 |
| `sky.js` | Provides sky presets, a gradient shader, clouds and distant rocks. | 2, 12–13 |

The JavaScript files are inside `game/src/`; `index.html` is inside `game/`. The supporting `game/styles.css` styles the HTML interface; `assets/` holds the vendored Three.js files, fonts, favicon and robot model. Those files must travel with the JavaScript.

Two pairs are worth keeping straight. `levels.js` is the description; `level.js` turns that description into things that move and collide. `character.js` knows how to play an animation; `player.js` knows *when* walking, jumping or dancing makes sense.

> [!TIP] Change the smallest responsible file
> Before adding a feature, say which module should own it. A new island belongs in `levels.js`; a different jump rule belongs in `player.js`. Reach for `game.js` when the feature changes the rules or connects several systems, not just because it's the biggest file.

## How a frame flows

The loop is still the one you met in Lesson 1: update, then draw. Skyhop adds more work inside the update, but it doesn't give every object its own animation loop. One loop keeps the order visible.

::snippet game/src/main.js#loop "game/src/main.js — the finished game's loop"

`stage.monitor(raw)` gets the actual frame duration for Lesson 13's quality checks. `game.update(...)` gets a duration capped at `1 / 20` seconds to limit sudden movement. `stage.render()` draws the updated scene. The cap is a safety measure, not a catch-up simulation.

The full `game/src/game.js#frame` region contains both rules and system updates. These excerpts show its beginning and end. First, Skyhop checks whether gameplay is active or paused:

::snippet game/src/game.js#frame-systems "game/src/game.js — beginning of the frame region"

`this.level.update(...)` moves platforms and updates cores, enemies and the portal. Then `p.update(...)` steers the player and resolves collisions against those updated platforms. This is the Lesson 6 ordering again: move the ground before deciding where its rider lands.

Between the excerpts, the playing branch advances `levelTime`, checks jump pads, collects nearby cores, tests enemy contact and checks for a fall or portal entry. Other branches manage the short delays before result and game-over screens. The state system from Lesson 10 decides which rules run; a paused game doesn't simply pretend that every frame is normal.

Near the end, player animation is updated unless paused, then the camera and visual systems follow:

::snippet game/src/game.js#frame-view "game/src/game.js — end of the frame region"

`this.chase.update(...)` sees the player's new position, or the saved death focus. The sky follows the camera, the sunlight follows the player and particles receive zero movement time while paused. Back in `main.js`, rendering uses bloom when enabled, otherwise it draws directly.

The route is **`main.js` loop → `game.update` → level/enemies and player → camera → render**. If a feature looks one frame late, inspect that order before adding another timer.

## Pre-flight checks

**Deployment** means putting the files on a web server so another browser can request them. Skyhop is a **static site**: the server supplies files, while the player's browser runs the game. You don't need to run JavaScript on a server to make these single-player rules work.

### Keep the paths portable

Use relative paths for your own scripts, styles, imports and assets. `./` means the current folder and `../` means its parent. A path beginning with `/assets/` starts at the domain's root, which is usually wrong when your game lives under a repository name such as `/skyhop/`.

Skyhop already uses relative paths, but they rely on its folder layout. `game/index.html` finds Three.js at `../assets/vendor/three/three.module.js`. The robot URL in `main.js` is resolved against `import.meta.url`, the module's own address, so it climbs two folders from `game/src/` to reach `assets/models/`.

You have two sensible publishing layouts. Copying the built course with `game/` and `assets/` still beside each other preserves those paths; players open `/REPO/game/`. For a game-only repository that opens directly at `/REPO/`, prepare a separate folder called `skyhop-release`. Copy the **contents** of `game/` into it and copy the course's `assets/` folder inside it too.

In that game-only copy, replace these path prefixes, leaving the rest of each path unchanged. Don't change your original course while preparing a release.

| File | Old prefix → new prefix |
| --- | --- |
| `index.html` | `../assets/` → `./assets/` |
| `styles.css` | `../assets/` → `./assets/` |
| `main.js` | `../../assets/` → `../assets/` |

Change both import-map entries and the favicon in the HTML, the CSS font URLs, and the robot URL in `src/main.js`. The robot URL becomes `../assets/models/RobotExpressive.glb`. Keep the HTML's `styles.css` and `src/main.js` references as they are. Replace tutorial links targeting `../index.html` with the course's full address below. External links can use full URLs; your own asset paths should be relative.

Your release folder should now contain `index.html`, `styles.css`, `src/` and `assets/`. Test **that folder**, not just the original game. Copy the entire vendored Three.js folder: `three.module.js` also imports `three.core.js`, and addons can import other addons.

### Check the boring failures

- **Match filename case exactly.** GitHub Pages is case-sensitive: `RobotExpressive.glb` and `robotexpressive.glb` are different URLs. Windows and macOS commonly use case-insensitive filesystems, which can hide the mistake locally; some installations are case-sensitive too. Keep the spelling and capitals identical everywhere.
- **Use HTTP locally, not `file://`.** Run the local server from Lesson 1 in your release folder. Module imports and model requests must work as web requests; a double-clicked HTML file is not a publishing test.
- **Try a real phone.** Move, look and jump together, rotate the screen, pause and resume, and leave the tab then return. Check the menus, audio after a tap and low graphics mode. Lesson 13's small-screen preview helps, but it doesn't reproduce a phone's graphics hardware or browser controls.
- **Check the browser's Console and Network panels.** Reload with those developer-tool tabs open. Look for JavaScript errors and failed file requests, especially the model and imported addons. Finish a level and retry after losing all hearts.
- **Name the page.** Keep a meaningful `<title>`, a short `<meta name="description">` and a working favicon, the small icon shown beside a browser tab. `game/index.html` already supplies all three; rename them if you're publishing your own variant.
- **Include credits and licences.** Keep `assets/vendor/three/LICENSE`: Three.js uses the MIT licence, which requires its copyright and permission notice to accompany copies. Keep `assets/models/CREDITS.txt` too. RobotExpressive is CC0 1.0, by Tomás Laulhé / Quaternius, modified by Don McCurdy. CC0 doesn't require attribution, but crediting the artist is a good habit. Preserve the fonts' OFL licence files and record sources for anything you add.

Make a readable `CREDITS.txt` or `LICENSES.txt` in your release folder that lists those third-party components and points to their bundled notices. A licence for your own code is a separate choice; don't label someone else's model or library as your work. The [upstream robot notes](https://github.com/mrdoob/three.js/blob/dev/examples/models/gltf/RobotExpressive/README.md) explain its original credit and modifications.

> [!WARNING] Published files are public
> Never put passwords, private tokens or secret API keys in your JavaScript or upload folder. A player can download the files and inspect them. Hiding a value in a different module doesn't make it secret.

## Publish on GitHub Pages

**Git** records snapshots of your files. **GitHub** stores repositories online; a **repository**, or repo, is a project's files plus their recorded history. **GitHub Pages** serves a website from those files. You can use its web interface for your first release without learning every Git command.

The steps below assume the game-only `skyhop-release` folder from the checklist, with `index.html` at its top level.

### 1. Create your account and repo

Go to [github.com](https://github.com/), create an account and verify your email. Choose a username you're happy to see in your game's address. Once signed in, use the **+** menu and choose **New repository**.

Name the repository `skyhop` or another short name without spaces, and choose **Public**. GitHub Pages is available for public repositories on GitHub's free plan. If you plan to use the terminal commands below, leave the options to add a README, licence and `.gitignore` unticked so the remote repo starts empty. Click **Create repository**.

### 2. Upload your files: choose one route

**Web route:** on an empty repo, follow **uploading an existing file**. In a repo that already has files, choose **Add file → Upload files**. Open `skyhop-release` in your file manager and drag its files and subfolders onto the upload area, not the enclosing folder itself.

Check the proposed paths: you want `index.html`, not `skyhop-release/index.html`. Type a short message such as `Publish first playable version`, choose to commit directly to `main` for this new personal repo, and confirm the upload. A **commit** is the recorded snapshot with that message. If you choose a new branch instead, merge its proposed changes into `main` before configuring Pages.

The browser accepts up to 100 files per upload and 25 MiB per file. Use smaller batches, preserving subfolders, if needed; the [GitHub upload guide](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository) has the current limits. Don't drag a ZIP onto GitHub and expect Pages to unpack it.

**Git route:** install [Git](https://git-scm.com/), then open Terminal or Git Bash **inside your separate `skyhop-release` folder**. Run these commands one at a time, replacing `USERNAME` and `REPO` with your account and repository names:

```bash
git init
git add .
git commit -m "Publish Skyhop"
git branch -M main
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main
```

`git add .` selects the files; `commit` records them locally. `branch -M main` names the branch, a line of recorded changes, and `remote add` connects it to the empty GitHub repo. `push` sends the commits there. The `-u` setting lets later updates use just `git push`.

If Git asks who you are, set your name and email with `git config user.name "Your Name"` and `git config user.email "YOUR_EMAIL"`, then retry the commit. Use the email associated with GitHub, or its provided no-reply address. For authentication, follow Git's credential-manager sign-in, or use a personal access token when required; GitHub doesn't accept your account password for HTTPS Git pushes. Never put the token into a published file or the remote URL.

### 3. Turn on Pages

Once your files are visible on `main`, open the repository's **Settings → Pages**. Under **Build and deployment**, set **Source** to **Deploy from a branch**. Select **main** and **/ (root)**, then click **Save**.

Wait about **1–2 minutes** for the first deployment; it can take longer. Refresh the Pages settings and use the site link it shows. For this project-style repository, the address is:

`https://USERNAME.github.io/REPO/`

If you copied the whole course instead, that address opens its home page and your game is at `https://USERNAME.github.io/REPO/game/`. Pages doesn't offer `game/` as a branch-source folder; keep **/ (root)** and use the longer game URL. The [official publishing-source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) show the same settings.

> [!WARNING] Folders that start with an underscore
> GitHub Pages runs every site through a tool called **Jekyll**, which silently skips files and folders whose names start with `_` (like `_assets/`). They exist in your repository but return 404 on the live site. Either rename them, or add an empty file named `.nojekyll` at the repository root to switch Jekyll off. This course avoids the problem by naming its demo kit folder `lessons/kit/`.

This course itself is published the same way at [https://mansonforsure.github.io/web-apps/3d-game-tutorial/](https://mansonforsure.github.io/web-apps/3d-game-tutorial/). Skyhop lives at [https://mansonforsure.github.io/web-apps/3d-game-tutorial/game/](https://mansonforsure.github.io/web-apps/3d-game-tutorial/game/). The extra folders in those addresses are ordinary folders in the `web-apps` repository, not special Three.js hosting settings.

## Keep your release working

Open the public link on your phone and ask someone new to play without help. Watch where they hesitate: unclear controls or an awkward first jump are useful feedback.

Updating is the same job again: edit, test, commit and push. With the web route, edit or upload the changed files at their existing paths and commit to `main`. With Git, run this from your release folder after testing:

```bash
git add .
git commit -m "Improve the first level"
git push
```

You don't need to save the Pages settings again. Changes on the publishing branch trigger another deployment. Wait for that deployment before deciding the update failed.

A **cache** is a stored copy of a downloaded file. If the site still looks old, try a hard refresh: usually **Ctrl+Shift+R** on Windows/Linux or **Command+Shift+R** on macOS. Another browser or a private tab is a useful second check. If it still fails, check the repository's **Actions** tab for the Pages deployment, then inspect Network requests for wrong paths or missing files. A refresh cannot fix a file you never uploaded.

> [!NOTE] A save is not an online account
> Lesson 10 stores progress in `localStorage`, within that browser and site origin. Publishing to a different domain doesn't transfer your local save. Changing browsers or clearing site data can lose it, and another player won't share your best times. Skyhop still plays if saving is unavailable.

GitHub Pages isn't the only place to host static files. Pick one route for now; you can move later if your game needs something different.

| Host | Upload | Notes |
| --- | --- | --- |
| [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages) | Store files in a repo and publish a branch. | Keeps code history beside the site; the static site itself doesn't run a multiplayer server. |
| [Netlify Drop](https://app.netlify.com/drop) | Drag a ready-to-serve project folder onto the drop area. | Useful for a quick upload; update the existing site through its Deploys drop area. |
| [Cloudflare Pages](https://developers.cloudflare.com/pages/get-started/direct-upload/) | Connect Git, or use Direct Upload for a folder or ZIP. | Choose the route deliberately: changing a Direct Upload project to Git integration requires a new project. |
| [itch.io](https://itch.io/docs/creators/html5) | Create an HTML5 game page and upload a ZIP with `index.html` at its root. | Include every asset in the ZIP, use relative paths and test its embedded or fullscreen player. |

Check each host's current limits and terms rather than assuming an unlimited free service. For itch.io, use the game-only release layout: zipping `game/` alone would leave its shared assets outside the upload.

## Where to go next

Choose a change that answers a question you have, build a small test and keep a working release while you experiment.

### More physical worlds

A **physics engine** simulates bodies and their interactions. [Rapier's JavaScript guide](https://rapier.rs/docs/user_guides/javascript/getting_started_js/) is a starting point for falling crates, rotating bodies and more varied collision shapes. A library such as cannon-es is another option. Three.js still draws the scene; the physics engine supplies positions and collision results.

An engine isn't an automatic upgrade to Lesson 6's controller. You'll need to learn simulation stepping, body types and how to keep meshes aligned with collision shapes. Test one crate and one floor before rebuilding every island, and keep the robot's movement feel as a separate design goal.

### Your own worlds and models

Start a level editor by moving island markers and exporting the same data structure that `levels.js` already uses. The editor doesn't need to run inside the game. It just needs to produce positions and dimensions that `Level` understands.

For custom art, try [Blender's glTF export](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html) and reuse the loading ideas from Lesson 8. A detailed visual model doesn't automatically have useful collision shapes. Keep those shapes simple, check scale and orientation, and update the animation names in `player.js` if your new character uses different clips.

### Read the examples, then try WebGPU

Keep the [Three.js docs](https://threejs.org/docs/) and [examples](https://threejs.org/examples/) nearby. Open an example's source and isolate one idea rather than copying a whole scene. Check its Three.js version: live examples may have changed since this course's r187 copy.

**WebGPU** is a newer browser graphics API. Three.js has a [WebGPURenderer guide](https://threejs.org/manual/en/webgpurenderer.html), including a WebGL 2 fallback for devices without WebGPU. It's a separate experiment, not a one-line renderer swap for Skyhop: this course doesn't vendor the WebGPU build, and its `ShaderMaterial` shaders and `EffectComposer` chain need migration to the newer material and post-processing systems. Don't promise better performance without measuring on your target devices.

### Play with someone else

A [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) is a connection for sending messages between a browser and a server. A first multiplayer experiment could show another robot's position, without shared enemies or competitive scoring. Then learn how delayed messages affect movement and which rules the server should own.

A shared leaderboard or multiplayer game needs a trusted server, validation and hosting beyond static files. `localStorage` keeps personal records, not proof of an honest score.

## Your turn

> [!TRY] Challenges
> 1. **Make a fourth level.** Add an object to `LEVELS` in `game/src/levels.js` with a unique `id`, `name`, `spawn`, islands, cores and portal. Begin by adapting Meadow Hop with one new route; keep every core reachable. The game uses `LEVELS.length` for progression, but update fixed three-level wording in `ui.js` and check the level-button layout in `styles.css` too.
> 2. **Give a Spiker a new behaviour.** Add a `wait` state to `Spiker.update()` in `enemy.js`: after reaching a patrol point, wait for `stateTime` to pass a short delay before returning to `patrol`. Use `setState()` to reset the timer, advance `target` only once and decide whether `canSee(player)` interrupts the wait. Revisit Lesson 9 if transitions get tangled.
> 3. **Add a double jump.** Track one remaining air jump in `Player.update()` in `player.js`, and reset it on landing, `spawn()` and `respawn()`. Use a fresh `input.consumeJump()` press and `launch()` for the second jump. Its current `airTime = Infinity` prevents ordinary coyote-time jumps from repeating, so add the air-jump rule deliberately rather than removing that guard. Test pads and stomps too.
> 4. **Build a local speed-run leaderboard.** Skyhop already has `levelTime` and one best time per level. Extend `completeLevel()` in `game.js` to keep the five fastest times per level `id`, sorted from shortest to longest, in `save`. Let `persist()` write them to `localStorage`, supply defaults in `loadSave()` and render the list with `formatTime()` from `ui.js`. Pause shouldn't add time. Label it “on this device”, not an online leaderboard.

## Recap

- Skyhop's modules separate input, movement, world building, rules, visuals and HTML UI.
- One loop updates the level and player, then the camera, before rendering the frame.
- A release needs its assets, exact filename case, portable paths, phone tests and third-party licence notices.
- GitHub Pages publishes files from **main / (root)**; later commits and pushes publish updates.
- Keep local records distinct from shared accounts, and add new features in small, testable steps.

There's no next lesson to wait for. Publish your working game, send someone the link and let what they do with it guide your next change. You know how a cube becomes a game; the next one can start with your own idea.
