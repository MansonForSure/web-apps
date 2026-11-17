---
title: Performance and mobile
tier: 3
minutes: 35
summary: Render the same forest three ways, measure what each frame costs, and spend your phone's limited graphics budget where it matters. Then borrow Skyhop's adaptive quality and resource-cleanup habits.
learn: How to measure frame time and find CPU or GPU bottlenecks; When to use separate meshes, instancing or merged geometry; Why pixel ratio and shadows matter on phones; How to dispose resources without breaking shared assets; How to test touch controls and adapt quality
---

Your robot can jump, fight enemies and reach the portal. Now you need all of that to feel responsive on a phone, not just on your development laptop. The lighting from Lesson 2, effects from Lesson 11 and shaders from Lesson 12 all share the same limited time to draw a frame.

Here's what you'll make: a forest with up to **6,000 trees**, each a cylinder trunk and cone canopy. Drag to orbit, scroll or pinch to zoom, and use the panel to change how the same trees are submitted to the graphics card. Start small; the separate-mesh method is deliberately expensive.

::demo "One forest, three rendering methods, and live frame and resource counters"

Try 600 trees with shadows off, compare all three methods, then change only the pixel ratio.

## Measure the frame budget

**Frame budget** means the time available before the next picture should appear. At 60 frames per second you have about **16.7 milliseconds**; at 120 you have **8.3 milliseconds**. That budget must cover input, physics, animation, JavaScript, rendering and browser work, not just moving the robot.

A **bottleneck** is the part that prevents the next frame arriving on time. **CPU-bound** means the processor is busy doing things such as collision checks or preparing thousands of drawing commands. **GPU-bound** means the graphics processor is busy transforming vertices, shading pixels or drawing shadow maps. They overlap in time, so adding two profiler numbers together doesn't necessarily give the frame interval.

::snippet lessons/13-performance-and-mobile/demo.html#stats "demo.html — measure intervals and read renderer counters"

`timer.getDelta()` gives the interval between animation callbacks in seconds. Multiplying by `1000` makes milliseconds. We smooth that interval over roughly half a second and calculate FPS as `1000 / smoothedMs`, so the two readouts agree rather than jumping around independently.

The timer stays **unclamped** for measurement. Clamping motion's delta, as you did in Lesson 5, protects physics; clamping the measured interval would hide slow frames. `skipSamples` excludes the first two frames after a rebuild or resume, while the counters update every 250 ms to avoid unnecessary DOM work.

`renderer.info.render` reports draw calls and submitted triangles after `renderer.render()`. A **draw call** is a command asking the GPU to draw some geometry with a particular rendering setup. With dynamic shadows enabled, this demo's counters include the shadow pass as well as the camera view; with shadows off, there is just the main pass.

> [!INFO] What the FPS counter cannot tell you
> The readout measures frame intervals, not GPU execution time. A steady 60 FPS can mean spare capacity on a 60 Hz screen, and one average can hide occasional stutters. This course's screenshot tests use software rendering, so their low FPS is not a phone benchmark.

Record a short run in your browser's **Performance profiler**, its timeline of work on each frame. Look for long JavaScript tasks, repeated allocations and garbage collection, or time spent preparing rendering. GPU detail varies by browser; use controlled comparisons alongside the timeline. If changing pixel ratio helps much more than reducing tree count, pixel work is a likely bottleneck. If batching helps while resolution barely matters, drawing-command overhead is a likely one.

## Batch the forest

A low-poly tree is cheap to draw; sending thousands of tiny commands often isn't. Reusing a geometry and material saves resources, but a thousand ordinary meshes still require a thousand mesh submissions. Batching puts many objects into fewer submissions.

### Separate meshes

This is the familiar approach from earlier lessons: make one mesh for each visible part and position it independently. It is easy to inspect and animate, and Three.js can skip each off-camera mesh separately.

::snippet lessons/13-performance-and-mobile/demo.html#separate "demo.html — two ordinary meshes per tree"

Both parts reuse the forest's two geometries and two materials. `place()` updates a temporary object's matrix, and `mesh.matrix.copy()` transfers that transform to each mesh. `matrixAutoUpdate = false` avoids rebuilding those local matrices every frame because these trees never move; it does not remove their draw calls.

With all trees visible and shadows off, 100 trees cost 201 calls: 200 tree parts plus the ground. At 6,000 trees that becomes 12,001. If you orbit until some trees leave the view, the separate-mesh count may fall.

### Instanced meshes

**Instancing** draws many copies of the same geometry and material using a list of transforms. It suits trees, grass, pebbles and other repeated scenery. Each copy can have a different position, rotation and scale without needing its own ordinary mesh.

::snippet lessons/13-performance-and-mobile/demo.html#instanced "demo.html — one InstancedMesh for trunks and one for canopies"

The **dummy** `Object3D` is a reusable matrix builder, not an object added to the scene. `place()` sets its transform and calls `updateMatrix()`; `setMatrixAt(i, dummy.matrix)` copies the result into instance slot `i`. Both parts use the same tree layout, so the canopy stays attached to its trunk.

`instanceMatrix.needsUpdate` tells Three.js to upload changed instance data. `computeBoundingSphere()` gives the batch a bound covering every tree. If you later move instances, refresh the upload flag and bounds; a stale bound can make visible trees disappear.

This forest has **two instanced meshes total**, not two per tree. With shadows off, they plus the floor cost three calls. Instancing doesn't remove triangles: the GPU still draws each copy.

### Merged geometry

**Merging** bakes transformed copies of shapes into a larger geometry. Unlike instancing, it can combine different shapes, provided their vertex attributes and indexing are compatible. It works well for static scenery that doesn't need independent movement.

::snippet lessons/13-performance-and-mobile/demo.html#merged "demo.html — bake tree transforms into two larger geometries"

`clone().applyMatrix4()` moves each copy's vertices into forest space. `mergeGeometries(copies, false)` joins those copies without creating separate material groups. We merge trunks separately from leaves, giving two meshes with two materials; the ground again makes three main-pass calls.

The temporary copies are disposed immediately. The finished geometry contains duplicated vertex data for every tree, so it usually uses more geometry memory than instancing. Moving one merged tree independently is no longer as simple as changing `mesh.position`.

| Method | Forest calls | Best fit |
| --- | --- | --- |
| Separate meshes | `2 × N` if all visible | A few movable objects |
| Instancing | 2 | Repeated shapes with shared materials |
| Merging | 2 in this demo | Static compatible shapes |

A third fix is **fewer materials**. Reuse a small palette rather than creating a new material for every object. Sharing alone doesn't collapse ordinary meshes into one call, but it makes batching possible and reduces rendering-state changes. Merging with many preserved material groups can still require many calls. Vertex colours or a texture atlas can provide variation without a different material for every tree.

**Frustum culling** means skipping objects outside the camera's visible volume. Separate trees can be culled individually, whereas each batch here has one bound around the whole forest. A huge batch partly on screen can submit many hidden trees. For a larger game, split scenery into spatial chunks, then instance or merge within each chunk.

> [!TIP] Make the comparison fair
> Keep the camera, N, shadows and pixel ratio unchanged when comparing methods. `treeLayout()` restarts a seeded random generator on every rebuild, so swapping methods doesn't secretly swap the scenery. The slider rebuilds on `change`, when you release it, rather than rebuilding for every drag step.

## Spend fewer pixels

Batching fixes submissions, not everything the GPU does afterwards. **Triangle count** describes how much shape data gets drawn. **Fill rate** describes how quickly the GPU can process screen pixels; detailed shaders, transparency and full-screen effects increase that work. Several transparent surfaces over the same pixel cause **overdraw**, shading that area repeatedly.

Pixel ratio controls drawing-buffer resolution, not the canvas's CSS size. At ratio 2, both width and height double, making four times as many pixels as ratio 1. A ratio-3 phone would ask for nine times as many. That's why Lesson 1 capped the ratio, and why lowering it is often the biggest mobile win.

::snippet lessons/13-performance-and-mobile/demo.html#pixel-ratio "demo.html — change resolution without changing the layout"

Try `0.75`, `1`, then **Device**, which uses the device ratio capped at 2. Moving from 2 to 1 removes 75% of main-buffer pixels; it doesn't promise four times the FPS because CPU work and fixed-size shadow maps remain. Ratio 0.75 draws about 56% as many pixels as 1, trading sharpness for headroom. The HTML panel stays crisp because it isn't drawn into the WebGL buffer.

If triangle processing is the problem, reduce cylinder or cone segments, distant decoration, or model detail. **Level of detail**, often shortened to **LOD**, means using simpler shapes at a distance. Reducing pixel ratio doesn't reduce submitted triangles. Likewise, fog blends distant scenery into the sky colour but doesn't itself stop that scenery being drawn.

### Shadows have their own bill

A shadow map is another render from a light's viewpoint, followed by shadow lookups when shading surfaces. More casters mean more shadow drawing; multiple shadow-casting lights mean more maps. Going from a 1024-square map to 2048-square means four times the texels, not automatically four times the total frame time.

::snippet lessons/13-performance-and-mobile/demo.html#shadows "demo.html — dynamic shadows or a cached map"

`shadowMap.enabled` switches shadows off completely. `shadowMap.autoUpdate = false` keeps the last map instead of redrawing it each frame. In this demo the trees, floor and sun stay still, so ticking **Static shadows** is safe while you orbit the camera. `rebuildForest()` sets `shadowMap.needsUpdate = true` whenever the trees change.

A moving character, moving platform or following sun makes a cached map stale. For a real game, refresh when casters or the light change, bake static shadows separately, or choose fewer casters. Don't freeze Skyhop's whole shadow map while its robot and sun are moving. Smaller maps and limiting `castShadow` often cost less visual quality than removing every shadow.

## Keep memory and phones healthy

**Disposal** releases graphics resources you no longer need. Removing a mesh from the scene stops it being drawn, but does not by itself free its geometry's GPU buffers. Rebuilding a level repeatedly can leak resources even when the screen looks correct.

::snippet lessons/13-performance-and-mobile/demo.html#dispose "demo.html — clean up only resources owned by the old forest"

`forest.geometries` and `forest.materials` are sets: thousands of separate meshes share those resources, so each is disposed once. An `InstancedMesh` also has per-instance buffers, released by its own `dispose()`. Clearing `forest` drops our reference to the old group. The floor remains because it belongs to the scene, not the replaceable forest.

`renderer.info.memory.geometries` and `.textures` count resources, not bytes. All three methods can show three uploaded geometries while their sizes differ greatly. Switch methods and N repeatedly; after rendering, counts should settle rather than grow without limit. Turning shadows off can leave their cached textures allocated, which is not automatically a leak.

> [!WARNING] Know who owns a resource
> Don't blindly dispose everything reachable from a departing mesh. Another level or object may still use a shared geometry or material. Conversely, `material.dispose()` does not dispose its textures; release textures and render targets separately when you own them and nothing else needs them.

### Touch, not hover

A phone has neither a mouse wheel nor reliable hover. Keep controls large enough to tap, reserve space for thumbs, and use actual touch gestures. The gameplay demos use Lesson 3's `Input` joystick and jump button; this inspection demo needs orbit controls instead.

::snippet lessons/13-performance-and-mobile/demo.html#touch "demo.html — explicit touch gestures and keyboard access"

One finger rotates and two fingers zoom or pan. OrbitControls receives events from the canvas, not the panel, so the slider and dropdown stay usable. Arrow keys pan only when the canvas has focus. The canvas uses `touch-action: none`, preventing page gestures from fighting camera gestures.

The head includes `width=device-width,initial-scale=1,viewport-fit=cover`. The first two settings give you a sensible mobile layout; `viewport-fit=cover` allows the page into cut-out areas. Position controls with `env(safe-area-inset-top)` and the other safe-area values so a notch or home indicator doesn't hide them. The shared `.panel` and `.hint` styles already do this. Safe areas don't replace checking portrait, landscape and browser-toolbar changes.

### Stop work nobody can see

A hidden game should not keep spending battery. Timer's visibility support avoids a huge resume delta, but explicitly stopping your loop also stops drawing.

::snippet lessons/13-performance-and-mobile/demo.html#visibility "demo.html — pause hidden or off-screen rendering"

`setAnimationLoop(null)` cancels rendering; `syncLoop()` restarts only when the document is visible and the canvas intersects the viewport. That's useful for an embedded demo scrolled off screen. In a game, pause gameplay and sound too rather than surprising the player when they return.

Phones can slow down after several minutes through **thermal throttling**, reducing processing speed to control heat. Battery-saving modes also affect performance. Test sustained play, not just the first ten seconds, and leave headroom below your target frame budget.

For a real-phone test, serve your project on your laptop's local network:

```bash
python3 -m http.server 8000 --bind 0.0.0.0
```

On the same Wi-Fi, open `http://YOUR-LAPTOP-LAN-IP:8000/` on the phone, then navigate to the demo. Use your laptop's private LAN address, not `localhost`, which means the phone itself. Allow local access through the firewall if needed; don't forward the port to the internet. Check taps, pinch, rotation, safe areas and a few minutes of play. Emulation tests layout, but cannot reproduce the phone's GPU, battery or heat.

## How Skyhop does it

The finished game applies the same ideas selectively. It batches decoration while leaving gameplay objects independent, then lowers expensive graphics settings if measured frame intervals stay high.

::snippet game/src/world.js#decor-build "game/src/world.js — Decor.build batches each scenery kind"

Inside the `Decor` region, `tree()` records a trunk and **two** leaf layers; our demo deliberately uses only one canopy. `scatter()` also records tufts, pebbles and two flower colours. `build()` turns each non-empty kind into an instanced mesh, using shared `GEO` shapes and `MATERIALS`. There can be up to seven decoration batches, not one giant mesh for everything.

Only trunks and leaf kinds cast shadows; small flowers, tufts and pebbles receive them without becoming casters. The returned mesh list goes into `Level.instanced` for cleanup. Collisions remain separate data, just as you separated colliders from visual meshes in Lesson 6.

::snippet game/src/stage.js#monitor "game/src/stage.js — measure before dropping quality"

`monitor(rawDt)` collects **120 frame intervals** in Auto mode and averages them. If that average exceeds `1 / 40` seconds, it switches to low quality. That's a frame-count window: about two seconds at 60 FPS, but four seconds at 30. The loop passes the raw delta to monitoring and clamps only the gameplay update.

This is **adaptive quality**: respond to measured performance rather than guessing from a device name. Skyhop automatically steps down once; it doesn't automatically step back up. That avoids constant switching, but a brief expensive period can leave it on low until the player changes mode. A two-way system needs separate thresholds and a cooldown so it doesn't oscillate.

::snippet game/src/stage.js#apply-quality "game/src/stage.js — apply a complete quality preset"

The high preset caps pixel ratio at 2, enables bloom and uses a 2048-square shadow map. Low caps at 1, disables bloom and uses 1024. `applyQuality()` updates both renderer and composer pixel ratios. When the shadow size changes, it disposes the old map and sets it to `null` so Three.js can allocate the replacement.

::snippet game/src/stage.js#resize "game/src/stage.js — resize both rendering paths for phones"

`resize()` sizes both the renderer and post-processing composer. In portrait it widens the vertical field of view, capped at 82 degrees, to retain useful horizontal coverage. The stage listens to ordinary window resizing and `visualViewport` resizing, which helps when mobile browser chrome changes the available view.

::snippet game/src/level.js#dispose "game/src/level.js — level-owned resources leave together"

The level removes its group, disposes its owned geometries and instance buffers, then lets cores, enemies and the portal clean up their resources. Shared world geometries and materials aren't disposed on every restart. That ownership boundary is what keeps scenery reusable without accumulating old level buffers.

### Your optimisation checklist

Treat these impacts as starting points, not benchmark promises. Measure the same view before and after each change, and choose the row that addresses your bottleneck.

| Check | Impact | Test |
| --- | --- | --- |
| Instance repeated scenery | Large draw-call reduction | Shared shape and material; check bounds |
| Merge static shapes by material | Large call reduction | More vertex storage; chunk for culling |
| Reuse fewer materials | Enables batching; fewer state changes | Use a consistent palette |
| Lower ratio from 2 to 1 | 75% fewer main-buffer pixels | Softer canvas, often a big mobile win |
| Reduce triangle detail or distant decor | Less vertex work and scenery load | Check silhouettes and draw distance |
| Reduce transparency and full-screen effects | Less fill and extra-pass work | Keep essential feedback readable |
| Shrink shadow maps / limit casters | Less shadow work and storage | Check edges and moving characters |
| Cache truly static shadows | Removes repeated map drawing | Invalidate when lights or casters change |
| Avoid per-frame allocations | Fewer memory-cleanup stutters | Reuse temporary vectors and arrays |
| Dispose departed resources | Prevents growth across restarts | Track ownership, not just scene removal |
| Pause hidden / off-screen work | Saves battery and heat | Resume input, timing and sound safely |

## Your turn

> [!TRY] Challenges
> 1. Change the radial segments in `rebuildForest()` from 6 and 7 to 4 and 5. Compare `renderer.info.render.triangles` and the tree silhouettes at N = 600.
> 2. Make only canopies cast shadows. Change `castShadow` in each builder, keeping all methods visually comparable. What happens to calls with dynamic shadows on?
> 3. Add a low-quality preset button that calls `setPixelRatio('0.75')`, clears `ui.shadows.checked`, then calls `applyShadows()`. Check that the readouts and button states agree.
> 4. Add an automatic one-way quality drop. Accumulate raw `dt` in `frame()`, follow `Stage.monitor()`'s 120-frame window, and call your preset only after a sustained average above 25 ms. Ignore rebuild samples using `skipSamples`.
> 5. Divide the forest into four spatial groups and instance each separately. Adapt `buildInstanced()` and `disposeForest()` so every batch is freed. Compare extra calls against better culling while zoomed into one corner.

## Recap

- Measure raw frame intervals: 60 FPS gives you about 16.7 ms, and 120 gives you 8.3 ms.
- Instancing and merging reduce draw calls; they don't automatically reduce triangles or shaded pixels.
- Pixel ratio, shadow maps, casters and effects are separate quality knobs. Change one, then measure.
- Dispose owned geometry, materials, textures and instance buffers without breaking shared assets.
- Test real touch controls and sustained play on a phone; pause hidden work and adapt quality deliberately.

In Lesson 14 you'll ship the game: package what it needs, publish it, and check that someone else can actually play it.
