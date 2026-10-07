# PLAN.md — Boo-Vac: step-by-step plan

This is the build order for **Boo-Vac** (dark room, flashlight, vacuum, ghosts, tug-of-war).
The full spec (what everything should be and how it works) is in [`AGENTS.md`](AGENTS.md). This file says **in which order** to build it and **who** does what.

---

## How to use this plan

- Every step has an ID (e.g. **2.5**). Work top to bottom. Don't skip ahead: later steps depend on earlier ones.
- Owner of each step:
  - 🧑 **You:** things only you can do (installing, accounts, downloading, layout decisions, playtesting, submitting)
  - 🤖 **Agent:** your AI agent writes the code; you review and test
  - 🤝 **Together:** the agent guides and explains, you type or decide (mainly the shader port, so you can explain it to your teacher)
- Each step ends with **Done when** (how you know it works) and a **Commit** message.
- **After every step:** commit → push → wait for the GitHub Action to turn green → open the live URL. *"Not online = no marks."*
- Tick the box in the tracker below when a step is done (or ask the agent to).

### Talking to your agent (copy-paste prompts)

| Situation | Prompt |
|---|---|
| Start of a session | `Read AGENTS.md and PLAN.md. Tell me which step is next according to the tracker, and what it involves.` |
| Do a step | `Do step 2.4 from PLAN.md. Follow AGENTS.md and the course patterns. Explain what you changed and how I can test it.` |
| Shader steps | `We're doing step 1.6c together. Explain the original GLSL line by line first, then let me translate it to WGSL, and correct me.` |
| Something broke | `Step 3.4 broke: <paste console error>. Check the pitfalls table in AGENTS.md first.` |
| Behind schedule | `We're behind. Look at the cut list in PLAN.md and tell me what to drop to finish the core.` |
| Before submitting | `Run the final checklist (phase 6) and AGENTS.md section 16. List anything that's not done.` |

### Suggested timing (adjust to your deadline)

| Week | Phases |
|---|---|
| Week 1 | Phase 0 + Phase 1 (setup, deploy, **Ether port**, suction cone) |
| Week 2 | Phase 2 (room + layout, first-person, flashlight) |
| Week 3 | Phase 3 (physics, dust) + Phase 4 (ghosts, game loop) |
| Week 4 | Phase 5 (polish, stretch) + Phase 6 (submit) |

---

## Progress tracker

**Phase 0: Preparation**
- [ ] 0.1 Install tools
- [ ] 0.2 GitHub repository
- [ ] 0.3 Reread the course chapters

**Phase 1: Foundation, deploy, first shaders**
- [x] 1.1 Create the Vite project
- [x] 1.2 Three.js boilerplate (WebGPU)
- [x] 1.3 Git + first push
- [x] 1.4 GitHub Pages deploy
- [x] 1.5 Submission README skeleton
- [x] 1.6 Port Ether (S1), 5 sub-steps
- [x] 1.7 Suction cone shader (S2) + spin-up
- [x] 1.8 ✋ Go / no-go checkpoint

**Phase 2: Room, layout, flashlight** *(no Blender: the room is downloaded, the layout lives in code)*
- [x] 2.1 Download assets from Poly Pizza
- [x] 2.2 Download an empty room
- [x] 2.3 Prepare the models (`public/models/`, scales, room size)
- [x] 2.4 Load the room + furniture (layout in code)
- [x] 2.5 Place the props (layout in code)
- [x] 2.6 Flashlight: SpotLight + beam (S3) + room lighting shader
- [x] 2.7 First-person controls + vacuum in hand

**Phase 3: Physics and dust**
- [x] 3.1 Rapier world + static colliders
- [x] 3.2 Props as dynamic bodies
- [ ] 3.3 Shared `suctionForce()` + self-check
- [ ] 3.4 Sucking: spiral, capture, tank
- [ ] 3.5 Blowing + tank-full mechanic
- [ ] 3.6 Compute dust (S4) + fallback

**Phase 4: Ghosts and game loop**
- [ ] 4.1 Ghost model + animations (AnimationMixer)
- [ ] 4.2 Ether aura on the ghost + beam visibility
- [ ] 4.3 Hiding spots: trembling + exposure + emerge
- [ ] 4.4 Tug-of-war
- [ ] 4.5 Escape + capture
- [ ] 4.6 Three ghost personalities
- [ ] 4.7 Screens: start, HUD, pause, invoice
- [ ] 4.8 Audio

**Phase 5: Polish and stretch**
- [ ] 5.1 Playtest with 3 people
- [ ] 5.2 Tuning pass
- [ ] 5.3 Stretch goals (pick max 2)
- [ ] 5.4 Performance + browser pass
- [ ] 5.5 Optional: bake the room in Blender (only when everything works)

**Phase 6: Submission**
- [ ] 6.1 Final README + credits
- [ ] 6.2 Final deploy + incognito test
- [ ] 6.3 Source zip without node_modules
- [ ] 6.4 Submit both assignments
- [ ] 6.5 Prepare to explain your project

---

## Phase 0: Preparation

### 0.1 Install tools · 🧑 · 30 min
1. **Node.js LTS** from https://nodejs.org. Check in a terminal: `node -v` and `npm -v`.
2. **Git**: on a Mac, `git --version` (installs the command-line tools if missing).
3. **VS Code** (you have it from the course).
4. **Blender** (latest stable) from https://www.blender.org. *Only needed for the optional bake (5.5).*
5. **Chrome**: the course says to use Chrome for WebGPU (best error messages).
6. Your AI agent (Claude Code / Cursor / ...), opened in your project folder (created in 1.1).

**Done when:** `node -v`, `npm -v`, `git --version` all print a version; Blender opens.

### 0.2 GitHub repository · 🧑 · 10 min
1. On github.com: **New repository** → name e.g. `Boo-Vac` → **Public** (GitHub Pages on free accounts needs public) → no README (we make our own) → Create.
2. Keep the page open, you'll need the URL in step 1.3.

**Done when:** you have an empty repo URL like `https://github.com/<you>/Boo-Vac`.

### 0.3 Reread the course chapters · 🧑 · 1 h
Skim these again, because the project reuses them directly:
- `threejs/README.md` → **Shadertoy shader in Three.js** (this is your porting method) and **ThreeJS + Blender + Shader** (this is your bake method)
- `threejs/projects/blender-three-bake-final/js/script.js`
- `webgpu/README.md` → **Using a Shadertoy shader**, **Compute shaders**, **WGSL cheat sheet**
- Rewatch the Blender bake tutorial on the learning platform.

**Done when:** you know what `wgslFn`, `uniform()`, `colorSpaceToWorking` and `baked.jpg` + `flipY = false` are for.

---

## Phase 1: Foundation, deploy, first shaders

### 1.1 Create the Vite project · 🤖 · 15 min
*Lesson: threejs/README.md → Aviator → Project setup*
1. Create the project folder `Boo-Vac` and open it in VS Code and your agent. Put `AGENTS.md` and `PLAN.md` in it.
2. Agent runs: `npm init -y`, `npm install three gsap`, `npm install -D vite`.
3. Scripts in `package.json`: `"dev": "vite"`, `"build": "vite build"`, `"preview": "vite preview"`.
4. `vite.config.js` with `base: './'`.
5. `.gitignore`: `node_modules/`, `dist/`, `.DS_Store`, `*.blend1`.
6. Folders per AGENTS.md §5.1 (only the ones needed now: `css/`, `js/`, `js/objects/`, `js/shaders/`, `public/`).

**Done when:** `npm run dev` serves an empty page with no errors.
**Commit:** `step 1.1: vite project setup`

### 1.2 Three.js boilerplate (WebGPU) · 🤖 · 30 min
*Lesson: Shadertoy shader in Three.js → Three.js boilerplate; bake project script.js*
1. `index.html` with a fullscreen `<canvas class="webgl">` and an empty `<div id="ui">` overlay.
2. `js/script.js`: `WebGPURenderer` (`antialias: true, alpha: false`), `PerspectiveCamera(70, aspect, 0.05, 50)`, scene, resize handler, `renderer.setAnimationLoop(draw)`, a `Clock`.
3. Temporary test: a grey floor plane + `OrbitControls` so you can look around (floor removed in 2.4, controls replaced in 2.7).
4. `js/config.js` with a first few constants.

**Done when:** you see a floor plane, can orbit, and the console is clean.
**Commit:** `step 1.2: webgpu renderer boilerplate`

### 1.3 Git + first push · 🧑🤖 · 10 min
1. `git init`, `git add .`, `git commit -m "step 1.2: boilerplate"`.
2. `git branch -M main`, `git remote add origin <your repo URL>`, `git push -u origin main`.
3. Check on GitHub that `node_modules` is **not** there and `package-lock.json` **is** there.

**Done when:** your code is on GitHub without `node_modules`.

### 1.4 GitHub Pages deploy · 🤖🧑 · 20 min
1. 🤖 Add `.github/workflows/deploy.yml` (official Vite workflow, see AGENTS.md §11).
2. 🧑 On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push. Watch the **Actions** tab until it's green.
4. Open `https://<you>.github.io/Boo-Vac/` in an **incognito** window.

**Done when:** the live URL shows the same floor plane as locally. 🎉 *From now on, the "online" requirement is covered; keep it that way.*
**Commit:** `step 1.4: github pages deploy`

### 1.5 Submission README skeleton · 🤖 · 10 min
1. Create the root `README.md` from the template in AGENTS.md §10.
2. Fill in the **live URL** and the **Shadertoy URL** `https://www.shadertoy.com/view/MsjSW3` now.
3. Empty credits table, to fill as you download assets.

**Done when:** README.md is on GitHub with both URLs.
**Commit:** `step 1.5: readme skeleton`

### 1.6 Port Ether (S1) · 🤝 · 3–5 h · ⭐ the most important step
*Lesson: threejs/README.md → Shadertoy shader in Three.js (follow the same sub-steps!) + webgpu/README.md → WGSL cheat sheet*

Do this **together**: let the agent explain, and you do the translation as much as possible. Your teacher can ask you about this code.

- **1.6a UV test.** Create `js/shaders/ether/fragment.wgsl` with a test function `ether(fragCoord, iResolution)` that returns the UV as a color (like the course's first step). Put it on a `PlaneGeometry(1.6, 1.6)` with `MeshBasicNodeMaterial` + `wgslFn`. *Done when:* you see a red/green gradient.
- **1.6b Uniforms.** Add `iTime` as a `uniform(0)` and update it in `draw()`. Test with a pulsing blue channel. *Done when:* it pulses.
- **1.6c Translate.** Open https://www.shadertoy.com/view/MsjSW3, read the code with the agent line by line, then translate it to WGSL using the rules in AGENTS.md §6 S1 (rotation-matrix helper, swizzle fix, loop syntax, renamed helpers, centering for a square plane). Header comment with the URL on line 1. *Done when:* the smoke animates like on Shadertoy.
- **1.6d Make it a ghost.** `transparent`, `AdditiveBlending`, `depthWrite: false`, billboard (copy camera rotation each frame). Add `tint` and `visibility` parameters. *Done when:* black is invisible and the smoke floats over the floor.
- **1.6e Colors.** Wrap in `colorSpaceToWorking(..., THREE.SRGBColorSpace)`. Compare with Shadertoy side by side. *Done when:* the colors match.

**Done when:** the Ether ghost floats in your scene online, and you can explain what `etherMap`, the raymarch loop and each uniform do.
**Commit:** `step 1.6: port Ether shader to WGSL`

### 1.7 Suction cone shader (S2) + spin-up · 🤖 · 2 h
*Lessons: smoothstep masks (warp effect), gsap (animated effect)*
1. `js/shaders/suction/fragment.wgsl` per AGENTS.md §6 S2.
2. `js/objects/vacuum.js` → `createVacuum()` with, for now, only the cone in front of the camera.
3. LMB down/up → `gsap.to(state, { power: 1, duration: 0.4, ease: 'power2.out' })` / back to 0.
4. Feed `power` into the shader. Also feed it into Ether's `stretch` as a test.

**Done when:** holding the mouse makes a swirling cone appear and spin up; releasing fades it out.
**Commit:** `step 1.7: suction cone shader`

### 1.8 ✋ Go / no-go checkpoint · 🧑 · 15 min
Check online (not just locally):
- [x] Ether port works and looks right
- [x] Suction cone reacts to the mouse
- [x] Console clean, deploy green

**All yes →** continue. **Ether still broken after a full week →** ask the agent for help debugging with the pitfalls table; if still stuck, talk to your teacher before moving on. Everything else builds on this.

---

## Phase 2: Room, layout, flashlight

> **Decision:** no Blender in the core build. The room is downloaded from Poly Pizza and the furniture/props are placed **in code** (`LAYOUT` in `config.js`). Baking is optional, at the very end (step 5.5).
> Quick model check without Blender: drag a `.glb` onto https://gltf-viewer.donmccurdy.com/ to see its size and animation clips.

### 2.1 Download assets from Poly Pizza · 🧑 · 1 h
1. Download as **GLB** (verified links in AGENTS.md §9.1):
   - Ghost (Quaternius, CC0, animated): https://poly.pizza/m/Iip30bDHmu
   - Vacuum Cleaner (Zoe XR, CC BY): https://poly.pizza/m/1_kdZRnuCo8
2. Furniture: `bookshelf`, `grandfather clock`, `armchair`, `table`, `rug`, `painting`, `chandelier` or `lamp`.
3. Props: `book` (several), `vase` (one becomes a hiding spot), `pillow`, `cup`, `bottle`, `candle`, `plant`.
4. Pick one consistent low-poly style.
5. Put the raw downloads in a folder `assets-raw/` (add it to `.gitignore` if large).
6. **Immediately** add each one to the README credits table: title, author, license, link.
7. Drop `ghost.glb` on the glTF viewer and **write down the animation clip names**.

**Done when:** all files are downloaded, the credits table is filled in, and you know the ghost's clip names.

### 2.2 Download an empty room · 🧑 · 30 min
1. On Poly Pizza, search `empty room` / `room`. Pick one that is **empty** (or almost), **closed** (floor, 4 walls, ceiling; a window is a bonus), **low-poly**, and **CC0 or CC BY**.
2. Download as **GLB** into `assets-raw/` and give the agent the link.
3. 🤖 The agent adds it to the README credits.

**Done when:** the room is in `assets-raw/` and credited.

### 2.3 Prepare the models · 🤖 · 30 min
1. Copy the models the game uses into `public/models/` with short lowercase names: `room.glb`, `ghost.glb`, `vacuum.glb`, `furniture/<name>.glb`, `props/<name>.glb`. (The painting is an OBJ: load it with `OBJLoader` + `MTLLoader`, or skip it.)
2. Measure each model (bounding box) and put a scale factor per model in `config.js`, so everything is real size: bookshelf ~2 m high, clock ~2 m, chair ~0.9 m, table ~0.75 m.
3. Update `ROOM` in `config.js` to the downloaded room's real inside size (scale the room if it's far from ~6 × 5 × 2.8 m).

**Done when:** every model is in `public/models/` with its scale in `config.js`, total under ~15 MB.
**Commit:** `step 2.3: prepare models`

### 2.4 Load the room + furniture (layout in code) · 🤝 · 1–2 h
1. 🧑 Tell the agent roughly where things go, e.g. "bookshelf against the left wall, clock in the corner next to the window, vase on the table, walking space in the middle".
2. 🤖 `LAYOUT` in `config.js`: per furniture piece a model, position, rotation and name. Hiding spots: `Hide_Vase`, `Hide_Bookshelf`, `Hide_Clock`. Other furniture: `Furniture_*`. Plus `spawn` (player start position + look direction).
3. 🤖 `js/objects/room.js` → `createRoom()`: `GLTFLoader` for the room and each furniture piece, transforms from `LAYOUT`, set `object.name`, collect the `Hide_*` objects. Temporary lights (`AmbientLight` + `DirectionalLight`) so you can see everything until 2.6.
4. 🤖 Remove the test floor from 1.2.
5. 🧑 Orbit around and give feedback; repeat until the room feels right.

**Done when:** the furnished room shows in the browser, online, and you like the layout.
**Commit:** `step 2.4: room and furniture layout`

### 2.5 Place the props (layout in code) · 🤝 · 1 h
1. 🧑 Tell the agent where the clutter goes: books near the bookshelf (the Librarian throws them), clutter around each hiding spot.
2. 🤖 `LAYOUT.props` in `config.js` (model, position, rotation), named `Prop_Book_01`, `Prop_Cup_01`, ... `js/objects/props.js` → `createProps()` loads each model once and places `clone()`s (static for now; physics comes in 3.2).
3. Aim for 30–50 props.

**Done when:** the room looks cluttered and lived-in.
**Commit:** `step 2.5: props layout`

### 2.6 Flashlight: SpotLight + beam (S3) + room lighting shader · 🤖 · 2–3 h
1. `js/shaders/flashlight/fragment.wgsl` per AGENTS.md §6 (*Room flashlight lighting*): give the room, furniture and hiding spots the flashlight node material (dark blue ambient + spot cone on their own colors). Remove the temporary lights from 2.4.
2. `js/objects/flashlight.js`: a `SpotLight` (for props and the ghost), plus the beam cone mesh with `js/shaders/beam/fragment.wgsl` (S3). Child of the camera.
3. Tune: the shader spot and the real SpotLight have the same angle, softness and color.

**Done when:** the room is dark and moody, and the flashlight reveals it with a soft-edged spot. The beam is faintly visible in the air.
**Commit:** `step 2.6: flashlight lighting and beam`

### 2.7 First-person controls + vacuum in hand · 🤖 · 2 h
1. Replace OrbitControls with `PointerLockControls`. Start position/rotation from `LAYOUT.spawn`.
2. WASD movement at 2.2 m/s, eye height 1.6 m, clamped inside the room (0.4 m from walls).
3. A temporary "Click to start" overlay (pointer lock needs a click). Esc → pause overlay.
4. Load `vacuum.glb` as a child of the camera (bottom-right of the view, like a first-person game). Tune `VACUUM.nozzleOffset` in `config.js` so the suction cone starts at the nozzle tip.
5. LMB = suck (from 1.7), RMB = blow (prevent the context menu).

**Done when:** you can walk through the dark room with a flashlight and a vacuum, and the cone comes out of the nozzle.
**Commit:** `step 2.7: first-person controls and vacuum`

---

## Phase 3: Physics and dust

### 3.1 Rapier world + static colliders · 🤖 · 1–2 h
1. `npm install @dimforge/rapier3d-compat`.
2. `js/physics.js`: `await RAPIER.init()`, world with gravity, fixed 60 Hz step.
3. A trimesh collider for the apartment (walls, floors, its own furniture), and cuboid colliders for each `Furniture_*` / `Hide_*` (from their bounding boxes).
4. **Player collision:** a Rapier `KinematicCharacterController` (capsule) so you can't walk through the apartment's walls anymore (replaces the box clamp from 2.7).
5. Debug mode (`?debug`): draw the collider boxes as wireframes.

**Done when:** with `?debug` the collider boxes line up with the furniture, and you can't walk through walls.
**Commit:** `step 3.1: rapier world and static colliders`

### 3.2 Props as dynamic bodies · 🤖 · 1–2 h
1. `js/objects/props.js`: for every `Prop_*` from 2.5, create a dynamic body + cuboid collider, keep mesh + body pairs.
2. Sync mesh position/rotation from the body each frame.
3. Test: in debug mode, a key drops all props from 1 m higher.

**Done when:** props fall and settle realistically on furniture and floor.
**Commit:** `step 3.2: dynamic props`

### 3.3 Shared `suctionForce()` + self-check · 🤖 · 1 h
*Lesson: webgpu/README.md → Compute shaders (pull + tangent swirl)*
1. Implement `suctionForce()` in `physics.js` exactly per AGENTS.md §7.
2. Add the `console.assert` self-check (runs in debug mode).
3. Explain to the student how it relates to the course's compute particle swirl.

**Done when:** the self-check passes and you understand the formula.
**Commit:** `step 3.3: suction force`

### 3.4 Sucking: spiral, capture, tank · 🤖 · 2–3 h
1. Every physics step: apply the suction impulse to props in the cone (scaled by `power`).
2. Capture small props near the nozzle: shrink tween (gsap) → remove body → push onto `tank` → "plop" placeholder (`console.log` for now).
3. HUD: a simple tank bar.

**Done when:** books and cups spiral toward the nozzle and disappear; heavy things only slide; the tank bar fills.
**Commit:** `step 3.4: suck and capture props`

### 3.5 Blowing + tank-full mechanic · 🤖 · 1–2 h
1. RMB: blow force (push, no swirl) + re-spawn props from the tank at the nozzle with a forward impulse.
2. Tank full (20): suction capped, jitter, HUD message *"Tank full! Blow it out (RMB)"*.

**Done when:** you can fill the tank, get the warning, and shoot everything back into the room.
**Commit:** `step 3.5: blow and tank full`

### 3.6 Compute dust (S4) + fallback · 🤖 · 3–4 h (riskiest code step)
*Lesson: webgpu/README.md → Compute shaders; Three.js example `webgpu_compute_particles`*
1. Agent first studies the official example for v0.186 and explains the pattern.
2. `js/objects/dust.js` + `js/shaders/dust/update.wgsl` per AGENTS.md §6 S4. Start with 5 000 particles, then raise to 30 000 if fps allows.
3. Brightness depends on the flashlight beam.
4. Fallback: if `!navigator.gpu` (or if this step stalls for more than a day), use 600 CPU `Points` with the same `suctionForce()`.

**Done when:** dust glitters in the beam and spirals into the nozzle, at a smooth framerate, online.
**Commit:** `step 3.6: compute dust particles`

---

## Phase 4: Ghosts and game loop

### 4.1 Ghost model + animations · 🤖 · 1–2 h
*Lesson: the Blender-animation extra mark*
1. `js/objects/ghost.js` → `createGhost()`: load `ghost.glb`, log the clip names, `AnimationMixer`.
2. Map the clips to states (emerged / tug / captured), crossfade 0.25 s on state change.
3. Debug keys to switch states and see each animation.

**Done when:** the ghost model plays a different animation per state.
**Commit:** `step 4.1: ghost model and animations`

### 4.2 Ether aura on the ghost + beam visibility · 🤖 · 1–2 h
1. Attach the Ether billboard from 1.6 to the ghost.
2. `visibility` from the flashlight cone + distance (AGENTS.md §6 S1), smoothed. Also fade the model's opacity with it.
3. `stretch` toward the nozzle from `power`.

**Done when:** the ghost is only visible in your beam and its smoke stretches toward the vacuum when you suck.
**Commit:** `step 4.2: ether aura and visibility`

### 4.3 Hiding spots: trembling + exposure + emerge · 🤖 · 2 h
1. Active hiding spot trembles every few seconds and drops a burst of dust.
2. `exposure` rises per AGENTS.md §4.3. At 1 → emerge (animation + aura fade-in).

**Done when:** you can find the shaking vase, vacuum around it, and Dusty pops out.
**Commit:** `step 4.3: hiding spots and emerge`

### 4.4 Tug-of-war · 🤖🧑 · 3 h (most important feel)
1. Tug starts when the ghost is in the cone and in the beam while sucking.
2. Ghost pull direction every `dirInterval`, drifts that way. Player must move the mouse the opposite way (`movementX`).
3. Meter fill/drain, HUD meter with direction arrow, screen shake, vacuum pitch (placeholder until 4.8).
4. 🧑 Play it 10 times and tell the agent what feels wrong. Tune in `config.js` / `?debug` lil-gui.

**Done when:** the tug feels like a fight: winnable, but you can lose.
**Commit:** `step 4.4: tug-of-war`

### 4.5 Escape + capture · 🤖 · 1–2 h
1. Escape rules (meter back to 0, or out of the beam > 1 s) → flies to another hiding spot.
2. Capture: spiral into the nozzle (gsap), stretch to max, capture animation, `ghostsCaught++`.

**Done when:** both outcomes work and the next ghost becomes active after a capture.
**Commit:** `step 4.5: escape and capture`

### 4.6 Three ghost personalities · 🤖 · 1–2 h
1. Dusty → Librarian → Granny Clock with the parameters from AGENTS.md §4.4.
2. Librarian throws books during the tug. Granny Clock needs 2 rounds.

**Done when:** you can play through all 3 and each feels different.
**Commit:** `step 4.6: three ghosts`

### 4.7 Screens: start, HUD, pause, invoice · 🤖 · 2–3 h
1. Start screen with the 3 intro cards and controls (AGENTS.md §4.1, §4.6).
2. Final HUD (ghosts 0/3, tank, tug meter).
3. Invoice screen with real stats and the joke lines + "Play again".
4. Unsupported-browser and touch-device notices.

**Done when:** start → play 3 ghosts → invoice works end to end, online.
**Commit:** `step 4.7: screens and hud`

### 4.8 Audio · 🤖🧑 · 2 h
1. 🤖 Web Audio motor, plop, sputter (AGENTS.md §4.7). Mute with M.
2. 🧑 Find 2–3 CC0 ghost sounds (freesound.org, filter on CC0), put them in `public/sounds/`, add them to the credits.

**Done when:** the vacuum sounds alive and ghosts giggle/moan.
**Commit:** `step 4.8: audio`

> 🎯 **Core complete.** At this point the project is fully submittable. Everything below makes it better.

---

## Phase 5: Polish and stretch

### 5.1 Playtest with 3 people · 🧑 · 1 h
Let 3 people play **without explaining anything**. Note where they get stuck, what they don't understand, what they laugh at. Give the notes to the agent.

### 5.2 Tuning pass · 🤝 · 2 h
Fix the playtest notes: text, timings, forces, visibility. All in `config.js`.

### 5.3 Stretch goals (pick max 2, in this order) · 🤖
1. **S7 atmosphere** (vignette, grain, RGB split near a ghost): cheap, big mood boost.
2. **S5 twirl distortion** at the nozzle.
3. **S6 tank** with mini ghosts.
4. **Dirt mask** on the floor (render-target lesson).
5. A cat (Quaternius) that flees: another Blender-animation showcase.

Each stretch goal: own commit + deploy check. Stop if fps drops below ~50.

### 5.4 Performance + browser pass · 🤖🧑 · 1–2 h
1. Check the fps in debug mode; apply the AGENTS.md §12 budgets.
2. 🧑 Test the live URL in Chrome, Edge, Safari 26 (if you have it), and Chrome with WebGPU unavailable (fallback mode should not crash).

**Done when:** smooth in Chrome, no crashes elsewhere.

### 5.5 Optional: bake the room in Blender · 🧑🤖 · 3–4 h
**Only when everything else works and is online.** Earns the *"Blender + baking"* extra mark. Same workflow as the course's `blender-three-bake-final` project. If it goes wrong, just don't merge it: the game works without it.

**A. Get the assembled room into Blender**
1. 🤖 Debug key that exports the static room (room + furniture + hiding spots, **no** props/ghost/vacuum) with `GLTFExporter` as `room-assembled.glb` (the layout lives in code, so this is how Blender gets it). Object names are kept.
2. 🧑 Blender: **File → New → General**, delete the cube and light (**X**), then **File → Import → glTF 2.0** → `room-assembled.glb`. Save as `blender/room.blend` in the project.

**B. Lights for the bake (bake BRIGHT, the darkness comes from the code)**
1. **Shift+A → Light → Area** in front of the window (or the middle of a wall), pointing in, size ~2 m, power ~300–500 W, slightly blue.
2. World tab → Color light grey, Strength ~0.5 (soft fill).
3. Optional: a warm point light near the clock.
4. Render tab → **Render Engine: Cycles** (Device: GPU if available).
5. Render tab → **Color Management → View Transform: Standard**.
6. Viewport: press **Z → Rendered** to preview. You want: evenly lit, soft shadows, not dark.

**C. UVs + bake + save `baked.jpg`** (the hardest part, take your time; rewatch the course bake tutorial first)
1. Select all imported objects (room, `Furniture_*`, `Hide_*`).
2. For **each** of them: Object Data tab (green triangle) → **UV Maps → +**, rename the new map `BakeUV` and **click it** (selected). ⚠️ Do **not** click the camera icon: the original map must stay the render map so the colors bake correctly.
3. With all of them selected: **Tab** → **A** → **U → Smart UV Project** (Island Margin 0.02) → OK. Check in the **UV Editing** workspace that islands don't overlap. If they do: **UV → Pack Islands**.
4. **Image Editor → New Image:** name `baked`, 2048 × 2048, uncheck Alpha.
5. **For every material on every selected object** (Shading workspace): **Shift+A → Texture → Image Texture**, choose `baked`, **click the node so it's selected**, and do **not** connect it. ⚠️ Missing it on one material = error or wrong bake.
6. Render tab: Samples ~256, Denoise on → **Bake** panel: Bake Type **Combined**, Output: Image Textures, Margin 16 px → **Bake**. Wait.
7. Image Editor → **Image → Save As** → `public/textures/baked.jpg` in your project, JPG, Quality 90, **Save as Render** checked.
8. Cleanup: for each baked object, in UV Maps **remove the original map** so only `BakeUV` remains.
9. Save `blender/room.blend`.

**Done when (C):** `baked.jpg` shows your room's surfaces with soft shadows, laid out as UV islands.

**D. Back into the game**
1. 🧑 Select all baked objects → **File → Export → glTF 2.0** → glTF Binary → **Limit to Selected Objects** → `public/models/room-baked.glb`.
2. 🤖 `room.js` loads `room-baked.glb` instead of room + furniture, with `TextureLoader('textures/baked.jpg')`, `flipY = false`, `SRGBColorSpace`. The flashlight shader stays the same, its `albedo` just becomes `texture(bakedTexture)`.
3. 🤖 README: add the Blender bake to *What's inside*. Commit `blender/room.blend` too.

**Done when:** online, the flashlight reveals soft baked shadows and dark corners.
**Commit:** `step 5.5: baked room`

---

## Phase 6: Submission

### 6.1 Final README + credits · 🤖🧑 · 30 min
- Live URL, Shadertoy URL (**required**), how to play, what's inside, run locally, full credits (every model, sound, the shader + license), "inspired by Luigi's Mansion" line.

### 6.2 Final deploy + incognito test · 🧑 · 15 min
- Push, wait for green, open the live URL in incognito, play start → invoice, console clean.

### 6.3 Source zip without node_modules · 🧑 · 5 min
From the project folder:
```bash
git archive -o Boo-Vac-source.zip HEAD
```
This only includes committed files, so there's no `node_modules` and no `dist`. Open the zip and check that `README.md` is at the root.

### 6.4 Submit both assignments · 🧑 · 5 min
- Assignment 1: the **live URL**.
- Assignment 2: the **source zip** (or repo link if that's allowed).

### 6.5 Prepare to explain your project · 🧑 · 1 h
Be ready to show and explain:
- How you ported Ether (GLSL → WGSL differences you hit, what `etherMap` and the loop do, what your extra uniforms do)
- How `wgslFn` + `uniform()` connect JS to WGSL
- The suction formula and its link to the course's compute particles
- How the room is assembled in code (`LAYOUT` in `config.js`, names, hiding spots), and your bake process if you did 5.5
- How the ghost animations are driven by game state
- Why the room uses a custom flashlight shader (unlit basic material lit by our own spot math: full control over the dark mood)

---

## Cut list (if you fall behind, drop in this order)

1. Stretch goals (Phase 5.3) and the optional bake (5.5)
2. Audio files (keep the generated motor sound only)
3. Librarian book-throwing and Granny's second round
4. From 3 ghosts to 1 (Dusty only, then invoice)
5. Compute dust → CPU fallback dust

**Never cut:** the Ether port (S1), the suction cone (S2), sucking props with physics, the online deploy, the README with the Shadertoy URL.

---

## Risk log

| Risk | Early warning | What to do |
|---|---|---|
| Ether port won't compile | Still red errors after a full session | Pitfalls table in AGENTS.md §15, compare with the course's `cyberFuji/fragment.wgsl` |
| Bake looks wrong | Black/stretched patches in `baked.jpg` | Missing Image Texture node in a material, overlapping UVs, or wrong active UV map (step 5.5) |
| Compute dust stalls | > 1 day on 3.6 | Switch to the CPU fallback and move on |
| Ghost has no usable animations | Clip list empty in 2.1 | Alternative model (AGENTS.md §9.5) |
| Deploy breaks | Red Action or 404 | Paths with a leading `/`, file-name case, missing `package-lock.json` |
| Tug feels bad | Playtesters lose interest | Spend the tuning time here; it's the heart of the game |
