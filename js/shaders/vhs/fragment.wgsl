// https://www.shadertoy.com/view/ldjGzV
// VCR distortion by ryk
// License CC BY-NC-SA 4.0 (https://creativecommons.org/licenses/by-nc-sa/4.0/)
// Ported to WGSL for Boo-Vac as a post-processing filter over the whole game.
// Changes: iChannel0 = the rendered scene, the noise texture (iChannel1) is replaced by a hash,
// every effect has a strength (calm when a tug-of-war starts, stronger as its meter fills),
// and amount 0 = the untouched scene (the filter is only on during a tug, see js/postfx.js).

// main function first: wgslFn calls the first function in the file
fn vhs(sceneTex: texture_2d<f32>, sceneTexSampler: sampler, uv: vec2f, iTime: f32, amount: f32, grain: f32, stripes: f32, wobble: f32, roll: f32, vignette: f32) -> vec4f {
  // original: uv = fragCoord.xy / iResolution.xy, then screenDistort(uv)
  // the curve of an old TV screen, faded in with amount
  let curved = mix(uv, vhsScreenDistort(uv), amount);
  var video = vhsGetVideo(sceneTex, sceneTexSampler, curved, iTime, wobble, roll);

  // vignette: dark edges that breathe a little (original strength 3, here tunable)
  let vigAmt = vignette * (1.0 + 0.1 * sin(iTime + 5.0 * cos(iTime * 5.0)));
  let vig = (1.0 - vigAmt * (curved.y - 0.5) * (curved.y - 0.5)) * (1.0 - vigAmt * (curved.x - 0.5) * (curved.x - 0.5));

  // a bright noisy band rolling over the screen + film grain
  video += vhsStripes(curved, iTime) * stripes;
  video += vhsNoise(curved * 2.0, iTime) * 0.5 * grain;
  video *= max(vig, 0.0);
  // scanlines: every line a tiny bit darker at its top
  video *= (12.0 + vhsMod(curved.y * 30.0 + iTime, 1.0)) / 13.0;

  // amount 0 (intro, ending) = the scene exactly as it was rendered
  let scene = textureSample(sceneTex, sceneTexSampler, uv).rgb;
  return vec4f(mix(scene, video, amount), 1.0);
}

// GLSL mod (WGSL % is different for negative numbers)
fn vhsMod(x: f32, y: f32) -> f32 {
  return x - y * floor(x / y);
}

// random number 0-1 per grid cell (same trick as the course compute lesson)
fn vhsHash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
}

// original: a lookup in a noise texture that jumps with time, squared
// here: a hash per small cell, a new random offset every frame, squared (mostly dark, a few bright specks)
fn vhsNoise(p: vec2f, iTime: f32) -> f32 {
  let offset = vec2f(fract(iTime * 7.13), fract(iTime * 3.71)) * 100.0;
  let s = vhsHash(floor(p * 400.0) + floor(offset));
  return s * s;
}

// 1 when sin(...) is above c: switches an effect on and off at irregular times
fn vhsOnOff(a: f32, b: f32, c: f32, iTime: f32) -> f32 {
  return step(c, sin(iTime + a * cos(iTime * b)));
}

// 1 at start, fading to 0 at end, 0 outside: the shape of the rolling band
fn vhsRamp(y: f32, start: f32, end: f32) -> f32 {
  let inside = step(start, y) - step(end, y);
  let fact = (y - start) / (end - start) * inside;
  return (1.0 - fact) * inside;
}

fn vhsStripes(uv: vec2f, iTime: f32) -> f32 {
  let noi = vhsNoise(uv * vec2f(0.5, 1.0) + vec2f(1.0, 3.0), iTime);
  return vhsRamp(vhsMod(uv.y * 4.0 + iTime / 2.0 + sin(iTime + sin(iTime * 0.63)), 1.0), 0.5, 0.6) * noi;
}

fn vhsGetVideo(sceneTex: texture_2d<f32>, sceneTexSampler: sampler, uv: vec2f, iTime: f32, wobble: f32, roll: f32) -> vec3f {
  // no swizzle assignment needed: look starts as a copy and x / y are changed one at a time
  var look = uv;
  // a horizontal band (window) moves down the screen; inside it the picture waves sideways
  let band = look.y - vhsMod(iTime / 4.0, 1.0);
  let bandMask = 1.0 / (1.0 + 20.0 * band * band);
  look.x = look.x + sin(look.y * 10.0 + iTime) / 50.0 * vhsOnOff(4.0, 4.0, 0.3, iTime) * (1.0 + cos(iTime * 80.0)) * bandMask * wobble;
  // the whole picture jumps up (a bad tape tracking): original 0.4, here scaled by roll (0 while calm)
  let vShift = 0.4 * roll * vhsOnOff(2.0, 3.0, 0.9, iTime) * (sin(iTime) * sin(iTime * 20.0) + (0.5 + 0.1 * sin(iTime * 200.0) * cos(iTime)));
  look.y = vhsMod(look.y + vShift, 1.0);
  return textureSample(sceneTex, sceneTexSampler, look).rgb;
}

// bulge the picture like a curved TV screen: strongest in the corners
fn vhsScreenDistort(uvIn: vec2f) -> vec2f {
  var uv = uvIn - vec2f(0.5, 0.5);
  uv = uv * 1.2 * (1.0 / 1.2 + 2.0 * uv.x * uv.x * uv.y * uv.y);
  return uv + vec2f(0.5, 0.5);
}
