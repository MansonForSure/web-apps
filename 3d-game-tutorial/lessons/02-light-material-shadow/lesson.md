---
title: Light, materials and shadows
tier: 1
minutes: 30
summary: Turn the debugging cube into a small low-poly floating island. Give its surfaces colour, add sky light and sunshine, and tune shadows so objects feel grounded.
learn: How lit materials differ from the debugging material; How roughness and flat shading create a low-poly look; How sky light and a directional sun work together; How to enable and tune shadow maps; How colour management and fog finish the scene
---

In lesson 1, your cube's rainbow colours showed which way its faces pointed. Useful for checking a shape, but not much like grass, stone or a robot. This time you'll give surfaces their own colours and let light explain their shape.

You'll build a floating island with a tree, two rocks, an orange player-sized box and a cyan crystal. Press **Run the demo**, then drag to orbit around it. Scroll to zoom on a computer, or pinch on a phone; the panel works with clicks or taps.

::demo "A low-poly island with switchable materials, moving sunlight, shadows and fog"

Try **Basic**, **Lambert** and **Standard**, then move the **Sun** slider and switch off the sky light. Watch the same surfaces change without changing their geometry.

## Choose a lit material

`MeshNormalMaterial` from lesson 1 uses the surface direction as a colour. That direction is a **normal**: an arrow pointing straight out of the surface. It's useful for spotting awkward geometry, but moving a light won't make this material look like orange paint.

A **lit material** calculates how light reaches a surface. A face pointing towards the sun gets more direct light than one pointing away. You choose the surface colour; the lighting decides how bright it looks from each direction.

Three.js offers several ways to do that. These short names correspond to classes such as `MeshBasicMaterial`:

| Material | Lighting | Starting use |
| --- | --- | --- |
| Basic | None | Unshaded markers. |
| Lambert | Matte, no shiny highlights | Simple scenery. |
| Standard | Roughness and metalness | Most game surfaces. |
| Toon | Bands of brightness | Cartoon shading. |

**Diffuse** light is the broad, matte part of a surface's response, rather than a shiny highlight. Standard adds a more realistic model of both. It's **physically based**, meaning its controls describe surface properties rather than an arbitrary highlight size; you can still use it for a deliberately cartoonish island.

The demo's material factory chooses between the first three rows. `MeshToonMaterial` isn't a fourth button here, but it's an alternative you can try by replacing the constructor.

::snippet lessons/02-light-material-shadow/demo.html#material-factory "demo.html — choose a material for each surface"

`color` is the base colour, such as the grass's `'#8fcf6f'`. It isn't a promise that every pixel will have that exact colour: sunlight, fill light, fog and the display settings all affect the result.

`roughness: 0.8` makes the surfaces fairly matte. Roughness runs from `0` for smooth, sharp reflections to `1` for very rough, broad ones. Try `0.2` on the Standard material and look for a tighter highlight as you orbit; changing roughness doesn't change the shape.

`metalness: 0.0` means a non-metal surface, appropriate for grass, bark and rock. Use `1` for a bare metal, not as a general-purpose shininess slider. Metals rely heavily on reflected surroundings, so a metal can look unexpectedly dark when you haven't supplied an environment for it to reflect.

`flatShading: true` uses a single normal across each triangle instead of smoothing between neighbouring faces. This makes the tree's facets visible. The `...common` spread passes the same colour and flat-shading setting into Lambert and Standard.

The crystal also has an **emissive** colour: a contribution that stays visible without incoming light. Standard scales it with `emissiveIntensity: 0.6` here. It makes the crystal look luminous, but doesn't illuminate the grass or create a glow halo; those would need separate lighting or effects.

> [!NOTE] A sky-coloured background is not a light
> `scene.background` only fills empty pixels. If you replace the normal material with Standard but add no lights or emissive contribution, the surface can appear black. Start by checking the lights, not by making every colour white.

## Shape the island

A low-poly scene doesn't need a modelling application yet. **Low-poly** means using relatively few polygons, the flat pieces that make up the shapes. A short cylinder gives you a grassy platform, and a cone underneath makes it read as a floating chunk of rock.

First, give every part the same setup. This helper adds a mesh to the scene, remembers its colour and enables the two mesh shadow flags we'll use shortly.

::snippet lessons/02-light-material-shadow/demo.html#part-helper "demo.html — one helper for all the island's parts"

`parts` stores the meshes so the material buttons can find them later. `mesh.userData` is a place for your own data; Three.js doesn't turn its `color` entry into a material automatically. This demo does that after building all the shapes.

The helper returns the mesh, which lets you rotate an individual part without changing the helper. Now build the island:

::snippet lessons/02-light-material-shadow/demo.html#island-shape "demo.html — a grassy cylinder and an inverted rock cone"

The first four `CylinderGeometry` arguments are top radius, bottom radius, height and segments around the rim. Here the radii are `4` and `3.8`, the height is `0.6`, and `9` segments make an angular outline. The top is slightly wider than the bottom, so the edge slopes inward.

The cylinder's centre is at `y: -0.3`. Its upper surface is therefore at `y = 0`, ready for scenery to sit on it. This is the same centre-versus-surface distinction you used for the cube in lesson 1.

The rock cone has radius `3.8` and height `4.5`. Rotating it by `Math.PI` around X points its tip down. Its centre at `y: -2.85` puts its wide upper rim at `y = -0.6`, exactly underneath the grass layer.

> [!TIP] Geometry and shading are separate choices
> Change the island's segment count from `9` to `24` to soften its outline. Then try `flatShading: false` in `common`. More segments change the silhouette; smooth shading changes how light crosses the existing faces.

Small props give you useful lighting test shapes. A cylinder and two cones make the tree, while the box has large faces that make changes in brightness easy to see.

::snippet lessons/02-light-material-shadow/demo.html#decorations "demo.html — simple props to reveal light and shadow"

The box is `1.6` units tall and centred at `y: 0.8`, so its feet sit at `0`. The crystal is an **octahedron**, a shape with eight triangular faces. Its position above the grass makes its moving shadow particularly easy to spot.

Finally, the buttons apply the chosen material to every stored mesh:

::snippet lessons/02-light-material-shadow/demo.html#material-swap "demo.html — swap materials without rebuilding geometry"

`makeMaterial()` reads the remembered colour, so a material change doesn't turn the whole island into one colour. `dispose()` releases the old material's graphics resources. Notice that the geometry and position stay untouched: this is a comparison of surfaces, not three different islands.

## Light from sky and sun

Outdoor objects aren't lit only by the sun. They also receive light scattered through the sky and bounced from nearby ground. Calculating every bounce would be too much work for this small demo, so we'll approximate it with one fill light.

`HemisphereLight` blends two colours according to the direction a surface faces. Upward-facing surfaces favour the sky colour; downward-facing surfaces favour the ground colour; sideways surfaces get a mixture.

::snippet lessons/02-light-material-shadow/demo.html#hemisphere "demo.html — sky light and approximate ground bounce"

The pale blue `'#e8f6ff'` suggests sky light, and the brown `'#7a6a55'` suggests reflected earth. The final argument, `1.3`, is intensity. This light doesn't examine the island to discover its actual ground colour, and it doesn't cast shadows.

`AmbientLight` is a simpler alternative: one colour illuminates surfaces regardless of which way they face. It can stop a scene becoming completely dark, but too much makes everything look equally bright. Hemisphere light gives our island's top and underside different treatment without needing another shadow map.

Switch off **Sky (hemisphere) light** while using Standard. The sun-facing surfaces remain bright, but the surfaces turned away lose their fill. Switch it back on and look underneath the island: that soft brown contribution is why the rock isn't just a black triangle.

For the sun itself, use `DirectionalLight`. A **directional light** sends parallel rays through the scene, like sunlight arriving from a very distant source. Its direction runs from its position towards its target, not from its rotation.

::snippet lessons/02-light-material-shadow/demo.html#sunlight "demo.html — a directional sun that can cast shadows"

The default target is at `(0, 0, 0)`, so moving this sun changes the direction towards the island. Unlike a nearby point light, a directional light doesn't become dimmer just because you move it farther away. Its position still matters for the direction and for the shadow camera.

The slider calls this function:

::snippet lessons/02-light-material-shadow/demo.html#sun "demo.html — move and recolour the sun"

`Math.cos(a)` moves the sun sideways while `Math.sin(a)` moves it up, tracing a semicircle in X/Y with Z fixed at `6`. The `12` sets that arc's radius. At `90` degrees it reaches its highest point; near `5` or `175` degrees it's low and lights from opposite sides.

`height` also controls colour and intensity. `setHSL()` sets **hue, saturation and lightness**: here the hue stays warm, while a higher sun becomes paler. The assignment to `sun.intensity` replaces the constructor's initial `2.6`, so the slider changes direction, warmth and brightness together.

## Switch shadows on

Shading tells you which side of a box faces the light. A **cast shadow** tells you that the box blocks light from reaching another surface. For a platform game, that dark patch helps you judge whether something is standing on the island or floating above it.

Shadows are opt-in at several levels. Start at the renderer:

::snippet lessons/02-light-material-shadow/demo.html#renderer "demo.html — enable shadow rendering"

`renderer.shadowMap.enabled = true` permits the renderer to draw shadow maps. A **shadow map** is an extra image made from the light's point of view, storing how far away the nearest blocking surfaces are. When drawing the main view, the renderer compares a surface's distance against that image to decide whether direct light reaches it.

Then complete the chain:

1. **Renderer:** `renderer.shadowMap.enabled = true` enables the shadow system.
2. **Light:** `sun.castShadow = true` asks this directional light for a shadow map.
3. **Blocker:** `mesh.castShadow = true` includes the mesh among the things that block the light.
4. **Receiver:** `mesh.receiveShadow = true` lets its lit surface show the resulting shadow.

You've already seen the light flag in the sunlight snippet and both mesh flags in `part()`. Every island part has both flags here. A floor often only needs to receive; a small decoration might only need to cast. These are independent decisions, not one global checkbox.

The panel's **Sun casts shadows** checkbox changes only `sun.castShadow`. Turning it off leaves sunlight and ordinary face shading in place. Basic still ignores that lighting and doesn't display these received shadows, even though its meshes retain their shadow flags.

> [!INFO] Shadows cost another view of the scene
> Each shadow-casting light needs extra rendering work. Our hemisphere fill needs none, and our single sun needs one map. Keep that arrangement while you're learning rather than adding a shadow-casting light for every prop.

## Fit the shadow camera

The main camera decides what you see. The sun has a second camera that decides what its shadow map covers. For a directional light, this is an **orthographic camera**: its view has parallel sides, without the main camera's perspective shrinking distant objects.

Its coverage is a box, sometimes called a **frustum**, bounded by left, right, top, bottom, near and far. Those limits are measured in the light camera's own space, not as world X/Y boundaries.

::snippet lessons/02-light-material-shadow/demo.html#shadow-settings "demo.html — shadow coverage, resolution and depth offset"

`left: -8` and `right: 8` cover a width of `16` units; `top: 8` and `bottom: -8` cover a height of `16`. That's enough for the little island at its starting sun angle. If a casting object falls outside this box, its shadow can disappear even when the object remains clearly visible to your main camera.

`near` and `far` bound the depth along the light camera's viewing direction. This demo leaves their defaults alone. When you tune them, include both the blockers and the surfaces their shadows fall on; clipping either can break the result.

To see the box while editing, add this after `scene.add(sun)`:

```js
const shadowHelper = new THREE.CameraHelper(sun.shadow.camera);
scene.add(shadowHelper);
```

If you move the sun with the slider, call `shadowHelper.update()` in the animation loop after rendering, once the light's shadow camera has been updated. The wireframe helps separate a coverage problem from a missing shadow flag.

### Spend resolution where it matters

`mapSize.set(2048, 2048)` gives this map a grid of `2048` samples along each side. A bigger grid gives finer detail but uses more memory and rendering work. Try `1024` or `512` by editing the setup and reloading the demo.

The box size matters just as much. Spreading the same map over a much wider area gives each sample more ground to cover, making shadow edges visibly coarser. Tighten the box around the action before increasing the map resolution, but leave room for tall props and long shadows at low sun angles.

For a directional light in this renderer, the shadow projection is refreshed during rendering. A `CameraHelper` still needs its own `update()` when the camera changes. Keep the renderer's default **PCF** shadow filtering, which blends nearby shadow tests to soften the edge; you don't need an extra shadow-type assignment.

### Fix shadow acne gently

Sometimes surfaces develop dark stripes or speckles even where they should be lit. This is **shadow acne**: limited numerical precision makes a surface incorrectly count as blocking light from itself. It's especially noticeable on sloping faces.

The demo uses `sun.shadow.bias = -0.0004`, a small offset in the shadow-depth comparison. Try setting it to `0` and orbiting around the rock, then restore it. Whether you see acne depends on the angle and device; the important thing is to know what the control addresses.

`sun.shadow.normalBias` is another tool. It offsets the position used for the shadow test along the surface normal, which can help on slopes. This demo leaves it at `0`; if needed, try a small value such as `0.02` rather than changing geometry to hide the stripes.

> [!WARNING] Bigger bias is not automatically better
> Too much bias or normal bias makes shadows detach from their objects, as if the objects are hovering. Check coverage first, then change one offset at a time. Inspect the box's contact with the grass as well as the rock's sloping faces.

## Colour and depth

Lighting calculations and screen colours aren't the same thing. A **colour space** defines how numerical colour values represent colours. Three.js performs lighting in a linear working space, where adding light behaves sensibly, then converts the result for display.

The familiar colour strings in this demo are interpreted as **sRGB**, the usual colour space for web images and screens. With the default colour management enabled, Three.js handles their conversion into its working space. Don't manually apply another gamma correction to them.

::snippet lessons/02-light-material-shadow/demo.html#colour-output "demo.html — screen colour space and tone mapping"

`renderer.outputColorSpace = THREE.SRGBColorSpace` explicitly keeps r187's default output setting. It controls the display conversion, not the strength of the sun. If a scene looks wrong, check this setup before compensating with strange material colours.

**Tone mapping** compresses bright lighting values into the range a screen can show. `ACESFilmicToneMapping` gives our lit surfaces a film-like highlight roll-off instead of abruptly flattening every bright value to white. It changes the final appearance; it isn't another light and doesn't create shadows.

`renderer.toneMappingExposure` stays at its default of `1`. You can try `0.8` or `1.2` to darken or brighten the tone-mapped image. Unlike lowering the sun intensity, exposure affects the rendered surfaces as a whole, including their emissive contribution.

### Fog separates near and far

A world feels deeper when distant surfaces lose contrast. **Fog** blends their colours towards a chosen colour as they recede. Matching that colour to the background makes distant scenery fade into the sky rather than towards a contrasting wall.

::snippet lessons/02-light-material-shadow/demo.html#atmosphere "demo.html — match the fog and background colours"

`Fog(skyColor, 12, 38)` begins the fade at a view-space depth of `12` and completes it at `38`. Think of those as depth along the camera's viewing direction, not height above the island. They aren't the main camera's clipping planes: fog blends visible surfaces rather than deciding whether the geometry is drawn.

Zoom out and toggle **Fog** to compare. With only one island, the effect is subtle at the starting view; it's easier to see when you pull back. If you edit the fog distances, change both the initial assignment and the checkbox handler, which recreates the fog when you turn it back on.

### The setup you'll reuse

From lesson 3 onward, `lessons/kit/stage.js#createStage` packs this setup into one function so you can concentrate on gameplay. Here is the first half of that existing function:

::snippet lessons/kit/stage.js@6-25 "stage.js — createStage options, renderer, scene and camera"

Then it adds the lights, handles resizing and returns the objects you'll need:

::snippet lessons/kit/stage.js@26-46 "stage.js — createStage lights, resizing and return value"

You'll recognise ACES, fog, hemisphere fill and a shadow-casting sun. The shared stage uses a `1024` shadow map and a wider box of `-18` to `18` for later demos; it isn't an exact copy of this island's tuning. Calling `createStage()` gives you these defaults, while options such as `shadows: false` or `fog: null` let you turn parts off.

## Your turn

> [!TRY] Challenges
> 1. Give the island a warmer evening look. Change the two colours in `HemisphereLight`, then compare the Sun slider at `15` and `90`.
> 2. Make a smoother island without changing its size. Increase the grass and rock segment counts, then compare `flatShading: true` and `false` in `common`.
> 3. Compare shadow detail at `512` and `2048`. Edit `sun.shadow.mapSize`, reload, and inspect the tree's shadow. Then shrink the camera bounds carefully; where does coverage start to fail?
> 4. Add a second tree with `part()`, keeping its trunk on `y = 0`. Put it near the island's edge and use `CameraHelper` to check its shadow at both ends of the Sun slider.

## Recap

- A lit material uses surface normals and lights to reveal shape; the normal material only visualises direction.
- Standard's `color`, `roughness` and `metalness` describe a surface. `flatShading` makes its facets visible.
- Hemisphere light approximates sky and ground fill; a directional light supplies the sun and its cast shadows.
- Shadows need renderer, light, caster and receiver flags. Tune the shadow camera's coverage before raising map resolution, and use small bias corrections.
- sRGB output, ACES tone mapping and fog help the scene read clearly without changing its geometry.

In lesson 3, you'll keep this lighting setup and turn keyboard and touch input into movement for your first controllable character.
