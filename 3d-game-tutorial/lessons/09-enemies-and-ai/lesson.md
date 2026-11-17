---
title: Enemies and simple AI
tier: 2
minutes: 35
summary: Give two Spikers a patrol route, a reason to chase you and a reason to stop. Add fair contact rules so a sideways touch hurts but a falling stomp wins.
learn: Build a finite state machine; Patrol waypoints and notice nearby players; Limit chase speed and distance from home; Tell a stomp from a damaging touch; Use invulnerability and knockback fairly; Project enemy state labels onto the screen
---
An enemy does not need to think like a person. It needs to make you decide: sneak past, run away or jump on it? In this lesson you'll give two orange Spikers a few predictable behaviours, then make contact with them mean something.

The arena reuses your movement, jumping, collisions and chase camera from lessons 3–6. We use `makeBot()` rather than the animated model from lesson 8 so the new rules are easy to see. Press **Run the demo**, move with **WASD** and hold **Space** to jump; on a phone, move with your left thumb, hold **JUMP** and drag with your right thumb to look.
::demo "Two Spikers patrol dashed routes, notice the robot and chase until you escape"
Walk into a sight ring, watch the state label change, then retreat; reset and try landing on a Spiker while falling.

## One job at a time
**AI**, short for artificial intelligence, means the code that chooses an enemy's actions here. There is no learning model or hidden planning system. Each Spiker remembers one word describing what it is doing now.

A **finite state machine** is a small, fixed collection of named behaviours, with rules for changing between them. “Finite” just means there are only so many states. Start by writing the rules as a table, before writing a single `if`:

| State | Job | Changes when |
| --- | --- | --- |
| `patrol` | Walks around its waypoint loop | Notices you after its cooldown → `alert` |
| `alert` | Pauses to give you a warning | Still sees you after 0.45 s → `chase`; loses you → `return` |
| `chase` | Moves towards your position | Loses sight or travels beyond its leash → `return` |
| `return` | Walks back to the centre of its route | Arrives home → `patrol`, with a 1 s cooldown |
| `squashed` | Gets wider and flatter, then disappears | After 0.35 s it stops updating |

A stomp can interrupt any live state and enter `squashed`. You never need to ask whether an enemy is “patrolling and chasing”; the single `state` property makes that impossible.
::snippet lessons/09-enemies-and-ai/demo.html#fsm "demo.html — one switch chooses the enemy's current job"
The `switch` runs one matching branch per update. A `break` ends that branch even if `setState()` changed the state inside it: the new behaviour starts on the next update. That keeps a transition from accidentally running several jobs at once.

`setState()` also resets `stateTime` to zero. The update adds `dt` to that timer before the switch, so `0.45` really means seconds spent in `alert`, not seconds since the page loaded. The squash branch scales only the visible group; contact checks already ignore a squashed enemy.

> [!INFO] Predictable is useful
> A short warning and a reliable escape rule let you learn an enemy. Making it react instantly, follow forever and always intercept perfectly might be “smarter”, but leaves you fewer interesting choices.

This is why simple AI is often more fun than smart AI. The challenge comes from where the designer places enemies, how their routes overlap and when you choose to jump, not from surprising you with rules you cannot read.

## Routes, sight and pursuit
A **waypoint** is a position an enemy aims for. Each Spiker stores a `path` array of ground positions, and `target` is the index of the next one. The dashed triangle shows that route; the small brown ring marks `home`, the average of its waypoint positions.

You need an **arrival threshold**: a small distance that counts as “close enough”. Checking whether two moving positions are exactly equal is brittle, because a step may pass the target or finish a fraction away.
::snippet lessons/09-enemies-and-ai/demo.html#move "demo.html — arrive without overshooting, turn without snapping"
`dx` and `dz` point from the enemy towards the goal. Dividing them by `distance` makes a direction one unit long. Multiplying that direction by `step` moves the Spiker along the ground without letting diagonal motion become faster.

`Math.min(distance, speed * dt)` caps movement at both the speed budget and the remaining distance. The `0.08` threshold is eight centimetres at our course scale. On arrival, the patrol branch uses `(target + 1) % path.length`: the remainder operator wraps the index back to zero after the final waypoint.

The last three motion lines limit turning. `angleDelta()` finds the shorter turn around the circle, and `clamp()` restricts it to `turnRate * dt`. With `turnRate = 4`, the visual can rotate by at most four radians per second. Movement heads directly towards the goal even while the body catches up; this is a visual turn limit, not steering around obstacles.

### Notice the player
Our **sight radius** is a circle on the ground, centred on the enemy. It is deliberately not a realistic view cone. A circle is easy to understand, and you can watch it change size with the panel slider.
::snippet lessons/09-enemies-and-ai/demo.html#sight "demo.html — distance-based sight, with a height limit"
`dx * dx + dz * dz` is squared ground distance. Comparing it to `sight * sight` answers “inside the circle?” without calculating a square root. The height check rejects a player whose feet are 2.5 metres or more above or below the enemy's feet; the ring only illustrates the horizontal part of this rule.

The default radius is `3.4` metres. Increase it to `6` and both Spikers notice you much earlier. This is not **line of sight**, which would also check whether a wall blocks the view. Our floor is open, and the demo does no wall-visibility test.

Optionally, you could add a **dot product** check. Think of it as asking how closely two arrows agree: one arrow points forwards from the enemy, the other towards you, and both have length one. Their dot product is `1` straight ahead, `0` directly sideways and `-1` directly behind; accepting values above `0.5` gives a 120-degree-wide view cone. That is an extension, not part of this demo's circle-based sight.

### Give the chase an end
Chasing uses the same `moveTowards()` function, but supplies `player.position` and `chaseSpeed` instead of a waypoint and `patrolSpeed`. The player runs at 6.5 m/s; the default chase is 3.8 m/s, so you can escape on open ground. Try the slider at 6 m/s before deciding whether faster feels better.

A **leash** limits how far an enemy can wander from home. In the demo, losing sight or being more than `6` metres from `home` changes `chase` to `return`. The check happens before the next movement step, so it can cross the boundary by one small step; it is a give-up rule, not a physical wall.

Returning deliberately ignores sight until the Spiker reaches home. It then gets a one-second cooldown before noticing you again. Without those rules, an enemy near the sight boundary could repeatedly switch between chasing and returning, making the label flicker and the movement look indecisive.

## Stomp or hurt?
A visible spike is not automatically a collider. As in lesson 6, we choose a simple contact shape separately from the detailed meshes. This demo checks overlap between two ground circles and between their vertical spans.

The player position is at its feet. The Spiker also has a feet position, plus a `top` height of `1.3`. Once their shapes overlap, two questions decide the outcome: are you falling, and are your feet near the enemy's top?
::snippet lessons/09-enemies-and-ai/demo.html#touch "demo.html — contact first, then falling + height decide the result"
The first returns reject enemies that cannot be touched, separated ground circles and separated heights. Only after those checks do `falling` and `above` matter. A player jumping upwards beside a Spiker should not win merely because its feet are high.

`velocity.y < -0.5` means moving downwards with more than a tiny amount of speed. `top - 0.22` creates a forgiving 22-centimetre band near the top, rather than demanding a perfect mathematical landing. The return value is a decision, not an effect: `'stomp'`, `'hurt'` or `null`.
::snippet lessons/09-enemies-and-ai/demo.html#contact "demo.html — turn a contact result into a game action"
`stomp()` changes the enemy to `squashed`, moves your feet to its top and sets upward velocity to `11` m/s. It clears `grounded`, `ground`, the jump buffer and coyote-time eligibility, so the floor controller does not treat that bounce as a fresh grounded jump. Sixteen pale particles make a short poof, and the stomp counter increases.

The shared controller still applies its variable-height gravity: holding the jump button makes that bounce taller than releasing it. The enemy's shrinking mesh cannot damage you again because `touch()` rejects `squashed` immediately, before the 0.35-second visual finishes.

> [!WARNING] Don't skip over the landing band
> A large physics step can move your feet from above a Spiker to well below its top in one update. The demo divides each frame into steps no longer than `1 / 120` second before movement and contact tests. This reduces missed stomps here; it is not a general swept-collision solution for arbitrarily fast objects.

That ordering matters: move the player, move the enemies, then check contact using the new positions and current vertical velocity. Change the two tolerances in `touch()` separately and test a falling landing, a rising jump and an ordinary sideways touch.

## Make a hit fair
One sideways touch should remove one heart, not all three. Because overlap may last across many updates, damage needs a temporary lockout. **Invulnerability frames**, often called **i-frames**, are that mercy period; despite the name, we count it in seconds so it lasts the same time on different screens.
::snippet lessons/09-enemies-and-ai/demo.html#hurt "demo.html — accept one hit, then push the player away"
The very first line refuses a hit while `invulnerable > 0`. A successful hit removes one heart and starts a one-second timer. Because the timer is set immediately, even a second enemy touching you in the same simulation step cannot remove another heart.

**Knockback** is the push away from the damage source. Subtracting the enemy position from your position gives an “away” arrow. `normalize()` makes it one unit long; multiplying by `7` gives the same horizontal kick regardless of how close the enemy was. If both positions match, the fallback chooses +Z rather than trying to normalise a zero-length arrow.

The `6.5` upward velocity lifts you clear of the contact, and the `0.22`-second `stun` briefly reduces control. Merely setting knockback velocity would not be enough if ordinary movement immediately steered it away.
::snippet lessons/09-enemies-and-ai/demo.html#recovery "demo.html — count down mercy and briefly weaken steering"
During stun, `silentInput` supplies zero movement and no new jump. Setting both acceleration values to `1.5` makes the kick decay gently; after stun, ground acceleration returns to `14` and air acceleration to `6`. This preserves a short visible shove without taking control away for the whole mercy second.

The separate `bot.visible` line alternates visibility using `Math.floor(elapsed * 14) % 2` while the timer is positive. Blinking is feedback, not protection: the timer check in `hurt()` is the protection. Deleting the blink must not change whether a hit lands.

At zero hearts, movement input is suppressed and the enemies stop seeing a live player. The demo asks you to reset rather than adding a death menu; lesson 10 will organise those wider game-flow decisions.

> [!TIP] Test both ends of the rule
> Touch a Spiker without jumping: one heart should empty and the robot should blink. Reset, then hold jump and land on it: you should bounce, keep three hearts and see the stomp count rise. A successful stomp is still allowed during the mercy period.

## Make the state visible
It is much easier to debug an enemy when you can see what it believes it is doing. Our ground rings change colour by state, while ordinary HTML labels follow the enemies on screen. Labels say the state as well as colouring it, so you do not have to distinguish teal from blue.

The enemy lives in world coordinates; HTML lives in pixels. **Projection** converts a 3D point into a position as seen through the camera.
::snippet lessons/09-enemies-and-ai/demo.html#label "demo.html — project a world point and position a DOM label"
`projected.copy()` protects the enemy's real position: `project(camera)` modifies the vector you call it on. Adding `1.9` to Y puts the label anchor above the spikes, not at the enemy's feet.

After projection, the visible screen spans approximately `-1` to `1` in X and Y. Multiply by `0.5` and add `0.5` to turn X into a fraction from zero to one, then multiply by the window width. Screen pixels grow downwards, so the Y conversion negates the projected value before scaling by height.

The depth and edge tests hide anchors outside the camera view, and `!enemy.alive` hides a finished squash. This does not detect an enemy hidden behind another object. In the frame loop we update the chase camera, call `camera.updateMatrixWorld()`, then place the labels, so they follow the current view rather than the previous one.

## How Skyhop does it
Skyhop uses the same patrol → alert → chase → return structure in `game/src/enemy.js`'s `fsm` region. Its alert lasts 0.45 seconds too, but adds a hop and an alert mark. Here is the chase branch inside that real state machine:
::snippet game/src/enemy.js#fsm-leash "game/src/enemy.js — the chase branch of Skyhop's FSM"
Rather than waiting for the enemy to stray beyond home, Skyhop clamps the chase goal to the leash circle. `fromHome` points from home to the desired destination; `setLength(this.leash)` shortens that arrow when it is too long. The enemy can pursue you towards the boundary without marching out indefinitely.

Its `lost` test also waits until the chase has lasted more than 0.6 seconds. Return heads towards the current patrol waypoint, not the route's centre, and can notice you again after 0.8 seconds under its cooldown rules. Those are deliberate variations on the demo, not different definitions of a state machine.
::snippet game/src/enemy.js#touch "game/src/enemy.js — contact against a hovering Spiker"
Skyhop's Spikers hover, so contact uses the nearest point on the player's vertical segment to the enemy's centre, then checks a combined radius in 3D. Its stomp height compares feet with the hovering body's centre, rather than the demo's fixed top band. The invariant stays the same: overlap first, then falling plus relative height.
::snippet game/src/player.js#hurt "game/src/player.js — the player owns health and knockback"
The finished `Player` owns `hearts`, `invulnerable` and `stun`. Its `hurt()` returns `false` for a refused hit, or `true` after applying one. Numbers come from `RULES` in `config.js`: Skyhop currently uses 1.6 seconds of mercy and 7.5 m/s horizontal knockback, slightly more generous recovery than the demo.
::snippet game/src/game.js#damage "game/src/game.js — only accepted hits trigger game-wide feedback"
`Game.damage()` checks that return value before changing the HUD, flashing the screen, playing sound or shaking the camera. Otherwise an ignored touch could still produce a hurt sound every update. Keep enemy contact, player health and game-wide feedback separate; each part then has one clear responsibility.

## Your turn
> [!TRY] Challenges
> 1. Make patrols calmer: change `patrolSpeed` from `1.5` to `0.8` in the `Spiker` constructor, then compare how easily you time a jump.
> 2. Change Spiker A's waypoint coordinates in the `enemies` array. Keep them on the arena and check that both its dashed route and `home` move with them.
> 3. Give the two Spikers different escape rules: assign `enemies[0].leash = 3.5` after creating the array, leaving B at `6`. Lure each away and watch its label.
> 4. Make damage tuning explicit: add an `INVULNERABLE_SECONDS` constant and use it in `hurt()`. Try `0.3` and `1.5`, checking that changing the blink rate alone does not change protection.
> 5. Add the optional facing check inside `canSee()`. Build a forward vector with `Math.sin(this.facing)` and `Math.cos(this.facing)`, normalise the player direction and use `.dot() > 0.5`; handle a zero-distance player before normalising.

## Recap
- A finite state machine gives each enemy one current job and explicit reasons to change it.
- Waypoints need arrival thresholds; movement and turning need per-second limits.
- Sight decides whether to pursue, while a leash and return cooldown keep pursuit manageable.
- A stomp needs contact, downward velocity and suitable relative height; a sideways touch hurts.
- Invulnerability prevents repeated damage, knockback separates the bodies, and labels expose the decisions.

Next, in lesson 10, you'll organise these local rules into a complete game flow: starting, finishing, retrying levels and saving progress.
