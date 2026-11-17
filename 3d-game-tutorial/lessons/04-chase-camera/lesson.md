---
title: A third-person chase camera
tier: 1
minutes: 30
summary: Follow the robot with a camera you can turn by dragging. Make movement follow the view, so forward stays forward whichever way you look.
learn: How fixed, follow and orbit cameras differ; How yaw, pitch and distance place the camera; Why you follow a smoothed focus point; How mouse and touch dragging turn the view; How to make movement camera-relative
---

In Lesson 3, you moved the robot across a field while the camera stayed still. Walk far enough and you leave the picture. A game needs a camera that travels with you, but attaching it rigidly to every movement can make the world feel jumpy.

You'll build a **third-person chase camera**: a view from outside the character that follows them around. You can drag to look around the robot, then keep moving in the direction the view suggests. Press **Run the demo** and use WASD or the arrow keys to move; on a phone, drag with your left thumb to move and your right thumb to look.

::demo "An orbiting camera follows the robot through trees and pillars"

Try turning the view sideways, holding forward, then unticking **Camera-relative controls** to feel the difference.

## Choose a camera

A camera decides more than what fits on screen. It decides which direction feels like forward, whether you can inspect a landing spot and how much you must think about the controls. Three common arrangements make different trade-offs:

| Camera | Behaviour | Trade-off |
| --- | --- | --- |
| Fixed | Stays in one place, aimed at the scene. | You can walk out of view. |
| Follow | Travels with you at a chosen offset. | You can't freely look around. |
| Orbit | Follows you and lets you turn around the target. | Needs look input and view-relative movement. |

Fixed views suit one-room puzzles and carefully framed scenes. A follow camera works for racing views and simple platformers; an orbit gives you more freedom to explore a third-person world.

Our chase camera combines following with an orbit. **Orbit** means travelling around a point, rather than turning the robot itself. Your camera angle and the robot's facing direction are separate: you can stand still and inspect its face, or watch it run sideways across the picture.

The scene, lighting and robot come from the helpers you've already used in Lessons 2 and 3. The new piece is `ChaseCamera`, imported from `../kit/chase-camera.js` in the demo:

::snippet lessons/04-chase-camera/demo.html#setup "demo.html — a robot, input and its chase camera"

`new Input({ jumpButton: false })` keeps the movement joystick and enables drag-look by default, but leaves out the jump button. We won't need that until Lesson 5. `new ChaseCamera(camera, ...)` controls the existing Three.js camera; it doesn't create another camera or renderer.

The two options here give you a distance of **7 units** and a starting vertical angle of **0.45 radians**, roughly **26°**. The rest have defaults in the shared class:

::snippet lessons/kit/chase-camera.js#class "chase-camera.js — the camera's settings and remembered state"

**Yaw** is the angle around the player, like walking around a statue. **Pitch** is the angle above or below the horizontal, like climbing a ladder while looking at that statue. `distance` is the length of the imaginary arm joining the focus point to the camera, not just the horizontal gap.

`focus` remembers the point you're looking at; `offset` stores the camera's displacement from it. The camera keeps these vectors separate because one answers *where is the player?* and the other answers *from which direction should I watch?* That separation makes both the maths and the controls easier to change.

## Orbit and aim

Start by choosing a useful point to watch. The robot's group position is at its feet, so aiming straight at `bot.position` puts the floor at the centre of the picture. We add `height`, **1.2 units** by default, to aim around the body instead.

The shared `update` method does three jobs: accept the look drag, follow that body-height point, then place and aim the camera. Here's the complete method; we'll unpack the orbit first and the smoothing next.

::snippet lessons/kit/chase-camera.js#update "chase-camera.js — turn, follow, then place and aim the camera"

`targetPosition.clone()` is important. It makes a separate vector before `goal.y += this.height`, so raising the point you watch doesn't lift the robot off the floor. The final two lines position the camera at `focus + offset` and use `lookAt(this.focus)` to aim it at that same point.

### Two circles make the orbit

**Spherical coordinates** describe a position with two angles and a distance instead of three axis values. Imagine the camera on the end of a 7-unit arm. Yaw swings the arm around the robot; pitch lifts its far end. We need to turn those angles back into X, Y and Z for `camera.position`.

**Sine** and **cosine** tell you the two components of a point travelling around a unit circle — a circle with radius 1. For our yaw convention, `sin(yaw)` gives the sideways X component and `cos(yaw)` gives the Z component. At yaw `0`, those values are `0` and `1`: the camera is on the +Z side. At yaw `Math.PI / 2`, they are `1` and `0`: it has moved round to the +X side.

Pitch splits the arm into its height and its horizontal reach. `sin(pitch)` gives the height fraction; `cos(pitch)` gives the fraction left on the ground plane. That's why both X and Z are multiplied by `cosPitch`, but Y is just `Math.sin(this.pitch)`.

Finally, `.multiplyScalar(this.distance)` stretches the unit-length direction into the full camera arm. With yaw `0`, pitch `0.45` and distance `7`, the offset is approximately **(0, 3.04, 6.30)**. Add the 1.2-unit focus height and the stationary camera sits about **4.24 units** above the ground.

This also explains why changing pitch doesn't change the arm's length. As the camera rises, its horizontal reach shrinks; it doesn't keep the same Z gap and accidentally travel further away. At pitch `0`, the arm is horizontal, so the camera and focus are at the same height.

> [!INFO] Angles describe the arm, not the robot
> These angles use the radians from Lesson 1. A quarter-turn is `Math.PI / 2`, and a half-turn is `Math.PI`. Increasing pitch raises the camera above its focus, so the resulting view looks further down; you aren't directly setting `camera.rotation.x`.

### Stop before the pole

The line `THREE.MathUtils.clamp(this.pitch, this.minPitch, this.maxPitch)` keeps pitch between **−0.15** and **1.25 radians**, about **−9°** and **72°**. **Clamping** means replacing anything below the minimum or above the maximum with that limit.

At a straight-overhead pitch of `Math.PI / 2`, the horizontal reach becomes zero. You lose the useful sense of which side of the player you're watching, and turning further over the top can make the view flip. The upper limit keeps you away from that awkward position. Yaw has no equivalent limit here: you can travel all the way around without hitting a stop.

## Smooth the follow

If the focus copied the player's position every frame, every sudden change would shift the entire picture immediately. Instead, the focus chases the desired body-height point. The robot can move a little ahead of the framing when you accelerate, and the view catches up when you stop.

This is the same smoothing idea you used for velocity in Lesson 3, applied to the camera's target. In the shared method, `this.focus.lerp(goal, damp(this.smoothing, dt))` moves some fraction of the remaining gap each frame. **Linear interpolation**, shortened to **lerp**, means taking a point between the current and desired values: a fraction of `0` stays put, and `1` reaches the goal.

The demo wires that behaviour to the panel after moving the robot:

::snippet lessons/04-chase-camera/demo.html#follow "demo.html — choose the follow rate and update the camera"

`chase.smoothing` is **9** when **Smooth follow** is ticked. Higher positive values catch up faster; smaller positive values produce more lag. The special value **0** means an instant copy in this class, not a camera that stops following.

The helper `damp` returns `1 - Math.exp(-lambda * dt)`. You don't need to memorise the exponential: it makes the *remaining gap* shrink at a consistent rate over time. At a follow rate of `9` and `dt = 1 / 60`, the focus covers about **14%** of the remaining gap each frame. If the goal suddenly changes and then stays still, about **90%** of that gap is gone after **0.25 seconds**.

A fixed `.lerp(goal, 0.1)` would catch up faster on a screen drawing more frames. The `dt` inside `damp` avoids that problem. Don't multiply the returned factor by `dt` again; time is already included.

Notice what we *don't* smooth: yaw and pitch respond directly to your drag, and the camera's position is rebuilt from the smoothed focus. Both the orbit centre and `lookAt` use `this.focus`. Smoothing the position towards one point while aiming at the unsmoothed robot would add extra swivelling as the robot moves.

The first frame deliberately snaps to the goal. Otherwise, `focus` would start at the world origin and glide towards the player even if you spawned far away. Once `snapped` is true, normal following begins.

> [!TIP] Snap after a teleport
> If you add a reset or respawn, set `chase.snapped = false` after changing `bot.position`. The next `update` copies the new focus immediately, rather than sweeping the camera across the whole level. Ordinary walking should keep `snapped` true.

### Comfort beats a dramatic view

Too much lag can make the robot drift far from the screen centre, then send the scenery sweeping past after you've stopped. It can also contribute to motion sickness. For a platformer, you need a stable view of the next landing spot more than a long, cinematic catch-up.

**Field of view**, or **FOV**, is the lens angle from Lesson 1. This demo uses the stage's default vertical FOV of **55°**. Changing distance moves the camera through the world; changing FOV changes the lens without moving it. Very wide views exaggerate stretching near the picture's edges, while narrow views hide nearby hazards. There isn't one comfortable setting for everyone.

> [!WARNING] More smoothing isn't always smoother
> A smaller positive `chase.smoothing` means more delay, not more responsiveness. Real games often provide camera sensitivity, invert-Y and FOV options, plus reduced shake or camera motion. Test starts, stops and sharp turns on a phone as well as a monitor, and stop testing a view if it makes you feel unwell.

## Drag to look

Dragging should turn the view only while you've pressed a mouse button or put a finger down. **Pointer events** are browser events that represent both of those devices. Lesson 3's `Input` helper already collects them; now you'll use its look output.

On a phone, one finger must steer while another turns the camera. Each active pointer has a `pointerId`, so the helper remembers one ID for the joystick and another for look. This part chooses which job a new press gets:

::snippet lessons/kit/input.js@87-102 "input.js — assign a press to movement or look"

A touch beginning in the left half becomes the joystick when that slot is free. Otherwise, a press can become the look pointer; the ordinary phone arrangement is left thumb for movement and right thumb for looking. Mouse presses skip the touch-only joystick branch and become look drags. Presses on buttons, inputs and labels are ignored so adjusting the panel doesn't also rotate the camera.

For the look pointer, movement adds the difference between the new and previous screen positions:

::snippet lessons/kit/input.js@113-117 "input.js — accumulate the look pointer's pixel movement"

`lookDelta` is a distance in pixels, not a rotation speed. Several pointer events can happen between rendered frames, so `+=` keeps all their movement rather than just the last event. `pointerup` and `pointercancel` release the stored ID; merely hovering afterwards doesn't keep looking.

At the end of each demo update, `input.consumeLook()` passes that accumulated drag to `chase.update`. **Consume** means read it once and clear it for the next frame:

::snippet lessons/kit/input.js@70-76 "input.js — read the drag once, then clear it"

In the camera method, `this.yaw -= look.x * this.sensitivity` turns horizontal dragging into yaw, while `this.pitch += look.y * this.sensitivity` handles vertical dragging. The default sensitivity is **0.006 radians per pixel**: a 100-pixel drag changes the relevant angle by **0.6 radians**, about **34°**, unless pitch reaches a limit.

Screen Y increases downwards, so dragging down increases pitch and raises the camera in this convention. An invert-Y option would reverse that sign. Don't multiply these drag changes by `dt`: the pointer has already measured the distance you travelled. Time belongs in continuous motion and damping, not in this pixel-to-angle conversion.

## Move with the camera

Here's the game-feel change that makes the orbit usable. In Lesson 3, forward became world −Z. That was fine with a fixed view from the +Z side. Turn the camera through a quarter-turn and the same world direction now looks sideways; press W and you go somewhere you didn't intend.

**Camera-relative movement** converts your input using the view's horizontal angle. Forward means away from the camera, along the ground towards and beyond the focus point. Right means towards the right side of that view. `ChaseCamera.toWorld` does the conversion:

::snippet lessons/kit/chase-camera.js#toWorld "chase-camera.js — turn input into a ground-plane world direction"

Think of two ground-level arrows. The forward arrow points opposite the horizontal camera offset: **(−sin(yaw), 0, −cos(yaw))**. The right arrow is perpendicular to it: **(cos(yaw), 0, −sin(yaw))**. Multiply the right arrow by `move.x`, the forward arrow by `move.y`, then add them together. The two component sums are exactly what `out.set` contains.

The middle component is always **0**. Tilting the view must not make W send the robot into the sky, or reduce its running speed because part of its movement points downwards. Using yaw alone gives you ground movement regardless of pitch. This rotation also preserves the input's length, including a partly pushed joystick.

You can check the signs with three views:

| Yaw | W direction | D direction |
| --- | --- | --- |
| `0` | −Z | +X |
| `Math.PI / 2` | −X | −Z |
| `Math.PI` | +Z | −X |

`toWorld` returns a direction, not a speed or a position. The demo makes it a desired velocity by multiplying by **6 units per second**, then uses the motion and facing code from Lesson 3:

::snippet lessons/04-chase-camera/demo.html#movement "demo.html — choose camera-relative or world-relative steering"

The checkbox switches just the conversion. Acceleration still uses `damp(10, dt)`, and the robot still turns towards `wish` with `angleDelta` and `Math.atan2`. Looking around doesn't directly rotate its body. If you keep holding W while turning the camera, the desired direction changes and your running path curves with it.

The order is worth noticing: the robot moves first, then `chase.update` follows its new position and consumes the latest drag. Movement therefore uses the yaw from the previous camera update, while the newest look delta reaches the view later in this frame. That's the actual order in this small demo, not a second movement system hidden in the camera.

### When something blocks the view

Walk near a pillar and drag the camera behind it. The trees and pillars are visual landmarks, not obstacles with collision handling in this demo. Neither the robot nor the camera is stopped by them.

**Camera clipping** happens when the desired camera position enters a wall or the floor. The near clipping plane can then slice the surface, or the object can hide the player. A pitch clamp avoids flipping; it doesn't detect scenery. At a long distance, even this demo's slightly negative minimum pitch can put the camera below the floor.

> [!WARNING] A camera needs its own collision test
> Player collisions in Lesson 6 won't automatically keep the camera out of walls. Real games commonly test the path from the focus to the desired camera position and shorten the arm when blocked. A sphere-shaped test allows space for the camera's width; a single thin ray can miss edges. They usually move inward promptly, ease outward when clear and may fade objects that hide the character.

Keep those fixes separate from the orbit maths. First calculate where the camera *wants* to be, then resolve obstructions before drawing. For now, the open field lets you concentrate on the relationship between looking and moving.

## Your turn

> [!TRY] Challenges
> 1. Aim a little higher: add `height: 1.6` to the `ChaseCamera` options in `demo.html`. Try a starting distance of `10`; change both `distance` in those options and the `value` of the `#dist` range input, because the panel overwrites the distance each frame.
> 2. Make a gentler orbit: add `sensitivity: 0.003`, `minPitch: 0.1` and `maxPitch: 0.9` to the same options. Compare a long mouse drag with a long right-thumb drag, and check that you can't look over the top.
> 3. Compare follow rates of `3`, `9` and `18`. Change the `9` in `chase.smoothing = ui.smooth.checked ? 9 : 0` inside the loop, not just the constructor. Run, release movement and watch how long the framing takes to settle.
> 4. Add a **Reset view** button to the panel. Its click handler should set `chase.yaw = 0`, `chase.pitch = 0.45` and `chase.snapped = false`. Turn the view halfway round before pressing it; test that the button itself doesn't begin a look drag and W returns to moving towards −Z.

## Recap

- A chase camera follows the player; an orbit lets you choose the side you watch from.
- **Yaw, pitch and distance** define the camera arm. Sine and cosine split it into X, Y and Z.
- Raise a separate focus point to body height, smooth it with **`damp`**, then position and aim the camera using that same point.
- Clamp pitch before the overhead pole. Convert drag pixels into angles, and consume each drag only once.
- **`toWorld`** combines view-relative right and forward arrows on the ground, so W follows your view instead of always following −Z.
- Keep lag comfortable and treat wall avoidance as a separate camera problem, not something `lookAt` fixes.

Next, in Lesson 5, you'll give the robot gravity and a jump while this camera keeps the action in view.
