import * as THREE from 'three/webgpu'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import { MODELS, LAYOUT } from '../config.js'

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

  // the house (Blender, real size, centered): walls, floors, ceilings and the signature,
  // all lit by ONE baked texture (same steps as the course's bake project)
  const bakedTexture = new THREE.TextureLoader().load(MODELS.house.baked)
  bakedTexture.flipY = false
  bakedTexture.colorSpace = THREE.SRGBColorSpace
  // one material for every mesh of the house: the bake is its color
  // (flashlight.lightUp turns it into the flashlight shader, with the baked texture as albedo)
  const bakedMaterial = new THREE.MeshStandardMaterial({ map: bakedTexture })
  const houseGltf = await loader.loadAsync(MODELS.house.file)
  const shell = houseGltf.scene
  shell.traverse((child) => {
    if (child.isMesh) child.material = bakedMaterial
  })
  shell.name = 'Room_Shell'
  mesh.add(shell)

  // furniture: load all files at the same time, then place each one
  const gltfs = await Promise.all(
    LAYOUT.furniture.map((item) => loader.loadAsync(MODELS.furniture[item.model].file))
  )
  const furniture = []
  const hidingSpots = []
  LAYOUT.furniture.forEach((item, i) => {
    const piece = placeModel(gltfs[i].scene, {
      scale: MODELS.furniture[item.model].scale,
      position: item.position,
      // dynamic furniture gets its rotation from its physics body
      rotationY: item.dynamic ? 0 : item.rotationY
    })
    piece.name = item.name
    piece.userData.layout = item
    mesh.add(piece)
    furniture.push(piece)
    if (item.name.startsWith('Hide_')) hidingSpots.push(piece)
  })

  return { mesh, shell, furniture, hidingSpots }
}
