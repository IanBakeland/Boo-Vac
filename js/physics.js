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

  // player: a capsule collider moved by a character controller (no rigid body: we move it ourselves)
  // it floats a bit above the floor, so rugs and small clutter don't block you
  const halfHeight = PLAYER.height / 2 - PLAYER.radius
  const centerY = PLAYER.floorGap + PLAYER.height / 2
  const playerPosition = new THREE.Vector3(LAYOUT.spawn.position[0], centerY, LAYOUT.spawn.position[2])
  const playerCollider = world.createCollider(
    RAPIER.ColliderDesc.capsule(halfHeight, PLAYER.radius).setTranslation(playerPosition.x, playerPosition.y, playerPosition.z)
  )
  // the controller keeps a tiny gap (offset) between the capsule and walls
  const controller = world.createCharacterController(PLAYER.skin)

  // try to move by `desired` (Vector3), slide along whatever is in the way; returns the new position
  const movePlayer = (desired) => {
    controller.computeColliderMovement(playerCollider, desired)
    const movement = controller.computedMovement()
    playerPosition.x += movement.x
    playerPosition.z += movement.z
    playerCollider.setTranslation(playerPosition)
    return playerPosition
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

  return { world, addTrimesh, addBox, movePlayer, step, debugLines, updateDebugLines }
}
