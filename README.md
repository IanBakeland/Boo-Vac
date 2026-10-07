# Boo-Vac

A tiny first-person ghost-cleaning game built with Three.js `WebGPURenderer` and WGSL.

**Live:** https://ianbakeland.github.io/Boo-Vac/
**Original Shadertoy shader:** [Ether by nimitz](https://www.shadertoy.com/view/MsjSW3) (CC BY-NC-SA 3.0), ported to WGSL and used as the ghost.

## How to play

| Input | Action |
|---|---|
| Click "Start" | Start the shift (locks the mouse, turns on sound) |
| Mouse | Look / aim. During the tug-of-war: move the mouse against the ghost's pull |
| W A S D | Walk |
| Left mouse (hold) | Suck |
| Right mouse (hold) | Blow |
| Esc | Pause |
| M | Mute |

Best on desktop Chrome / Edge / Safari 26.

## What's inside

*(Work in progress: this list is updated as each feature is finished.)*

- Ported Shadertoy shader (WGSL via `wgslFn`): Ether → ghost aura, revealed by the flashlight, stretched by the vacuum
- Own shaders: suction cone, flashlight beam, baked-room flashlight lighting, compute dust particles
- Physics: Rapier (props sucked in a spiral, captured, blown out, thrown by a ghost)
- Blender: room modelled and lighting baked by me (`blender/room.blend`), furniture from Poly Pizza
- Blender animation: ghost model clips driven per game state with `AnimationMixer`
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
