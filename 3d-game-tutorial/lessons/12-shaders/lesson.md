---
title: Shaders: painting with the GPU
tier: 3
minutes: 35
summary: Paint a gradient sky and a swirling portal without textures, then wobble a mesh on the GPU. Learn how small vertex and fragment programs turn numbers into a game's visual style.
learn: What vertex and fragment shaders do; How ShaderMaterial connects GLSL to Three.js; Attributes, uniforms and varyings; Patterns made with UVs and simple GLSL maths; Animating and debugging custom shaders; Keeping shader colours consistent
---

In Lesson 11 you added feedback to things that happen in the game. Now you'll change how those things are drawn. A portal doesn't need a video of swirling fire: a short program can calculate its colour every frame.

You'll build a shader playground with three examples: a gradient sky, a swirling portal and a wobbling blue object. Press **Run the demo**, choose a shader, then drag to orbit and scroll or pinch to zoom. Its sliders change the maths while it runs; **Show active GLSL** reveals the actual source, collapsed by default on phones.

::demo "Three shader experiments: a sky painted by height, a portal painted by angle and a mesh displaced by sine waves"

Try **Portal swirl**, pause time, then move **Frequency** from `9` to `18`: the pattern changes without moving the plane.

## Two little GPU programs

A **shader** is a small program run by the **GPU**, the graphics processor. JavaScript organises your scene on the CPU; the GPU transforms geometry and colours the image. Even the materials from Lesson 2 use shaders internally. `ShaderMaterial` lets you supply your own instead.

GPUs suit jobs where the same calculation repeats over lots of independent inputs. A **vertex shader** runs for the geometry's vertices, the corner points of its triangles. A **fragment shader** runs for fragments, the candidate contributions to pixels covered by those triangles. Think "place the corners", then "paint between them".

Fragments aren't quite final pixels: depth testing can reject them, and transparent surfaces can contribute more than once to one pixel. But "one calculation per visible bit of surface" is a useful starting picture. The GPU runs many invocations in parallel; you don't write a JavaScript loop over every pixel.

::snippet lessons/12-shaders/demo.html#material "demo.html — give a plane your two shader programs"

`vertexShader` and `fragmentShader` are strings containing **GLSL**, the shading language used by this WebGL renderer. `uniforms` supplies their adjustable inputs. The plane is still an ordinary mesh; only its material has changed.

`transparent: true` enables alpha blending, so the portal's faded edge reveals the background. `depthWrite: false` stops those translucent pixels claiming solid depth. `DoubleSide` lets you orbit behind the plane and still see it. These settings don't create the swirl: the shader does.

### Three.js supplies the plumbing

With `ShaderMaterial`, Three.js adds useful declarations and keeps the camera and object matrices current. You don't redeclare its built-in `position`, `normal` or `uv` attributes. Here's the smallest vertex program used by the portal:

::snippet lessons/12-shaders/demo.html#uv-vertex "demo.html — pass UVs through and project a vertex"

`position` is a vertex's local-space location. `modelViewMatrix` converts it from the mesh's coordinates into the camera's coordinates; `projectionMatrix` applies the camera's perspective. Their product goes into `gl_Position`, the required vertex output. The fourth component in `vec4(position, 1.0)` lets these matrices include translation as well as rotation and scale.

`uv` is a two-number surface coordinate, usually from `0` to `1` across the shape. `normal` is the vertex's outward-facing direction. Three.js provides the declarations, but your geometry must actually contain the attributes you use; our plane and icosahedron do.

| Input | Scope | Example |
| --- | --- | --- |
| **Attribute** | Each vertex | `position`, `uv`, `normal` |
| **Uniform** | The whole draw, not individual vertices | `uTime`, `uStrength`, a colour |
| **Varying** | Each fragment, interpolated from vertices | `vUv` |

A varying carries data from the vertex program to the fragment program. Both declare the same name and type; the vertex program writes it. The GPU **interpolates** it, blending corner values across the triangle, with perspective correction. That's how a plane with only four corner vertices can have smoothly changing UVs across thousands of fragments.

> [!INFO] Free plumbing, not free lighting
> `ShaderMaterial` supplies built-in inputs, not an automatic lit surface. These examples calculate their own final colours. Adding a directional light won't shade them unless their shader code also implements a lighting calculation.

### A GLSL survival kit

GLSL resembles JavaScript, but types matter. Write `float strength = 1.0;`, not `const strength = 1`. End statements with semicolons, and put each shader's work inside `void main()`.

| Tool | What it does here |
| --- | --- |
| `vec2`, `vec3`, `vec4` | Groups of two, three or four numbers: UVs, RGB or RGBA. |
| `mix` | Blends from `a` to `b` as `t` goes from 0 to 1; blends sky colours. |
| `smoothstep` | Smoothly rises from 0 to 1 between two edges; softens the portal edge. |
| `fract` | Keeps the fractional part; makes repeating rings. |
| `sin` | Repeats between −1 and 1; creates swirls and wobble. |
| `length` | Distance from the origin; finds the portal radius. |
| `atan` | Angle around the origin, in radians; finds the portal angle. |
| `normalize` | Keeps direction, makes length 1; finds the sky direction. |
| `clamp` | Keeps a number within bounds; limits sky height. |
| `.xyz`, `.xy`, `.rgb` | Selects components, called **swizzling**; takes XYZ from a `vec4`. |

A vector can represent a position or a colour: `vec3(1.0, 0.0, 0.0)` is red when interpreted as RGB. Operations such as `sin(vec3(...))` apply to each component. There's no `Math.` prefix: these functions belong to GLSL itself.

## Paint a sky by height

A sky can be one enormous sphere viewed from inside. Our sphere has radius `80`; `THREE.BackSide` draws its inward-facing sides. Orbiting turns your view through the colours rather than around a small ball.

The fragment program needs a direction to each piece of sky. First, the vertex shader supplies world position:

::snippet lessons/12-shaders/demo.html#sky-vertex "demo.html — send world position to the sky shader"

`modelMatrix` moves the local vertex into world coordinates; `.xyz` keeps its three spatial components. This dome stays centred at the world origin, so normalising that world position gives a direction from the dome's centre. If you moved the dome, you'd subtract its centre before normalising instead.

::snippet lessons/12-shaders/demo.html#sky-shader "demo.html — blend the horizon and zenith, then add a sun"

`direction.y` measures how much the direction points upwards: `0` at the horizon, `1` straight up. The **zenith** is the point directly overhead. `clamp` keeps the lower hemisphere at the horizon colour rather than extrapolating below it.

`smoothstep(0.0, 0.65, height)` makes the blend reach the zenith colour before you look completely upwards. Change `0.65` to `1.0` for a more gradual transition. `mix` then chooses a colour between `uHorizon` and `uZenith`; no image texture is involved.

The sun uses another normalised direction. `length(direction - sunDirection)` is small when both directions nearly match. Two soft-edged masks make a broad glow and a small disc; `1.0 - smoothstep(...)` turns a rising ramp into a falling one. The slider changes `uStrength`, multiplying the added brightness, not the sphere's size.

This painted sun doesn't illuminate anything. A game still needs the separate lighting from Lesson 2 if its islands should catch sunlight.

## Turn UVs into a portal

A flat plane can look like a spinning portal if each fragment knows where it sits relative to the centre. **Polar coordinates** describe that location using a radius and an angle instead of horizontal and vertical distances.

::snippet lessons/12-shaders/demo.html#swirl-shader "demo.html — centre the UVs, find an angle, paint a spiral"

`(vUv - 0.5) * 2.0` moves the UV centre to `(0, 0)` and the edges to `−1` and `1`. `length(p)` gives the radius: `0` at the centre and `1` halfway along each outer edge. The square's corners have a larger radius, so the alpha calculation hides them and leaves a disc.

`atan(p.y, p.x)` gives the angle around that centre. The tiny `0.00001` offset avoids asking for an angle at the exact zero vector. GLSL's two-argument `atan` plays the role of JavaScript's `Math.atan2`.

The key expression is `angle * 3.0 + radius * uFrequency - uTime`. The angle creates three arms; the radius twists them as you move outwards. `sin(...) * 0.5 + 0.5` remaps the wave from `−1…1` into `0…1`, giving a brightness mask instead of negative colour values.

Increasing `uFrequency` packs more turns into the same disc. Increasing `uStrength` makes the wave contribute more brightness. The material remains attached to the same unmoving plane: the numbers inside each fragment change.

`fract(radius * 5.0 - uTime * 0.15)` adds a repeating radial ramp. Every whole-number boundary resets it to zero, creating rings. Unlike the smooth sine wave, those resets are sharp; at high frequencies or far away they can shimmer. Keep the default modest for now; Lesson 13 considers the cost and readability of effects on phones.

Finally, `1.0 - smoothstep(0.92, 1.0, radius)` fades the outer edge to transparent. Keep the smoothstep edges in increasing order. To reverse a fade, subtract the result from `1.0`, rather than swapping the edges.

## Move vertices, not the mesh

The first two examples changed colour. **Vertex displacement** changes the shape by moving vertices before projection. You'll use a vertex's normal as the direction of travel: positive movement pushes outwards, negative movement pulls inwards.

::snippet lessons/12-shaders/demo.html#wobble-shader "demo.html — move each vertex along its normal"

`sin(position * uFrequency + vec3(uTime))` calculates three waves, one for each coordinate. Adding them and dividing by `3.0` makes an average still within `−1…1`. Different positions get different wave values, so the surface ripples rather than sliding as one solid object.

Multiplying by `uStrength` sets the displacement in local units. At the default `0.28`, each vertex stays within `0.28` units of its original location. `position + normal * vDisplacement` is the crucial line: direction times distance, added to the starting position.

The geometry is `IcosahedronGeometry(1.45, 4)`. Its extra subdivisions provide enough vertices to make curves. Lower the detail to `0` and you'll see why a shader can't create a smoothly rippling outline from a few large triangles: it only moves the vertices it receives.

::snippet lessons/12-shaders/demo.html#wobble-colour "demo.html — paint the displacement, from blue to cyan"

The fragment shader receives the interpolated displacement. Dividing by strength recovers the original wave scale; multiplying by `0.5` and adding `0.5` maps it into a blend amount. `max(uStrength, 0.001)` prevents division by zero when you turn strength off.

The colour isn't lighting. It marks inward and outward movement, so you can read the deformation without calculating new normals for a lit material.

> [!NOTE] Your physics hasn't moved
> Vertex displacement happens on the GPU. It doesn't rewrite `geometry.attributes.position`, move the mesh's JavaScript position or update the colliders from Lesson 6. Use this for visual ripples, not a platform whose collision surface must wobble. The demo also enlarges its geometry's bounding sphere by `0.65`, the maximum slider strength, so CPU visibility tests allow for the displaced outline.

## Time, colour and debugging

Shaders don't have a built-in game clock. JavaScript supplies a time uniform, just as it supplies strength and colours. Only one example is visible, and each remembers its own time while you switch between them.

::snippet lessons/12-shaders/demo.html#uniforms "demo.html — advance the active shader's time before drawing"

This is the delta-time rule from Lesson 3 again: `dt * active.speed` advances time consistently across refresh rates. Unlike adding `0.01` per frame, it doesn't make a fast screen animate twice as quickly. Pausing simply skips the uniform update; you can still orbit the camera.

The readout labelled **GPU time** shows this shader's accumulated animation input, not how many milliseconds the GPU took to render. At portal speed `4`, a second advances `uTime` by `4`. Its subtraction inside `sin(...)` shifts the pattern through its cycle.

::snippet lessons/12-shaders/demo.html#uniform-input "demo.html — change uniform values without rebuilding the shader"

Three.js expects entries such as `uStrength: { value: 0.28 }`. Change the nested `.value`, not the wrapper. Colour inputs call `.set(input.value)` on an existing `THREE.Color`. Changing a uniform doesn't require `material.needsUpdate`; changing shader source does, because the GPU program must be compiled again.

### Why do my colours look different?

A **colour space** describes how colour numbers are interpreted. Three.js normally works with Linear-sRGB for calculations, then converts to sRGB for display. With colour management enabled by default, `new THREE.Color('#ff5b2e')` converts that display hex colour into working-space values. A hard-coded GLSL `vec3(...)` has no automatic hex conversion.

The final two includes in each fragment shader matter. `tonemapping_fragment` applies the renderer's **tone mapping**, which compresses bright values into a displayable range. Our shared stage uses ACES filmic tone mapping. `colorspace_fragment` converts the resulting working-space colour to the renderer's output colour space.

Keep them after assigning `gl_FragColor`, in that order. Without output conversion, linear colours sent straight to an sRGB display can look too dark. Tone mapping and the sun's added brightness also mean a colour picker value won't always look identical on the rendered surface. Don't "fix" this by converting your colour uniform twice.

### Make invisible numbers visible

You can't use `console.log` inside GLSL. Instead, replace the colour output temporarily with a value you want to inspect. The demo's **Debug values as colours** checkbox already does this: sky height becomes grey, portal UVs become red/green, and wobble displacement becomes grey.

For UV debugging, `vec3(vUv, 0.0)` increases red from left to right and green from bottom to top. For signed directions, `direction * 0.5 + 0.5` would remap `−1…1` into visible RGB. Keep the output chunks while debugging; they change displayed brightness, but the spatial pattern still tells you whether your data is sensible.

> [!WARNING] A blank mesh isn't always bad maths
> Check the browser console for shader compilation errors first: a missing semicolon or mismatched varying name can stop the whole program. Then output one solid colour to prove the fragment shader runs, and restore radius, UVs or displacement one at a time. Also check the camera, material side and alpha before blaming the formula.

## How Skyhop does it

Skyhop uses the same ideas in places where a texture would be less flexible. Its sky shader blends three colours rather than two: a top, a horizon and a lower hemisphere.

::snippet game/src/sky.js#sky-fragment "game/src/sky.js — a three-colour sky with a bright sun"

`vDir` comes from normalised local sphere positions, then gets normalised again after interpolation. `dot(d, normalize(uSunDir))` measures how closely two unit directions align: it reaches `1` when they match. Raising that value to `900.0` leaves a tiny bright sun; the lower powers create wider glow. `Sky.update` centres the dome on the camera, avoiding a reachable sky wall as the player travels.

The game's exit portal adds gameplay state to a UV pattern:

::snippet game/src/pickups.js#portal-fragment "game/src/pickups.js — the portal changes when it becomes active"

`uTime` animates the swirl and rings. `uActive` blends a dim idle colour into the bright warm portal, and also increases opacity. `Portal.update` eases that uniform towards `1` after activation, instead of replacing the shader. Its reversed-edge `smoothstep` is an existing implementation detail; in your own shader, use the increasing-edge form from the demo for a defined fade.

Finally, the particles from Lesson 11 pass individual size, alpha and colour attributes into their shaders:

::snippet game/src/particles.js#vertex "game/src/particles.js — each point carries its own size and colour"

The custom attributes `aSize`, `aAlpha` and `aColor` vary per point. `gl_PointSize` controls its screen size; dividing by `-mv.z` makes distant particles smaller. The vertex shader hands colour and alpha to the fragment stage as varyings.

::snippet game/src/particles.js#fragment "game/src/particles.js — cut a square point into a glowing circle"

`gl_PointCoord` is a built-in coordinate across a point's square footprint, not a mesh UV. Measuring its distance from the centre lets `discard` reject the corners. The remaining alpha creates a soft edge, and `uGlow` scales brightness. This fragment also uses reversed smoothstep edges; the portable equivalent is `1.0 - smoothstep(0.15, 0.5, d)`.

So the pattern repeats: JavaScript chooses geometry and supplies data, the vertex shader places it, and the fragment shader paints it. You can change the visual language without changing the game's collision or collection rules.

## Your turn

> [!TRY] Challenges
> 1. Give the sky a dusk palette. Change `skyUniforms.uHorizon` and `skyUniforms.uZenith`, then change `smoothstep`'s `0.65` endpoint to `1.0` and compare the transition.
> 2. Give the portal five arms instead of three. In `swirlFragment`, change `angle * 3.0` to `angle * 5.0`. Pause time and compare both at frequency `9`.
> 3. Make wobble travel in the opposite direction. Change `+ vec3(uTime)` to `- vec3(uTime)` in `wobbleVertex`, leaving `position + normal * vDisplacement` alone.
> 4. Add a third wobble colour at neutral displacement. In `wobbleFragment`, use two `mix` calls split at `amount = 0.5`; add a `uMiddle` colour to `wobbleUniforms` and declare it in GLSL.

## Recap

- Vertex shaders place geometry; fragment shaders paint the covered surface, with many invocations running in parallel.
- Attributes belong to vertices, uniforms to the whole draw, and varyings carry interpolated data between stages.
- UVs, angles, distances and simple waves can create patterns without image textures.
- Animate by updating `uTime` with delta time; uniform changes don't need a new shader program.
- Vertex displacement is visual, not automatic physics. Debug data as colours and keep the tone-mapping and output-colour chunks.

Next, in Lesson 13, you'll measure what all this drawing costs and make Skyhop comfortable to play on a phone.
