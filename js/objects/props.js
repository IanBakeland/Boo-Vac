import * as THREE from 'three/webgpu'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import { MODELS, LAYOUT } from '../config.js'
import { placeModel } from './room.js'

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
    const body = physics.addProp({
      position: new THREE.Vector3().fromArray(item.position),
      rotationY: item.rotationY ?? 0,
      halfExtents: size.multiplyScalar(0.5),
      density: MODELS.props[item.model].density
    })
    props.push({ mesh: prop, body })
  })

  // copy every body's position and rotation onto its model (after the physics step)
  const update = () => {
    props.forEach(({ mesh, body }) => {
      mesh.position.copy(body.translation())
      mesh.quaternion.copy(body.rotation())
    })
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

  return { mesh, props, update, drop }
}
