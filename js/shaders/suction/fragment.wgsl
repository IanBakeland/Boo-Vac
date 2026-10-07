// Suction cone (own shader): swirling air streaks flowing into the nozzle
// flowDir: 1 = suck (spiral in toward the nozzle), -1 = blow (straight out, no swirl)
fn suction(uv: vec2f, iTime: f32, power: f32, flowDir: f32) -> vec4f {
  // CylinderGeometry: uv.y = 1 at the narrow end (nozzle), 0 at the wide end
  // along: 0 at the nozzle, 1 at the wide end
  let along = 1.0 - uv.y;
  // swirl only while sucking (blowing pushes straight out)
  let swirl = max(flowDir, 0.0);
  // twist grows near the nozzle (squared: stronger the closer), so the streaks spiral in
  // in turns: 0.25 = a quarter turn between the wide end and the nozzle
  let twist = (1.0 - along) * (1.0 - along) * 0.25 * swirl;
  // uv.x goes around the cone: scrolling it with time = swirl
  let around = uv.x + iTime * 0.35 * swirl + twist;
  // scrolling "along" with time moves the pattern toward the nozzle (suck) or away from it (blow)
  let flow = along * 3.0 + iTime * 1.5 * flowDir;
  // two layers of noise: big soft shapes + finer detail
  // more cells around than along: long thin streaks in the flow direction
  let n = suctionNoise(vec2f(around * 12.0, flow * 0.5), 12.0) * 0.6
        + suctionNoise(vec2f(around * 24.0, flow), 24.0) * 0.4;
  // keep only the brighter parts as soft streaks
  let streaks = smoothstep(0.45, 0.85, n);
  // fade in just after the nozzle, fade out toward the wide end
  let ends = smoothstep(0.0, 0.08, along) * (1.0 - smoothstep(0.6, 1.0, along));
  // power 0 = fully invisible (additive: black adds nothing)
  let brightness = streaks * ends * power * 0.5;
  return vec4f(vec3f(0.75, 0.85, 1.0) * brightness, 1.0);
}

// GLSL mod (WGSL % behaves differently for negative numbers)
fn suctionMod(x: f32, y: f32) -> f32 {
  return x - y * floor(x / y);
}

// random number 0-1 per grid cell (same trick as the course compute lesson)
fn suctionHash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
}

// value noise: random value per grid corner, smoothly blended in between
// x wraps every `period` cells, so there is no visible seam where uv.x goes from 1 back to 0
fn suctionNoise(p: vec2f, period: f32) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let x0 = suctionMod(i.x, period);
  let x1 = suctionMod(i.x + 1.0, period);
  let a = suctionHash(vec2f(x0, i.y));
  let b = suctionHash(vec2f(x1, i.y));
  let c = suctionHash(vec2f(x0, i.y + 1.0));
  let d = suctionHash(vec2f(x1, i.y + 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
