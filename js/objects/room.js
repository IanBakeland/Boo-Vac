import * as THREE from 'three/webgpu'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import { ROOM, MODELS, LAYOUT } from '../config.js'

const loader = new GLTFLoader()

// Scale + rotate a model, then shift it so its bottom-center sits on `position`.
// Downloaded models all have their origin somewhere else, this makes placing them predictable.
export const placeModel = (model, { scale, position, rotationY = 0 }) => {
  model.scale.setScalar(scale)
  model.rotation.y = THREE.MathUtils.degToRad(rotationY)
  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model, true)
  const center = box.getCenter(new THREE.Vector3())
  // wrap it in a group: the group's position is now the model's bottom-center
  const group = new THREE.Group()
  model.position.set(-center.x, -box.min.y, -center.z)
  group.add(model)
  group.position.fromArray(position)
  return group
}

export const createRoom = async () => {
  const mesh = new THREE.Group()

  // the downloaded room: stretched to ROOM size, floor at y = 0 (numbers in MODELS.room)
  const roomGltf = await loader.loadAsync(MODELS.room.file)
  const shell = roomGltf.scene
  shell.scale.fromArray(MODELS.room.scale)
  shell.position.fromArray(MODELS.room.position)
  shell.traverse((child) => {
    if (MODELS.room.hide.includes(child.name)) child.visible = false
  })
  shell.name = 'Room_Shell'
  mesh.add(shell)

  // the room has no ceiling: a plane facing down
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.width, ROOM.depth),
    new THREE.MeshStandardMaterial({ color: LAYOUT.ceilingColor })
  )
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.y = ROOM.height
  ceiling.name = 'Room_Ceiling'
  mesh.add(ceiling)

  // fake window: unlit, so it glows in the dark
  const win = LAYOUT.window
  const windowGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(win.width, win.height),
    new THREE.MeshBasicMaterial({ color: win.color })
  )
  // face into the room (-x)
  windowGlow.rotation.y = -Math.PI / 2
  windowGlow.position.fromArray(win.position)
  windowGlow.name = 'Window_Glow'
  mesh.add(windowGlow)

  // furniture: load all files at the same time, then place each one
  const gltfs = await Promise.all(
    LAYOUT.furniture.map((item) => loader.loadAsync(MODELS.furniture[item.model].file))
  )
  const hidingSpots = []
  LAYOUT.furniture.forEach((item, i) => {
    const piece = placeModel(gltfs[i].scene, {
      scale: MODELS.furniture[item.model].scale,
      position: item.position,
      rotationY: item.rotationY
    })
    piece.name = item.name
    mesh.add(piece)
    if (item.name.startsWith('Hide_')) hidingSpots.push(piece)
  })

  return { mesh, hidingSpots }
}
