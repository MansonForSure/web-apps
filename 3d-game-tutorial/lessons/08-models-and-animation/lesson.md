---
title: Real 3D models and animation
tier: 2
minutes: 35
summary: Replace your box robot with a real animated model. Load a GLB, blend between poses, and let the player's movement choose the right animation.
learn: What glTF and GLB contain and where to find CC0 models; How to load a model with async and await; How to scale imported models and enable their shadows; How clips and actions blend and finish; How controller state and speed drive animation
---

Your box robot can already run, jump and collect things. Now give it elbows, a face and a wave. You don't need to model those parts yourself: you'll load an artist's robot and play the animations packed inside its file.

This demo has two jobs. In the showcase, buttons play gestures while the robot stays on its orange circle. In **Drive mode**, the controller from Lessons 3–6 moves the robot, and its movement chooses the animation. The camera and collisions haven't changed; you're replacing what follows the player position.

::demo "A real robot: one-shot emotes, adjustable crossfades and automatic movement animations"

Try **Wave**, then **Punch** before the wave finishes; change the crossfade slider, then enable **Drive mode** and turn **Run** off to walk.

## Load a GLB

**glTF** means *Graphics Language Transmission Format*: a standard way to deliver 3D assets to an application. Think of it as the JPEG of 3D — a common delivery format, not a modelling tool. Unlike JPEG, it can describe an entire hierarchy of objects, their materials, textures and animations, not just a flat image.

A `.gltf` file contains readable JSON, often accompanied by separate binary data and image files. **GLB** is the binary version, which can bundle that data into one file. That's handy for a game: one path to keep correct, and fewer loose files to forget when publishing. Our `RobotExpressive.glb` is already in `assets/models/`, so the demo needs no external downloads.

A character also needs a **rig**, the joints that let its body bend, and suitable animation clips. A lovely static statue won't gain a walking animation just because you load it with Three.js. When choosing a replacement, check whether it is animated and whether the download includes a glTF or GLB version.

These three libraries offer free **CC0** models. CC0 is a public-domain dedication: you can modify and use the covered asset, including in commercial games, without a required credit.

| Library | Useful for | Check first |
| --- | --- | --- |
| [Quaternius](https://quaternius.com/packs/animatedrobot.html) | Animated low-poly characters and matching packs | Some packs provide FBX or Blender files that need exporting to GLB. |
| [Kenney](https://kenney.nl/assets) | Simple, consistent props and environments | A 3D prop is not necessarily a rigged character. |
| [Poly Pizza](https://poly.pizza/m/QCm7qe9uNJ) | Individual low-poly models, including a CC0 animated robot | Choose downloads labelled CC0; the whole catalogue is not under one licence. |

[Kenney's licence FAQ](https://kenney.nl/support) confirms its asset-page downloads are CC0. [Poly Pizza's terms](https://poly.pizza/docs/tos) require following each model's own licence. Keep the download's licence file rather than relying on the word “free”.

Three.js's **GLTFLoader** reads both formats. Our shared `loadCharacter` function wraps that loader and returns a ready-to-use character. Loading is **asynchronous**: the browser must fetch and decode the file before you can use its objects.

::snippet lessons/08-models-and-animation/demo.html#load "demo.html — wait for the robot, not the whole game loop"

`async` lets this function use `await`. `loadCharacter(...)` returns a **Promise**, a result that will arrive later; `await` pauses this function until that result is ready. It doesn't freeze the browser or the stage's rendering loop. While you wait, `character` stays `null`, the loading message remains visible and the emote buttons are disabled.

Once the character arrives, add its root to the scene and start `Idle`. The `try`/`catch` also matters: a wrong URL should produce a readable message, not leave the player guessing forever. The path starts with `../../` because `demo.html` sits two folders below the course root.

## Fit the model to your world

Artists work at different scales. One exported robot might be 100 units tall, while your controller is only 1.6 units tall. You want the art to fit the collision body from Lesson 6, not to rewrite gravity and platform sizes around every imported asset.

A **bounding box** wraps the model between minimum and maximum coordinates. `Box3` measures that box, and its Y size tells you how tall the imported model is before animation starts.

::snippet lessons/kit/character.js#load "character.js — GLTFLoader, a known height and mesh shadows"

The actual loader call is `new GLTFLoader().loadAsync(url)`. Its result supplies `gltf.scene`, the model hierarchy, and `gltf.animations`, the clips. `updateMatrixWorld(true)` makes sure the measurement includes the children's transforms, rather than stale positions from before the hierarchy was updated.

`height / size.y` is the scale factor. If the measured height were 8 units, asking for 1.6 gives a factor of 0.2: every dimension becomes one fifth as large. `setScalar` applies the same factor to X, Y and Z, so the robot doesn't become thin or stretched. Measure once when loading; don't continually rescale the bounding box as animated hands move around.

The top-level model is a container, not necessarily a mesh. `traverse` visits its descendants, and `obj.isMesh` identifies the pieces that can cast a shadow. Setting `model.castShadow` alone wouldn't switch on its arms and head. The lawn and sun already have the receiver and light settings from Lesson 2; this traversal enables the new shadow casters.

> [!INFO] Keep movement outside the animation
> `root` is a plain group that the controller moves. The animated model lives inside it. These clips are **in-place**: running moves the limbs, not the character across the lawn. The controller remains responsible for travel, gravity and collisions.

This robot faces **+Z**, just like the earlier box bot. Its turning therefore uses `player.facing` without an extra half-turn. For another asset, check both its forward direction and where its feet sit relative to its origin before blaming the controller.

## Clips, actions and crossfades

An **AnimationClip** is the recorded animation data: a name, a duration and tracks of values over time. Those tracks can turn joints or change facial expressions. An **AnimationMixer** evaluates that data on a particular model. An **AnimationAction** is the playable instance of a clip, with its own time, weight, loop mode and playback speed.

The file contains fourteen clips: `Dance`, `Death`, `Idle`, `Jump`, `No`, `Punch`, `Running`, `Sitting`, `Standing`, `ThumbsUp`, `Walking`, `WalkJump`, `Wave` and `Yes`. Names are case-sensitive. `Running` works; `run` does not.

::snippet lessons/kit/character.js#class "character.js — one mixer, named actions and a reusable play method"

The constructor creates one mixer for this model. `mixer.clipAction(clip)` makes or retrieves its playable action, which we store under `clip.name`. Reuse these actions instead of creating a fresh mixer whenever you press a button.

`play()` starts an action, but the movement only appears when `mixer.update(dt)` advances its animation time. The wrapper's `update(dt)` does exactly that. Forget this call and you'll see a loaded robot stuck in a pose, even though every button handler runs.

The shared `play` method also avoids resetting the current action. That's important in Drive mode: asking for `Running` every frame mustn't repeatedly send it back to its first pose. The emote buttons deliberately allow restarting the same gesture, so their small handler manages the action directly.

::snippet lessons/08-models-and-animation/demo.html#emote-action "demo.html — start an emote and crossfade into it"

A **crossfade** reduces the old action's influence while increasing the new one's. `previous.crossFadeTo(next, fadeSeconds(), false)` does this over the slider's chosen duration. At `0` seconds the change is immediate; at `0.20` seconds the shoulders and arms have time to blend. At `1` second, a short punch may be mostly over before its pose has much influence.

`setEffectiveWeight(1)` restores the incoming action's influence, and `setEffectiveTimeScale(1)` restores normal playback. They're useful when reusing an action that previously faded or changed speed. `reset()` rewinds it and clears old fade scheduling before it plays again.

The shared helper uses `next.crossFadeFrom(previous, fade, true)` instead. That's the other direction of the same transition. The final argument enables **warping**, temporary playback-speed adjustment based on the two clip durations; the showcase's `false` leaves gestures at their native timing. The slider affects emotes and their return to Idle, not the controller's preset movement fades.

> [!TIP] Read the clip, not just the pose
> The stat uses `character.current.getClip().name`. It reports the destination action chosen by your code. During a crossfade, the previous action can still influence the visible pose, so a label saying `Punch` doesn't mean the wave has vanished instantly.

## Play once, then return

Walking should loop while you move. A nod should finish. You choose that behaviour on the action, not by editing the artist's clip. The emote handler above uses `next.setLoop(THREE.LoopOnce, 1)` for every button, including `Dance` and `Jump`.

`next.clampWhenFinished = true` holds the final pose when the action reaches its end. It doesn't automatically choose Idle. Without a follow-up transition, a finished thumbs-up could stay frozen with its hand raised.

You could start a timeout, but then you'd need to know the clip duration and adjust it whenever playback speed changed. The mixer's **finished event** already knows when the action has completed. Our loading function registers `returnToIdle` as its listener.

::snippet lessons/08-models-and-animation/demo.html#emote-finish "demo.html — let the mixer announce the end of a one-shot"

`event.action` tells you which action finished. Compare it with `character.current` so an old, fading-out action cannot interrupt the newer gesture. The listener then asks the shared `play` method to blend back to looping `Idle`, using the slider's current value.

The other condition checks `!ui.drive.checked`. In Drive mode, controller state owns animation decisions. A Jump clip ending isn't proof that the physics body has landed, so this listener mustn't force Idle halfway through a real jump.

`Jump` illustrates the difference particularly well. In the showcase it's a short animated gesture, and the root stays put. In Drive mode, Space or JUMP launches the physics body; the clip only supplies the accompanying pose. Dance is similarly a one-shot here, even though it can loop during a game's victory celebration.

## Let movement choose

You don't want players to press an animation button every time they start walking. The controller already knows whether they're grounded, how long they've been airborne and how fast they're travelling. Use those facts as a small priority-ordered state table.

| Condition | Clip | Settings |
| --- | --- | --- |
| Airborne beyond 0.08 s | `Jump` | Once, `timeScale: 1.3`, fade `0.12` s |
| Horizontal speed above `4` m/s | `Running` | Loop, speed-adjusted playback |
| Horizontal speed above `0.4` m/s | `Walking` | Loop at `1.2`× |
| Otherwise | `Idle` | Loop, fade `0.3` s |

The order matters: a fast-moving robot in the air needs Jump, not Running. The brief air-time check avoids switching for tiny drops off a surface. A deliberate jump sets the controller's `airTime` to `Infinity` to prevent a second coyote-time jump, so it qualifies immediately.

::snippet lessons/kit/character.js#animate "character.js — choose the clip from controller state"

`horizontalSpeed` measures the X/Z velocity, not the held key. That makes the animation follow acceleration and braking rather than instantly snapping to a run on keydown. The two speed thresholds leave an Idle range near zero; tiny velocity leftovers won't keep the feet marching.

The helper copies the controller position and facing into `character.root`. It never asks an animated foot where the player should be. That's why changing an emote can't change the collision body, and why the same controller works with either this model or the old box bot.

::snippet lessons/08-models-and-animation/demo.html#drive "demo.html — controller first, animation second, camera last"

The **Run** checkbox sets the requested top speed to either `6.5` or `3` m/s. Those values put sustained movement on opposite sides of the Running threshold, making both clips easy to inspect with keys or touch. Apart from clamping the practice area to the lawn, this is the controller and chase camera you already know.

After the controller updates, `animateFromController` chooses the pose. Then `character.update(dt)` advances the mixer, even outside Drive mode, and the chase camera follows the resulting root position. Keeping that order avoids selecting a clip from last frame's grounded state.

### Match the stride to speed

**Foot sliding** happens when the animation's stride and the body's travel disagree: feet appear to skate along the ground. `timeScale` changes how quickly animation time advances. At `1` it plays normally; at `0.5` it takes twice as long; at `2` it plays twice as fast.

Our Running clip treats 6 m/s as its nominal travel speed. At 3 m/s, the ratio `speed / 6` would be `0.5`; at 6 m/s it is `1`. The helper updates the current Running action every frame, then clamps the ratio between `0.6` and `1.4` to avoid very slow or frantic strides.

This isn't a perfect foot lock. Walking uses a fixed `1.2`× rate, and the running clamp deliberately limits the match. But speed-based playback reduces the mismatch during acceleration. The stat's playback rate helps you see that adjustment rather than guessing from the legs alone.

> [!WARNING] Don't let two systems choose at once
> The demo disables emote buttons during Drive mode. Otherwise the controller would replace your wave on the next frame. Decide who owns animation — movement, a menu, a celebration or a one-shot — before calling `play` from several places.

## How Skyhop does it

The finished game uses the same GLB and the same separation between movement and animated art. Its loader adds two practical details for a platformer: exact foot placement and an extra group for squash and stretch.

::snippet game/src/character.js#load "game/src/character.js — loading, foot alignment and a visual pivot"

`-box.min.y * scale` lifts or lowers the model so its measured bottom lands on the root's origin. The shared demo loader only scales; this game's extra offset handles an asset whose origin isn't already at its feet. The `pivot` group lets later effects stretch the visual character without changing the player's collision height.

`frustumCulled = false` keeps animated mesh parts from disappearing when they move outside their static bounds. **Frustum culling** means skipping objects outside the camera's view. This is a simple safeguard for one hero, not a recommendation to disable culling for the whole world.

::snippet game/src/character.js#play "game/src/character.js — remember the selected clip and blend into it"

The game's `currentName` prevents restarting the selected clip, just as the demo helper compares action objects. Its normal transition is `0.2` seconds, and callers can request a different fade, playback rate or one-shot. Both wrappers reuse actions and update one mixer per character.

::snippet game/src/player.js#animate "game/src/player.js — movement poses, celebrations and visual effects"

Skyhop skips automatic movement selection while the robot is dead, celebrating or posing in a menu. Its Running threshold is `3.8` m/s and its Walking threshold is `0.5`, slightly different from the demo. Running still follows `speed / 6`, with a narrower `0.7`–`1.35` clamp.

The rest of this method updates the mixer, turns a celebrating robot towards the camera, blinks the model while invulnerable and applies squash to the pivot. Those effects don't rewrite the animation clips or move the collision body. You'll add the gameplay and polish behind them in later lessons.

The robot credit belongs with the shipped assets: **Tomás Laulhé / Quaternius, CC0 1.0 Universal, modified by Don McCurdy**. The local `assets/models/CREDITS.txt` records that McCurdy added facial-expression **morph targets** — alternate mesh shapes that can be blended — and converted and simplified the asset. Credit isn't required by CC0, but preserving this record is useful, courteous and makes future licence checks much easier.

## Your turn

> [!TRY] Challenges
> 1. Compare a Wave-to-Punch transition at `0`, `0.20` and `1` seconds. Change the range input's initial `value` and the `fade-value` label together to choose your own default.
> 2. Add a **Sitting** button with `data-clip="Sitting"`. The existing click handler should play it once and return to Idle without another event listener.
> 3. Make Dance loop until another emote replaces it. In `playEmote`, choose `THREE.LoopRepeat` for `name === 'Dance'`, and set `clampWhenFinished` only for the other emotes.
> 4. Make walking playback follow speed too. Define a local wrapper around `animateFromController`; after calling it, adjust `character.actions.Walking.timeScale` using `player.horizontalSpeed` and a chosen nominal walking speed. Keep the shared file unchanged.

## Recap

- glTF describes a 3D asset; GLB can package its scene, materials and animations into one binary file. Check each download's licence.
- `await` waits for the model without freezing the game loop. Measure its bounds, scale it to your world and traverse its meshes for shadows.
- A clip holds animation data, an action plays it, and a mixer advances and blends it using `dt`.
- Crossfades blend poses; `LoopOnce` and `clampWhenFinished` control completion. A guarded `finished` listener returns showcase gestures to Idle.
- Controller state chooses movement clips. Keep physics on the root, and adjust playback speed to reduce foot sliding.

Next, you'll give the robot something to react to: enemies with simple brains that patrol the islands and chase you when you get close.
