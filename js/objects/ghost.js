import * as THREE from 'three/webgpu'
import { wgslFn, uniform, uv, colorSpaceToWorking } from 'three/tsl'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import { MODELS, GHOST, ETHER, FLASHLIGHT } from '../config.js'
import { suctionStrength } from '../physics.js'
import etherShader from '../shaders/ether/fragment.wgsl?raw'

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

export const createGhost = async ({ iTime }) => {
  const gltf = await new GLTFLoader().loadAsync(MODELS.ghost.file)

  // root: position + rotation of the ghost; the model inside is scaled to real size
  const mesh = new THREE.Group()
  const model = gltf.scene
  model.scale.setScalar(MODELS.ghost.scale)
  mesh.add(model)
  // the model fades with the visibility: its materials must be transparent
  const modelMaterials = []
  model.traverse((child) => {
    if (!child.isMesh) return
    child.material.transparent = true
    modelMaterials.push(child.material)
  })

  // --- Ether aura: the ported Shadertoy shader (S1) on a billboard around the ghost ---
  // uniforms are TSL nodes, we update their .value every frame
  // square plane, so the shader works in a 1 x 1 space
  const iResolution = uniform(new THREE.Vector2(1, 1))
  // per-ghost color (sRGB, like the shader's own colors)
  const tint = uniform(new THREE.Color().setRGB(...GHOST.tint, THREE.SRGBColorSpace))
  // how much the flashlight reveals the ghost (0-1)
  const visibility = uniform(0)
  // screen-space direction x amount the smoke smears toward the nozzle
  const stretch = uniform(new THREE.Vector2(0, 0))
  const ether = wgslFn(etherShader)
  // additive: black adds nothing, so the black background of the shader is invisible
  const auraMaterial = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
  // the shadertoy shader outputs display-ready (sRGB) colors, tell three to treat them as such
  auraMaterial.colorNode = colorSpaceToWorking(ether({
    fragCoord: uv().mul(iResolution),
    iTime,
    iResolution,
    tint,
    visibility,
    stretch
  }), THREE.SRGBColorSpace)
  const aura = new THREE.Mesh(new THREE.PlaneGeometry(ETHER.size, ETHER.size), auraMaterial)
  aura.position.y = ETHER.centerHeight
  mesh.add(aura)

  // the flashlight beam's cone, as cosines (same numbers as the SpotLight)
  const beamAngle = THREE.MathUtils.degToRad(FLASHLIGHT.angle)
  const cosOuter = Math.cos(beamAngle)
  const cosInner = Math.cos(beamAngle * (1 - FLASHLIGHT.penumbra))

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

  const center = new THREE.Vector3()
  const toGhost = new THREE.Vector3()
  const toNozzle = new THREE.Vector3()
  const camRight = new THREE.Vector3()
  const camUp = new THREE.Vector3()
  let shown = 0

  // camera, lamp (position + direction), nozzle and the vacuum power drive the aura
  const update = (dt, { camera, lampPos, lampDir, nozzle, power }) => {
    mixer.update(dt)
    center.copy(mesh.position)
    center.y += ETHER.centerHeight

    // visibility: is the ghost inside the flashlight cone, and close enough?
    toGhost.subVectors(center, lampPos)
    const dist = toGhost.length()
    const inBeam = THREE.MathUtils.smoothstep(toGhost.normalize().dot(lampDir), cosOuter, cosInner)
    const near = 1 - THREE.MathUtils.smoothstep(dist, GHOST.visibleRange[0], GHOST.visibleRange[1])
    // ease toward the target, so it fades instead of popping
    shown += (inBeam * near - shown) * Math.min(1, dt * GHOST.visibilitySmoothing)
    visibility.value = shown
    modelMaterials.forEach((material) => { material.opacity = shown })
    // completely hidden: don't draw it at all
    mesh.visible = shown > 0.01

    // the ghost turns to face you (only around the vertical axis)
    mesh.rotation.y = Math.atan2(camera.position.x - mesh.position.x, camera.position.z - mesh.position.z)
    // billboard: the aura faces the camera (undo the ghost's own rotation)
    aura.quaternion.copy(mesh.quaternion).invert().multiply(camera.quaternion)
    // the ghost faces you, so its local +z points at you: move the aura a bit forward
    aura.position.set(0, ETHER.centerHeight, ETHER.forward)

    // stretch: smear the smoke toward the nozzle, in the aura's own (screen) directions
    toNozzle.subVectors(nozzle.position, center)
    camRight.setFromMatrixColumn(camera.matrixWorld, 0)
    camUp.setFromMatrixColumn(camera.matrixWorld, 1)
    stretch.value.set(toNozzle.dot(camRight), toNozzle.dot(camUp)).normalize()
    // as strong as the suction reaches the ghost (and only while sucking)
    const pull = suctionStrength(center, nozzle.position, nozzle.direction, power)
    stretch.value.multiplyScalar(pull * ETHER.maxStretch)
  }

  return { mesh, model, setState, getState: () => state, update }
}
