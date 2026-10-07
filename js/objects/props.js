import * as THREE from 'three/webgpu'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import { MODELS, LAYOUT } from '../config.js'
import { placeModel } from './room.js'

const loader = new GLTFLoader()

export const createProps = async () => {
  const mesh = new THREE.Group()

  // load every prop model once, the copies are clones
  const models = [...new Set(LAYOUT.props.map((item) => item.model))]
  const gltfs = await Promise.all(models.map((model) => loader.loadAsync(MODELS.props[model].file)))
  const sources = {}
  models.forEach((model, i) => { sources[model] = gltfs[i].scene })

  const props = []
  const counts = {}
  LAYOUT.props.forEach((item) => {
    counts[item.model] = (counts[item.model] ?? 0) + 1
    const prop = placeModel(sources[item.model].clone(), {
      scale: MODELS.props[item.model].scale,
      position: item.position,
      rotationY: item.rotationY
    })
    // e.g. bookStack #2 -> Prop_BookStack_02
    const type = item.model[0].toUpperCase() + item.model.slice(1)
    prop.name = `Prop_${type}_${String(counts[item.model]).padStart(2, '0')}`
    mesh.add(prop)
    props.push(prop)
  })

  return { mesh, props }
}
