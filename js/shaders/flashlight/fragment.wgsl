// Room flashlight lighting (own shader): the room and furniture are lit only by
// the flashlight + a dim moonlight ambient. Same math as three's SpotLight + Lambert,
// so the room matches the props, which are lit by a real THREE.SpotLight.
fn flashlight(albedo: vec3f, worldPos: vec3f, normal: vec3f, lampPos: vec3f, lampDir: vec3f, cosOuter: f32, cosInner: f32, ambient: vec3f, lampColor: vec3f, range: f32) -> vec4f {
  let toPoint = worldPos - lampPos;
  let dist = length(toPoint);
  let dirToPoint = toPoint / max(dist, 0.001);
  // cone: 1 inside the inner cone, 0 outside the outer cone, soft edge (penumbra) in between
  let cone = smoothstep(cosOuter, cosInner, dot(dirToPoint, lampDir));
  // surfaces facing the lamp get the most light, surfaces turned away get none (Lambert)
  let facing = max(dot(normalize(normal), -dirToPoint), 0.0);
  // light gets weaker with distance squared, and fades to exactly 0 at `range`
  let rangeFade = pow(clamp(1.0 - pow(dist / range, 4.0), 0.0, 1.0), 2.0);
  let attenuation = rangeFade / max(dist * dist, 0.01);
  // lampColor already contains the intensity
  let light = ambient + lampColor * cone * facing * attenuation;
  // divide by PI: three's Lambert diffuse does the same, so the brightness matches the props
  return vec4f(albedo * light / 3.14159265, 1.0);
}
