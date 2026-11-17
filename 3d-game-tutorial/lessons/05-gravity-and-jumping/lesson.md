---
title: Gravity and jumping
tier: 2
minutes: 30
summary: Give your robot a jump you can measure and tune. Use gravity, early-release short hops and a small input buffer to make take-off and landing feel deliberate.
learn: How gravity changes velocity before velocity changes position; How to derive jump speed from a target height; How early release and stronger falling gravity change a jump; How to cap falling speed and detect the ground; How jump buffering and landing squash improve the feel; How Skyhop combines these ideas in its player controller
---

Your robot can walk, and the camera follows it. Now you want to leave the floor. This is the start of Tier 2: turning the scene from Lessons 1–4 into a game with rules, starting with a jump you can control rather than a decorative bobbing animation.

You'll build an upward kick, let gravity bring the robot back, and make a quick tap produce a shorter hop than a long hold. Press **Run the demo**, then use **Space** or the phone's **JUMP** button; WASD or the left thumb still moves, and dragging still turns the chase camera from Lesson 4.

::demo "An orange robot jumps beside metre markers, leaving a dotted trail with predicted and measured peak heights"

Try one long hold, then one quick tap; watch the peak readout and the brief squash when you land.

## Gravity moves velocity

In Lesson 3, you moved by velocity multiplied by `dt`. **Velocity** means speed with a direction: positive `velocity.y` takes you up, negative takes you down. **Acceleration** changes that velocity over time; gravity is a downward acceleration, even while you're travelling upwards.

The controller needs to remember more than its current height. A robot halfway up a jump and a robot halfway down can have the same position but need opposite movement on the next frame.

::snippet lessons/05-gravity-and-jumping/demo.html#state "demo.html — remember motion and the jump's state"

`velocity` holds motion on all three axes. `grounded` says whether you have support under your feet, while `jumpHeldFlag` remembers whether the current jump's button has stayed down. We'll use `bufferTimer` for a recent press and `squash` for the visible landing reaction later.

To simulate gravity, first change the velocity, then use that **new** velocity to move. This order is called **semi-implicit Euler integration**: a numerical recipe for advancing motion in small steps, rather than calculating the whole flight at once.

::snippet lessons/05-gravity-and-jumping/demo.html#integrate "demo.html — update velocity, then position"

The two essential operations are `velocity.y -= g * dt` and `bot.position.addScaledVector(velocity, dt)`. The latter adds `velocity × dt` to the robot's position, including X and Z walking. `g` is a positive downward strength, so subtracting it makes upward velocity smaller, then negative.

For example, at `g = 26` and `dt = 1 / 60`, a starting upward speed of `9 m/s` becomes about `8.57 m/s`. That frame moves the robot about `0.143 m` upwards. Keep repeating: upward motion slows, reaches the **apex** (the highest point), then becomes downward motion without a separate “start falling” command.

> [!WARNING] Gravity is not a position offset
> Writing `bot.position.y -= 26 * dt` makes the robot descend at a constant speed. Gravity changes **velocity**, so you need `dt` in both stages. Keep gravity's magnitude positive here: `velocity.y -= g * dt` already supplies the downward sign.

The shared `createStage()` loop uses the `THREE.Timer` from Lesson 1 and caps `dt` at `0.05` seconds. This limits oversized steps after a pause; it doesn't make the simulation exact. At a low frame rate, jumps can measure slightly lower, and the clamp may make game time advance more slowly than real time. Smaller steps give a closer approximation.

## Choose your jump height

A useful jump starts with a design question: “How high should your feet rise?” You can then calculate the take-off velocity, instead of guessing a speed and repeatedly moving platforms to fit it. Gravity and jump height together define the arc.

Earth's gravity is roughly `9.8 m/s²`, but at this course's metre-like scale it often feels floaty for a platformer. Try **20–40 units/s²** as a starting range, not a universal rule. The demo uses `26`; with the same `9 m/s` kick, `9.8` predicts a `4.13 m` rise, whereas `26` predicts only `1.56 m`.

::snippet lessons/05-gravity-and-jumping/demo.html#prediction "demo.html — predict the height from speed and gravity"

Here `JUMP_SPEED * JUMP_SPEED` means the speed squared. Divide by twice the gravity to find the ideal full-hold height: **`h = v² / (2g)`**. This describes constant upward gravity, so it isn't a promise for a short tap or a gravity slider changed halfway through a jump.

Where does it come from? Gravity removes upward speed steadily, taking `t = v / g` seconds to reach zero. During that climb, your average upward speed is half your initial speed. Distance is average speed multiplied by time, so `h = (v / 2) × (v / g)`.

Rearrange that relationship to choose a speed from a height: **`v = sqrt(2 × g × h)`**. For a target rise of `1.6 m` and gravity `26`:

```js
const gravity = 26;
const jumpHeight = 1.6;
const jumpSpeed = Math.sqrt(2 * gravity * jumpHeight);
// sqrt(83.2) ≈ 9.12 units per second
```

The demo exposes speed directly, in `0.5` steps, so `9` is the nearby slider setting. Its theoretical peak is `1.56 m`, not exactly `1.6 m`. The measured value tracks the largest `bot.position.y` during the latest jump; it resets at take-off and stays visible after landing.

> [!TIP] Compare like with like
> Hold jump until you start falling, or untick **Variable height**, when checking predicted against measured peak. The finite simulation steps normally put the measured height below the ideal calculation. The dots are drawn `0.8` units above the robot's feet, so use the readout, not the highest dot, to measure the rise.

Even at the same target height, gravity changes the timing. A `1.6 m` rise takes about `0.57` seconds to reach the apex with gravity `9.8`, but `0.35` seconds with gravity `26`, after recalculating take-off speed for each. Higher gravity with a correspondingly stronger kick gives the same reach in less time.

## Tap, hold and fall

A fixed-height jump asks you to commit to the entire arc. **Variable jump height** lets you stop climbing sooner: hold for the full leap, release early for a short hop. The button doesn't keep adding upward kicks; it controls how quickly you lose the upward speed you already have.

The running demo achieves this with extra gravity during the remaining ascent after release:

::snippet lessons/05-gravity-and-jumping/demo.html#gravity "demo.html — early release spends upward speed faster"

The condition checks three things: the checkbox is enabled, `velocity.y > 0`, and `jumpHeldFlag` is false. Only then does `g *= 2.5` apply. At the default gravity, that is `65 units/s²` while still rising, rather than `26`; once falling, the condition stops applying.

The jump code sets `jumpHeldFlag` true at take-off and clears it when you let go. Once cleared, it stays false for that jump, so pressing again in mid-air doesn't restore the full climb. A release after the apex cannot shorten a climb that's already finished.

### Cut upward velocity instead

Another common approach is to cut the remaining upward velocity **once**, at release. As an experiment, untick **Variable height** to disable the demo's extra upward gravity, then replace its `if (!input.jumpHeld) jumpHeldFlag = false;` line with:

```js
if (!input.jumpHeld && jumpHeldFlag) {
  if (velocity.y > 0) velocity.y *= 0.5;
  jumpHeldFlag = false;
}
```

This keeps half your upward speed, making a sharper change than the demo's gradual extra deceleration. The `jumpHeldFlag` guard matters: without it, you'd halve velocity on every released frame, almost stopping the climb instantly. The `velocity.y > 0` guard also matters; cutting negative velocity would slow a fall instead.

### Make the descent snappier

You can tune falling separately from rising. For a quicker return to the floor, insert this optional line after the existing early-release gravity condition, before `velocity.y -= g * dt`:

```js
if (velocity.y < 0) g *= 1.8;
```

This **fall multiplier** leaves the upward arc alone and increases acceleration only on descent. It gives you time to steer upwards but gets you back to the next jump sooner. Start around `1.5–2`, then compare how much time you have to aim a landing.

> [!NOTE] Two different multipliers
> The unedited demo has **no extra falling gravity**: its `2.5` multiplier is only for early-release ascent. Skyhop also uses normal gravity on descent. The `1.8` fall multiplier and the direct velocity cut above are optional experiments, not features already running in either file.

Finally, `Math.max(velocity.y, -30)` sets a **terminal velocity**, a maximum falling speed. Since down is negative, `Math.max` prevents a value below `-30` while leaving positive upward motion untouched. This is an explicit game limit, not simulated air resistance; it keeps long falls manageable, but doesn't by itself prevent missed collisions during large time steps.

## Ground checks and buffering

A jump should launch only when you have somewhere to push off. For this first experiment, that means an imaginary, unlimited floor at `y = 0`. There's a visible ground mesh, but its triangles aren't what stops the robot; this small rule is.

::snippet lessons/05-gravity-and-jumping/demo.html#ground "demo.html — correct a crossing of the flat floor"

After movement, `bot.position.y <= 0` catches a step that reaches or passes below the surface. Set the feet back to `0`, cancel vertical velocity, and mark `grounded = true`. The `makeBot()` group has its origin at its feet, unlike the centred cube from Lesson 1, so you don't add half the robot's height here.

You'll notice a landing-squash calculation before velocity is cleared. It needs the incoming speed, which would be lost after `velocity.y = 0`. The `!grounded` check means it happens only when arriving from the air, not on every frame you stand still.

This deliberately isn't a full collision system: you can walk beyond the visible ground and still stand on the imaginary floor. The metre markers are visual guides, not solid obstacles. Lesson 6 replaces this shortcut with platform checks, including whether you're actually above a surface.

### Remember a slightly early press

If you press jump just before landing, a strict “pressed **and** grounded this frame” test discards it. **Jump buffering** remembers that press for a short window, so your timing doesn't need to match one exact frame. The demo remembers it for `0.12` seconds.

::snippet lessons/05-gravity-and-jumping/demo.html#jump "demo.html — consume a press, remember it, launch once"

`input.consumeJump()` is true once per press, using the input handling from Lesson 3. It fills `bufferTimer`; frames without a new press subtract `dt`. The launch condition needs both `bufferTimer > 0` and `grounded`, so a recent press can wait for the floor without granting an extra mid-air jump.

At take-off, `velocity.y = JUMP_SPEED` is an instantaneous kick. Set `grounded` false immediately and clear `bufferTimer` so that one press cannot launch twice. Holding the button doesn't generate fresh presses, so you won't automatically bounce forever.

With buffering unticked, the timer gets `0.0001` rather than `0.12`. That keeps a current-frame press eligible, but it expires on the next ordinary frame without a new press. This tiny positive value is effectively the “no remembered press” version of the same condition.

> [!INFO] Update order adds one frame
> The demo checks for a jump **before** moving and correcting the floor. If a buffered press arrives during the landing frame, the floor sets `grounded` true later that frame; launch happens on the next update, provided the timer is still positive. The `0.12` seconds is a window, not a deliberate pause before every jump.

A larger buffer helps slightly early inputs, particularly on touch screens, but too large a value can cause a jump the player has already stopped expecting. Tune the window, not the jump speed, when the complaint is “I pressed just before touching down and nothing happened”.

## Give landing some weight

A perfectly rigid robot can have correct physics and still feel like a sliding box. **Squash and stretch** briefly changes its visible proportions: taller at take-off, shorter and wider at landing. It's feedback about the motion, not another force applied to the jump.

The launch code sets `squash = 1.35`. The floor code sets `1 - Math.min(-velocity.y / 30, 0.4)`, so a harder impact makes a deeper squash, capped at `0.6`. For example, a landing at `9 m/s` starts at `0.7` height scale.

::snippet lessons/05-gravity-and-jumping/demo.html#squash "demo.html — ease the robot's proportions back to normal"

`damp(10, dt)` is the smoothing helper you used for movement and the camera. Each frame it brings `squash` closer to `1`, rather than snapping the shape back. Increasing `10` makes that recovery quicker; decreasing it makes the deformation linger.

The scale is `(1 / sqrt(s), s, 1 / sqrt(s))`. Why the square roots? Width × height × depth becomes `(1 / sqrt(s)) × s × (1 / sqrt(s)) = 1`, keeping the same volume. A height scale of `0.6` therefore widens both horizontal axes to about `1.29`.

Only the visual scale changes. Neither `velocity` nor the floor height changes with it, and scaling around the feet keeps the robot on the surface. Later, when you add collision shapes, keep their dimensions separate from this temporary visual deformation.

## How Skyhop does it

The finished game uses the same sequence inside `Player.update()`: steer, accept a jump, apply gravity, then move and resolve support. Its numbers live together in `game/src/config.js`, rather than being scattered through the controller.

::snippet game/src/config.js#jump-tuning "game/src/config.js — Skyhop's jump settings"

`jumpSpeed: 9.4` and `gravity: 26` predict a full-hold rise of about `1.70` units before the simulation-step difference. There isn't a `jumpHeight` setting in this file: height is implied by those two numbers. `lowJumpGravity: 2.3` controls released ascent, and `maxFall: 32` caps downward speed.

Here are the main knobs to compare. Change one at a time, and keep height constant by recalculating speed when you're testing gravity alone.

| Tunable | Demo / game | Feel |
| --- | --- | --- |
| Gravity | `26` / `26` | Higher: less airtime. Recalculate speed to keep height. |
| Jump height | `1.56` / `1.70` units | Higher: more reach, requiring more take-off speed. |
| Fall multiplier | `1` / `1` | Optional `1.8`: quicker descent, unchanged rise. |
| Buffer time | `0.12` / `0.14` s | Longer: accepts earlier presses, but may trigger old requests. |

Height is the ideal derived peak, and the fall multiplier is implicitly `1` in both files. The buffer value is `PLAYER.jumpBuffer` in Skyhop.

Skyhop extends the launch condition beyond `grounded`:

::snippet game/src/player.js#jump "game/src/player.js — buffer plus a short ledge grace period"

**Coyote time** is a short grace period after walking off a ledge. `airTime` resets while grounded and increases while airborne; `PLAYER.coyoteTime` allows a jump for `0.12` seconds after support disappears. Buffering forgives pressing *before* landing; coyote time forgives pressing *after* leaving a ledge. You'll test that difference on actual platforms in Lesson 6.

`canSteer` prevents accepting a new jump press when normal control isn't available. The launch itself is shared with other upward kicks, such as jump pads and enemy stomps:

::snippet game/src/player.js#launch "game/src/player.js — one launch helper clears old jump eligibility"

`airTime = Infinity` closes the coyote-time window immediately after a launch, preventing a second jump during the same grace period. `bufferTimer = 0` consumes the request. The `cuttable` argument decides whether this particular launch should react to releasing the button; a normal jump passes `true`.

::snippet game/src/player.js#gravity "game/src/player.js — gravity, collision movement and one landing reaction"

Skyhop multiplies gravity only when `rising`, `jumpCut` is enabled, and jump isn't held. Unlike the demo's latched release flag, this condition reads the current button state every frame. `jumpCut` means “this launch can be shortened”, not “the velocity has already been cut”.

`moveBody()` performs the position integration and platform collision handling. The controller saves `fallSpeed` first, then detects the change from airborne to grounded, applies squash and calls the landing event once. That's the same idea as your flat-floor experiment, ready for islands rather than an unlimited plane.

## Your turn

> [!TRY] Challenges
> 1. Find two different-feeling full jumps with the same predicted height. Set the `gravity` slider to `16` and `jumpSpeed` to `8`, then compare `gravity = 25` and `jumpSpeed = 10`. Both predict `2 m`; hold until the apex and compare the timings.
> 2. Replace the demo's release line with the one-off velocity cut above. Untick **Variable height**, then try multipliers `0.3` and `0.7` in `velocity.y *= 0.5`. Which gives you finer control over a small hop?
> 3. Add `if (velocity.y < 0) g *= 1.8;` before the gravity integration. Compare full-hold jumps with and without it: the predicted peak should stay the same, but landing should arrive sooner.
> 4. Change the buffered value in `bufferTimer = ui.buffer.checked ? 0.12 : 0.0001` to `0.25`. Press shortly before landing, then progressively earlier. Reduce it again until accidental follow-up jumps disappear.
> 5. Tune the landing feedback without changing motion. Compare caps `0.2` and `0.4` in the ground section's `Math.min`, and recovery rates `6` and `16` in `damp(10, dt)`. Keep `bot.scale.set` volume-preserving.

## Recap

- Gravity changes **velocity**, then the updated velocity changes **position**; multiply both stages by `dt`.
- Choose take-off speed from a target height with **`v = sqrt(2 * g * h)`**; small simulation steps approximate the ideal arc.
- Early release can cut upward speed or increase upward gravity. Extra **fall gravity** is a separate tuning choice.
- A ground check restores the feet and cancels vertical speed; a **terminal velocity** caps long falls.
- **Jump buffering** remembers a recent press, and landing squash makes the impact visible without changing the physics.

Next, in Lesson 6, you'll replace the unlimited floor with platforms you can land on, bump into and ride as they move.
