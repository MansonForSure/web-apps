---
title: Collectibles and a HUD
tier: 2
minutes: 30
summary: Give your robot a reason to explore: collect glowing energy cores, track your progress and race your best time. Keep the game rules in JavaScript and the readouts in HTML.
learn: How to combine game data with a visible mesh; How to update many collectibles in one loop; How squared distance checks detect collection; How to remove objects without skipping their neighbours; How to update an HTML HUD only when values change; How to save a best time safely in localStorage
---

Your robot can run, jump and land on blocks. Now you need a reason to go somewhere. In this lesson you'll scatter twelve glowing energy cores around a grassy meadow, count each pickup and finish with a time to beat.

The movement, jumping and chase camera come straight from Lessons 3–6. Use **WASD or arrow keys** to move, **Space** to jump and a mouse drag to look around. On a phone, move with your left thumb, drag to look with your right and use **JUMP**. The timer starts when you first move or jump.

::demo "Collect twelve spinning energy cores, chain a combo and try to beat your saved time"

Try collecting the three cores ahead of you quickly, then hop onto a raised block; after clearing the meadow, choose **Play again**.

## Objects with memory

A mesh can show you a core, but it cannot tell your rules whether that core has been collected. A **game object** combines the visible thing with the data that describes its behaviour. Here that means an ordinary JavaScript object containing a group, two visible children and a few numbers and flags.

::snippet lessons/07-collectibles-and-hud/demo.html#cores "demo.html — make one core with its own state"

The `group` holds an octahedron and its halo. An **octahedron** is the eight-sided shape used for these crystals. Moving the group moves both children together; spinning only `mesh` turns the crystal without rotating the halo. A **sprite** is a flat image that always faces the camera, which makes a soft circular glow look right from any direction.

`homeY` remembers the original height. `phase` offsets the animation, `collected` starts false and `fade` starts at zero. Keeping these beside the mesh means you don't need separate arrays of positions, flags and timers whose indices can drift apart.

The demo's `placements` array contains twelve `[x, y, z]` entries. `resetRun()` passes each entry to `makeCore()` and pushes the result into `cores`. To move a pickup, edit its placement rather than searching through the update loop. The raised blocks keep the colliders from Lesson 6; cores use a simpler overlap rule we'll add shortly.

The crystal material has cyan `emissive` colour: it stays bright even on a shaded face. The halo uses one small radial-gradient texture drawn into a local canvas. That glow is an image, not twelve extra lights, and it doesn't illuminate the surrounding grass.

Notice `coreTemplate.clone()`. Geometry and the halo texture are shared because their shapes and pixels don't change. Each crystal gets its own material because its opacity *will* change independently when you collect it. Each halo also gets its own sprite material.

> [!WARNING] Shared material, shared fade
> If every crystal uses `coreTemplate` directly, setting one crystal's `material.opacity` changes them all. Share the geometry, but clone the material when an individual object needs its own fading value.

## Give every core a turn

You already have one game loop. Don't create a timer or animation loop for every pickup. Instead, the existing loop calls `updateCores()`, which visits each object and calls this small function. Twelve objects follow the same rule, each using its own state.

::snippet lessons/07-collectibles-and-hud/demo.html#update "demo.html — idle animation and the collection pop"

For an uncollected core, `Math.sin()` supplies a repeating value between −1 and 1. Multiplying it by `0.15` makes the core hover 0.15 units above and below `homeY`. Adding the result to the remembered height is important: you're setting today's position, not adding another offset to yesterday's position.

`time * 2.2` controls how quickly the wave repeats. Increase `2.2` for quicker bobbing or `0.15` for a taller bob. Adding `phase` gives each core a different point along the wave, so the meadow doesn't rise and fall in perfect synchronisation. `time * 1.8` turns the crystal at 1.8 radians per second.

The **early return**, which leaves the function before the remaining lines run, separates two behaviours. An idle core spins and bobs. A collected core grows, rises and fades. Unchecking **Spin & bob** freezes only the idle motion; collection feedback still works.

`fade` measures progress from zero to one. Adding `dt / 0.35` makes that journey take 0.35 simulation seconds, and `Math.min(1, …)` prevents it overshooting. The sine inside `pop` runs through half a wave: zero at the start, one halfway through, zero at the end. Scale therefore grows from 1 to 1.65 and returns to 1 while opacity falls to zero.

This is a useful separation: the rule says “collected” immediately, while the picture takes a moment to say goodbye. The final collection stops your time straight away, but the animation loop keeps running until the last pop has finished.

## Collect without skipping

A collectible doesn't need the platform collision solver. It just needs to ask whether the robot is close enough. We treat the robot's centre as a point and accept any core within a radius of 0.95 units, in all three directions.

::snippet lessons/07-collectibles-and-hud/demo.html#collect "demo.html — squared distance and safe removal"

The player's position is at its feet. `centre.copy(player.position).y += player.height / 2` lifts the test point to the middle of its 1.6-unit collision body. Without that adjustment, walking past a chest-high core would feel oddly unreliable. Both positions are in the same scene coordinates; the core groups are added directly to `scene`.

**Squared distance** is the sum of the squared gaps along X, Y and Z. The usual distance takes the square root of that sum. When you only need a yes-or-no comparison, `distanceToSquared()` avoids that square root: compare against `COLLECT_RADIUS * COLLECT_RADIUS`, not the unsquared radius. Squaring preserves the ordering of non-negative distances, so the answer stays the same.

Including Y matters. You can't collect a high core simply by standing underneath it. Increasing `COLLECT_RADIUS` makes pickups more forgiving, but it also makes those raised cores reachable from further away. This check is for overlap, not solid collision: it doesn't push the player or stop movement.

The three guards require a started run, an unfinished run and an uncollected object. Once the distance test passes, the scoring function marks the core before the next frame can see it again:

::snippet lessons/07-collectibles-and-hud/demo.html#award "demo.html — award one pickup and update the combo"

`lastCollectTime` begins at `-Infinity`, so the first pickup starts a chain of one. A pickup within `COMBO_WINDOW`, which is 1.5 seconds, increases the chain; a slower pickup resets it to one. `comboUntil` keeps the label visible for one second after the latest pickup. Combo changes the feedback, not the number of cores awarded.

A marked core remains in `cores` until its fade reaches one. Then `scene.remove()` stops drawing it, and `splice(i, 1)` removes its data. Those are separate jobs: removing an object from the scene doesn't remove it from your array.

Why loop backwards? Suppose an array contains A, B and C. Removing A at index zero moves B into index zero. A forward loop then advances to index one and visits C, skipping B. Starting at the final index means removals only shift entries you've already visited. That also handles several completed fades in the same frame.

The two `dispose()` calls release the per-core materials. They deliberately leave the shared geometry and halo texture alone, because other cores — and the next run — still use them.

> [!TIP] Check the rule, then the feedback
> Stand near one core and watch the count. It should increase once, even though the crystal remains visible during its 0.35-second fade. If it increases every frame, check the `!core.collected` guard and the first line of `collectCore()`.

## HTML over the canvas

A **HUD**, or heads-up display, tells you what is happening without making you look away from play. Our count and timer are HTML elements positioned over the WebGL canvas. They stay at the top-centre when the chase camera turns.

::snippet lessons/07-collectibles-and-hud/demo.html@55-59 "demo.html — the count, timer and combo message"

The **DOM** is the browser's tree of HTML elements. Using it for a HUD gives you ordinary text, CSS layout and real buttons. Drawing text inside WebGL usually means creating textures or specialised text geometry, then handling resolution and placement yourself. That's useful for labels floating inside the world, but unnecessary for a screen-fixed counter.

The browser already knows how to lay out this header on a phone. The cyan diamond is decorative, so `aria-hidden="true"` keeps it out of the accessible text. The combo message uses a polite live region to announce a short event. The timer doesn't: announcing a new value ten times a second would be distracting.

::snippet lessons/07-collectibles-and-hud/demo.html@18-24 "demo.html — place the HUD without blocking input"

`left: 50%` places the header's left edge at the screen centre; `translateX(-50%)` shifts it back by half its own width. `z-index: 6` layers it above the canvas. `pointer-events: none` lets a mouse or finger pass through the HUD to the input system, so dragging over the counter can still turn the camera or start a touch joystick.

Only the read-only overlay uses that setting. The restart button and finish card remain interactive. On narrow screens, the panel moves below the HUD and the hint sits above the jump button. `font-variant-numeric: tabular-nums` gives timer digits equal widths, reducing sideways wobble as they change.

JavaScript looks up the elements once in `ui`, then updates their text when the displayed value changes:

::snippet lessons/07-collectibles-and-hud/demo.html#hud "demo.html — update only changed readouts"

`lastHud` remembers the last strings written to the page. The frame can call `updateHud()` repeatedly without rewriting an unchanged count. `formatTime()` rounds the running time to one decimal place, so its string changes at most about ten times per second, rather than on every rendered frame.

Compare the *formatted string*, not the unrounded timer number. Almost every frame changes the underlying time, but many frames display the same tenth of a second. The combo's class changes only when its text changes too; CSS handles the brief fade in and out.

## Finish and remember

Collecting all twelve cores needs a clear result, not just a full counter. `finishRun()` marks the run finished, checks the record and prepares the card. The frame reveals it after the remaining core objects have finished fading.

::snippet lessons/07-collectibles-and-hud/demo.html#finish "demo.html — freeze the result and prepare the finish card"

The `finished` flag stops movement and timer accumulation, but not core updates or rendering. The card shows the final time and best time, then focuses **Play again** so you can restart with the keyboard. `resetRun()` recreates all cores from `placements`, clears the count and combo, resets the player and hides the card. It keeps the best time.

The demo uses two time values deliberately. Physics and collection pops use the shared stage's capped `dt`, from Lesson 6. The running timer adds the difference between consecutive `elapsed` values supplied by `THREE.Timer`, so a slow frame doesn't make a personal record artificially faster. The timer is connected to the document to handle hidden tabs. Waiting before your first input doesn't count; standing still after starting does.

**localStorage** is a small browser store whose string values survive a reload. It belongs to this site's origin — the combination of protocol, host and port — and this browser, not to an online account. Our versioned key names this lesson, so it doesn't overwrite Skyhop's save.

::snippet lessons/07-collectibles-and-hud/demo.html#save "demo.html — read and write a best time defensively"

`getItem()` returns a string or `null`. The missing-value check avoids treating an absent record as a best time of zero. `Number.isFinite()` and the positive-value check reject broken entries. `saveBest()` keeps the smaller time; an equal or slower run doesn't replace the record.

Both operations use `try/catch` because browser settings or a full storage quota can make them throw. Updating `best` before the write keeps a record in memory for this session even when saving fails. The game still finishes; it may simply forget the record after a reload.

> [!NOTE] A personal record, not a leaderboard
> A player can edit localStorage or clear site data. It's suitable for convenience settings and local best times, not trusted competitive scores. Reload the demo after finishing to check persistence; Lesson 10 will expand this idea into a larger save.

## How Skyhop does it

The finished game keeps the same distinction between an object's state and its picture. Its `Core` class stores the group, original position, phase, collected flag and fade progress. Here is its real update function:

::snippet game/src/pickups.js#core-update "game/src/pickups.js — idle cores and their farewell animation"

Skyhop also bobs with a sine wave and uses a 0.35-second farewell. Its crystal shrinks away while the halo grows and fades; the demo instead grows the crystal and fades its material. Skyhop hides the group at the end rather than splicing it out. That keeps the level's core array stable until the level is disposed.

Its game loop tests squared distance from the player's centre and ignores already collected cores. When that test succeeds, the game applies the rule here:

::snippet game/src/game.js#collect "game/src/game.js — scoring, sound and opening the portal"

The same `core.collected = true` line prevents duplicate awards. Skyhop adds sparks and a rising collection sound. Its combo uses a 2.5-second countdown and starts at zero, rather than our displayed chain of one. Collecting everything opens the portal; you still have to reach it to complete the level.

Its HUD is also ordinary HTML. This is the real header, including the core counter, timer and menu controls:

::snippet game/index.html@25-44 "game/index.html — Skyhop's HUD header"

The game passes new values to `UI` methods instead of touching elements throughout its rules. In `game/src/ui.js`, `setTimer()` remembers `lastTimerText` and avoids rewriting the same displayed time, just like `lastHud.time`. The HUD also includes hearts and a level name because the finished game has more information to report.

Finally, Skyhop saves a structured object containing records, unlocked levels, mute preference and graphics quality. It uses JSON to turn that object into a string:

::snippet game/src/game.js#load-save "game/src/game.js — load saved data with defaults"

The default object is used when reading or parsing fails. This loader is compact; our single-number loader also checks that the saved value is finite and positive. As your save grows, validate the fields your rules depend on rather than assuming any successfully parsed JSON is sensible.

::snippet game/src/game.js#persist "game/src/game.js — saving must not interrupt play"

The empty catch is intentional: an unavailable convenience store shouldn't break jumping, collecting or finishing a level. Bigger game flow comes in Lesson 10; the data, overlap test and HTML display you built here remain the foundation.

## Your turn

> [!TRY] Challenges
> 1. Make cores bob higher and spin slower. In `updateCore()`, change the `0.15` bob amplitude and the `1.8` rotation speed independently.
> 2. Add two cores by appending entries to `placements`. Check that `TOTAL`, the running count and the completion rule follow the new length. Update the fixed “12 / 12 energy cores” text in the finish card too.
> 3. Make a longer combo route. Move a few placements closer together, then change `COMBO_WINDOW` from `1.5` to `2`. Keep `comboUntil` at one second so the collection window and message duration stay separate.
> 4. Add a “Clear best” button beside `restart`. Remove `SAVE_KEY` with `localStorage.removeItem()` inside `try/catch`, set `best = null`, and update `ui.best`. Check that it clears the record without resetting your current pickups.

## Recap

- A game object pairs visible meshes with data such as `collected`, `phase` and `fade`.
- One update loop visits many objects; elapsed time drives idle motion and `dt` advances short animations.
- Compare `distanceToSquared()` against a squared radius, using the player's centre rather than its feet.
- Mark collection immediately, then finish the animation; loop backwards when splicing objects out.
- Put screen-fixed readouts in HTML, let input pass through with `pointer-events: none`, and write only changed text.
- Save local best times with validation and `try/catch`; storage failure must not stop the game.

Next, in Lesson 8, you'll replace the box robot with a real 3D model and choose animations that match its movement.
