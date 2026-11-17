---
title: Input and frame-rate independent motion
tier: 1
minutes: 30
summary: Turn held keys or a touch joystick into movement that feels consistent on different screens. Give your robot smooth acceleration, gentle stopping and turns that take the short way round.
learn: Read keyboard input as held-key state; Turn keys and touch into a normalised direction; Separate velocity from position and move with delta time; Smooth acceleration and friction with exponential damping; Turn towards movement using the shortest angle; Handle a virtual joystick with pointer events
---

In Lesson 1 you made a cube move by itself; in Lesson 2 you gave the world light and shadows. Now you get to steer. You'll move a little box robot across a grassy grid, with controls that work on a keyboard or a phone.

The scene setup lives in `createStage()`, a small shared helper built from those earlier lessons. That leaves you free to concentrate on the part that makes this a game: translating what the player wants into motion. Press **Run the demo**, then use WASD or the arrow keys; on a phone, start a drag on the left half of the screen.

::demo "Steer the robot, then compare smooth movement with deliberately broken frame timing"

Try releasing a direction, changing direction sharply, and ticking **Simulate a slow phone** with **Multiply by delta time** first on, then off.

## Keys are state

A keyboard sends events when a key goes down or comes up. Those events aren't your game loop: holding a key also produces repeated `keydown` events at a rate chosen by the operating system. Moving the robot inside that event handler would tie its speed to keyboard repeat settings rather than elapsed time.

Instead, remember which keys are held. This is **input state**: a small snapshot that the game can read on every frame, whether or not a new event arrived. The shared `Input` class keeps that snapshot in a JavaScript `Set`, a collection where each value appears at most once.

::snippet lessons/kit/input.js#state "input.js — held keys and other input state"

`this.keys` holds strings such as `KeyW`. A repeated press cannot add a second copy, and releasing one key doesn't affect the others. The constructor also prepares a joystick vector and jump flags; we'll separate those jobs shortly.

The browser gives you two useful keyboard properties. `e.key` describes the character or action, such as `w`, `W` or `ArrowUp`. `e.code` identifies the physical key position: `KeyW` is the position labelled W on a US keyboard, even when another layout puts a different letter there.

For WASD movement, you usually want the same physical cluster on different keyboard layouts. On an AZERTY keyboard, the forward key in that cluster is labelled Z, but its code is still `KeyW`. Using `e.key === 'w'` would move the forward control elsewhere. Arrow keys provide another option without relying on letter labels.

| Movement | WASD code | Arrow code |
| --- | --- | --- |
| Forward | `KeyW` | `ArrowUp` |
| Backward | `KeyS` | `ArrowDown` |
| Left | `KeyA` | `ArrowLeft` |
| Right | `KeyD` | `ArrowRight` |

::snippet lessons/kit/input.js#keyboard "input.js — record presses and releases, then query held keys"

`add(e.code)` records a press; `delete(e.code)` records its release. `isDown(...codes)` returns true if *any* supplied code is in the set, so either forward key works. `preventDefault()` stops arrows and Space scrolling the page while you're playing.

> [!WARNING] Release keys when focus is lost
> You might hold W, switch to another window and release W there. Your game may never receive that `keyup`. The `blur` handler clears the set and resets `jumpHeld`, so returning to the demo doesn't leave the robot walking by itself.

## A direction, not a speed

The rest of your game shouldn't care whether the player pressed D or dragged a thumb. It should ask for **movement intent**: how much the player wants to move right and forward. The input class returns a **vector**, a pair of numbers that together describe a direction and its strength.

Here `x` means right and `y` means forward. This `y` is a name in a two-dimensional input object, not the world-height axis from Lesson 1. Right is positive, left is negative; forward is positive, backward is negative. Opposite keys cancel, because adding 1 and subtracting 1 leaves zero.

::snippet lessons/kit/input.js#move "input.js — one movement vector and one-shot actions"

`getMove()` starts with the joystick values, then adds the keyboard directions. Pressing D and Right together still adds just 1, because `isDown()` answers a yes-or-no question rather than counting keys. The last few lines keep the combined vector's length at most 1.

Why does that matter? Holding W gives `(0, 1)`, whose length is 1. Holding W and D gives `(1, 1)`, whose length is about 1.414: the distance across a unit square. Multiply both by the same speed and the diagonal player travels about 41% faster.

**Normalising** means dividing a vector's components by its length so its new length is 1. `Math.hypot(x, y)` calculates that length. Dividing `(1, 1)` by it gives approximately `(0.707, 0.707)`: still diagonally forward-right, but no longer longer than forward alone.

> [!INFO] Only shorten vectors longer than 1
> The `if (len > 1)` matters. A small joystick drag might return `(0.2, 0)`, deliberately requesting slow movement. Normalising every non-zero vector would turn even that tiny drag into full speed. It would also require a separate guard against dividing by zero.

The snippet includes `consumeJump()` and `consumeLook()` because they expose a different kind of input: something that happened since the last read. Movement remains available while a key is held; a jump press should be consumed once. We'll use jumping in Lesson 5 and drag-look in Lesson 4.

## Velocity becomes distance

Knowing a direction isn't enough. You also need a speed, and somewhere to remember the motion between frames. **Velocity** combines direction and speed; **position** says where the robot is now. Position uses world units, while velocity uses world units per second.

::snippet lessons/03-input-and-motion/demo.html#state "demo.html — persistent motion state"

`SPEED = 6` is the requested top speed, roughly 6 metres per second at this course's scale. `velocity` begins at zero and survives between updates. `facing` stores the robot's turning angle; `stride` remembers distance for the little leg wiggle, not for steering.

Each frame, the demo converts the input vector into a desired world-space velocity called `wish`. **World space** means the scene's X/Y/Z axes, rather than the input's right/forward pair.

::snippet lessons/03-input-and-motion/demo.html#wish "demo.html — convert movement intent into a desired velocity"

The middle component is zero: this lesson doesn't move vertically. The minus sign before `move.y` makes forward point down world −Z, away from this fixed camera. Multiplying by `SPEED` turns full-strength forward input into `(0, 0, -6)` units per second. A half-strength joystick request produces half that speed.

With smoothing switched off, `velocity.copy(wish)` adopts that request immediately. With smoothing on, velocity takes a little time to catch up. Either way, moving the position is a separate step.

::snippet lessons/03-input-and-motion/demo.html#position "demo.html — distance equals velocity multiplied by time"

`addScaledVector(velocity, step)` adds velocity multiplied by `step`, without changing the velocity itself. At a steady 6 units/s, a 1/60-second update moves 0.1 units; a 1/15-second update moves 0.4 units. Both cover 6 units in a second when the elapsed time is counted correctly.

Unchecking **Multiply by delta time** deliberately replaces the elapsed time with `1 / 60`. It's the same bug as adding a fixed distance every frame: at 15 updates per second you now cover only 1.5 units per second at full speed. Keep smoothing off for the clearest comparison, and stay away from the edge.

The two `clamp()` calls limit X and Z to the square from −14 to 14. They're just a boundary for this experiment, not collisions with the pillars. Velocity can still be non-zero at the boundary, so the speed readout describes the movement step requested by the code, not distance actually achieved after clamping. Lesson 6 will handle obstacles properly.

### Keep long frames safe

Lesson 1 introduced **delta time**, `dt`, in seconds. The shared stage still uses `THREE.Timer` and `renderer.setAnimationLoop`; it also limits each normal update's delta:

::snippet lessons/kit/stage.js#loop "stage.js — a timer plus a safety limit on long frames"

`timer.connect(document)` lets the timer handle visibility changes. `Math.min(timer.getDelta(), 1 / 20)` is another safeguard: it caps an update at 0.05 seconds. A debugger pause or long stall shouldn't become a giant step when the browser resumes. Without protection, a two-second delta at 6 units/s would request a 12-unit leap.

That cap deliberately discards excess time. It's safer than a sudden teleport, but it doesn't make a badly stalled game advance perfectly in real time. The visibility check also avoids drawing and updating an off-screen demo, while the timer continues to update.

The slow-phone checkbox is a separate experiment. It accumulates the stage's supplied deltas until enough simulated time has passed, then performs one update:

::snippet lessons/03-input-and-motion/demo.html#timing "demo.html — skip updates to demonstrate a lower frame rate"

Returning `false` also tells the stage not to render that skipped frame. Notice that the accumulated `dt` can exceed the stage's 0.05-second cap: it's a sum of several smaller deltas. On a normally running browser this imitates roughly 15 updates per second; it isn't a precise measurement of your phone's hardware performance.

## Smooth acceleration and friction

Instant changes are easy to control, but a small run-up makes the robot feel less like a cursor. **Acceleration** means changing velocity over time. Here you approach the desired velocity smoothly instead of setting it immediately.

::snippet lessons/03-input-and-motion/demo.html#acceleration "demo.html — approach the requested velocity or snap to it"

`lerp()` means **linear interpolation**: move some fraction of the way from the current value towards a target. A factor of 0 changes nothing; a factor of 1 copies the target. `velocity.lerp(wish, ...)` applies the same blend to all three components.

The fraction needs its own time correction. This tempting version is wrong for gameplay motion:

```js
velocity.lerp(wish, 0.1); // wrong: close 10% of the gap on every frame
```

At 60 fps it closes the gap 60 times each second; at 15 fps, only 15 times. After one second, about 0.18% of the original gap remains in the first case, but about 21% remains in the second. Multiplying position by `dt` afterwards doesn't repair this earlier timing mistake.

The demo imports two small helpers. `damp()` supplies the time-aware interpolation fraction; `angleDelta()` will help with turning in the next section.

::snippet lessons/kit/stage.js@116-124 "stage.js — shortest-angle difference and exponential damping"

For damping, the important expression is `1 - Math.exp(-lambda * dt)`. `Math.exp()` raises the mathematical constant e to a power. You don't need to memorise e: here the exponential describes how much of the gap remains after an amount of time. The interpolation fraction is 1 minus that remaining part.

With an unchanged target, two short damping steps leave the same velocity gap as one step covering their combined time. That's **exponential damping**, and it's why this formula doesn't need a particular frame rate. It makes velocity's response time consistent; the simple position updates are still discrete steps, so acceleration paths can differ slightly at very low update rates.

> [!INFO] Lambda sets the response, not the top speed
> `damp(10, dt)` closes about 63% of the velocity gap in 0.1 seconds and 95% in 0.3 seconds. A larger `lambda` feels more responsive; a smaller one feels heavier. `SPEED` still decides the requested top speed. This isn't a constant acceleration measured in units/s²: acceleration shrinks as you get closer to the target.

Releasing every movement key makes `wish` zero. The same interpolation now pulls velocity towards zero, producing **friction**, the slowing-down effect when you stop steering. This is a simple game-feel model, not a simulation of tyres or surface contact. Acceleration and stopping share the rate 10 here; you can give them separate rates if you want quick starts but slippery stops.

## Turn the short way

A robot looks more convincing when its face follows the requested movement. This box robot's front points along local +Z, so an angle of zero faces towards the camera. Rotating around Y changes its heading without tipping it over.

::snippet lessons/03-input-and-motion/demo.html#turning "demo.html — find a heading and approach it by the shortest turn"

`Math.atan2(wish.x, wish.z)` converts the two horizontal components into a heading angle in radians, the angle unit from Lesson 1. The order matters: +Z gives zero, +X gives a quarter-turn, and −Z gives a half-turn. The demo faces `wish`, not the lagging actual velocity, so its body starts turning as soon as you request a new direction.

Angles wrap around. Imagine facing 179 degrees and wanting −179 degrees: the directions are only 2 degrees apart, but subtracting the raw numbers requests −358 degrees. Ordinary interpolation would spin the robot almost all the way round.

The `angleDelta()` helper shown above uses sine and cosine to represent the angle difference as a direction on a circle, then `atan2()` turns that direction back into a signed angle. Full turns disappear in that conversion. The result is a difference no larger than a half-turn in either direction, so you take the short route across the wrap.

`facing += ... * damp(12, dt)` approaches that heading over time rather than snapping. The turning rate 12 is independent of the movement rate 10: change one without changing the other. `wish.lengthSq() > 0.01` avoids choosing a new heading from nearly zero input. When you release the keys, the robot keeps its last requested heading while its velocity slows down.

## One intent, two devices

Touch doesn't need a second movement controller. A **virtual joystick** turns a finger's displacement from its starting point into the same right/forward vector returned by the keyboard. The shared input class creates the visible base and knob for you.

::snippet lessons/03-input-and-motion/demo.html#controls "demo.html — enable movement input without jump or camera gestures"

`jumpButton: false` hides the touch JUMP button; it doesn't disable keyboard Space tracking. `look: false` stops drag-look input from being recorded. Touch movement still starts on the left half: disabling look doesn't turn the right half into another joystick area.

**Pointer events** are the browser's common event system for mouse, pen and touch. `pointerType` tells you which kind arrived, and `pointerId` identifies one active contact. That matters when two thumbs are touching at once: only the contact that started the joystick should move it.

The pointer region is longer than one teaching snippet, so we'll read its handlers in two pieces:

::snippet lessons/kit/input.js@80-102 "input.js — choose the joystick contact on pointerdown"

The first guard leaves buttons, inputs, labels, selects and links alone. Otherwise, touching a checkbox could also steer the robot. A touch in the left half records `stickId` and `origin`, then places the joystick underneath the finger. Later lessons can use the other contact for looking around; this demo has that branch disabled.

Next, movement measures how far the selected finger has travelled, and release clears the intent:

::snippet lessons/kit/input.js@104-130 "input.js — convert a drag into movement, then release it safely"

`RADIUS = 56` is the maximum joystick travel in CSS pixels. Dividing displacement by it produces values on the same scale as keys: a full drag requests full speed, a shorter drag requests less. The radial limit keeps dragging beyond the circle from increasing speed.

Screen Y grows downwards, so `-dy / RADIUS` makes an upward drag positive forward input. The demo's `wish` vector later converts that into negative world Z. These are two different coordinate conversions, not two cancelling mistakes.

Both `pointerup` and `pointercancel` use `release`. A phone can cancel a contact without a normal lift, so handling only `pointerup` risks leaving the joystick stuck. Resetting `this.stick` stops requesting movement; smooth friction then slows the robot. The injected input styles use `touch-action: none` so gameplay drags don't become page scrolling.

### Held movement versus a press

You won't jump yet, but the shared touch button shows how a single action reaches the same input interface:

::snippet lessons/kit/input.js@140-155 "input.js — queue a touch jump press and track whether it remains held"

`jumpQueued` remembers that a press happened, even if it began and ended between updates. `consumeJump()` returns that flag and clears it, so a second read returns false until another press is queued. `jumpHeld` separately tracks whether the button remains down. The keyboard follows the same pattern, and `!e.repeat` prevents repeated Space events queuing extra jumps.

Keep that distinction in your own controls: query held state for walking; consume a queued press for a single action. Once both devices produce the same intent, everything from velocity to turning can stay unchanged.

## Your turn

> [!TRY] Challenges
> 1. Change `SPEED` from `6` to `3`, then `9`. Compare straight and diagonal movement with smoothing off; both should approach the same speed.
> 2. Change `damp(10, dt)` in the velocity update to `damp(3, dt)`, then `damp(20, dt)`. Try short taps and sudden reversals. Keep delta time enabled while comparing the slow-phone checkbox.
> 3. Give stopping a different feel from starting. Choose a damping rate using `wish.lengthSq()`: try `2` when it's zero and `14` otherwise, then pass that rate to `damp(rate, dt)`.
> 4. Make turning adjustable without changing movement. Replace `damp(12, dt)` in the facing update with `damp(4, dt)` or `damp(24, dt)`, then steer across the forward/backward angle boundary. Does it still turn the short way?

## Recap

- Store held `e.code` values in a `Set`; keyboard events update state, and the game loop reads it.
- Combine controls into a movement vector, shortening lengths above 1 so diagonals aren't faster and small joystick drags stay small.
- Velocity describes motion; position changes by **velocity × `dt`**. Clamp long deltas as a safety measure, not as a replacement for real elapsed time.
- Use `damp(lambda, dt)` for time-aware acceleration and friction, rather than a fixed per-frame interpolation fraction.
- Use `angleDelta()` to turn the short way, and let touch pointer handlers feed the same movement and action interface as keys.

Next, in Lesson 4, you'll make the camera chase the robot and turn these directions into movement relative to where the camera is looking.
