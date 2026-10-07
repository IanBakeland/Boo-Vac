// Dust specks on the GPU: compute shader with storage buffers (beyond the course's raw-WebGPU compute
// lesson: the Three.js way), structure from the official example
// https://threejs.org/examples/?q=compute#webgpu_compute_particles
import * as THREE from 'three/webgpu'
import { Fn, If, uniform, float, vec3, color, mix, hash, smoothstep, shapeCircle, instancedArray, instanceIndex, wgslFn } from 'three/tsl'

import { DUST, ROOM, SUCTION } from '../config.js'
import updateShader from '../shaders/dust/update.wgsl?raw'

export const createDust = ({ iTime, nozzle, lamp }) => {
  const count = DUST.count
  // GPU buffers: one vec3 per speck
  const positions = instancedArray(count, 'vec3')
  const velocities = instancedArray(count, 'vec3')

  // uniforms we update every frame
  const dt = uniform(0)
  const power = uniform(0)
  const flowDir = uniform(1)
  // changes every frame, so respawned specks land on a new random spot
  const seed = uniform(0)
  const nozzlePos = uniform(nozzle.position)
  const nozzleDir = uniform(nozzle.direction)
  // a puff of dust out of a hiding spot: for one frame, burstAmount of all specks jump there
  const burstPos = uniform(new THREE.Vector3())
  const burstAmount = uniform(0)
  const burstRadius = uniform(0)

  // a random spot in the apartment; `s` = seed (every speck and frame gets other random numbers)
  const randomSpot = (s) => vec3(
    mix(-ROOM.width / 2, ROOM.width / 2, hash(s)),
    mix(DUST.minY, ROOM.height - 0.05, hash(s.add(2e6))),
    mix(-ROOM.depth / 2, ROOM.depth / 2, hash(s.add(4e6)))
  )

  // run once: spread the dust through the apartment
  const init = Fn(() => {
    positions.element(instanceIndex).assign(randomSpot(float(instanceIndex)))
  })().compute(count)

  const dustVelocity = wgslFn(updateShader)
  const update = Fn(() => {
    const position = positions.element(instanceIndex)
    const velocity = velocities.element(instanceIndex)
    // per-speck random number, the same every frame (like the course's fract(sin(i * 12.9898) ...))
    const random = hash(float(instanceIndex).add(6e6))

    const newVelocity = dustVelocity({
      position, velocity,
      nozzlePos, nozzleDir, power, flowDir,
      cosInner: Math.cos(THREE.MathUtils.degToRad(SUCTION.innerAngle)),
      cosOuter: Math.cos(THREE.MathUtils.degToRad(SUCTION.outerAngle)),
      range: SUCTION.range,
      pullStrength: SUCTION.pullStrength,
      swirlStrength: SUCTION.swirlStrength,
      blowStrength: SUCTION.blowStrength,
      drag: DUST.drag,
      drift: DUST.drift,
      dt, random, iTime
    }).toVar()
    velocity.assign(newVelocity)
    position.addAssign(newVelocity.mul(dt))

    // sucked into the nozzle, or out of the apartment: respawn somewhere random
    const sucked = position.distance(nozzlePos).lessThan(DUST.respawnDistance).and(flowDir.greaterThan(0)).and(power.greaterThan(0.1))
    const outside = position.y.lessThan(0).or(position.y.greaterThan(ROOM.height))
      .or(position.x.abs().greaterThan(ROOM.width / 2)).or(position.z.abs().greaterThan(ROOM.depth / 2))
    If(sucked.or(outside), () => {
      position.assign(randomSpot(float(instanceIndex).add(seed)))
      velocity.assign(vec3(0))
    })

    // burst: a random part of the specks (different every frame) puffs out of the hiding spot
    const s = float(instanceIndex).add(seed).add(8e6)
    If(hash(s).lessThan(burstAmount), () => {
      // random direction around the spot (-1..1 on every axis), mostly sideways and a bit down
      const dir = vec3(hash(s.add(1e6)), hash(s.add(2e6)), hash(s.add(3e6))).mul(2).sub(1)
      position.assign(burstPos.add(dir.mul(burstRadius)))
      velocity.assign(dir.mul(vec3(0.6, 0.3, 0.6)))
    })
  })().compute(count)

  // drawing: one tiny round sprite per speck, position straight from the GPU buffer
  const material = new THREE.SpriteNodeMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
  const position = positions.toAttribute()
  material.positionNode = position
  material.scaleNode = uniform(DUST.size)
  // glitter in the flashlight beam: same cone math as the flashlight shader
  const toSpeck = position.sub(lamp.lampPos)
  const inBeam = smoothstep(lamp.cosOuter, lamp.cosInner, toSpeck.normalize().dot(lamp.lampDir))
  const beamFade = float(1).sub(smoothstep(0, DUST.beamRange, toSpeck.length()))
  const brightness = inBeam.mul(beamFade).mul(DUST.beamGlow).add(DUST.baseGlow)
  material.colorNode = color(DUST.color).mul(brightness)
  // round instead of square
  material.opacityNode = shapeCircle()

  const mesh = new THREE.Sprite(material)
  mesh.count = count
  // the dust is everywhere: never skip drawing it
  mesh.frustumCulled = false

  let frame = 0
  // call every frame before rendering
  const updateDust = (renderer, delta, vacuumPower, mode) => {
    dt.value = delta
    power.value = vacuumPower
    flowDir.value = mode === 'blow' ? -1 : 1
    frame++
    // keep the seed below 2^24 so it stays an exact whole number in a float
    seed.value = (frame * 7919) % 1e6 + 1e6
    renderer.compute(update)
    // a burst only lasts one frame
    burstAmount.value = 0
  }

  // puff of dust at `position` (Vector3), `amount` = part of all specks (0-1)
  const burst = (position, amount, radius) => {
    burstPos.value.copy(position)
    burstAmount.value = amount
    burstRadius.value = radius
  }

  return { mesh, init, update: updateDust, burst }
}
