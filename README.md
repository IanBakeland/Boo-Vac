# Boo-Vac

A tiny first-person ghost-cleaning game built with Three.js `WebGPURenderer` and WGSL.

**Live:** https://ianbakeland.github.io/Boo-Vac/
**Original Shadertoy shaders** (both ported to WGSL):
- [Ether by nimitz](https://www.shadertoy.com/view/MsjSW3) (CC BY-NC-SA 3.0): the ghost aura
- [VCR distortion by ryk](https://www.shadertoy.com/view/ldjGzV) (CC BY-NC-SA 4.0): the VHS filter during a tug-of-war

**Physics engine:** [Rapier](https://rapier.rs) (`@dimforge/rapier3d-compat`, WebAssembly)

**Additional WebGPU libraries:** [TypeGPU](https://docs.swmansion.com/TypeGPU/) by Software Mansion (dust glitter, see below) and [kokoro-js](https://github.com/hexgrad/kokoro) (Transformers.js): the boss's voice, an AI text-to-speech model running on WebGPU (the voicemail, and your final invoice read out loud with your own numbers)

**Level:** own Blender model, baked into one texture (`blender/house.blend`, see below)

## Assignment checklist

| Asked | Where |
|---|---|
| Shadertoy fragment shader ported to WebGPU (WGSL) in Three.js `WebGPURenderer` | Ether → the ghost aura (`js/shaders/ether/`), plus VCR distortion → the VHS filter (`js/shaders/vhs/`) |
| Shader responds to user interaction | The aura only shows in your flashlight beam, smears toward the nozzle while you suck, and stretches with the tug-of-war; the VHS filter gets worse the harder you pull |
| Interaction beyond looking around | Walk, jump, suck, blow, MAX, unclog the vacuum, tug-of-war against the ghost with the mouse |
| Physics | Rapier: player controller, props sucked in a spiral, captured, blown back out, furniture moved by MAX, books thrown by a ghost |
| Multiple shaders | 2 Shadertoy ports + suction cone, flashlight beam, room flashlight lighting, compute dust |
| Additional WebGPU library | TypeGPU: the dust's glitter. Kokoro (kokoro-js / Transformers.js): the boss's voice, in the voicemail and reading your invoice live |
| Own Blender model + baking | The house (the whole level), baked in Cycles into `public/textures/baked.jpg` |
| Controlling Blender animations | Three animated ghost models, their clips driven per game state with an `AnimationMixer` |

## How to play

| Input | Action |
|---|---|
| Click "Start" | Start the shift (locks the mouse, turns on sound) |
| Mouse | Look / aim. During the tug-of-war: move the mouse against the ghost's pull |
| W A S D | Walk |
| Space | Jump |
| Left mouse (hold) | Suck |
| Right mouse (hold) | Blow (also unclogs the vacuum: suck up 5 things and it jams) |
| F | MAX: 3 s of extra strong suction/blowing that also moves furniture (recharges) |
| Esc | Pause |
| M | Mute |

Best on desktop Chrome / Edge / Safari 26.

## The game

You are the night-shift cleaner of Dust & Ghost Cleaning Co. Three ghosts hide in the clutter of a dark old house. Search with your flashlight (ghosts are only visible in its beam), vacuum the clutter around a trembling hiding spot until the ghost pops out, then win a tug-of-war by moving the mouse against the ghost's pull. Catch all three (in any order) and you get the invoice.

| Ghost | Model | Hides in | Personality |
|---|---|---|---|
| Dusty | Ghost | the vase on the living room table | slow and weak, giggles when it gets away |
| The Librarian | Hywirl | the bookcase in the library | throws books at you during the tug |
| Granny Clock | Alien | the grandfather clock at the end of the gallery | the boss: fast, and you have to win twice |

## How it works

### Shadertoy ports

Both are WGSL files (`js/shaders/<name>/fragment.wgsl`), imported with `?raw` and wrapped with `wgslFn`, like in the course. The Shadertoy URL is in the header of each file.

- **Ether → ghost aura** (`js/shaders/ether/`): the original 6-step raymarch, drawn on a billboard in front of the ghost model (`MeshBasicNodeMaterial`, additive). Added inputs make it interactive: `tint` (one color per ghost), `visibility` (computed in JS from the flashlight cone: outside the beam the ghost is invisible) and `stretch` (the smoke smears toward the nozzle while you suck, more as the tug meter fills, fully at capture).
- **VCR distortion → VHS filter** (`js/shaders/vhs/`, `js/postfx.js`): post-processing over the whole frame with `THREE.RenderPipeline`. The rendered scene is the shader's `iChannel0` (same texture node for texture + sampler, the course trick), the original noise texture is replaced by a hash. It fades in when a tug-of-war starts and the grain, stripes, wobble and roll get stronger as the meter fills. At amount 0 the scene passes through untouched. Only with real WebGPU.

### Own shaders

- **Suction cone** (`js/shaders/suction/`): swirling air in front of the nozzle, procedural noise scrolled and twisted along a cone; blue-white inward when sucking, orange outward when blowing. Everything is multiplied by the vacuum's `power`.
- **Flashlight beam** (`js/shaders/beam/`): a faint "volumetric" cone so the light is visible in the dusty air.
- **Room flashlight lighting** (`js/shaders/flashlight/`): the house and furniture are lit by our own spotlight math (`albedo × (moonlight ambient + lamp × cone × facing × distance falloff)`), so the room is dark blue and the flashlight reveals the colors.
- **Dust particles** (`js/shaders/dust/update.wgsl`, `js/objects/dust.js`): a compute shader (TSL storage buffers) moves the dust specks with the same suction formula as the physics (pull + tangent swirl + drag + per-speck speed limit). They glitter in the beam and spiral into the nozzle. The glitter itself is written with **TypeGPU**, an additional WebGPU library: a JavaScript function marked `'use gpu'` (turned into WGSL by `unplugin-typegpu`) that reads Three.js values with `fromTSL`, adds a 3D Perlin-noise twinkle from `@typegpu/noise`, and is plugged in as the dust material's color with `toTSL`.

### The level (own Blender model + baking)

`public/models/house.glb`, modelled in Blender (`blender/house.blend`; a render in `blender/preview-hall.png`). An old house of 12 × 10 m with seven rooms: the hall where you start, a pantry, a study, the living room, the library, a corridor between them and a long gallery at the back. Each room has its own wallpaper, wainscoting, floor, fake boarded-up windows and wall decoration; the hall has a portrait of the "Employee of the month", Ian Bakeland.

- **Baking:** the whole house is lit evenly in Blender and baked (Cycles, Combined) into one 4096 × 4096 texture, `public/textures/baked.jpg`, on one shared UV map.
- **In the game** (`js/objects/room.js`): loaded like the course's bake project (`TextureLoader`, `flipY = false`, `colorSpace = SRGBColorSpace`), and the bake is the albedo of the room flashlight shader: the house is dark blue moonlight until your flashlight hits it.
- **The house is empty on purpose:** all furniture and props are placed in code (`LAYOUT` in `js/config.js`), so they can be physics bodies and hiding spots.
- **Collisions:** the house meshes are one Rapier trimesh collider, so the walls, floors and ceilings are solid.

### Physics (Rapier)

`js/physics.js`, a [Rapier](https://rapier.rs) world (WebAssembly) stepped at a fixed 60 Hz.

- **Player:** a kinematic character controller with a capsule, colliding with a trimesh of the house, so walls and furniture are solid and you can jump.
- **Props** (books, cups, candles, pillows, ...): dynamic bodies. Each step the vacuum applies an impulse from one shared formula, `suctionForce()` (pull toward the nozzle + a swirl around its axis, inside a cone, fading with distance). The GPU dust uses the exact same formula in WGSL. Small props that reach the nozzle are removed from the world and counted in the tank; blowing pushes them away.
- **Clogging:** the 5th item in the hose jams the vacuum: sucking moves no air until you blow. Blowing shoots the stuck items back out of the nozzle one by one, each as a new Rapier body with a velocity along the nozzle direction. A HUD panel shows how many are still stuck.
- **MAX** (F): ×4 force for 3 s that also moves the heavy furniture (table, chair, vase).
- **The Librarian** throws books at you with a Rapier impulse.

### Game logic

- `js/script.js`: `init()` + `draw()` (with `renderer.setAnimationLoop`), input, and a plain state machine: start → playing ⇄ paused, playing → ending → invoice. Per ghost: hidden (trembling) → emerged → tug → escaped or captured.
- `js/objects/ghost.js`: one ghost: its model (one of three, `MODELS.ghosts` in `js/config.js`), its animation clips driven per state with an `AnimationMixer` (out, tug, escape, giggle, caught), the Ether aura and the tug-of-war.
- `js/objects/vacuum.js`: the vacuum model on the camera, the nozzle aimed at what's under the crosshair, `power` spun up and down with gsap.
- `js/intro.js` / `js/outro.js`: the voicemail intro on your phone (the boss: Kokoro voice from `js/voice.js`, the voicemail system: Web Speech API; with a transcript) and the ending (lights on, back out of the front door, the invoice, read out loud by the boss in `js/script.js`).
- `js/audio.js`: all sound and music generated live with the Web Audio API (no sound files).
- `js/config.js`: every tunable number and the level layout.

## What's inside

- 2 ported Shadertoy shaders: Ether (ghost aura) and VCR distortion (VHS post FX), both reacting to the player
- Own shaders: suction cone, flashlight beam, room flashlight lighting, compute dust particles
- Additional WebGPU library: [TypeGPU](https://docs.swmansion.com/TypeGPU/) (`@typegpu/three` + `@typegpu/noise`): the dust's glitter in the flashlight beam is a TypeGPU function with a Perlin-noise twinkle
- Physics: Rapier (player controller, props sucked in a spiral, captured, blown out, furniture moved by MAX, books thrown by a ghost)
- Own Blender model + baking: the level, a house with seven rooms and corridors (`public/models/house.glb`), modelled in Blender (`blender/house.blend`) and baked into one texture (`public/textures/baked.jpg`, Cycles, Combined). Loaded like the course's bake project (`flipY = false`, sRGB) and used as the albedo of the room flashlight shader, so it stays dark until your beam hits it. A portrait in the hall says who made it.
- Furniture and props from Poly Pizza, laid out in code
- Blender animation: three animated ghost models (Ghost, Hywirl, Alien), each with its own game-state → clip mapping (`MODELS.ghosts` in `js/config.js`), played with an `AnimationMixer`
- Intro: a voicemail from the boss on your phone, with a transcript
- Voice of the boss: Kokoro-82M text-to-speech running on WebGPU (kokoro-js / Transformers.js, `js/voice.js`). The model (fp32, 326 MB) downloads from Hugging Face while the opening film plays, once: after that it's in the browser cache. It speaks the voicemail, and at the end it reads your invoice out loud: that text has your own numbers (ghosts, items sucked up, escapes, total, star rating), so it really is generated live, in the browser, on the GPU. While the model is still loading, the play button shows "Loading the voicemail…" (at most 15 s). The voicemail system ("You have one new message") stays the browser's speech synthesis on purpose. Without WebGPU the boss falls back to speech synthesis in the voicemail, and the invoice stays silent
- Tip: on a first visit (or in incognito), give the voice a minute to download before you press play
- Sound and music: generated live with the Web Audio API (motor, air, plop, ghost moans, a creepy music box with a drone and a heartbeat in the tug), no sound files
- Mechanic inspired by Luigi's Mansion. No Nintendo assets are used.

## Run locally

```
npm install
npm run dev
```

## Credits

| Asset | Author | License | Link |
|---|---|---|---|
| Ether (shader) | nimitz | CC BY-NC-SA 3.0 | https://www.shadertoy.com/view/MsjSW3 |
| VCR distortion (shader) | ryk | CC BY-NC-SA 4.0 | https://www.shadertoy.com/view/ldjGzV |
| Kokoro-82M (voice model) | hexgrad | Apache-2.0 | https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX |
| kokoro-js (library) | hexgrad, Xenova | Apache-2.0 | https://github.com/hexgrad/kokoro |
| Grenze Gotisch (title font) | Omnibus-Type | SIL OFL 1.1 | https://fonts.google.com/specimen/Grenze+Gotisch |
| IM Fell English SC (heading font) | Igino Marini | SIL OFL 1.1 | https://fonts.google.com/specimen/IM+Fell+English+SC |
| Ghost (animated, Dusty) | Quaternius | CC0 | https://poly.pizza/m/Iip30bDHmu |
| Hywirl (animated, The Librarian) | Quaternius | CC0 | https://poly.pizza/m/zjr7CmWGER |
| Alien (animated, Granny Clock) | Quaternius | CC0 | https://poly.pizza/m/sUTLXji0aL |
| Vacuum Cleaner | Zoe XR | CC BY | https://poly.pizza/m/1_kdZRnuCo8 |
| House (the level, baked) | Ian Bakeland (Blender) | own work | `blender/house.blend` |
| Bookcase with Books | Quaternius | CC0 | https://poly.pizza/m/tACDGJ4CGW |
| Grandfathers Clock | CreativeTrio | CC0 | https://poly.pizza/m/09YKIkFZnA |
| Chair | Quaternius | CC0 | https://poly.pizza/m/zMmKNm8w4a |
| Small Table | Quaternius | CC0 | https://poly.pizza/m/rAEBvfb1FT |
| Rug | Quaternius | CC0 | https://poly.pizza/m/7H5qKjuxVY |
| Chandelier | CreativeTrio | CC0 | https://poly.pizza/m/RPLTkXHOOM |
| Tall Vase | Jarlan Perez | CC BY | https://poly.pizza/m/52xZtzRG244 |
| Books | CreativeTrio | CC0 | https://poly.pizza/m/dxt7dETAy9 |
| Book Stack | Danni Bittman | CC BY | https://poly.pizza/m/1WggoIFq8tx |
| Bottle | Quaternius | CC0 | https://poly.pizza/m/FAHsHFXfTf |
| Cup | Kenney | CC0 | https://poly.pizza/m/aSF8ANEIsX |
| Candle | Nick Slough | CC BY | https://poly.pizza/m/HFpLq6iqKu |
| Pillow | Poly by Google | CC BY | https://poly.pizza/m/f60emm1Xkas |
| House plant | Poly by Google | CC BY | https://poly.pizza/m/3qh9saogdJd |
