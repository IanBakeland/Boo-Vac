# AGENTS.md — Boo-Vac (WebGPU / Three.js ghost-vacuum game)

> **Read this whole file before writing any code.** It is the single source of truth for this project.
> The step-by-step build order lives in [`PLAN.md`](PLAN.md). When the student says *"do step X.Y"*, open `PLAN.md`, do exactly that step, and nothing beyond it.
> If you are Claude Code: copy or symlink this file to `CLAUDE.md` so it loads automatically. Cursor, Codex and most other agents read `AGENTS.md` directly.

---

## 0. TL;DR for the agent

- **What:** a small first-person game in the browser. In a dark, haunted room you search with a flashlight, vacuum up clutter to expose a hiding ghost, then win a tug-of-war to suck it into your vacuum.
- **Why:** a school assignment (DEVINE, Creative Development). Port a Shadertoy fragment shader to WebGPU inside Three.js `WebGPURenderer`, make it interactive, deploy it online.
- **Main ported shader:** *Ether* by nimitz: https://www.shadertoy.com/view/MsjSW3. It becomes the ghost.
- **Stack:** Vite + `three@^0.186` (`three/webgpu`, `three/tsl`, `three/addons`) + `@dimforge/rapier3d-compat` + `gsap`. Nothing else without asking.
- **Golden rule:** use the techniques from the student's course whenever possible (section 3). The teacher gives more marks for that.
- **Second rule:** online or it does not count. Deploy from day 1 and after every finished step.
- **Third rule:** the student must be able to explain every line. Explain what you write in plain language, especially shader code.

---

## 1. The assignment (verbatim requirements, paraphrased)

> Find a fragment shader on Shadertoy.com and port it to WebGPU. Embed it in a Three.js environment with the `WebGPURenderer` and make sure the shader responds to user interaction.
> Submit (1) a URL where the working experiment can be seen and (2) the source code, as separate assignments. Mention the original shader URL in a `README.md` at the root of the project. Do not submit `node_modules`.
> **"The project needs to be fully functional online. Not online = no marks. Deploy early & often."**

### 1.1 Hard requirements checklist (all must be true at submission)

- [ ] At least one Shadertoy fragment shader ported to **WGSL** and running in Three.js with `WebGPURenderer` (Ether → ghost)
- [ ] That shader **responds to user interaction** (it is revealed by the flashlight, stretched by the vacuum, fades when captured, and reacts to the tug-of-war)
- [ ] Public URL works in a fresh incognito Chrome window, with no console errors
- [ ] `README.md` at the project root contains **https://www.shadertoy.com/view/MsjSW3**
- [ ] Source code submitted without `node_modules` (and without `dist`)

### 1.2 Extra marks and how this project earns them

| Extra-mark category | How we earn it | Status goal |
|---|---|---|
| Interaction beyond looking around | Search, suck, blow, tug-of-war (mouse direction against the ghost), tank management | **Core** |
| Physics | Rapier rigid bodies: props are sucked in a spiral, captured, blown out; the Librarian throws books | **Core** |
| Multiple shaders | Ether ghost (port) + suction cone + flashlight beam + room flashlight lighting + compute dust (+ post FX as stretch) | **Core** |
| Additional WebGPU libraries | **Not targeted.** Rapier is a physics (WASM) library and gsap is an animation library; neither is a WebGPU library. Do not claim this category in the README. | Not claimed |
| Own Blender models + baking | **Student's decision: no Blender in the core.** The room is downloaded (Poly Pizza) and furniture/props are placed in code. Baking is an **optional last step** (PLAN 5.5) once everything works. Do **not** claim this category in the README unless 5.5 is done. | Optional (end) |
| Controlling Blender animations | Quaternius "Ghost" model (CC0, tagged *Animated* on Poly Pizza), its clips driven by an `AnimationMixer` per game state | **Core** (check the clips exist) |

---

## 2. People and context

- The student is a DEVINE student. They are comfortable with JavaScript and have followed the course below. They have **little to no Blender experience**: for Blender tasks, give click-by-click instructions (menu paths, shortcuts). You cannot do Blender work yourself. **The student chose to avoid Blender:** never make a core step depend on it (Blender only appears in the optional bake, PLAN 5.5).
- The course material is on the student's machine at:
  `/Users/ian/Downloads/creative-development-f26-main/`
  - `threejs/README.md`: Three.js chapter (Aviator, **Shadertoy shader in Three.js**, **Three.js + Blender + Shader**)
  - `threejs/projects/shadertoy/`: reference port (`wgslFn`, `uniform`, render target as `iChannel0`)
  - `threejs/projects/blender-three-bake-final/`: reference bake (`baked.jpg`, `GLTFLoader`, `colorSpaceToWorking`)
  - `threejs/projects/20-the-aviator/`: reference code structure (`objects/*.js`, `createX()` returning `{ mesh, ... }`)
  - `webgpu/README.md`: raw WebGPU chapter (2D effects, **Using a Shadertoy shader**, **Compute shaders**, **WGSL cheat sheet**)
  - `webgpu/compute/01-particles.html`: compute particle swirl (pull + tangent swirl). **Our suction math is based on this.**

  If you have read access, open these files when a step references them. If not, ask the student to paste the relevant part.

---

## 3. Course alignment rules (MUST follow)

The teacher rewards using what was taught. Prefer these patterns over alternatives, even if another approach is shorter.

| Topic | Course pattern to use | Source |
|---|---|---|
| Project setup | `npm init -y`, `npm install three`, `npm install -D vite`, scripts `dev` / `build` / `preview` | threejs/README.md, *Aviator → Project setup* |
| Imports | `import * as THREE from 'three/webgpu'`, `import { wgslFn, uniform, uv, texture, colorSpaceToWorking } from 'three/tsl'`, addons from `'three/addons/...'` | threejs/README.md |
| Renderer loop | `new THREE.WebGPURenderer({ canvas, antialias: true, alpha: false })` + `renderer.setAnimationLoop(draw)`. **Never** call `requestAnimationFrame` yourself. | threejs/README.md, *Hello Three.js* |
| Resize | Same resize handler as the bake project, pixel ratio capped with `Math.min(window.devicePixelRatio, 2)` | blender-three-bake-final/js/script.js |
| **Custom shaders** | Write **WGSL in `.wgsl` files**, import with `?raw`, wrap with `wgslFn(...)`, plug into a node material's `colorNode` (usually `MeshBasicNodeMaterial`). Parameters are matched **by name**. The **main function must be first** in the file, helpers below. | threejs/README.md, *Shadertoy shader in Three.js* |
| Shadertoy inputs | `uniform()` nodes; update `.value` every frame. Rebuild `fragCoord` as `uv().mul(iResolution)`. | same |
| Shader colors in a lit/baked scene | Wrap shader output in `colorSpaceToWorking(..., THREE.SRGBColorSpace)`. Do **not** switch the whole renderer to linear output (the room's colors and textures are sRGB). | threejs/README.md, *Three.js + Blender + Shader* |
| Shader into a texture | `THREE.RenderTarget` + orthographic camera + 2×2 plane, `renderer.setRenderTarget(rt)` / `null` | *Buffer A* section |
| Texture + sampler in WGSL | Pass the same TSL `texture()` node for both the `texture_2d<f32>` and `sampler` parameters | *Sampling the texture in the shader* |
| Baked room (optional, PLAN 5.5) | `TextureLoader().load('textures/baked.jpg')`, `flipY = false`, `colorSpace = THREE.SRGBColorSpace`, traverse the glTF and assign materials **by object name** | blender-three-bake-final |
| Code structure | One file per object in `js/objects/`, each exporting `createX()` that returns `{ mesh, update, ... }`; `init()` + `draw()` in `js/script.js` | Aviator |
| Animating values | **gsap** `gsap.to(obj, { duration, ease, prop })` to tween uniforms and properties (suction spin-up, fades) | webgpu/README.md, *Animated effect* |
| Soft edges / masks | `smoothstep`, `step`, `mix` masks instead of `if` chains | webgpu/README.md, *Warp effect* |
| Compute / particles | Pull + tangent swirl, `fract(sin(i * 12.9898) * 43758.5453)` per-particle randomness, drag, per-particle speed limit | webgpu/README.md, *Compute shaders* |
| GLSL→WGSL | Follow the **WGSL cheat sheet** (no `out` params, `vec3f`, `let` / `var`, no multi-component swizzle assignment, braces required, no `#define`, GLSL `mod` ≠ WGSL `%` for negatives: use a `glslMod` helper like in `cyberFuji/fragment.wgsl`) | webgpu/README.md |
| Header comment | Every ported shader file starts with `// https://www.shadertoy.com/view/<id>` (like the course files) | course `.wgsl` files |

**When you must go beyond the course** (Rapier, compute in Three.js via TSL storage buffers, `RenderPipeline` post-processing, pointer lock, Web Audio), say so to the student, keep it minimal, and add a short comment with a link to the docs or example you based it on.

### 3.1 Three.js 0.186 API facts (verified in the package; double-check against `node_modules/three` before use)

- Post-processing class is **`THREE.RenderPipeline`** (since r183; `PostProcessing` still exists but is deprecated and warns). Use `renderPipeline.outputNode = ...` and `renderPipeline.render()`.
- TSL exports available: `wgslFn`, `Fn`, `uniform`, `uv`, `texture`, `colorSpaceToWorking`, `instancedArray`, `storage`, `instanceIndex`, `pass`, `screenUV`, `positionWorld`, `positionLocal`, `cameraPosition`, `mix`, `smoothstep`, `convertToTexture`, `rtt`.
- Node materials available: `MeshBasicNodeMaterial`, `MeshStandardNodeMaterial`, `PointsNodeMaterial`, `SpriteNodeMaterial`, ...
- Compute: `renderer.compute(node)` / `renderer.computeAsync(node)`; GPU buffers via `instancedArray(count, 'vec3')`; render them with `buffer.toAttribute()` or `buffer.element(instanceIndex)`.
- Controls available: `PointerLockControls` (`three/addons/controls/PointerLockControls.js`).
- **Before using any API you are not 100% sure of**, grep `node_modules/three/build/three.webgpu.js` or check the official example of the same version (https://threejs.org/examples/?q=webgpu). Do not invent APIs.

---

## 4. Game design spec

### 4.1 Pitch and story

**Boo-Vac.** You are the new night-shift cleaner at **Dust & Ghost Cleaning Co.**, a dodgy company that also handles "light paranormal nuisance". First job: one dusty old room in a villa, at midnight. Your tools: a flashlight and an overpowered vacuum.

**The twist:** ghosts live in dust and clutter. Cleaning and ghost hunting are the same thing.

**Intro (3 text cards, as a voicemail from the boss):**
1. "Welcome to the crew! Small thing: old houses have *dust ghosts*. The more dust, the more ghosts."
2. "Find stuff that shakes, vacuum the clutter around it, and the ghost pops out. Then just... pull. Don't let go, or it hides again."
3. "Oh, and anything you suck up is the client's property. We'll bill you. Good luck!"

**Ending:** after 3 ghosts, an **invoice screen** (pure HTML/CSS) with funny line items (time, items sucked × €12, escapes × €50 overtime, a joke line like "1 cat, returned, €0") and a star rating.

**IP note:** the mechanic is *inspired by* Luigi's Mansion. Do **not** use any Nintendo names, characters, logos, sounds or assets in the game. The README may say "Mechanic inspired by Luigi's Mansion".

**UI language:** English (change only if the student asks).

### 4.2 Controls

| Input | Action |
|---|---|
| Click "Start" | Enters pointer lock and unlocks audio (both need a user gesture) |
| Mouse | Look / aim (pointer lock). During the tug-of-war: horizontal mouse movement fights the ghost |
| W A S D | Walk (Rapier character controller: solid walls and furniture) |
| Space | Jump |
| Left mouse (hold) | **Suck** |
| Right mouse (hold) | **Blow** (pushes props away, shoots sucked props back out of the tank) |
| F | **MAX** (student's idea): 3 s of ×4 force that also pulls the heavy dynamic furniture (table, chair, vase), then 8 s recharge. HUD button bottom-right. |
| Esc | Pause (pointer lock released → pause overlay → click to resume) |
| M | Mute |

There is **no stun/flash mechanic** (removed on purpose). The flashlight is always on and its role is: (1) the only real light in the room, (2) **ghosts are only visible inside the beam**, (3) dust glitters in the beam.

### 4.3 Core loop (per ghost)

1. **Search.** The room is dark (moonlight ambient). A hiding spot (`Hide_*` object) **trembles** and drops dust particles every few seconds.
2. **Expose.** While the hiding spot is inside the active suction cone, its `exposure` rises (`+0.25/s`). Each `Prop_*` sucked up within 1.5 m of the hiding spot adds `+0.2`. At `exposure ≥ 1` the ghost **emerges** (spawn animation + Ether aura fades in).
3. **Tug-of-war** starts automatically when the emerged ghost is **inside the suction cone and inside the flashlight beam** while sucking:
   - The ghost picks a pull direction (left/right) every `dirInterval` seconds (randomized per ghost) and drifts sideways that way.
   - The player must move the mouse **opposite** to the ghost's pull (`event.movementX` accumulated over ~0.15 s, threshold ~6 px).
   - Correct + sucking → `meter += fillRate * dt`. Otherwise `meter -= drainRate * dt`.
   - Visual and audio feedback scale with the meter: Ether stretch, screen shake, vacuum pitch.
4. **Escape.** If `meter` returns to 0 after the tug started, or the ghost leaves the beam for more than 1 s, it **escapes**: fly to a random other hiding spot, `exposure = 0`, start again from step 1.
5. **Capture.** At `meter ≥ 1`: the ghost spirals into the nozzle (gsap tween + Ether stretch to max + scale to 0), `ghostsCaught++`, a mini ghost appears in the tank (stretch goal S6).

### 4.4 The three ghosts (same model and same Ether shader, different parameters)

| Ghost | Hides in | Ether color (sRGB) | Behaviour during tug | Params |
|---|---|---|---|---|
| **Dusty** (tutorial) | `Hide_Vase` | pale blue-grey | Slow, weak, giggles when it escapes | `dirInterval 1.5–2.5 s`, `fillRate 0.45`, `drainRate 0.2` |
| **The Librarian** | `Hide_Bookshelf` | green | Every ~2 s throws a nearby `Prop_Book*` at the player (Rapier impulse) | `dirInterval 1.0–1.8 s`, `fillRate 0.35`, `drainRate 0.25` |
| **Granny Clock** (boss) | `Hide_Clock` | purple | Fast direction changes, strong; meter must be filled **twice** (2 rounds) | `dirInterval 0.6–1.2 s`, `fillRate 0.3`, `drainRate 0.3` |

Order: Dusty → Librarian → Granny Clock. Only one ghost is "active" (trembling/out) at a time.

### 4.5 Vacuum mechanics

- **Spin-up:** `power` tweens 0→1 in 0.4 s (`power2.out`) on LMB down, 1→0 in 0.3 s on release (gsap). Every effect reads `power`.
- **Suction cone:** range `3.0 m`, inner half-angle `15°`, outer half-angle `35°`.
- **Capture of props:** a `Prop_*` closer than `0.35 m` to the nozzle and with a bounding-box max dimension `< 0.5 m` is sucked in: tween scale to 0 (0.15 s), remove its Rapier body, push it onto `tank` (store the mesh + body description), play "plop".
- Heavy or large props are pulled but never captured (they slide and rattle).
- **Tank:** capacity `20` props. When full, suction power is capped at `0.3`, the vacuum sputters (audio + jitter), and the HUD says *"Tank full! Blow it out (RMB)"*. This makes blowing a real mechanic.
- **Blow (RMB):** force direction reversed (`push` only, no swirl). Every 0.12 s while blowing, the most recent prop in the tank re-spawns at the nozzle with a forward impulse.

### 4.6 HUD and screens (HTML/CSS overlay, no canvas UI)

- **Start screen:** title, 3 intro cards, "Start shift" button, controls list, "Best on desktop Chrome / Edge / Safari 26" note.
- **HUD:** small crosshair, ghosts `0/3`, tank fill bar, tug-of-war meter (only during tug, center-bottom, shows the ghost's pull direction with an arrow).
- **Pause overlay** on pointer-lock loss.
- **Invoice screen** at the end, "Play again" button (reload is fine).
- **Unsupported notices:**
  - `navigator.gpu` missing → banner "Your browser has no WebGPU: running in fallback mode, some effects are off". Disable compute dust (S4).
  - Touch device (`matchMedia('(pointer: coarse)').matches`) → "This game needs a mouse and keyboard" (still render the scene).

### 4.7 Audio (Web Audio API, no library)

- **Motor:** sawtooth `OscillatorNode` → `BiquadFilterNode` (lowpass) → gain. Frequency 70→160 Hz and cutoff 400→1800 Hz follow `power` and the tug meter.
- **Plop:** short noise burst (an `AudioBuffer` of random samples, 60 ms, fast decay).
- **Ghost giggle / moan:** small CC0 sound files in `public/sounds/` (credit in the README if not CC0).
- **Sputter** when the tank is full: modulate the motor gain with a square LFO.
- Create the `AudioContext` on the Start click. Respect the mute toggle.

---

## 5. Technical architecture

### 5.1 File structure (keep it this small; add files only when a step needs them)

```
index.html                  canvas + HTML overlay (start, HUD, pause, invoice)
css/style.css
vite.config.js              base: './'
js/script.js                init(), draw(), game state machine, input
js/config.js                every tunable number (sections 4–7) + LAYOUT (room, furniture, props, spawn)
js/objects/room.js          loads room + furniture GLBs at LAYOUT positions, names them, flashlight material, hiding spots
js/objects/props.js         loads prop GLBs at LAYOUT positions, creates dynamic bodies
js/objects/vacuum.js        viewmodel attached to camera, nozzle, suction cone (S2), power tween, tank
js/objects/flashlight.js    SpotLight + visible beam (S3)
js/objects/ghost.js         ghost model + AnimationMixer + Ether aura (S1) + ghost state
js/objects/dust.js          compute dust (S4) + fallback
js/physics.js               Rapier world, step, sync, suctionForce()
js/audio.js
js/postfx.js                (stretch) RenderPipeline + post shader (S5/S7)
js/shaders/ether/fragment.wgsl       S1 (Shadertoy port)
js/shaders/suction/fragment.wgsl     S2
js/shaders/beam/fragment.wgsl        S3
js/shaders/flashlight/fragment.wgsl  room flashlight lighting
js/shaders/dust/update.wgsl          S4 math (called from a TSL compute Fn)
js/shaders/post/fragment.wgsl        S5 + S7 (stretch)
public/models/apartment.glb downloaded apartment (Poly Pizza), the level
public/models/furniture/    bookshelf, clock, vase, table, ... (Poly Pizza)
public/models/props/        book, cup, pillow, ... (Poly Pizza)
public/models/vacuum.glb    nozzle = VACUUM.nozzleOffset in config.js
public/models/ghost.glb     Quaternius Ghost (animated)
public/sounds/*.mp3
(optional, PLAN 5.5) public/models/room-baked.glb, public/textures/baked.jpg, blender/room.blend
README.md                   submission README (section 10)
AGENTS.md  PLAN.md
.github/workflows/deploy.yml
.gitignore                  node_modules/, dist/, .DS_Store, *.blend1
```

Asset paths in code are **relative without a leading slash** (`'models/room.glb'`), like the course (`'assets/Room.glb'`). Together with `base: './'` this works locally and on GitHub Pages. **Paths are case-sensitive on GitHub Pages**: match file names exactly.

### 5.2 Frame order in `draw()`

```
1. dt = min(clock.getDelta(), 0.05)
2. input → player movement (clamp to room) → camera
3. vacuum.update(dt)          (power, nozzle world position/direction)
4. physics: apply suction/blow forces → world.step() → sync meshes → capture checks
5. ghost.update(dt)           (hiding/trembling/exposure/tug/escape/capture, mixer.update(dt))
6. dust compute               (renderer.compute(...))
7. uniforms (iTime, power, nozzle, flashlight, ghost stretch/visibility)
8. HUD update (DOM writes only when values change)
9. render: renderer.render(scene, camera)   — or renderPipeline.render() if post FX are enabled
```

### 5.3 Game state machine (in `script.js`)

`START → PLAYING ⇄ PAUSED → INVOICE`. Inside `PLAYING`, per ghost: `HIDDEN(trembling) → EMERGED → TUG → (ESCAPED → HIDDEN) | CAPTURED → next ghost`. Keep it a plain object with a `state` string and a `switch`, no state-machine library.

### 5.4 Coordinates and scale

- 1 unit = 1 meter. The level is the downloaded **apartment** ("Apartment 2", Poly Pizza, CC BY 3.0), scaled ×7 to about **11.7 m × 11.8 m × 2.66 m** (x × z × y), centered on the origin, floor at y = 0 (`MODELS.room` in `config.js`). It has a living room, kitchen, hallway and an empty blue room, and no ceiling (one plane is added in code). Its own furniture stays.
- Player eye height 1.6 m, walk speed 2.2 m/s, keep 0.4 m away from walls.
- Camera: `PerspectiveCamera(70, aspect, 0.05, 50)`. Add the camera to the scene (`scene.add(camera)`) because the vacuum and flashlight are children of the camera (scene-graph lesson).

---

## 6. Shader specs

All shaders are WGSL files used through `wgslFn`, unless noted. Each spec lists **inputs (parameter names)**, technique, priority and "done when".

### S1. Ether ghost aura (Shadertoy port, REQUIRED)

- **Source:** *Ether* by nimitz (2014), https://www.shadertoy.com/view/MsjSW3. License CC BY-NC-SA 3.0: credit in file header + README.
- **Original structure:** one Image pass; inputs `iTime` and `iResolution` only. Helper `m(a)` builds a 2D rotation matrix; helper `map(p)` is a distance-like field of a rotating, noisy, twisted sphere; `mainImage` raymarches **6 steps**, accumulating a glowing color. The background is black.
- **Port (follow the course method exactly):**
  1. Copy the GLSL from Shadertoy into a comment at the top of your working file for reference (do not keep it in the final file).
  2. Main function first: `fn ether(fragCoord: vec2f, iTime: f32, iResolution: vec2f, tint: vec3f, visibility: f32, stretch: vec2f) -> vec4f`. Helpers below, renamed to avoid name collisions: `etherRot`, `etherMap`.
  3. `#define t iTime` → pass `iTime` into `etherMap` as a parameter.
  4. Rotations like `p.xz *= m(a)` are multi-component swizzle assignments, **not allowed in WGSL**: compute `let xz = vec2f(p.x, p.z) * etherRot(a); p = vec3f(xz.x, p.y, xz.y);`. Keep the `vector * matrix` order (same meaning as GLSL).
  5. `mat2(c,-s,s,c)` → `mat2x2f(c, -s, s, c)` (both column-major, same meaning).
  6. The inner loop redeclares `p`: rename the inner one (`rayPos`) for clarity.
  7. `for(int i=0; i<=5; i++)` → `for (var i = 0; i <= 5; i++) { ... }`.
  8. The original centers with `fragCoord/iResolution.y - vec2(.9,.5)` (made for a 16:9 canvas). On our square billboard use `iResolution = vec2(1,1)` and center with `uv - 0.5` (scale to taste, ~1.0–1.4).
  9. Return `vec4f(color * tint * visibility, 1.0)`.
- **Our interactive additions:**
  - `tint`: per-ghost color.
  - `visibility` (0–1): computed in JS from the flashlight. `dot(cameraForward, normalize(ghostPos - cameraPos))` vs. the beam cone (`smoothstep(cos(25°), cos(15°), d)`), times a distance fade (0 beyond 7 m). Tweened with gsap for emerge/escape/capture.
  - `stretch` (vec2, screen-space direction × amount): shift the sampling point toward the nozzle proportionally to distance from center, so the smoke elongates toward the vacuum. Amount = `power * tugMeter`, max at capture.
- **Mesh:** `PlaneGeometry(1.6, 1.6)` billboard (copy `camera.quaternion` every frame) on `MeshBasicNodeMaterial` with `transparent: true`, `blending: THREE.AdditiveBlending`, `depthWrite: false`. Black = invisible with additive blending, so no alpha math is needed. `colorNode = colorSpaceToWorking(ether({...}), THREE.SRGBColorSpace)`.
- **Placement:** the aura is a child of the ghost model's root (behind/around the body).
- **Done when:** the Ether smoke animates on a plane in the room, is invisible outside the beam, stretches toward the nozzle while sucking, and has its header comment with the URL.

### S2. Suction cone (own shader, core)

- **What:** visible swirling air in front of the nozzle.
- **Mesh:** `CylinderGeometry(radiusTop 0.05, radiusBottom 0.9, height 2.5, 32, 1, openEnded true)`, rotated so the narrow end sits at the nozzle and it opens along the camera's forward (−Z) direction. Child of the camera, positioned at the nozzle (`VACUUM.nozzleOffset` in `config.js`, tuned to the vacuum model's tip). Additive, `transparent`, `depthWrite: false`, `side: DoubleSide`.
- **Inputs:** `uv`, `iTime`, `power`.
- **Technique:** procedural value noise (a small `hash` + `noise` helper in WGSL). Scroll `uv.x` with time (swirl), scroll `uv.y` toward the narrow end (inflow), add twist that grows near the nozzle (`uv.x += (1.0 - uv.y) * twist`). Fade with `smoothstep` at the wide end and both seams. Multiply everything by `power`, so at 0 it is fully invisible.
- **Done when:** holding LMB makes a soft spiral appear and spin up; releasing fades it out.

### S3. Flashlight beam (own shader, core)

- **What:** a fake volumetric light cone, so the beam is visible in the dusty air.
- **Mesh:** open cone (like S2, longer: height 6, radiusBottom 1.8), child of the flashlight. Additive, `depthWrite: false`.
- **Inputs:** `uv`, `iTime`, `intensity`.
- **Technique:** bright near the lamp (`1 - uv.y` falloff), soft edges via `smoothstep` across `uv.x` seam distance, slow noise for "dusty air". Very low overall opacity (≈0.05–0.12): it must not wash out the scene.
- **Real light:** a `THREE.SpotLight` on the same transform lights props and the ghost model (lights lesson). Angle ~25°, penumbra 0.4, decay 2, distance 10. Shadows **off** (performance).

### S4. Dust particles (compute, core with fallback)

- **What:** about 30 000 dust specks floating in the room. They glitter in the flashlight beam and get sucked into the nozzle in a spiral. They respawn at a random spot in the room when they reach the nozzle.
- **Math:** identical in spirit to the course compute lesson (pull + tangent swirl + drag + per-particle random speed limit), but in 3D around the nozzle axis. See section 7 (shared suction model).
- **Implementation (Three.js way):**
  - Storage: `instancedArray(count, 'vec3')` for positions and another for velocities (TSL), initialized with random positions inside the room bounds.
  - Update: a TSL `Fn` compute node (`.compute(count)`) that reads `position` / `velocity` at `instanceIndex`, calls the WGSL update functions from `js/shaders/dust/update.wgsl` via `wgslFn` (e.g. `dustVelocity(...)` returns the new velocity), integrates, handles respawn, and writes back. Run with `renderer.compute(computeNode)` every frame.
  - Render: points or small sprites whose position comes from the position buffer (`toAttribute()` / `element(instanceIndex)`), size ~0.006–0.012 m, additive. Brightness = how close the speck is to the beam axis (same cone math as S1 visibility) + small base glow.
  - **First check the official example for this exact pattern in v0.186** (`webgpu_compute_particles`) and copy its structure. If `wgslFn` inside compute causes trouble, write the update in TSL instead, but keep the same math.
- **Fallback (no WebGPU, or if compute does not work in time):** 600 `THREE.Points` updated on the CPU with the same `suctionForce()` from `physics.js`.
- **Done when:** dust visibly drifts, glitters in the beam, and spirals into the nozzle when sucking, at 60 fps on a mid-range laptop.

### Room flashlight lighting (own shader, core)

- **File:** `js/shaders/flashlight/fragment.wgsl`, `fn flashlight(albedo: vec4f, worldPos: vec3f, normal: vec3f, lampPos: vec3f, lampDir: vec3f, cosOuter: f32, cosInner: f32, ambient: vec3f, lampColor: vec3f, range: f32) -> vec4f`.
- **Why:** the room and furniture use an unlit `MeshBasicNodeMaterial` lit by our own spot math, so we fully control the dark mood (and it's an extra own shader). `result = albedo * (ambient + lampColor * cone * facing * distanceFalloff)`, where `cone = smoothstep(cosOuter, cosInner, dot(normalize(worldPos - lampPos), lampDir))` and `facing = max(dot(normal, normalize(lampPos - worldPos)), 0.0)` (so walls and furniture edges stay readable without a bake).
- **Material:** for every mesh of the room, `Furniture_*` and `Hide_*`: read the original material's `color` and `map` as `albedo` (`texture(map).mul(color)`, or just the color), then `colorNode = flashlight({ albedo, worldPos: positionWorld, normal: normalWorld, ... })`.
- **Optional bake (PLAN 5.5):** `albedo` becomes `texture(bakedTexture)`; the shader stays the same.
- **Match the SpotLight:** use the same angle, penumbra and color as the real `SpotLight` from S3, so props (standard materials) and the room look consistent.
- **Ambient:** dark moonlight blue, around `vec3(0.05, 0.07, 0.12)`. If the room has a window, it can get a separate emissive basic material.
- **Done when:** the room is dark blue, and the flashlight reveals its colors with a soft-edged spot.

### S5 + S7. Post FX (stretch)

- `js/postfx.js`: `renderPipeline = new THREE.RenderPipeline(renderer)`, `scenePass = pass(scene, camera)`, `sceneTex = scenePass.getTextureNode()`, `renderPipeline.outputNode = post({ sceneTex, sceneTexSampler: sceneTex, uv: screenUV, ... })` (same texture + sampler trick as the course). Compare a screenshot with and without the pipeline: if colors shift, fix the color-space conversion before going further.
- `js/shaders/post/fragment.wgsl`: `fn post(sceneTex: texture_2d<f32>, sceneTexSampler: sampler, uv: vec2f, nozzleUV: vec2f, power: f32, iTime: f32, ghostNear: f32) -> vec4f`.
  - **S5 twirl:** rotate `uv` around `nozzleUV` by an angle that falls off with distance (`smoothstep`) × `power` (like the course's ripple/displacement exercises).
  - **S7 atmosphere:** vignette (smoothstep on distance from center), film grain (hash of `uv + iTime`), slight RGB split scaled by `ghostNear`.
- Only add after the core is done. When enabled, `draw()` calls `renderPipeline.render()` instead of `renderer.render()`.

### S6. Tank (stretch)

- Glass cylinder on the vacuum (`MeshPhysicalNodeMaterial` with `transmission`, or simple transparent material). For each captured ghost, a tiny S1 billboard orbits inside. Reuse the S1 material with a small scale and its own tint.

### Dirt mask (stretch, course-aligned)

- A `RenderTarget` (render-to-texture lesson) holding a floor "dust" mask. Each frame while sucking near the floor, draw a soft circle at the nozzle's floor position. The floor shader mixes a dusty color by the mask. Gives satisfying cleaning stripes. Only if time allows.

---

## 7. Shared suction model (JS and WGSL must match)

One formula drives props (Rapier), dust (compute) and ghost drift. In JS it lives in `physics.js` as `suctionForce(point, nozzlePos, nozzleDir, power, mode)`; in WGSL it is mirrored in `dust/update.wgsl`.

```
d       = point - nozzlePos
dist    = length(d)
dirOut  = d / max(dist, 0.001)                   // nozzle → point
cone    = smoothstep(cosOuter, cosInner, dot(dirOut, nozzleDir))
falloff = smoothstep(range, 0.0, dist)           // 1 near nozzle, 0 at range
pull    = -dirOut * pullStrength                 // toward nozzle
swirl   = normalize(cross(nozzleDir, dirOut)) * swirlStrength   // around nozzle axis
force   = (pull + swirl) * cone * falloff * power      // mode 'suck'
force   = dirOut * blowStrength * cone * falloff * power // mode 'blow' (no swirl)
```

Start values (tune with lil-gui in debug mode): `range 3.0`, `cosInner cos(15°)`, `cosOuter cos(35°)`, `pullStrength 14`, `swirlStrength 5`, `blowStrength 18`.

**Debug check:** add one tiny self-check (`console.assert`) for `suctionForce`: a point straight in front of the nozzle at 1 m gets a force pointing to the nozzle; a point behind the nozzle gets zero. Run it once in debug mode.

---

## 8. Physics spec (Rapier)

- Package: `@dimforge/rapier3d-compat` (WASM embedded, works with Vite without config). `import RAPIER from '@dimforge/rapier3d-compat'`, then `await RAPIER.init()` inside the async `init()`.
- World: gravity `(0, -9.81, 0)`. Fixed step: accumulate `dt` and call `world.step()` at 60 Hz (max 3 steps per frame).
- **Static colliders:** floor, ceiling and 4 walls as cuboids from the room dimensions in `config.js`. For every `Furniture_*` and `Hide_*` mesh: compute a `Box3` in world space → fixed cuboid collider.
- **Dynamic props:** every `Prop_*` mesh → dynamic body at its world transform, cuboid collider from its local bounding box (half extents × world scale), density ~300–600 (books heavier than pillows). Keep each mesh and body paired in an array.
- **Forces:** each physics step, for each awake prop: `body.applyImpulse(suctionForce(...) × mass × stepDt, true)`. Clamp linear velocity to ~8 m/s.
- **Capture:** remove body (`world.removeRigidBody`), hide or scale the mesh, push onto `tank`.
- **Blow-out spawn:** recreate the body at the nozzle with an impulse along `nozzleDir`.
- **Librarian throw:** pick the nearest `Prop_Book*` within 2.5 m of the ghost and apply an impulse toward the player (+ small upward component).
- **Trembling hiding spots:** visual only (small random offset/rotation on the mesh, no physics).
- **Player:** can jump (Space): vertical speed + gravity through the same character controller, so it can't tunnel through floors or ceilings. The apartment has interior walls, so a box clamp is not enough: give the player a Rapier `KinematicCharacterController` with a capsule collider and collide it with the apartment (trimesh collider from the apartment meshes). Done in PLAN step 3.1.
- Max ~60 dynamic props. Rapier API names change between versions: check the installed version's docs.

---

## 9. Assets (and the optional Blender bake)

### 9.1 Poly Pizza assets (verified pages; download **GLB**)

| Asset | Link | Author | License |
|---|---|---|---|
| Ghost (animated) | https://poly.pizza/m/Iip30bDHmu | Quaternius | CC0 |
| Vacuum Cleaner | https://poly.pizza/m/1_kdZRnuCo8 | Zoe XR | CC BY 3.0 (credit required) |
| Vacuum (alternative) | https://poly.pizza/m/eJ96_O_dQ2p | Poly by Google | CC BY 3.0 (credit required) |

Search terms for the rest: `bookshelf`, `grandfather clock`, `old chair`, `armchair`, `table`, `vase`, `book`, `pillow`, `bottle`, `cup`, `candle`, `painting`, `rug`, `chandelier`, `cat`. Prefer one consistent low-poly style (e.g. mostly Quaternius / Kenney / Poly by Google). **Log every downloaded model (title, author, link, license) in the README credits immediately.**

### 9.2 Naming conventions (code depends on these exact prefixes)

Names are set **in code** from `LAYOUT` in `config.js` (no Blender).

| Name | Meaning |
|---|---|
| room | The downloaded apartment GLB (walls, floors, its own furniture). Gets the flashlight material. |
| `Furniture_*` | Static furniture. Flashlight material. Gets a fixed cuboid collider. |
| `Hide_Vase`, `Hide_Bookshelf`, `Hide_Clock` | Hiding spots. Static, trembles in code, collider. |
| `Prop_*` (e.g. `Prop_Book_01`) | Dynamic, suckable props. Keep their own materials (lit by the real `SpotLight`). |
| `LAYOUT.spawn` | Player start position and look direction. |
| `VACUUM.nozzleOffset` | Nozzle tip relative to the camera. **Position only.** The suction direction is always the camera's forward vector (you aim with the camera). |

### 9.3 Bake rules (optional, PLAN 5.5 only; same workflow as the course's baking project)

- Only the room, `Furniture_*` and `Hide_*` are baked (exported from the game with `GLTFExporter`, then imported in Blender), into **one** shared texture `baked.jpg` (2048×2048, JPG quality ~90).
- **Bake bright, darken in code.** Light the scene evenly (soft area light at the window + some world light), bake **Combined** in Cycles (samples ~256, denoise on). The night darkness comes from the flashlight shader's `ambient`. A dark bake would stay muddy when lit.
- **Color management:** set View Transform to **Standard** before baking/saving, so the JPG matches three's sRGB pipeline.
- **Multiple materials pitfall:** every material on every baked object needs an **Image Texture node pointing to the bake image, selected (active)**, otherwise Blender errors or bakes into the wrong image.
- **UVs:** create a new UV map `BakeUV`, select all baked objects, Edit Mode, **Smart UV Project** (island margin ~0.02) so they share one non-overlapping layout. After baking, make `BakeUV` the **only** UV map (delete the others) so three's default `uv` uses it.
- Code side: `bakedTexture.flipY = false`, `bakedTexture.colorSpace = THREE.SRGBColorSpace`.

### 9.4 Asset rules

- Models in `public/models/` with short lowercase file names (case-sensitive online). One scale factor per model in `config.js`.
- `ghost.glb`: the Quaternius file as-is (keep its animations).
- Keep the total asset size **under ~15 MB**.

### 9.5 Blender animation (extra marks)

- **Verified clips in the downloaded `ghost.glb`:** `CharacterArmature|Death`, `|Fast_Flying`, `|Flying_Idle`, `|Headbutt`, `|HitReact`, `|No`, `|Punch`, `|Yes` (1 skinned mesh). `vacuum.glb` has no `Nozzle` empty (single node `group115819083`): use `VACUUM.nozzleOffset` in `config.js` instead.
- Load `ghost.glb`, `console.log(gltf.animations.map(a => a.name))` and map clips to states (e.g. idle/fly → `EMERGED`, a hit/struggle clip → `TUG`, a death/disappear clip → `CAPTURED`). Use whatever clip names the file actually has.
- `AnimationMixer` + `clipAction(...).fadeIn/crossFadeTo` (0.2–0.3 s) on state changes; `mixer.update(dt)` every frame.
- If the model turns out to have no usable clips, tell the student immediately. Alternatives: "Ghost Character" by Polygonal Mind (https://poly.pizza/m/CKLHPoYhE9) or a Quaternius animal (cat) that flees.

---

## 10. Submission `README.md` (project root) — template

The root `README.md` is for the teacher, not for the agent. Create it in step 1.5 of `PLAN.md` and keep it updated.

```markdown
# Boo-Vac

A tiny first-person ghost-cleaning game built with Three.js `WebGPURenderer` and WGSL.

**Live:** https://<user>.github.io/<repo>/
**Original Shadertoy shader:** [Ether by nimitz](https://www.shadertoy.com/view/MsjSW3) (CC BY-NC-SA 3.0), ported to WGSL and used as the ghost.

## How to play
(controls table)

## What's inside
- Ported Shadertoy shader (WGSL via `wgslFn`): Ether → ghost aura, revealed by the flashlight, stretched by the vacuum
- Own shaders: suction cone, flashlight beam, room flashlight lighting, compute dust particles (+ post FX if present)
- Physics: Rapier (props sucked in a spiral, captured, blown out, thrown by a ghost)
- Room and furniture from Poly Pizza, laid out in code (+ Blender bake, only if PLAN 5.5 is done)
- Blender animation: ghost model clips driven per game state with `AnimationMixer`
- Mechanic inspired by Luigi's Mansion. No Nintendo assets are used.

## Run locally
npm install
npm run dev

## Credits
| Asset | Author | License | Link |
| ... |
```

---

## 11. Deployment (GitHub Pages via GitHub Actions)

- `vite.config.js`:
  ```js
  export default { base: './' };
  ```
- `.github/workflows/deploy.yml`: the official Vite static deploy workflow (https://vite.dev/guide/static-deploy#github-pages). Trigger on push to `main`. Steps: checkout → setup-node (LTS, npm cache) → `npm ci` → `npm run build` → configure-pages → upload-pages-artifact (`./dist`) → deploy-pages. Use the action versions shown in the current Vite docs.
- GitHub repo → Settings → Pages → Source: **GitHub Actions**.
- After every push: wait for the green check under *Actions*, then open the live URL in an **incognito** window and check the console.
- `package-lock.json` **must be committed** (`npm ci` needs it).

---

## 12. Performance and compatibility budget

- Target 60 fps on a mid-range laptop (integrated GPU) at `pixelRatio ≤ 2`.
- No real-time shadows (`renderer.shadowMap.enabled = false`).
- Ether billboard ≤ ~1.6 m. It is a 6-step raymarch per pixel, cheap at that size.
- Dust ≤ 30 000 (WebGPU). Fallback 600 on the CPU.
- ≤ 60 dynamic Rapier bodies.
- Test in: Chrome (primary), Edge, Safari 26 if available. Firefox only on Windows has WebGPU.
- `WebGPURenderer` falls back to WebGL2 automatically. Compute dust is disabled in that case (section 4.6).

---

## 13. Debug mode

- `?debug` in the URL enables: `lil-gui` (dev dependency; ask before adding) with every number from `config.js`, an FPS readout, suction cone gizmo lines, collider boxes, the `suctionForce` self-check, and keys: `G` = force-emerge the active ghost, `N` = skip to next ghost.
- Never ship with debug on by default.

---

## 14. Working agreements for the agent

1. **One step at a time** from `PLAN.md`. Before coding, restate the step's goal in 1–2 sentences. After coding, list what changed, how to test it, and tick the box in `PLAN.md`.
2. **Run it.** After each step: `npm run dev` and check the browser console has 0 errors. For build-affecting changes, run `npm run build && npm run preview` too.
3. **Commit + push** after each finished step with a clear message (`step 2.4: room and furniture layout`). Then check the deploy.
4. **Never** commit `node_modules`, `dist`, `.env`, or `*.blend1`.
5. **Ask before adding any dependency.** Allowed by default: `three`, `vite`, `@dimforge/rapier3d-compat`, `gsap`. `lil-gui` (dev) and `@types/three` (dev) on request.
6. **Course first** (section 3). If you deviate, say why in one sentence.
7. **Explain shader code** line by line when you write or port it. The student must be able to defend it (the course explicitly says LLM-ported code must be understood).
8. Keep every tunable number in `js/config.js`. No magic numbers scattered around.
9. Keep the ported shader's header comment with the Shadertoy URL. Keep the credits table up to date.
10. **Scope discipline:** core first (`PLAN.md` phases 1–4). Stretch items only after the core works online. If behind schedule, use the cut list in `PLAN.md`.
11. Do not invent APIs, URLs, model links or animation names. Verify, or tell the student what to check.
12. No Nintendo IP anywhere.

---

## 15. Common pitfalls (check these first when something breaks)

| Symptom | Likely cause |
|---|---|
| WGSL compile error mentioning a parameter | `wgslFn` parameter names must match the object keys exactly; the **first** function in the file is the one that gets called |
| `cannot assign to ... swizzle` | Multi-component swizzle assignment (`p.xz = ...`); rebuild the vector |
| Wrong results with negative numbers in `mod` | GLSL `mod` ≠ WGSL `%`: use a `glslMod(x, y) = x - y * floor(x / y)` helper |
| Shader colors look washed out | Missing `colorSpaceToWorking(..., THREE.SRGBColorSpace)` |
| Baked texture looks upside-down/scrambled | `flipY = false` missing, or the wrong UV map was exported |
| Baked texture too bright/dark/grey | Wrong `colorSpace`, or Blender View Transform was not Standard |
| Black screen, no errors | Renderer not ready: use `setAnimationLoop`, don't render before init |
| Pointer lock / audio not starting | Must be triggered inside a user click handler |
| Rapier errors on load | `await RAPIER.init()` not awaited before creating the world |
| Works locally, 404 online | Absolute paths (`/models/...`), wrong `base`, or file-name case mismatch |
| Deploy action fails at `npm ci` | `package-lock.json` not committed or out of sync |
| Additive objects hide things behind them | `depthWrite: false` missing on additive materials |
| Ghost animation does not play | `mixer.update(dt)` missing, or wrong clip name |

---

## 16. Definition of done (whole project)

- All boxes in section 1.1 ticked.
- Core loop works for all 3 ghosts, start screen → invoice.
- Shaders S1, S2, S3, S4 (or its fallback) and the room flashlight lighting are in and visibly react to interaction.
- Rapier props: sucked, captured, tank fills, blown out. The Librarian throws books.
- Room + furniture laid out in code; ghost animation clips driven by state. (Bake only if optional PLAN 5.5 is done.)
- README complete with Shadertoy URL, live URL, credits.
- Live URL tested in incognito Chrome; 60 fps-ish; no console errors.
- Source zip without `node_modules` / `dist` (see `PLAN.md` step 6.3).
