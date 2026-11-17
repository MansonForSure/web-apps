---
title: Your first 3D scene
tier: 1
minutes: 15
summary: Every Three.js game starts with the same three objects — a scene, a camera and a renderer. Build them, add a cube, and make it move with a proper game loop.
learn: What the scene, camera and renderer each do; How a mesh is made of geometry and material; Which way X, Y and Z point; How a game loop and delta time work; How to keep the canvas sharp when the window resizes
---

Welcome! By the end of this course you'll have built **Skyhop**, a complete 3D platformer that runs in any browser. Today's goal is much smaller: draw one cube in 3D and make it spin. Every 3D game you'll ever write grows out of these thirty-odd lines.

Here's what you'll make. Press **Run the demo**, then drag nothing — just watch, and try the checkboxes.

::demo "A spinning cube, a grid and the X/Y/Z axes"

## Set up a project

A Three.js game is just a web page. Make a new folder with one file in it, `index.html`:

```html title="index.html"
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>My first 3D scene</title>
  <style>
    html, body { margin: 0; height: 100%; overflow: hidden; }
    canvas { display: block; }
  </style>
  <!-- Tell the browser where "three" lives. -->
  <script type="importmap">
    {
      "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/"
      }
    }
  </script>
</head>
<body>
  <script type="module">
    import * as THREE from 'three';
    // ...all the code from this lesson goes here
  </script>
</body>
</html>
```

The **import map** is the secret to "no build tools": it maps the short name `three` to a real file, so `import * as THREE from 'three'` just works. This course keeps its own copy of Three.js inside the project (in `assets/vendor/`) so that it works offline and never changes underneath you. The CDN link above is the quickest way to start.

> [!WARNING] Use a local server
> Double-clicking `index.html` opens it as `file://…`, and browsers refuse to load JavaScript modules that way. In your project folder, run `npx serve .` or `python3 -m http.server 8000`, then open the address it prints.

## Scene, camera, renderer

Three objects do all the work. Think of a film set:

| Object | Film-set version | What it does |
| --- | --- | --- |
| `Scene` | The stage | A container for everything that exists: meshes, lights, cameras. |
| `PerspectiveCamera` | The camera operator | Decides *where* we look from and how wide the lens is. |
| `WebGLRenderer` | The projector | Draws the scene, as the camera sees it, into a `<canvas>`. |

::snippet lessons/01-first-scene/demo.html#scene "demo.html — scene, camera, renderer"

The camera's four numbers are worth learning once:

- **50** is the *field of view* in degrees, top to bottom. Small numbers zoom in; 50–60 feels natural for games.
- **aspect** is width ÷ height of the canvas. If it's wrong, everything looks squashed.
- **0.1** and **100** are the *near* and *far* clipping planes. Anything closer than 0.1 or further than 100 units isn't drawn.

`setPixelRatio` makes the picture sharp on high-density screens such as phones and Retina laptops. We cap it at 2, because a 3× phone would otherwise draw 9× as many pixels as a 1× screen. That's the first of many performance habits you'll pick up.

## Your first mesh

Anything you can *see* in Three.js is usually a **mesh**: a **geometry** (the shape, a list of triangles) wearing a **material** (how the surface reacts to light).

::snippet lessons/01-first-scene/demo.html#mesh "demo.html — a mesh is geometry + material"

`BoxGeometry(1, 1, 1)` is a cube one unit on each side. In this course **one unit is roughly one metre**: our robot will be 1.6 units tall. Pick a scale like this early and stick to it. It makes physics numbers such as gravity feel right.

`MeshNormalMaterial` colours each face by the direction it points. It's a debugging material that needs no lights, which is perfect for now. In the next lesson we'll replace it with real, lit materials.

> [!NOTE] Why `cube.position.y = 0.5`?
> A mesh's position is its *centre*. The cube is 1 unit tall, so lifting it by half its height sits it exactly on the floor instead of halfway through it.

## Which way is up?

Three.js uses a **right-handed** coordinate system with **Y pointing up**:

| Axis | Direction | Helper colour |
| --- | --- | --- |
| **X** | right (+) / left (−) | red |
| **Y** | up (+) / down (−) | green |
| **Z** | towards you (+) / into the screen (−) | blue |

That last one surprises everyone: moving "forward", away from the camera, means **decreasing** Z. In Skyhop, every level runs towards −Z for exactly this reason.

::snippet lessons/01-first-scene/demo.html#helpers "demo.html — helpers you'll use all the time"

`AxesHelper` and `GridHelper` are training wheels. Keep them around while you build anything new. They answer "where is this thing, really?" instantly.

## The game loop

A game is a loop: **update the world a tiny bit, draw it, repeat**, about 60 times per second, or 120 on fast screens.

::snippet lessons/01-first-scene/demo.html#loop "demo.html — the game loop"

`renderer.setAnimationLoop` calls our function once per screen refresh. Inside it, the most important line in this lesson is:

```js
const dt = timer.getDelta(); // seconds since the last frame
```

`dt` (**delta time**) is how long the last frame took, for example `0.0167` seconds at 60 fps. We always write motion as *speed × dt*:

```js
cube.rotation.y += 0.9 * dt; // 0.9 radians per SECOND, on any screen
```

If you wrote `cube.rotation.y += 0.015` instead, the cube would spin twice as fast on a 120 Hz monitor as on a 60 Hz one. Multiplying by `dt` makes your game run at the same speed everywhere. You'll see `* dt` in nearly every lesson from here on.

> [!INFO] Radians, quickly
> Three.js measures angles in **radians**: a full turn is `2 * Math.PI` (≈ 6.28). So `0.9` radians per second is about one full spin every 7 seconds. If you think in degrees, `THREE.MathUtils.degToRad(90)` converts for you.

`THREE.Timer` is the modern replacement for the old `THREE.Clock`. Calling `timer.connect(document)` lets it notice when you switch tabs, so you don't get one gigantic `dt` when you come back.

## Handle resizing

When the window changes size, the canvas and the camera's aspect ratio must follow, or the picture stretches.

::snippet lessons/01-first-scene/demo.html#resize "demo.html — keep the aspect ratio right"

`updateProjectionMatrix()` is the line people forget. The camera caches its lens maths, so after changing `fov`, `aspect`, `near` or `far` you must tell it to recalculate.

## Your turn

> [!TRY] Challenges
> 1. Change the camera's field of view to `20`, then `100`. What happens to the perspective?
> 2. Replace `BoxGeometry` with `new THREE.TorusKnotGeometry(0.5, 0.18, 120, 16)`. Shapes are swappable.
> 3. Make the cube bob up and down: inside the loop, set `cube.position.y = 0.5 + Math.sin(timer.getElapsed() * 2) * 0.3`.
> 4. Add a second cube at `x = 2`. Hint: you can reuse the same geometry and material for both meshes.

## Recap

- A **scene** holds things, a **camera** looks at them, a **renderer** draws them.
- A **mesh** = geometry (shape) + material (surface). Position is its centre.
- **Y is up**, and forward is **−Z**.
- The **game loop** runs every frame. Multiply every speed by **`dt`** so the game runs the same on every screen.

Next up, we'll swap the debugging material for real ones and add sunlight, shadows and a floating island. That's where it starts to look like a game.
