// Flashlight beam (own shader): faint glowing cone of dusty air in front of the lamp
fn beam(uv: vec2f, iTime: f32, intensity: f32, facing: f32) -> vec4f {
  // CylinderGeometry: uv.y = 1 at the narrow end (the lamp), 0 at the far end
  // along: 0 at the lamp, 1 at the far end
  let along = 1.0 - uv.y;
  // brightest near the lamp, fading out with distance (and a quick fade-in right at the lamp)
  let lengthFade = (1.0 - along) * (1.0 - along) * smoothstep(0.0, 0.05, along);
  // facing: 1 where we look straight at the cone wall, 0 where we see it edge-on
  // fading the edge-on parts hides the hard outline of the cone
  let edge = smoothstep(0.0, 0.6, facing);
  // slowly drifting dusty air: noise that scrolls away from the lamp
  let dust = 0.6 + 0.4 * beamNoise(vec2f(uv.x * 12.0, along * 6.0 - iTime * 0.15), 12.0);
  let brightness = lengthFade * edge * dust * intensity;
  return vec4f(vec3f(1.0, 0.95, 0.85) * brightness, 1.0);
}

// GLSL mod (WGSL % behaves differently for negative numbers)
fn beamMod(x: f32, y: f32) -> f32 {
  return x - y * floor(x / y);
}

// random number 0-1 per grid cell
fn beamHash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
}

// value noise, x wraps every `period` cells (no seam around the cone)
fn beamNoise(p: vec2f, period: f32) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let x0 = beamMod(i.x, period);
  let x1 = beamMod(i.x + 1.0, period);
  let a = beamHash(vec2f(x0, i.y));
  let b = beamHash(vec2f(x1, i.y));
  let c = beamHash(vec2f(x0, i.y + 1.0));
  let d = beamHash(vec2f(x1, i.y + 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
