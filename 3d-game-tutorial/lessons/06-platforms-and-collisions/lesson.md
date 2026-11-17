---
title: Platforms and collisions
tier: 2
minutes: 35
summary: Turn floating blocks into solid ground, slide along walls, and ride moving platforms. Add a small jump grace period so stepping off an edge feels fair.
learn: Separate visible meshes from collision shapes; Test axis-aligned boxes for overlap; Resolve landings and wall collisions without stopping all movement; Detect ground and add coyote time; Carry the player with a moving platform; Inspect colliders and compare them with Skyhop's round islands
---

In Lesson 5, you stopped a falling robot at `y = 0`. That works for one endless floor, but a platformer needs edges, raised blocks, walls and ceilings. You need to ask which surface the robot touched, not just whether its height is negative.

Here's what you'll make: a staircase of floating blocks, a wall you can slide along, and two blue platforms that carry you. Press **Run the demo**. Use **WASD** and **Space**, or the left-thumb joystick and **JUMP** on a phone; drag on the right to look around, as in Lesson 4.

::demo "Climb the blocks, slide beside the wall and ride the blue platforms"

Try **Show collider boxes**, walk diagonally into the wall, then compare an edge jump with **Coyote time** on and off.

## Meshes are not colliders

A **collider** is a simple invisible shape used to decide whether objects touch. A mesh is what you draw. Keeping them separate lets you decorate a platform without changing where the player can stand.

Imagine colliding against every triangle in the robot's hands, head and legs. The answer would change as it turned or stretched, and tiny details could snag on a wall. A cylinder around the body gives you a consistent width and a flat bottom, even while the visible robot squashes on landing.

The demo's world uses an **axis-aligned bounding box**, or **AABB**: a box whose edges stay parallel to X, Y and Z. You store its lowest coordinates in `min` and highest coordinates in `max`. No triangles are needed for the collision test.

::snippet lessons/kit/physics.js#colliders "physics.js — build a box and refresh it after movement"

`Box3().setFromObject(mesh)` measures the mesh in world space. The returned collider holds those bounds, a reference to the mesh, and a `delta` vector that starts at zero. The second function updates an existing collider; we'll use its last line when platforms start moving.

An AABB can enclose a rotated mesh, but it does not rotate with it. Rotate a long block diagonally and the enclosing box includes empty corners. These demo platforms only translate, so their boxes stay a close match. This solver is not a slope controller.

> [!INFO] Simple shapes are a design choice
> Your collision shape should match the movement you want, not every visible detail. The demo's player uses `radius = 0.4` and `height = 1.6`; its `position` is at its feet. Its mesh can turn or squash without changing those numbers.

Build the mesh and its collider together so you cannot accidentally add a visible block that has no solid surface:

::snippet lessons/06-platforms-and-collisions/demo.html#level "demo.html — build visible platforms and register their colliders"

In `platform(name, w, h, d, x, y, z)`, **`y` means the top surface**, not the mesh centre. The mesh is therefore placed at `y - h / 2`. A block with top `1` and height `1` fills the space from `0` to `1`, while the floor island fills `-1` to `0`.

`colliders.push(c)` makes the block solid to the player controller. `c.name` supplies the panel's **on** readout. Change `w` or `d` to make a landing easier; change the top `y` to change how high you must jump.

## Overlap, then sliding

A **collision test** answers whether shapes touch. **Collision resolution** changes position or velocity so they no longer pass through each other. Those are separate jobs: discovering an overlap does not tell you whether to land, stop at a wall or hit your head.

For two AABBs, compare three pairs of intervals. They overlap only if their X ranges overlap **and** their Y ranges overlap **and** their Z ranges overlap. This short illustrative function is for two boxes, not the demo's cylindrical player:

```js title="An AABB overlap test"
function overlaps(a, b) {
  return a.min.x <= b.max.x && a.max.x >= b.min.x
    && a.min.y <= b.max.y && a.max.y >= b.min.y
    && a.min.z <= b.max.z && a.max.z >= b.min.z;
}
```

The `<=` and `>=` comparisons count touching faces as overlap. Use strict comparisons if you only want penetration, but choose deliberately. A gap on even one axis means the boxes cannot overlap, however close they look from the camera.

For a box-shaped player, a common simple solver moves and resolves **one axis at a time**: X, then Y, then Z. On each axis, it clamps the player to the face it crossed and cancels only that axis's velocity. If a wall blocks X, the later Z move still happens, so you slide beside the wall rather than freezing.

The demo follows that separation idea, but **does not run three independent X/Y/Z sweeps**. It applies the velocity once, resolves Y first, then pushes a circular footprint out of walls in the XZ plane. The rounded footprint makes corners less likely to catch you.

::snippet lessons/kit/physics.js@39-50 "physics.js — moveBody records the old height before moving"

`p.addScaledVector(v, dt)` is the movement from Lesson 3. Before it runs, `prevFeet` and `prevHead` save where the player was vertically. `grounded` and `ground` are cleared because support must be checked again at the new position.

For a cylinder above a box, compare its circular footprint with the box's rectangle on the ground plane:

::snippet lessons/kit/physics.js#helpers "physics.js — distance from the player to a box's footprint"

`clamp` finds the nearest X and Z coordinates inside the rectangle. If the player's centre is inside it, both distances are zero. Outside a corner, both can be non-zero; `dx * dx + dz * dz` measures squared distance, so you can compare it with a squared radius without taking a square root.

The wall response uses the same closest-point idea:

::snippet lessons/kit/physics.js#pushOut "physics.js — push away from a wall without cancelling the slide"

The first half moves the player's centre one radius away from the nearest point. If the centre is already inside the rectangle, the fallback chooses the nearest side to escape through. That stops a zero-length direction from producing invalid maths.

`nx` and `nz` form a **normal**: a direction pointing out of the wall, with length one. The **dot product**, here `velocity.x * nx + velocity.z * nz`, measures how much velocity points along that direction. A negative result means movement into the wall; subtracting that part keeps the movement along it. At a flat X-facing wall you lose the blocked X movement, not your Z movement.

## Landing or hitting your head

An overlap alone cannot distinguish a landing from entering a block sideways. You also need the old position and the direction of travel. A landing starts above a top surface and finishes at or below it while falling.

::snippet lessons/kit/physics.js@52-66 "physics.js — land on a top or stop beneath a ceiling"

For a landing, `v.y <= 0` means falling or stationary. `prevFeet >= prevTop - 0.02` says your feet started above the old top, with a 0.02-unit tolerance. `p.y <= c.max.y` says they have reached the current top. Together, these prevent a sideways collision halfway up a wall from becoming a landing.

Set `p.y = c.max.y` to put the feet exactly on the surface, then `v.y = 0` to remove downward movement. **Ground detection** is the same successful landing test: set `grounded = true` and remember the actual collider in `ground`. A single boolean tells you whether you can jump; the collider reference tells you what you are riding.

For a head hit, the tests reverse: upward velocity, a previous head position below the bottom, and a new head position above it. `p.y = c.min.y - body.height` puts the head underneath the block. Velocity becomes zero, but you do **not** become grounded; gravity pulls you down on later frames.

| Contact | Position correction | Grounded? |
| --- | --- | --- |
| Landing | Feet onto the top | Yes |
| Head hit | Head beneath the bottom | No |
| Wall hit | Centre outside the side | Does not grant support |

The foot test uses `radius * 0.9`, or `0.36` with this player. That slightly smaller support footprint means the outermost edge of the collision cylinder is not enough to count as a landing. The body still uses its full `0.4` radius against walls.

After resolving height, ignore boxes that are entirely below the feet or above the head:

::snippet lessons/kit/physics.js@68-75 "physics.js — only vertically overlapping boxes act as walls"

`standingOnTop` prevents your own supporting platform from pushing you sideways. `fullyBelow` lets you walk underneath a raised platform when there is room. All other boxes are candidates for `pushOutXZ`.

> [!TIP] Diagnose the direction, not just the height
> If touching a wall launches you onto it, inspect `prevFeet` and the landing condition. If a ceiling makes you able to jump again, check that the head-hit branch never sets `grounded`. Increasing gravity will not fix either mistake.

Because gravity is applied before `moveBody`, a stationary player attempts a small downward move each update. The landing test corrects it and renews support. Walk off the footprint and no collider renews it: `grounded` stays false. You do not need a second, unrelated floor-height rule.

## A fair edge jump

Your eyes follow the robot's body, but the collision system watches its smaller footprint. Near an edge, a jump can feel timely to you yet arrive just after the last supported frame. **Coyote time** is a short grace period that still permits that jump after you leave ground.

It is not a second jump, and it does not hold you in the air. Gravity keeps working; you simply accept a recently late input. The demo allows **0.12 seconds**. Compare the checkbox settings by walking off an edge and pressing jump immediately afterwards.

::snippet lessons/kit/player.js@47-57 "player.js — remember time off ground and consume one jump"

`airTime` resets to zero while grounded and otherwise grows by `dt`. A remembered jump is accepted while `airTime <= coyoteTime`. `bufferTimer` is the early-input allowance from Lesson 5: it remembers a press shortly before landing. Buffering forgives being early; coyote time forgives being late.

`airTime = Infinity` is important. After take-off, the player must land before the grace period can be used again. Clearing `ground` also prevents the jump from continuing to inherit platform movement.

The demo connects its checkbox to that setting each frame:

::snippet lessons/06-platforms-and-collisions/demo.html#frame "demo.html — toggle the grace period and follow the controller"

A setting of `0` removes the extra timed allowance after leaving support. The collision result is still discrete: an input processed from the previous grounded state can coincide with the update that crosses an edge. You cannot make a frame-based controller respond between frames.

The rest of this snippet keeps visuals separate from physics: `bot.position.copy(player.position)` makes the mesh follow the body. Falling below `-12` returns you to the start and clears velocity. That is a simple recovery rule, not ground detection.

## Moving platforms and debugging

Standing on a moving mesh does not automatically move the player. The renderer only draws it in a new place. You must measure how far the platform travelled this frame and add that displacement to its rider.

::snippet lessons/06-platforms-and-collisions/demo.html#moving "demo.html — move the platforms before refreshing their bounds"

The slider travels left and right around `x = 1.5`, with amplitude `3`. The lift moves vertically, with its **top** ranging from `1` to `5`; `-0.3` accounts for half its `0.6` thickness. Sine supplies smooth back-and-forth motion, rather than an abrupt change of direction.

The update order matters: **move the mesh → call `syncCollider` → update the player**. In the earlier collider snippet, `collider.delta.subVectors(collider.min, oldMin)` calculates new position minus old position. The opening of `moveBody` adds `body.ground.delta` to the player's position before applying its own velocity.

This is displacement, not speed: do **not** multiply `delta` by `dt` again. Adding all three components carries the player sideways on the slider and upwards on the lift. When you disable movement, the meshes keep their current positions and the refreshed deltas become zero.

`prevTop = c.max.y - c.delta.y` reconstructs the platform's old top for the landing comparison. That helps distinguish a crossing from merely being somewhere beneath a platform. This small solver still is not a full moving-obstacle or crushing simulation.

When something feels wrong, make the invisible shapes visible:

::snippet lessons/06-platforms-and-collisions/demo.html#collider-debug "demo.html — draw platform bounds with Box3Helper"

`Box3Helper` draws the box edges in pink. The checkbox changes `helper.visible`, and the frame loop refreshes each helper's box from `colliders[i].min` and `max`. Watch a blue platform with the boxes enabled: its outline should follow its mesh, not remain at the starting position. These helpers show world boxes, not a player cylinder.

> [!WARNING] Fast motion can skip a collision
> **Tunnelling** happens when an object moves from one side of a thin obstacle to the other between tests. This solver checks horizontal overlap after moving, so a fast player can pass through a thin wall without ending inside it. The shared loop caps `dt` at `1 / 20` seconds, which helps but does not guarantee safety.

For simple worlds, use smaller simulation steps or split one movement into several substeps. A **swept test** checks the whole path rather than only the destination. If you need fast projectiles, rotating rigid bodies, piles of crates or reliable physical contacts, consider **Rapier** or **cannon-es**. They provide a broader physics toolkit; you still need to configure collision shapes, time steps and player movement deliberately.

## How Skyhop does it

Skyhop keeps the same split between a controller, a visible character and simple world shapes. Its `game/src/physics.js` extends the demo's `moveBody` in the `#move` region. Here is the landing part of that function:

::snippet game/src/physics.js#move-ground "game/src/physics.js — the landing pass inside move"

The familiar `prevFeet`, `prevTop` and head-hit checks remain. `footprintDistSq` now handles either rectangular boxes or circular islands, and `c.disabled` skips colliders that are no longer active. You can change the footprint without rewriting the idea of crossing a top surface.

An upright **cylinder collider** suits a round island better than its square enclosing box. A square would let you stand on invisible corners outside the island. For side collisions, compare the distance between the two centres with the sum of their radii:

::snippet game/src/physics.js#cyl "game/src/physics.js — push a cylindrical player away from a round collider"

`minD = c.radius + body.radius` is the minimum separation that avoids overlap. Dividing `dx` and `dz` by distance gives the outward normal. Move the player to that separation, then call `slide` to remove inward velocity, just as you did beside a box wall.

Skyhop also lets you walk over small rims instead of requiring a jump for every raised surface:

::snippet game/src/physics.js#move-step "game/src/physics.js — the step-up part of move"

The surrounding loop has already rejected non-overlapping heights. Here `rise` is the remaining height to the top. If you were grounded and it is within `body.stepHeight`, the solver lifts your feet onto it and records support. Skyhop sets `stepHeight = 0.4`; the demo does not have this feature, so its taller staircase blocks need jumps.

Remembering the supporting collider is useful beyond riding platforms. It also tells you whether a position is suitable for recovery after a fall:

::snippet game/src/player.js#safe "game/src/player.js — remember a reliable respawn position"

Skyhop rejects moving platforms, crumbling ground, pads and trees when recording `lastSafe`. `insideFootprint(..., 0.8)` requires the player's centre to be at least `0.8` units inside the footprint. After more than `0.25` seconds of qualifying support it copies the position; losing those conditions resets the timer.

That is safer than remembering every landing, including one balanced on an edge. Skyhop's `respawn()` copies `lastSafe` back to the player and clears velocity and ground state. The demo always returns to its starting point, but both recovery rules build on the ground information you now understand.

## Your turn

> [!TRY] Challenges
> 1. Make **step 1** easier to land on. Change its `platform()` call from width and depth `2.5` to `3.5`; enable collider boxes and check that the outline grows too.
> 2. Give the grace-period checkbox a longer setting. Change `0.12` to `0.2` in `player.coyoteTime` inside the frame loop, and update the checkbox label to match. Compare edge jumps without changing `jumpSpeed`.
> 3. Slow the slider but widen its travel. Change `t * 0.9` to `t * 0.45` and its amplitude `3` to `4`. Ride it while stationary; leave both `syncCollider` calls after the mesh movement.
> 4. Add a low ceiling over the starting area with `platform('ceiling', 3, 0.4, 3, 0, 3, 4)`. Hold jump underneath it, then jump beside it. Use the pink box to locate its bottom and check that a head hit does not set **grounded** to **yes**.
> 5. Add safe recovery without editing shared files. Store a `THREE.Vector3` in the demo; after `player.update`, copy `player.position` only when `player.grounded`, `player.ground.delta.lengthSq() === 0` and the feet are well inside the box. Use `player.ground.min` and `max` with a `0.8` margin, then replace the fixed position in the fall-reset branch.

## Recap

- A **mesh** is visual; a **collider** is a simple gameplay shape. AABBs store axis-aligned `min` and `max` bounds.
- Box overlap needs overlap on all three axes. Resolve blocked movement without cancelling movement along a wall.
- Previous feet and head positions distinguish a landing from a head hit. Only support sets `grounded` and `ground`.
- **Coyote time** accepts a slightly late jump; consuming it prevents an extra airborne jump.
- Moving platforms carry riders through their frame **delta**. Refresh colliders before moving the player and inspect them with `Box3Helper`.
- Skyhop extends the solver with round footprints, small step-ups and safe respawn positions; fast motion still needs care.

Next, in Lesson 7, you'll give those platforms a reason to explore: collectible energy cores and a HUD that counts them.
