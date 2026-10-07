// Rapier physics: https://rapier.rs/docs/user_guides/javascript/getting_started_js
// (beyond the course: physics engine, compiled to WebAssembly)
import * as THREE from 'three/webgpu'
import RAPIER from '@dimforge/rapier3d-compat'

import { PHYSICS, PLAYER, LAYOUT } from './config.js'

export const createPhysics = async () => {
  // the WebAssembly module must be loaded before anything else
  await RAPIER.init()
  const world = new RAPIER.World({ x: 0, y: PHYSICS.gravity, z: 0 })
  world.timestep = PHYSICS.fixedStep

  // static triangle-mesh collider for every visible mesh in `object` (walls, floors, its furniture)
  const addTrimesh = (object) => {
    object.updateMatrixWorld(true)
    const v = new THREE.Vector3()
    object.traverse((child) => {
      if (!child.isMesh || !child.visible) return
      const position = child.geometry.attributes.position
      // Rapier wants the vertices in world space, as one flat array x, y, z, x, y, z, ...
      const vertices = new Float32Array(position.count * 3)
      for (let i = 0; i < position.count; i++) {
        v.fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld)
        vertices.set([v.x, v.y, v.z], i * 3)
      }
      const index = child.geometry.index
      const indices = index ? new Uint32Array(index.array) : Uint32Array.from({ length: position.count }, (_, i) => i)
      world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices))
    })
  }

  // static box collider around `object` (its world-space bounding box)
  const addBox = (object) => {
    const box = new THREE.Box3().setFromObject(object, true)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2).setTranslation(center.x, center.y, center.z)
    )
  }

  // a dynamic prop: box collider around the (unrotated) model, origin at its bottom-center
  // CCD = continuous collision detection: fast small objects can't tunnel through walls
  const up = new THREE.Vector3(0, 1, 0)
  const addProp = ({ position, rotationY, halfExtents, density }) => {
    const rotation = new THREE.Quaternion().setFromAxisAngle(up, THREE.MathUtils.degToRad(rotationY))
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y + PHYSICS.propLift, position.z)
        .setRotation(rotation)
        .setCcdEnabled(true)
    )
    // the box is shifted up by half its height, so the body's origin is the model's bottom-center
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
        .setTranslation(0, halfExtents.y, 0)
        .setDensity(density),
      body
    )
    return body
  }

  // player: a capsule standing on the floor, moved by a character controller
  // (no rigid body: we move it ourselves, the controller tells us how far we can go)
  const halfHeight = PLAYER.height / 2 - PLAYER.radius
  const spawn = new THREE.Vector3(LAYOUT.spawn.position[0], PLAYER.height / 2, LAYOUT.spawn.position[2])
  const playerPosition = spawn.clone()
  const playerCollider = world.createCollider(
    RAPIER.ColliderDesc.capsule(halfHeight, PLAYER.radius).setTranslation(spawn.x, spawn.y, spawn.z)
  )
  // the controller keeps a tiny gap (offset) between the capsule and everything else
  const controller = world.createCharacterController(PLAYER.skin)
  // walk over rugs and low clutter, but not onto props (they'd wobble under you)
  controller.enableAutostep(PLAYER.stepHeight, 0.1, false)
  controller.enableSnapToGround(PLAYER.snapDistance)
  // walking into props pushes them. The push is based on the character's mass:
  // our capsule has no rigid body, so without this Rapier assumes 0 kg and nothing moves
  controller.setApplyImpulsesToDynamicBodies(true)
  controller.setCharacterMass(PLAYER.mass)

  // try to move by `desired` (Vector3): the capsule is swept along the way and stops at the first
  // contact (sliding along it), so it can't glitch through walls or floors, even when falling fast
  const movePlayer = (desired) => {
    controller.computeColliderMovement(playerCollider, desired)
    const movement = controller.computedMovement()
    playerPosition.add(movement)
    // safety net: if we ever end up under the floor, go back to the spawn point
    if (playerPosition.y < PLAYER.killY) playerPosition.copy(spawn)
    playerCollider.setTranslation(playerPosition)
    return { position: playerPosition, movement, grounded: controller.computedGrounded() }
  }

  // fixed 60 Hz steps, so physics behaves the same at any framerate (max a few steps per frame)
  let accumulator = 0
  const step = (dt) => {
    accumulator += dt
    let steps = 0
    while (accumulator >= PHYSICS.fixedStep && steps < PHYSICS.maxSteps) {
      world.step()
      accumulator -= PHYSICS.fixedStep
      steps++
    }
    // too far behind (e.g. a lag spike): drop the rest instead of catching up forever
    if (steps === PHYSICS.maxSteps) accumulator = 0
  }

  // debug: every collider as lines (Rapier generates them)
  const debugLines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ vertexColors: true })
  )
  const updateDebugLines = () => {
    const { vertices, colors } = world.debugRender()
    debugLines.geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
    debugLines.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4))
  }

  return { world, addTrimesh, addBox, addProp, movePlayer, step, debugLines, updateDebugLines }
}
