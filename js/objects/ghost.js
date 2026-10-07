import * as THREE from 'three/webgpu'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import { MODELS, GHOST } from '../config.js'

// game state -> animation clip in ghost.glb (made in Blender by Quaternius)
const CLIPS = {
  emerged: 'CharacterArmature|Flying_Idle',
  tug: 'CharacterArmature|HitReact',
  escape: 'CharacterArmature|Fast_Flying',
  giggle: 'CharacterArmature|Yes',
  captured: 'CharacterArmature|Death'
}
// these play once and then hold their last pose
const PLAY_ONCE = ['captured', 'giggle']

export const createGhost = async () => {
  const gltf = await new GLTFLoader().loadAsync(MODELS.ghost.file)

  // root: position + rotation of the ghost; the model inside is scaled to real size
  const mesh = new THREE.Group()
  const model = gltf.scene
  model.scale.setScalar(MODELS.ghost.scale)
  mesh.add(model)

  // the mixer plays the Blender animation clips on this model
  const mixer = new THREE.AnimationMixer(model)
  const actions = {}
  Object.entries(CLIPS).forEach(([state, clipName]) => {
    const clip = THREE.AnimationClip.findByName(gltf.animations, clipName)
    const action = mixer.clipAction(clip)
    if (PLAY_ONCE.includes(state)) {
      action.setLoop(THREE.LoopOnce)
      action.clampWhenFinished = true
    }
    actions[state] = action
  })

  let state = null
  // switch animation: the old clip fades out while the new one fades in
  const setState = (next) => {
    if (next === state) return
    const action = actions[next]
    action.reset().play()
    if (state) actions[state].crossFadeTo(action, GHOST.crossFade, false)
    state = next
  }
  setState('emerged')

  const update = (dt) => {
    mixer.update(dt)
  }

  return { mesh, model, setState, getState: () => state, update }
}
