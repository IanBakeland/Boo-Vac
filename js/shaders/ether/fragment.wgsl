// https://www.shadertoy.com/view/MsjSW3
// Ether by nimitz 2014 (twitter: @stormoid)
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License
// Ported to WGSL for Boo-Vac. Added: tint, visibility, stretch, square-plane centering + round edge fade.

// main function first: wgslFn calls the first function in the file
fn ether(fragCoord: vec2f, iTime: f32, iResolution: vec2f, tint: vec3f, visibility: f32, stretch: vec2f) -> vec4f {
  // original: fragCoord / iResolution.y - vec2(.9, .5) (made for a 16:9 canvas)
  // our plane is square, so center the uv: (0, 0) is the middle of the plane
  let centered = fragCoord / iResolution - 0.5;
  // stretch: shift the sampling point more the further it is from the center,
  // so the smoke smears out in the stretch direction (toward the nozzle)
  let stretched = centered - stretch * length(centered);
  // scale > 1 zooms out, so the drifting blob stays inside the plane
  let p = stretched * 1.8;
  // soft round mask, so the square edge of the plane never shows
  let edgeFade = 1.0 - smoothstep(0.35, 0.5, length(centered));
  var cl = vec3f(0.0);
  var d = 2.5;
  for (var i = 0; i <= 5; i++) {
    // ray from the "camera" at z = 5 through this pixel, d units far
    let rayPos = vec3f(0.0, 0.0, 5.0) + normalize(vec3f(p, -1.0)) * d;
    let rz = etherMap(rayPos, iTime);
    // compare with a point a bit further: a cheap "how fast does the field change" = lighting
    let f = clamp((rz - etherMap(rayPos + 0.1, iTime)) * 0.5, -0.1, 1.0);
    let l = vec3f(0.1, 0.3, 0.4) + vec3f(5.0, 2.5, 3.0) * f;
    // original: smoothstep(2.5, .0, rz), written the safe way (WGSL wants low < high)
    cl = cl * l + (1.0 - smoothstep(0.0, 2.5, rz)) * 0.7 * l;
    d += min(rz, 1.0);
  }
  return vec4f(cl * tint * visibility * edgeFade, 1.0);
}

// 2D rotation matrix (original: m), same column-major layout as GLSL mat2
fn etherRot(a: f32) -> mat2x2f {
  let c = cos(a);
  let s = sin(a);
  return mat2x2f(c, -s, s, c);
}

// distance-like field of a rotating, noisy, twisted blob (original: map)
// t is passed in because WGSL has no #define t iTime
fn etherMap(pIn: vec3f, t: f32) -> f32 {
  var p = pIn;
  // original: p.xz *= m(t*0.4); WGSL can't assign to a swizzle, so rebuild the vector
  let xz = vec2f(p.x, p.z) * etherRot(t * 0.4);
  p = vec3f(xz.x, p.y, xz.y);
  // original: p.xy *= m(t*0.3);
  let xy = vec2f(p.x, p.y) * etherRot(t * 0.3);
  p = vec3f(xy.x, xy.y, p.z);
  let q = p * 2.0 + t;
  return length(p + vec3f(sin(t * 0.7))) * log(length(p) + 1.0) + sin(q.x + sin(q.z + sin(q.y))) * 0.5 - 1.0;
}
