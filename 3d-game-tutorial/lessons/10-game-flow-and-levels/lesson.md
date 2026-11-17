---
title: Game flow, levels and saving
tier: 3
minutes: 35
summary: Turn a platforming scene into a small complete game. Add title and pause screens, build three levels from data, and remember progress between visits.
learn: How one setState function keeps game flow consistent; How level data separates what to build from how; How to dispose a level without leaving GPU resources or colliders behind; How to pause simulation while keeping rendering alive; How to validate edited levels and version saved progress
---

Your robot can move, jump and land. But a playable scene isn't quite a complete game yet: you need a beginning, a finish, a way to stop, and something to remember when you return. Welcome to Tier 3, **Polish & ship**. We'll organise those pieces before adding more visual effects.

Here's a tiny version of that whole journey. Press **Run the demo**, then **Play**. Use WASD and hold Space to jump, or use the left-thumb joystick and hold JUMP on a phone. Land on the orange goal block, choose **Next level**, and press Esc, P or **Pause** whenever you need a break. Movement and collisions come from lessons 3–6; our job today is the structure around them.

::demo "Three data-driven levels, title and pause screens, saved best times and a live JSON editor"

Try finishing level 1, returning to **Title**, and reloading the demo: level 2 should now be available.

## One state at a time

A **state machine** is a small set of named situations, with rules for moving between them. Lesson 9 used this idea for an enemy's behaviour. Here it describes the whole game: `title`, `playing`, `paused` and `complete`. A **transition** is a change from one of those states to another.

One string is easier to reason about than four separate flags. With `isPaused`, `isPlaying` and `hasFinished`, you can accidentally say that the game is playing and finished together. With `state === 'complete'`, the answer is unambiguous.

| State | Simulation | How you leave |
| --- | --- | --- |
| `title` | Stopped | Play, or open the editor |
| `playing` | Running | Pause, reach the goal, or leave the tab |
| `paused` | Stopped | Resume, restart, or return to title |
| `complete` | Stopped | Next level, play again, or return to title |

::snippet lessons/10-game-flow-and-levels/demo.html#states "demo.html — permitted transitions and one setState function"

The `transitions` object lists permitted destinations. The first line of `setState` rejects an unexpected change, such as pausing during the `boot` setup. Calling it with the current state is allowed: the editor uses that to refresh the overlays without inventing an extra game state.

Most importantly, this is the only function that assigns a new value to `state` after its initial declaration. It also updates the visible screen, the readout and button availability. If you later add a sound when pausing, you have one obvious place to put it, rather than remembering three separate event handlers.

`clearInput()` releases held keys, joystick movement and queued jumps at transitions. Otherwise, a Space press made in a menu could become a jump after resuming. The editor has a second, separate flag because opening a drawer is a UI detail: underneath it, the game remains paused.

### Pause the rules, not the drawing

An overlay doesn't pause physics. If you merely show the pause card, gravity still pulls the robot off a platform behind it. The frame update must explicitly decide whether the simulation is allowed to advance.

::snippet lessons/10-game-flow-and-levels/demo.html#simulation "demo.html — only playing advances physics and the level timer"

Both `levelTime += dt` and `player.update(...)` live inside `state === 'playing'`. They either advance together or stop together. We still consume menu jump presses, and the shared `createStage()` helper still draws the scene after this callback. The chase camera can settle into position while paused, but the robot cannot move.

Notice the order of the checks. Falling below `-12` rebuilds the current level and resets the attempt timer. Otherwise, standing on the goal collider completes the level. We use `player.grounded` and collider identity, not a distance test, so jumping near the orange block doesn't finish the level until you actually land on it.

The shared loop uses `THREE.Timer`, updates it every frame, and caps `dt` at `1 / 20` seconds as before. Pausing doesn't accumulate missed simulation time. We also pause when the window loses focus or the page becomes hidden, so a phone lock cannot quietly ruin a run.

> [!INFO] There isn't one universal clock
> A simulation timer measures time the game actually advances. This demo adds the same capped `dt` to movement and the run timer, so pauses don't count and a slow frame can't cause a giant step. A competitive wall-clock stopwatch would need separate timing rules; don't silently mix those two meanings.

## Levels as data

**Data-driven** means describing what you want separately from the code that creates it. Instead of writing three different blocks of mesh-building instructions, we write three plain objects. One builder will interpret all of them.

::snippet lessons/10-game-flow-and-levels/demo.html#levels "demo.html — three levels are ordinary JavaScript objects"

Each object has a stable `id`, a readable `name`, `spawn`, `platforms` and `goal`. The builder doesn't care whether the level is called First hop or Little climb. It only needs the agreed shape of the data.

Every box is `[x, y, z, w, h, d]`, with one important convention: **`y` is the walkable top surface**. For `[0, 0, 0, 7, 1, 7]`, the platform is 7 units wide and deep, and extends from `y = -1` to `y = 0`. The spawn `[0, 0, 2]` places the robot's feet on that surface, near its safe centre. The orange goal is another solid box, not a separate collision system.

The first level uses equal-height, broad platforms. The second introduces sideways steering and a small rise. The third keeps the same controls but asks for several rising jumps onto narrower platforms. Difficulty changes through numbers, not new movement code.

### Teach one idea at a time

A level is a lesson for your player. Introduce one main idea, let them practise it, then ask for a slightly more careful version. First hop has a 7 × 7 starting platform so you can move and jump without immediately falling; its first visible gap is only 0.6 units between platform edges.

Don't judge a jump by centre-to-centre distance alone. The first platform reaches to `z = -3.5`; the next one reaches back to `z = -4.1`. The useful question is whether the robot can cross the space between those edges and still land somewhere safe. Raising the destination makes a jump harder because you must reach it earlier, while you are still high enough.

Keep the first jump generous, make the orange destination visible, and increase one demand at a time: height, gap, landing width or steering. If you change all four together, a failed jump doesn't tell the player what to improve. Test by walking from the spawn, not by dropping the robot directly onto the tricky platform.

> [!TIP] Change one number, then play
> In the editor, increase a platform's width from `3.8` to `5`, or lower its top by `0.3`. Leave the controller's `jumpSpeed` and `gravity` alone while testing the route. That way you know whether your level edit, rather than different physics, made the jump feel better.

## Build, dispose, repeat

Changing levels must replace the old world, not pile a new one on top. We give every level a **group**, a scene object that holds its meshes together. The robot, camera and lights belong to the game and survive level changes; platforms and the goal belong to the level.

::snippet lessons/10-game-flow-and-levels/demo.html#build "demo.html — one buildLevel function turns the data into a playable scene"

`buildLevel(data)` starts by removing the previous level. Its inner `addBox` builds a mesh and a collider from the same numbers, reusing lesson 6's helper. `y - h / 2` converts our top-surface convention into the centre position that `box()` expects.

The goal's returned collider is kept as `goalCollider`, making the finish check precise. The rest of the function starts a fresh attempt: time returns to zero, velocity is cleared, old grounding and jump-buffer state are removed, and the chase camera will snap to the spawn. Resetting only the position would leave the robot falling at its previous speed.

Removing meshes from the scene isn't enough to release their graphics resources. A **GPU resource** is data Three.js has uploaded to the graphics processor, such as a geometry's vertex buffers. JavaScript's garbage collector doesn't perform all of that cleanup for you.

::snippet lessons/10-game-flow-and-levels/demo.html#dispose "demo.html — remove the scene objects, release resources, and clear collisions"

`scene.remove(levelGroup)` stops drawing the level. `geometry.dispose()` releases its geometry resources; `material.dispose()` tells Three.js to release resources associated with those materials. Here every `box()` call creates a new geometry and material, so both are owned by that level and safe to dispose.

`colliders.length = 0` is just as important. Colliders aren't rendered: if you forget them, the next level contains invisible walls and floors. Clearing `player.ground` also removes its reference to the platform it was standing on. Finally, we clear the group and discard our reference to it.

> [!WARNING] Dispose what you own
> This demo has no shared level materials or textures. In a larger game, don't dispose a material that the next level still uses. Textures need their own `dispose()` when their owner is finished with them; disposing a material doesn't automatically dispose its textures. Keep a clear distinction between per-level resources and resources shared for the game's lifetime.

### Check instead of guessing

The panel shows `renderer.info.memory.geometries` and `.textures`: counts of resources tracked by the renderer, not memory sizes in bytes. Start a level, open **Editor**, then press **Rebuild** repeatedly. With the same boxes, the geometry count should settle back to the same number after rendering.

This demo's first two levels normally report 9 geometries: five robot meshes plus three platforms and one goal. Little climb adds one platform, so 10 is expected. Textures needn't be zero because the renderer also has internal resources, including shadows. A different stable baseline isn't automatically a leak; steady growth after revisiting the same level is the warning sign.

## Edit a level live

Once levels are plain data, a simple editor is almost free. **JSON** is a text format for arrays, objects, strings and numbers. `JSON.stringify(currentData, null, 2)` fills the textarea with a readable, two-space-indented version of the current level.

::snippet lessons/10-game-flow-and-levels/demo.html#editor "demo.html — parse and validate before replacing the current level"

There are two different kinds of mistake. `JSON.parse()` rejects invalid text, such as a missing comma or an unquoted property name. The first `catch` turns that into a useful message and returns immediately, leaving the old level intact.

Valid JSON can still be wrong level data: `{"name":"Broken"}` parses successfully but has no spawn or platforms. `validateLevel(data)` checks a 1–40-character name, a three-number spawn, a six-number goal and 1–30 platform boxes. Coordinates must be finite and within ±100; box sizes must be positive and no larger than 30. Those limits keep accidental edits small enough for this demo.

Only after both checks pass do we call `buildLevel(data)`. The level is rebuilt immediately behind the drawer, but remains paused. Close the drawer and press **Resume** to test it; **Original** restores the built-in definition. Validation checks the format, not whether your route is reachable, so you still need to play it.

Typing and pointer presses inside the drawer stop propagating to the shared input listeners. This matters on a phone as well as a keyboard: editing a number mustn't steer the robot, and pressing Space in the textarea mustn't queue a jump. Esc closes the drawer rather than resuming while you're still editing.

Edited levels are marked `edited = true`. They are practice runs: completing a level with the goal moved beside the spawn won't replace your genuine best time or make another built-in level available. The edited JSON itself isn't saved, so copy it somewhere before leaving if you want to keep it.

## Save progress

A save should remember a player's progress, not serialise the entire scene. We need only the highest available level and best times. **localStorage** is the browser's small, persistent key–value store; it stores strings, so objects go through `JSON.stringify()` on the way in and `JSON.parse()` on the way out.

::snippet lessons/10-game-flow-and-levels/demo.html#save "demo.html — versioned save data, validated loading and guarded writing"

`version: 1` describes the save format. If we later change what the fields mean, we can recognise an older format and migrate it deliberately. This small demo instead returns a fresh save for an unknown version. That is a conscious fallback, not an automatic migration.

`highestUnlocked` is a **zero-based index**: `0` means level 1 is available, `1` means levels 1 and 2 are available. We clamp it to the existing level range when loading. Best times are stored under stable IDs such as `'first-hop'`, rather than array positions, so rearranging the level list doesn't attach a record to the wrong name. Only finite, positive times for known IDs are copied into the cleaned save.

::snippet lessons/10-game-flow-and-levels/demo.html#complete "demo.html — finish once, keep the faster time and save the next available level"

The guard at the top prevents completion from being counted twice. `setState('complete')` stops further simulation before we update the record. Lower times are better, so `levelTime < previous` keeps the faster attempt; a missing previous time counts as a new record.

`Math.max` prevents progress from moving backwards when you replay an early level. `Math.min` stops the highest available index extending beyond the final level. We persist after completion, not every frame: the useful data changed once, so one write is enough. The title's level buttons disable indices above that saved limit and show each available level's best time.

Both reading and writing are guarded because storage may be unavailable, full or contain broken JSON. If a write fails, the game still keeps progress in its current JavaScript object and displays a message; it simply can't promise to remember after a reload. This is local to the browser and site, not a cloud account: clearing site data or using another browser won't carry it across.

## How Skyhop does it

Skyhop uses the same separation, with richer data. Its Meadow Hop definition describes islands, cores, enemies and a portal rather than just platform boxes.

::snippet game/src/levels.js#meadow "game/src/levels.js — Meadow Hop describes what exists"

`at` uses the same `[x, topY, z]` idea, while `r` gives an island's radius. The data also names a sky theme and robot facing direction. It doesn't create meshes or start animations; those decisions belong to the systems that read it.

::snippet game/src/level.js#build-islands "game/src/level.js — turn island definitions into meshes and colliders"

The loop calls `buildIsland`, creates a cylindrical collider and records newly owned geometries. Tree descriptions become scenery and colliders too. That is the same WHAT/HOW boundary as `platforms` and `addBox`, with a more detailed builder on the HOW side.

::snippet game/src/level.js#dispose "game/src/level.js — clean up the resources owned by this level"

Skyhop disposes owned geometries, instanced decorations, cores, enemies and its portal. Unlike our boxes, its terrain uses shared materials from `world.js`, so this method doesn't dispose those materials. The old `Level` instance owns the collider array; replacing the instance replaces that array too, rather than keeping one global array to clear.

::snippet game/src/game.js#setstate "game/src/game.js — centralise state, input availability and HUD visibility"

The finished game's `setState` disables gameplay input outside `playing` and resets a state timer. It doesn't contain our transition table; its action methods and update checks decide which transitions are allowed. The shared principle is one place for changes that every state transition needs.

::snippet game/src/game.js#complete "game/src/game.js — completion adds celebration, records and progress"

Skyhop adds a celebration animation, sound and particles before preparing its result. Its `unlocked` field counts available levels starting at 1, unlike our zero-based highest index. Hence `levelIndex + 2`: completing index 0 makes two levels available. Don't copy that expression into a differently defined save field without changing it.

::snippet game/src/game.js#load-save "game/src/game.js — defaults for progress and player preferences"

::snippet game/src/game.js#persist "game/src/game.js — saving failure must not stop the game"

Skyhop also remembers mute and graphics preferences. Its loader merges parsed data with defaults and catches failures; it doesn't validate each field or enforce the `v` version value the way our teaching demo checks `version`. For a changing save format, you'd add explicit migration and validation here. Both versions keep the playable game separate from the success of a storage write.

## Your turn

> [!TRY] Challenges
> 1. Make Little climb more forgiving. Increase its `platforms` widths and depths from `3.8` to `5`, then play the same route without changing `PlayerController` settings.
> 2. Add a fourth definition to `LEVELS`, with a new `id`, `name`, `spawn`, `platforms` and `goal`. Teach one idea, and check that **Next level** and the title buttons pick it up without a fourth builder.
> 3. Add **Forget progress** to the title card. Hint: remove `SAVE_KEY` from localStorage inside `try/catch`, reset the existing `save` object's fields with `freshSave()`, and call `renderLevelList()`.
> 4. Make a fifth platform in the live editor, press **Rebuild** ten times, and check the geometry count returns to the same baseline. Then add a friendly check to `validateLevel()` for a spawn placed below its starting platform.

## Recap

- A top-level **state machine** gives the game one clear situation at a time; `setState()` keeps shared transition work together.
- Pause physics and simulation timers, not the whole rendering loop.
- Level data describes **what** exists; one `buildLevel()` decides **how** to create it.
- Teardown means removing meshes, disposing owned resources and discarding old collider references.
- Parse and validate edited data before rebuilding, and keep practice results separate from real records.
- Save small, versioned progress with stable level IDs, and let the game work even when storage doesn't.

Next, lesson 11 adds juice: small bursts of motion, sound and feedback that make these already-working rules easier to feel.
