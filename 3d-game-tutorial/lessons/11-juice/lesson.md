---
title: Juice: making it feel good
tier: 3
minutes: 35
summary: Give familiar actions a little weight with camera shake, squash and stretch, particles, hit-stop and synthesised sound. Compare each effect against the same game without it, then keep the feedback subtle.
learn: How event-driven feedback changes game feel; Why trauma-squared camera shake stays subtle; How visual squash preserves the player's collider; How to reuse a particle pool; How hit-stop separates simulation from presentation; How to synthesise sound and respect reduced motion
---

Your robot already moves, jumps and collects things. Now make those actions easier to feel: a landing compresses its body, a core scatters cyan flecks, and an orange bumper gives a short camera jolt and a low blip. You aren't adding another level or changing the jump height. You're giving the existing actions clearer feedback.

Here's a small island with eight cores that return after four seconds, plus a bumper that knocks you back. Press **Run the demo**, move with **WASD**, jump with **Space**, and drag to look. On a phone, use the left thumb to move, the **JUMP** button, and the right thumb to look. Sound starts after your first key press or tap.

::demo "The same robot and island, with six independently switchable feel effects"

Try **Juice none**, collect a core and touch the bumper, then try **Juice all** and repeat the same actions.

## Feedback, not new rules

**Game feel** is the experience of controlling a game: how promptly it responds, how movement behaves, and how clearly you can read the result of an action. **Juice** is the extra audiovisual feedback around those actions. It can make a core feel rewarding or a collision feel solid, but it cannot fix a controller that ignores your input.

Martin Jonasson and Petri Purho's [Juice It or Lose It](https://www.gdcvault.com/play/1016487/juice-it-or-lose), from GDC Europe 2012, demonstrates adding small feedback techniques to an existing game. Squirrel Eiserloh's [Math for Game Programmers: Juicing Your Cameras With Math](https://gdcvault.com/play/1023146/Math-for-Game-Programmers-Juicing), from GDC 2016, covers camera motion and screen shake. They're useful further watching; the numbers here come from our demo, not quotations from either talk.

Start with the events you already have. The `PlayerController` from lessons 5 and 6 calls `onJump` when a jump starts and `onLand` when the body meets a platform. Attach presentation work there, rather than guessing from the robot mesh's height every frame.

::snippet lessons/11-juice/demo.html#events "demo.html — let gameplay events trigger feedback"

The `speed < 2` test ignores tiny settling movements. A landing adds at most `0.18` trauma, while a bumper adds `0.55`, so the more important event gets the stronger response. `burst`, `tone` and the camera effects check their switches before doing any work.

With every effect off, you still collect cores and receive the same bumper velocity: `11` units/s away from the post and `5.5` units/s upward. Hit-stop changes the timing of that response, not its strength. The score and text messages remain readable even without sound or motion.

> [!TIP] Compare one change at a time
> Use **Juice none**, then enable just one checkbox. Repeat the same jump or collision before adding another effect. If you cannot tell what the effect communicates, increasing its strength is not necessarily the answer.

## Cameras with restraint

**Screen shake** briefly perturbs the camera around its normal pose. It should not push the player, change the camera-relative movement direction, or permanently drag the view off-centre. Lesson 4's chase camera still computes the clean pose first; we apply shake afterwards.

Store **trauma**, a number from `0` to `1` describing how much disturbance remains. Events add to it, capped at `1`. Each frame draws a small offset, then subtracts `1.7 * dt` so the disturbance runs out in seconds rather than frames.

::snippet lessons/11-juice/demo.html#shake "demo.html — random offsets scaled by trauma squared"

`randomSigned()` returns a value between `-1` and `1`, giving movement in either direction. `translateX` and `translateY` move along the camera's local right and up axes; `rotateZ` rolls the view. At full strength the limits are `0.25` units sideways, `0.18` units vertically and `0.025` radians of roll. A single `0.55` bumper hit produces a maximum sideways offset of roughly `0.076` units, before decay.

The important line is `trauma * trauma`. For numbers below one, multiplication makes the output smaller:

| Trauma | Linear | Squared |
| --- | --- | --- |
| 0.25 | 0.25 | 0.0625 |
| 0.50 | 0.50 | 0.25 |
| 0.75 | 0.75 | 0.5625 |
| 1.00 | 1.00 | 1.00 |

> [!INFO] Why square it?
> Linear shake gives a quarter-strength jolt even at `0.25` trauma. Squaring gives only one sixteenth of full strength there, while preserving the maximum at `1`. Small events stay quiet, and the tail becomes gentler as trauma decays. This is a useful response curve, not a rule that every camera must follow.

A single bumper's added trauma takes about `0.32` seconds to decay completely, unless another event adds more. Don't add offsets to last frame's shaken pose: they would accumulate into drift. The loop calls `chase.update` before `shakeCamera` on every frame, rebuilding the view from its unchanged target.

A **field-of-view kick** briefly widens the lens instead of moving the camera. The jump callback adds `3` degrees; the bumper sets a `5`-degree kick. Both return towards the base `55`-degree lens:

::snippet lessons/11-juice/demo.html#fov "demo.html — widen the lens, then ease back"

`damp(14, dt)` brings the kick towards zero without tying its speed to the frame rate. A `3`-degree kick has only about `0.18` degrees left after `0.2` seconds. As in lesson 1, changing `camera.fov` needs `updateProjectionMatrix()` or the new value won't affect the picture.

### Give motion an off switch

Shaking the whole view and changing perspective can be uncomfortable. This demo offers **Reduce motion** separately from its effect checkboxes and starts with the operating system's preference:

::snippet lessons/11-juice/demo.html#motion "demo.html — respect the browser's reduced-motion preference"

The `enabled(name)` helper suppresses shake, squash, particles and FOV kick while reduction is active. It also stops decorative core bobbing, core rotation and the walking leg wiggle elsewhere in the demo. Sound, scores, messages and hit-stop still work; you can disable those last two effects independently if you prefer.

**Juice all** doesn't clear this preference. Keep accessibility settings independent of a convenience button, and test your important events with motion and sound both off. Feedback should add information, not be the only way to know that you collected something.

## Squash and stretch

**Squash and stretch** changes a character's visual proportions briefly: taller on take-off, shorter and wider on landing. You saw a first version in lesson 5. This time it's an independently switchable effect attached to controller events.

The jump callback sets `squash = 1.25`, meaning 125% of normal height. Landing uses `1 - Math.min(speed / 34, 0.28)`, so the body never becomes shorter than 72% of normal height. Faster landings reach that lower limit sooner.

::snippet lessons/11-juice/demo.html#squash "demo.html — deform the robot, not the physics body"

`damp(12, dt)` eases the height back towards `1`. The width is `1 / Math.sqrt(squash)` on both horizontal axes: multiply width × height × depth and the scale factors cancel to `1`. The robot becomes about `0.89` times as wide at `1.25` height, or about `1.18` times as wide at `0.72` height. That keeps its approximate volume steady instead of visibly inflating it.

The bot's group origin is at its feet, so scaling its Y axis keeps its feet on the ground. An imported model with its origin at its centre would also move its feet; put the visual model inside a correctly positioned pivot, as you did in lesson 8.

Notice what doesn't change: `player.height`, `player.radius` and `player.position`. Lesson 6's collider stays the same size, even when the robot looks compressed. Scaling the physics body would change which gaps it fits through and could make a landing push it into the floor. The bumper uses the same visual scale trick, without changing its collision trigger.

## Particles without churn

A **particle** is a small visual element with a short life. A handful flying outward from a core makes its collection easier to spot; a smaller burst at the feet marks a landing. Our particles are tiny cyan boxes, not a physics system: they fall with their own simple gravity and don't collide with the island.

A **pool** creates a fixed set of objects once, then reuses them. We allocate eighty meshes at setup, with one shared geometry and material. Each slot remembers its velocity and remaining life:

::snippet lessons/11-juice/demo.html#particle-pool "demo.html — allocate the particle pool once"

Creating geometry, materials and meshes for every burst, then abandoning them, adds memory churn. JavaScript's **garbage collector** eventually reclaims unused objects, but that work can interrupt animation; GPU resources also need explicit disposal. Pooling bounds the resource count and avoids repeatedly rebuilding these short-lived meshes. It doesn't make eighty meshes into one draw call.

Spawning becomes a matter of resetting a slot. `nextParticle` wraps around to zero after the last entry, reusing the oldest slot if the pool fills up:

::snippet lessons/11-juice/demo.html#particles "demo.html — reuse slots, move them, then hide them"

The cosine and sine turn a random angle into an outward direction across the ground. Horizontal speed ranges from `1` to `3` units/s, upward speed from `2` to `4`, and lifetime from `0.45` to `0.65` seconds. Collection requests twelve particles; landing requests eight.

In `updateParticles`, `9 * dt` subtracts from upward velocity, and `addScaledVector` moves by velocity × time, the same integration idea as lesson 5. During the final `0.2` seconds, the boxes shrink towards zero. Expired slots become invisible, ready for another event; there is no need to remove or recreate their meshes.

These are deliberately modest counts. If a burst hides the robot or obscures the next platform, reduce the count or lifetime before adding more detail. In lesson 13 you'll measure rendering costs; for now, the live counter lets you see that this pool never grows beyond eighty slots.

## Hit-stop and sound

**Hit-stop** is a very short pause in simulation at the instant of an impact. The bumper sets `freezeUntil = performance.now() + 80`: an eighty-millisecond deadline measured against real time. That delay makes the contact moment linger before knockback carries the robot away.

Keep drawing while paused. The simulation receives no updates until the deadline passes, but the camera, shake and lens continue:

::snippet lessons/11-juice/demo.html#hitstop "demo.html — separate simulation time from presentation time"

`simDt` is zero during the pause. `simulate` controls the player, core respawns, combo window and bumper animation; particles and robot squash also receive `simDt`. Meanwhile the normal `dt` drives camera follow and shake decay. Input isn't consumed by the player until simulation resumes, so a jump press during the pause is still queued.

Use real time for the deadline: a timer that only counts down inside `simulate` would never finish while `simulate` is stopped. Rendering samples the deadline once per frame, so the visible pause is limited by the screen's frame timing. Around `60–90` milliseconds is a useful starting range for this bumper; pausing on every footstep would quickly make movement feel unresponsive.

### A tiny synthesiser

**Web Audio** creates sound with connected audio nodes. An **OscillatorNode** generates a repeating waveform; a **GainNode** controls its volume. Our chain is oscillator → gain → master gain → speakers. There are no audio files to download.

Browsers restrict automatic audio playback. Create or resume the **AudioContext**, the object that runs the audio graph, from a user gesture such as a key press or tap:

::snippet lessons/11-juice/demo.html#audio-unlock "demo.html — create and resume audio from a gesture"

This function keeps one context rather than creating a new one for every sound. `syncSound` uses the checkbox to mute the master gain, and the status text distinguishes ready, muted and suspended states. The listeners remain attached so a later gesture can resume a suspended context. The `tone` function simply skips playback if the context isn't running.

> [!WARNING] Sound needs a gesture
> Don't start an AudioContext from the animation loop and assume that sound will play. Call the initialisation function directly from an input event. Also use `audioContext.currentTime` for scheduled notes: it is measured in seconds, unlike the millisecond value from `performance.now()`.

A **frequency sweep** changes pitch during the blip. A volume **envelope** shapes its beginning and end, so the waveform doesn't abruptly jump from silence to full volume:

::snippet lessons/11-juice/demo.html#sound "demo.html — an oscillator, pitch sweep and gain envelope"

The gain rises from `0.0001` to the requested volume over `0.005` seconds, then returns to `0.0001` by the end. Exponential ramps need positive endpoints, not zero. `osc.stop` ends the sound and `onended` disconnects the short-lived nodes. Oscillators are one-shot sources, so unlike particle meshes, you create a new one for each note.

The master gain is only `0.3`. Keep playback quiet enough that overlapping blips don't become harsh. Jump sweeps `260 → 560` Hz, landing drops `120 → 55` Hz, and the bumper drops `180 → 60` Hz. Upward and downward sweeps help those events sound different without needing samples.

Collection adds a rising **combo**, a sequence of pickups close together:

::snippet lessons/11-juice/demo.html#collect "demo.html — a short combo window raises the next note"

The window lasts `1.5` simulation seconds. `2 ** ((combo - 1) / 12)` raises the starting pitch one musical **semitone**, one twelfth of an octave, per extra core. Each step multiplies frequency by about `1.059`; the combo caps at eight to keep the pitch controlled. The pickup still counts when sound is muted.

## How Skyhop does it

The finished game separates these effects into modules, so gameplay reports an event without knowing how its feedback is drawn. Its camera uses the same trauma-squared response, but replaces our independent random samples with sums of sine waves:

::snippet game/src/camera.js#shake "game/src/camera.js — trauma shake in the finished game"

Those waves vary continuously with `shakeTime`, giving a repeatable oscillating pattern rather than fresh white-noise offsets. `0.22` scales each positional wave sum, `0.05` scales roll, and trauma still decays at `1.7` per second. Don't copy those larger limits without testing them in your own camera framing.

Skyhop also pools particles, but stores their data in typed arrays and draws them through one `THREE.Points` object. Its burst function reuses slots just like our `nextParticle`:

::snippet game/src/particles.js#burst "game/src/particles.js — reset a pooled particle's data"

`this.next` wraps at `this.max`. Position, velocity, colour, lifetime, size, gravity and drag all belong to that slot; no new mesh is created by `burst`. Custom point shaders draw the particles, which we'll examine in lesson 12. The demo's tiny meshes keep today's version readable without requiring shader code yet.

The audio module expands the same graph with a master gain, compressor and reusable noise buffer:

::snippet game/src/audio.js#unlock "game/src/audio.js — prepare the game's audio graph"

The compressor helps manage overlapping sounds. Its noise buffer supplies thuds and whooshes, while pitched sounds use the familiar oscillator-and-envelope pattern:

::snippet game/src/audio.js#tone "game/src/audio.js — scheduled oscillator blips"

`delay` schedules a note slightly later on the audio clock. `attack` defaults to the same `0.005`-second rise, and `Math.max(20, to)` keeps the pitch-ramp endpoint positive. Collection layers two notes and chooses pitches from the module's pentatonic scale, a five-note musical scale:

::snippet game/src/audio.js#collect "game/src/audio.js — a rising, two-note collection sound"

The second note arrives `0.06` seconds later, seven semitones above the first. The combo selects the starting step rather than making every collection sound louder. Read the `PENTATONIC` array near the top of that file to see the available steps.

Finally, the model animations from lesson 8 and squash are separate layers:

::snippet game/src/player.js#animate "game/src/player.js — animate the model, then scale its visual pivot"

`c.update(dt)` advances the animation mixer. The last few lines ease `this.squash` back to `1` and scale `c.pivot`, not the controller's collision dimensions. The running, jumping and idle clips can therefore keep playing underneath the deformation. Follow that separation when you add polish to a more complicated character.

## Your turn

> [!TRY] Challenges
> 1. Make collection quieter than landing. In `collect`, change the added trauma from `0.12` to `0.06`; compare using only **Screen shake**.
> 2. Change `player.onJump` to use `squash = 1.15`. In `animateBot`, try `damp(8, dt)` instead of `damp(12, dt)`. Which version reads more clearly?
> 3. Make a sparse particle burst: change the collection count to six, and change `p.life` in `burst` to `0.3 + Math.random() * 0.1`. Confirm the live counter still stays below the pool size.
> 4. Compare bumper pauses of `60` and `90` milliseconds by editing `freezeUntil` in `hitBumper`. Keep knockback at `11` and `5.5` so timing is the only variable.
> 5. Make a three-note repeating pickup motif. Replace the pitch calculation in `collect` with steps from `[0, 4, 7][(combo - 1) % 3]`, then use `440 * 2 ** (step / 12)`. Check it with **Reduce motion** enabled and with **Sound** muted.

## Recap

- Trigger feedback from gameplay events, and keep the controller's rules independent of presentation.
- Trauma-squared shake makes small hits subtle; rebuild the clean camera pose before adding offsets.
- Squash the visual robot around its feet, leaving its physics dimensions unchanged.
- Pool particles so short-lived bursts reuse a bounded set of resources.
- Hit-stop pauses simulation, not drawing; Web Audio uses a gesture-started context and scheduled gain envelopes.
- Offer reduced motion and mute controls, and keep essential feedback readable without either effect.

Next, in lesson 12, you'll write shaders to change how surfaces and particles are drawn, without changing how the game plays.
