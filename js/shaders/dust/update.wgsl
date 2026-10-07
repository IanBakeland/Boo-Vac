// Dust (own compute shader): the new velocity of one dust speck.
// Same suction formula as suctionForce() in physics.js (AGENTS.md §7), plus the course's
// compute-particle ideas: per-particle random, drag and a per-particle speed limit.
fn dustVelocity(position: vec3f, velocity: vec3f, nozzlePos: vec3f, nozzleDir: vec3f, power: f32, flowDir: f32, cosInner: f32, cosOuter: f32, range: f32, pullStrength: f32, swirlStrength: f32, blowStrength: f32, drag: f32, drift: f32, dt: f32, random: f32, iTime: f32) -> vec3f {
  // from the nozzle to the speck
  let d = position - nozzlePos;
  let dist = length(d);
  let dirOut = d / max(dist, 0.001);
  // only inside the cone in front of the nozzle (soft edge), strongest close to the nozzle
  let cone = smoothstep(cosOuter, cosInner, dot(dirOut, nozzleDir));
  let falloff = 1.0 - smoothstep(0.0, range, dist);
  let strength = cone * falloff * power;

  // suck: pull toward the nozzle + swirl around its axis (the 3D version of the course's tangent)
  let pull = -dirOut * pullStrength;
  let around = cross(nozzleDir, dirOut);
  let aroundLength = length(around);
  // a speck exactly on the axis has no "sideways": no swirl there
  let swirlDir = select(vec3f(0.0), around / aroundLength, aroundLength > 0.0001);
  // every speck swirls a bit differently (like the course's 0.5 + random)
  let swirl = swirlDir * swirlStrength * (0.5 + random);
  let suck = (pull + swirl) * strength;
  // blow: straight away from the nozzle
  let blow = dirOut * blowStrength * strength;
  let force = select(blow, suck, flowDir > 0.0);

  // when the vacuum is off, dust just floats: a slow wobble, different per speck
  let phase = random * 6.2831;
  let wander = vec3f(sin(iTime * 0.3 + phase), 0.5 * cos(iTime * 0.21 + phase * 2.0), cos(iTime * 0.27 + phase * 3.0)) * drift;

  var v = velocity + (force + wander) * dt;
  // air resistance (the course's velocity *= 0.995, but per second)
  v = v * max(1.0 - drag * dt, 0.0);
  // every speck has its own speed limit (like the course): some race in, some drift slowly
  let maxSpeed = 1.5 + random * 2.5;
  let speed = length(v);
  return select(v, v * (maxSpeed / speed), speed > maxSpeed);
}
