import * as THREE from 'three/webgpu'
import { wgslFn, uniform, uv, colorSpaceToWorking } from 'three/tsl'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import gsap from 'gsap'

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

// hidingSpots: the Hide_* furniture
export const createGhost = async ({ iTime, hidingSpots }) => {
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

  // the flashlight beam's cone angles (same numbers as the SpotLight)
  const outerAngle = THREE.MathUtils.degToRad(FLASHLIGHT.angle)
  const innerAngle = outerAngle * (1 - FLASHLIGHT.penumbra)

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

  // --- hiding: the ghost is invisible inside its spot until exposure reaches 1 ---
  // phase: 'hidden' (in the spot, trembling, only a small Ether wisp) or 'emerged' (out, visible in the beam)
  let phase = 'hidden'
  let exposure = 0
  // presence: 0 while hidden, fades to 1 when emerging (the model's opacity follows it)
  const fade = { presence: 0 }
  const spot = hidingSpots.find((s) => s.name === GHOST.hideSpot)
  // the spot's model inside its group: we shake that one, so the physics body stays untouched
  const spotModel = spot.children[0]
  const spotModelHome = spotModel.position.clone()
  const spotModelRotation = spotModel.rotation.clone()
  const spotCenter = new THREE.Vector3()
  const spotBox = new THREE.Box3()
  const randomBetween = ([min, max]) => min + Math.random() * (max - min)
  let trembleTimer = randomBetween(GHOST.trembleInterval)
  let trembleLeft = 0

  // rise out of the spot (a little toward the player, but never too close to them)
  const playerPosition = new THREE.Vector3()
  const emerge = () => {
    if (phase !== 'hidden') return
    phase = 'emerged'
    exposure = 1
    spotModel.position.copy(spotModelHome)
    spotModel.rotation.copy(spotModelRotation)
    const toPlayer = new THREE.Vector3().subVectors(playerPosition, spotCenter).setY(0)
    const step = Math.min(GHOST.emergeDistance, Math.max(0, toPlayer.length() - GHOST.minPlayerDistance))
    const target = toPlayer.normalize().multiplyScalar(step).add(spotCenter)
    // the ghost's middle ends up just above the spot
    target.y = spotBox.max.y + GHOST.emergeHeight - ETHER.centerHeight
    mesh.scale.setScalar(0.2)
    gsap.to(mesh.position, { x: target.x, y: target.y, z: target.z, duration: GHOST.emergeDuration, ease: 'power2.out' })
    gsap.to(mesh.scale, { x: 1, y: 1, z: 1, duration: GHOST.emergeDuration, ease: 'back.out' })
    gsap.to(fade, { presence: 1, duration: GHOST.emergeDuration })
    setState('emerged')
  }

  // a prop got sucked up: if it stood near the spot, the ghost is more exposed
  const onPropCaptured = (prop) => {
    if (phase === 'hidden' && prop.home.distanceTo(spotCenter) < GHOST.propRadius) exposure += GHOST.exposurePerProp
  }

  const shake = (amount) => (Math.random() - 0.5) * 2 * amount
  const updateHidden = (dt, { nozzle, power }) => {
    // trembling every few seconds: the spot shakes and wobbles
    trembleTimer -= dt
    if (trembleTimer <= 0) {
      trembleTimer = randomBetween(GHOST.trembleInterval)
      trembleLeft = GHOST.trembleDuration
    }
    spotModel.position.copy(spotModelHome)
    spotModel.rotation.copy(spotModelRotation)
    if (trembleLeft > 0) {
      trembleLeft -= dt
      spotModel.position.x += shake(GHOST.trembleAmount)
      spotModel.position.z += shake(GHOST.trembleAmount)
      spotModel.rotation.x += shake(GHOST.trembleAngle)
      spotModel.rotation.z += shake(GHOST.trembleAngle)
    }
    // exposure: rises while the suction cone reaches the spot
    if (suctionStrength(spotCenter, nozzle.position, nozzle.direction, power) > 0.05) exposure += GHOST.exposureRate * dt
    if (exposure >= 1) emerge()
  }

  const center = new THREE.Vector3()
  const toGhost = new THREE.Vector3()
  const toNozzle = new THREE.Vector3()
  const camRight = new THREE.Vector3()
  const camUp = new THREE.Vector3()
  let shown = 0

  // camera, lamp (position + direction), nozzle and the vacuum power drive the aura
  let time = 0
  const update = (dt, { camera, lampPos, lampDir, nozzle, power }) => {
    time += dt
    playerPosition.copy(camera.position)
    // the spot can move (the vase has physics): measure it every frame
    spotBox.setFromObject(spot).getCenter(spotCenter)
    // hint: how much of the Ether shows (only a small wisp while hidden, growing with the exposure)
    let hint = 1
    if (phase === 'hidden') {
      updateHidden(dt, { nozzle, power })
      // the ghost sits inside its spot: the wisp rises from the top of the spot
      mesh.position.copy(spotCenter)
      mesh.position.y = spotBox.max.y - ETHER.centerHeight
      const e = Math.min(exposure, 1)
      hint = THREE.MathUtils.lerp(GHOST.hintStrength[0], GHOST.hintStrength[1], e)
      aura.scale.setScalar(THREE.MathUtils.lerp(GHOST.hintSize[0], GHOST.hintSize[1], e))
    } else {
      aura.scale.setScalar(1)
      mixer.update(dt)
      // gentle floating up and down (on the model, so it doesn't fight the emerge tween on the root)
      model.position.y = Math.sin(time * GHOST.hoverSpeed) * GHOST.hoverAmount
    }
    // the model only shows once it's out
    model.visible = phase === 'emerged'
    center.copy(mesh.position)
    center.y += ETHER.centerHeight

    // visibility: is the ghost inside the flashlight cone, and close enough?
    toGhost.subVectors(center, lampPos)
    const dist = toGhost.length()
    // the ghost is a ball, not a point: widen the cone by the angle the ball covers from the lamp
    // (up close that's a lot, so a ghost half in the beam still counts)
    const spread = Math.atan(GHOST.visibleRadius / Math.max(dist, 0.1))
    const inBeam = THREE.MathUtils.smoothstep(toGhost.normalize().dot(lampDir), Math.cos(outerAngle + spread), Math.cos(innerAngle + spread))
    const near = 1 - THREE.MathUtils.smoothstep(dist, GHOST.visibleRange[0], GHOST.visibleRange[1])
    // ease toward the target, so it fades instead of popping
    shown += (inBeam * near - shown) * Math.min(1, dt * GHOST.visibilitySmoothing)
    // the aura: the beam visibility x the hint; the model: the beam visibility x its presence
    visibility.value = shown * hint
    modelMaterials.forEach((material) => { material.opacity = shown * fade.presence })
    // completely hidden: don't draw it at all
    mesh.visible = visibility.value > 0.01

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

  return { mesh, model, setState, getState: () => state, getExposure: () => Math.min(exposure, 1), emerge, onPropCaptured, update }
}
