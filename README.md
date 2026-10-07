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
- Own shaders: suction cone, flashlight beam, room flashlight lighting, compute dust particles
- Physics: Rapier (props sucked in a spiral, captured, blown out, thrown by a ghost)
- Room and furniture from Poly Pizza, laid out in code
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
| Ghost (animated) | Quaternius | CC0 | https://poly.pizza/m/Iip30bDHmu |
| Vacuum Cleaner | Zoe XR | CC BY | https://poly.pizza/m/1_kdZRnuCo8 |
| Bookcase with Books | Quaternius | CC0 | https://poly.pizza/m/tACDGJ4CGW |
| Grandfathers Clock | CreativeTrio | CC0 | https://poly.pizza/m/09YKIkFZnA |
| Chair | Quaternius | CC0 | https://poly.pizza/m/zMmKNm8w4a |
| Small Table | Quaternius | CC0 | https://poly.pizza/m/rAEBvfb1FT |
| Rug | Quaternius | CC0 | https://poly.pizza/m/7H5qKjuxVY |
| Chandelier | CreativeTrio | CC0 | https://poly.pizza/m/RPLTkXHOOM |
| Wall painting | jeremy | CC BY | https://poly.pizza/m/62zn39CRkbG |
| Tall Vase | Jarlan Perez | CC BY | https://poly.pizza/m/52xZtzRG244 |
| Books | CreativeTrio | CC0 | https://poly.pizza/m/dxt7dETAy9 |
| Book Stack | Danni Bittman | CC BY | https://poly.pizza/m/1WggoIFq8tx |
| Bottle | Quaternius | CC0 | https://poly.pizza/m/FAHsHFXfTf |
| Cup | Kenney | CC0 | https://poly.pizza/m/aSF8ANEIsX |
| Candle | Nick Slough | CC BY | https://poly.pizza/m/HFpLq6iqKu |
| Pillow | Poly by Google | CC BY | https://poly.pizza/m/f60emm1Xkas |
| House plant | Poly by Google | CC BY | https://poly.pizza/m/3qh9saogdJd |
