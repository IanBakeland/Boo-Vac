import * as THREE from 'three/webgpu'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import gsap from 'gsap'

import { MODELS, LAYOUT, TANK, PHYSICS } from '../config.js'
import { placeModel } from './room.js'
import { suctionForce, suctionStrength } from '../physics.js'

const loader = new GLTFLoader()

export const createProps = async ({ physics }) => {
  const mesh = new THREE.Group()

  // load every prop model once, the copies are clones
  const models = [...new Set(LAYOUT.props.map((item) => item.model))]
  const gltfs = await Promise.all(models.map((model) => loader.loadAsync(MODELS.props[model].file)))
  const sources = {}
  models.forEach((model, i) => { sources[model] = gltfs[i].scene })

  // every prop is a pair: the visible group + its physics body
  const props = []
  const counts = {}
  LAYOUT.props.forEach((item) => {
    counts[item.model] = (counts[item.model] ?? 0) + 1
    // placed unrotated at the origin: the physics body does the position and rotation
    const prop = placeModel(sources[item.model].clone(), {
      scale: MODELS.props[item.model].scale,
      position: [0, 0, 0]
    })
    // e.g. bookStack #2 -> Prop_BookStack_02
    const type = item.model[0].toUpperCase() + item.model.slice(1)
    prop.name = `Prop_${type}_${String(counts[item.model]).padStart(2, '0')}`
    mesh.add(prop)

    const size = new THREE.Box3().setFromObject(prop, true).getSize(new THREE.Vector3())
    const halfExtents = size.clone().multiplyScalar(0.5)
    const density = MODELS.props[item.model].density
    const body = physics.addProp({
      position: new THREE.Vector3().fromArray(item.position),
      rotationY: item.rotationY ?? 0,
      halfExtents,
      density
    })
    // small enough to fit in the vacuum?
    const suckable = Math.max(size.x, size.y, size.z) < TANK.captureMaxSize
    // body = null once the prop is in the tank
    props.push({ mesh: prop, body, halfExtents, density, suckable })
  })

  // copy every body's position and rotation onto its model (after the physics step)
  const update = () => {
    props.forEach(({ mesh, body }) => {
      if (!body) return
      mesh.position.copy(body.translation())
      mesh.quaternion.copy(body.rotation())
    })
  }

  // every physics step while the vacuum runs: push each prop with the shared suction force
  const force = new THREE.Vector3()
  const applySuction = (nozzle, power, mode, stepDt) => {
    if (power <= 0) return
    props.forEach(({ body }) => {
      if (!body) return
      const com = body.worldCom()
      suctionForce(com, nozzle.position, nozzle.direction, power, mode, force)
      // outside the cone: don't touch it (and don't wake it up)
      if (force.lengthSq() < 1e-6) return
      // the air flow carries the prop: inside the cone gravity is cancelled
      // (fully at full strength), otherwise floor props would only slide under the nozzle
      if (mode === 'suck') force.y -= PHYSICS.gravity * suctionStrength(com, nozzle.position, nozzle.direction, power)
      // (the drag below runs after the impulse, in the same step)
      // force = acceleration x mass, impulse = force x time
      force.multiplyScalar(body.mass() * stepDt)
      body.applyImpulse(force, true)
      // drag (like the course's velocity *= 0.995): stronger where the suction is stronger,
      // so props slow down near the nozzle instead of flying past it
      const strength = suctionStrength(com, nozzle.position, nozzle.direction, power)
      let k = Math.max(0, 1 - TANK.drag * strength * stepDt)
      // speed limit, so props don't shoot around like bullets
      const v = body.linvel()
      const speed = Math.hypot(v.x, v.y, v.z) * k
      if (speed > TANK.maxPropSpeed) k *= TANK.maxPropSpeed / speed
      body.setLinvel({ x: v.x * k, y: v.y * k, z: v.z * k }, true)
    })
  }

  // small props close to the nozzle disappear into the tank; returns how many were sucked in
  const tank = []
  const capture = (nozzle) => {
    let count = 0
    props.forEach((prop) => {
      if (!prop.body || !prop.suckable || tank.length >= TANK.capacity) return
      const com = prop.body.worldCom()
      const dist = Math.hypot(com.x - nozzle.position.x, com.y - nozzle.position.y, com.z - nozzle.position.z)
      if (dist > TANK.captureDistance) return
      // no more physics for this prop: remove its body, shrink the model away
      physics.world.removeRigidBody(prop.body)
      prop.body = null
      gsap.to(prop.mesh.scale, {
        x: 0, y: 0, z: 0,
        duration: TANK.shrinkDuration,
        ease: 'power2.in',
        onComplete: () => { prop.mesh.visible = false }
      })
      tank.push(prop)
      count++
    })
    return count
  }
  update()

  // debug: lift every prop 1 m and let it drop
  const drop = () => {
    props.forEach(({ body }) => {
      const t = body.translation()
      body.setTranslation({ x: t.x, y: t.y + 1, z: t.z }, true)
      body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    })
  }

  return { mesh, props, tank, update, applySuction, capture, drop }
}
