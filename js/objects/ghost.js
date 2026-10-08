import * as THREE from 'three/webgpu'
import { wgslFn, uniform, uv, colorSpaceToWorking } from 'three/tsl'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import gsap from 'gsap'

import { MODELS, GHOST, ETHER, FLASHLIGHT, TUG, THROW } from '../config.js'
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

// One ghost (one entry of GHOSTS in config.js). All ghosts hide at the same time.
// hidingSpots: the Hide_* furniture, castAim: physics ray (how far until something is in the way)
// takenSpots(): spot names other ghosts are in, canStartTug(): false while another ghost is in a tug
// onCapture / onEscape: called when this ghost is sucked up / gets away
// onThrow(center): the Librarian throws a book from near `center`
export const createGhost = async ({ iTime, config, hidingSpots, castAim, takenSpots, canStartTug, onCapture, onEscape, onThrow }) => {
  const gltf = await new GLTFLoader().loadAsync(MODELS.ghost.file)
  // its tug-of-war numbers: TUG + its own personality overrides
  const tugConfig = { ...TUG, ...config.tug }

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
  // this ghost's color (sRGB, like the shader's own colors)
  const tint = uniform(new THREE.Color().setRGB(...config.tint, THREE.SRGBColorSpace))
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

  // --- hiding: the ghost is invisible inside its spot until exposure reaches 1 ---
  // phase: 'hidden' (in the spot, trembling, only a small Ether wisp), 'emerged' (out, visible in the beam)
  // 'tug' (tug-of-war with the player), 'escaping' (flying to another spot), 'captured' (spiralling
  // into the nozzle) or 'done' (caught)
  let phase = 'hidden'
  let exposure = 0
  // presence: 0 while hidden, fades to 1 when emerging (the model's opacity follows it)
  const fade = { presence: 0 }
  // the spot's model inside its group: we shake that one, so the physics body stays untouched
  let spot = null
  let spotModel = null
  // while escaping: the spot it flies to (so other ghosts don't pick it too)
  let targetSpot = null
  const spotModelHome = new THREE.Vector3()
  const spotModelRotation = new THREE.Euler()
  const spotCenter = new THREE.Vector3()
  const spotBox = new THREE.Box3()
  // the spot plus a margin: aiming anywhere at it counts
  const aimBox = new THREE.Box3()
  const randomBetween = ([min, max]) => min + Math.random() * (max - min)
  let trembleTimer = 0
  let trembleLeft = 0

  // put the spot's model back where it belongs (it may have been shaking)
  const restoreSpot = () => {
    if (!spotModel) return
    spotModel.position.copy(spotModelHome)
    spotModel.rotation.copy(spotModelRotation)
  }

  // hide (again) in a spot: invisible, exposure back to 0
  const hideIn = (spotName) => {
    restoreSpot()
    spot = hidingSpots.find((s) => s.name === spotName)
    spotModel = spot.children[0]
    spotModelHome.copy(spotModel.position)
    spotModelRotation.copy(spotModel.rotation)
    targetSpot = null
    phase = 'hidden'
    exposure = 0
    fade.presence = 0
    mesh.scale.setScalar(1)
    trembleTimer = randomBetween(GHOST.trembleInterval)
    setState('emerged')
  }

  // the tug is lost: fly to a free other hiding spot and hide there (Dusty giggles first)
  let giggleCall = null
  const escape = () => {
    phase = 'escaping'
    // pick the spot now, so no other ghost takes it while this one is on its way
    const taken = takenSpots()
    const free = hidingSpots.filter((s) => s !== spot && !taken.includes(s.name))
    targetSpot = free.length ? free[Math.floor(Math.random() * free.length)].name : spot.name
    if (config.giggle) {
      setState('giggle')
      giggleCall = gsap.delayedCall(THROW.giggleTime, flyAway)
    } else flyAway()
    onEscape?.(config)
  }
  const flyAway = () => {
    setState('escape')
    const next = hidingSpots.find((s) => s.name === targetSpot)
    const box = new THREE.Box3().setFromObject(next)
    const target = box.getCenter(new THREE.Vector3())
    target.y = box.max.y - ETHER.centerHeight
    gsap.to(mesh.position, { x: target.x, y: target.y, z: target.z, duration: GHOST.escapeDuration, ease: 'power1.inOut' })
    // fades out on the way
    gsap.to(fade, { presence: 0, duration: GHOST.escapeDuration, ease: 'power2.in', onComplete: () => hideIn(next.name) })
  }

  // the tug is won: spiral into the nozzle, then it's gone for good
  const captureState = { t: 0 }
  const captureStart = new THREE.Vector3()
  const captureSpin = new THREE.Vector3()
  const capture = () => {
    phase = 'captured'
    setState('captured')
    captureStart.copy(mesh.position)
    captureState.t = 0
    gsap.to(captureState, {
      t: 1,
      duration: GHOST.captureDuration,
      ease: 'power2.in',
      onComplete: () => {
        phase = 'done'
        mesh.visible = false
        restoreSpot()
        onCapture?.(config)
      }
    })
  }

  // rise out of the spot (a little toward the player, but never too close to them)
  const playerPosition = new THREE.Vector3()
  const emerge = () => {
    if (phase !== 'hidden') return
    phase = 'emerged'
    exposure = 1
    // measure the spot now (emerge can be called before the first update, e.g. debug key G)
    spotBox.setFromObject(spot).getCenter(spotCenter)
    restoreSpot()
    const toPlayer = new THREE.Vector3().subVectors(playerPosition, spotCenter).setY(0)
    const step = Math.min(GHOST.emergeDistance, Math.max(0, toPlayer.length() - GHOST.minPlayerDistance))
    const target = toPlayer.normalize().multiplyScalar(step).add(spotCenter)
    // the ghost's middle ends up just above the spot
    target.y = spotBox.max.y + GHOST.emergeHeight - ETHER.centerHeight
    mesh.scale.setScalar(0.2)
    gsap.to(mesh.position, { x: target.x, y: target.y, z: target.z, duration: GHOST.emergeDuration, ease: 'power2.out' })
    gsap.to(mesh.scale, { x: 1, y: 1, z: 1, duration: GHOST.emergeDuration, ease: 'back.out' })
    gsap.to(fade, { presence: 1, duration: GHOST.emergeDuration })
    fade.emerging = true
    gsap.delayedCall(GHOST.emergeDuration, () => { fade.emerging = false })
    setState('emerged')
  }

  // a prop got sucked up: if it stood near the spot, the ghost is more exposed
  const onPropCaptured = (prop) => {
    if (phase === 'hidden' && prop.home.distanceTo(spotCenter) < GHOST.propRadius) exposure += GHOST.exposurePerProp
  }

  const shake = (amount) => (Math.random() - 0.5) * 2 * amount
  // aimPoint: what's under the crosshair (from the vacuum)
  const updateHidden = (dt, { nozzle, power, aimPoint }) => {
    // exposure rises while you suck at the spot: the crosshair anywhere on it, or the suction reaching its middle
    aimBox.copy(spotBox).expandByScalar(GHOST.aimMargin)
    const sucking = power >= TUG.minPower
    const exposing = sucking && (aimBox.containsPoint(aimPoint) ||
      suctionStrength(spotCenter, nozzle.position, nozzle.direction, power) > 0.05)
    if (exposing) exposure += GHOST.exposureRate * dt

    // trembling: every few seconds, and the whole time while you're exposing it (so you see it registers)
    trembleTimer -= dt
    if (trembleTimer <= 0) {
      trembleTimer = randomBetween(GHOST.trembleInterval)
      trembleLeft = GHOST.trembleDuration
    }
    restoreSpot()
    if (trembleLeft > 0 || exposing) {
      trembleLeft -= dt
      spotModel.position.x += shake(GHOST.trembleAmount)
      spotModel.position.z += shake(GHOST.trembleAmount)
      spotModel.rotation.x += shake(GHOST.trembleAngle)
      spotModel.rotation.z += shake(GHOST.trembleAngle)
    }
    if (exposure >= 1) emerge()
  }

  const center = new THREE.Vector3()
  const toGhost = new THREE.Vector3()
  const toNozzle = new THREE.Vector3()
  const camRight = new THREE.Vector3()
  const camUp = new THREE.Vector3()
  let shown = 0

  // --- tug-of-war ---
  // round / rounds: Granny Clock must be beaten twice
  const tug = { meter: 0, pullDir: 1, correct: false, round: 1, rounds: 1 }
  let throwTimer = 0
  let dirTimer = 0
  let lostTimer = 0
  // no draining at the start of a round (time to read the arrow), and right after a direction change
  let graceLeft = 0
  let reactLeft = 0
  let sideOffset = 0
  // how far the ghost may drift to the right (+) and left (-) before it would hit something
  const driftLimit = { left: 0, right: 0 }
  const anchor = new THREE.Vector3()
  const left = new THREE.Vector3()
  const tugRight = new THREE.Vector3()
  const tugToPlayer = new THREE.Vector3()

  const startTug = (camera) => {
    phase = 'tug'
    tug.meter = TUG.startMeter
    tug.pullDir = Math.random() < 0.5 ? -1 : 1
    tug.round = 1
    tug.rounds = config.rounds ?? 1
    throwTimer = config.throwInterval ?? 0
    dirTimer = randomBetween(tugConfig.dirInterval)
    graceLeft = TUG.grace
    reactLeft = 0
    lostTimer = 0
    sideOffset = 0
    anchor.copy(mesh.position)
    // sideways = the camera's right, flat on the floor; and the direction toward the player
    tugRight.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize()
    tugToPlayer.subVectors(camera.position, anchor).setY(0).normalize()
    // measure the free space on both sides with a ray, so the drift never goes through a wall
    const reach = TUG.driftRange + TUG.wallMargin
    driftLimit.right = Math.max(0, castAim(center, tugRight, reach) - TUG.wallMargin)
    driftLimit.left = Math.max(0, castAim(center, left.copy(tugRight).negate(), reach) - TUG.wallMargin)
    setState('tug')
  }

  // mouseDX: horizontal mouse movement over the last TUG.inputWindow seconds (px)
  const updateTug = (dt, { camera, power, pull, mouseDX }) => {
    const sucking = power >= TUG.minPower
    if (phase === 'emerged') {
      if (!fade.emerging && sucking && pull > TUG.startStrength && shown > TUG.startVisibility && canStartTug()) startTug(camera)
      return
    }
    // every few seconds the ghost picks a (new) direction to pull
    dirTimer -= dt
    if (dirTimer <= 0) {
      dirTimer = randomBetween(tugConfig.dirInterval)
      const next = Math.random() < 0.5 ? -1 : 1
      // a real change: give the player a moment to react
      if (next !== tug.pullDir) reactLeft = TUG.reactTime
      tug.pullDir = next
    }
    graceLeft -= dt
    reactLeft -= dt
    // correct: sucking, and the mouse moved far enough the other way
    tug.correct = sucking && Math.sign(mouseDX) === -tug.pullDir && Math.abs(mouseDX) >= TUG.inputThreshold
    // fills while correct; drains otherwise, but not during the grace / reaction time
    const canDrain = graceLeft <= 0 && reactLeft <= 0
    const change = tug.correct ? tugConfig.fillRate : (canDrain ? -tugConfig.drainRate : 0)
    tug.meter = THREE.MathUtils.clamp(tug.meter + change * dt, 0, 1)

    // the ghost drifts sideways (slower while you resist) and gets pulled in as the meter fills
    sideOffset += tug.pullDir * tugConfig.driftSpeed * (tug.correct ? TUG.driftResist : 1) * dt
    sideOffset = THREE.MathUtils.clamp(sideOffset, -driftLimit.left, driftLimit.right)
    mesh.position.copy(anchor)
      .addScaledVector(tugRight, sideOffset)
      .addScaledVector(tugToPlayer, tug.meter * TUG.pullIn)

    // the Librarian throws a book every throwInterval seconds
    if (config.throwInterval) {
      throwTimer -= dt
      if (throwTimer <= 0) {
        throwTimer = config.throwInterval
        onThrow?.(center)
      }
    }
    // won: full meter. Lost: the meter ran empty, or the ghost was out of the beam for too long
    lostTimer = shown < TUG.lostVisibility ? lostTimer + dt : 0
    if (tug.meter >= 1) {
      // Granny Clock: one more round, the meter starts over (a bit higher, with grace time again)
      if (tug.round < tug.rounds) {
        tug.round++
        tug.meter = TUG.roundMeter
        graceLeft = TUG.grace
      } else capture()
    } else if (lostTimer > TUG.lostTime || tug.meter <= 0) escape()
  }

  let time = 0
  // camera, lamp (position + direction), nozzle, aimPoint and the vacuum power drive the ghost
  const update = (dt, { camera, lampPos, lampDir, nozzle, aimPoint, power, mouseDX = 0 }) => {
    time += dt
    if (phase === 'done') return
    playerPosition.copy(camera.position)
    // the spot can move (the vase has physics): measure it every frame
    spotBox.setFromObject(spot).getCenter(spotCenter)
    // hint: how much of the Ether shows (only a small wisp while hidden, growing with the exposure)
    let hint = 1
    if (phase === 'hidden') {
      updateHidden(dt, { nozzle, power, aimPoint })
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
    if (phase === 'captured') {
      // spiral into the nozzle: from where the tug ended to the nozzle (it moves with you),
      // circling around the way in and shrinking to nothing
      const t = captureState.t
      mesh.position.lerpVectors(captureStart, nozzle.position, t)
      mesh.position.y -= ETHER.centerHeight * (1 - t)
      const angle = t * GHOST.captureTurns * Math.PI * 2
      captureSpin.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(Math.cos(angle))
        .addScaledVector(camera.up, Math.sin(angle))
      mesh.position.addScaledVector(captureSpin, GHOST.captureSpiral * (1 - t))
      mesh.scale.setScalar(1 - t)
    }
    // the model only shows once it's out
    model.visible = phase !== 'hidden'
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
    // as strong as the suction reaches the ghost (and only while sucking); in the tug also with the meter
    const pull = suctionStrength(center, nozzle.position, nozzle.direction, power)
    const tugAmount = phase === 'tug' ? THREE.MathUtils.lerp(TUG.stretchMin, 1, tug.meter) : 1
    // captured: stretched all the way into the nozzle
    const amount = phase === 'captured' ? 1 : pull * tugAmount
    stretch.value.multiplyScalar(amount * ETHER.maxStretch)

    if (phase === 'emerged' || phase === 'tug') updateTug(dt, { camera, power, pull, mouseDX })
  }

  hideIn(config.hideSpot)

  return {
    mesh,
    model,
    center,
    tug,
    name: config.name,
    isTugging: () => phase === 'tug',
    isHidden: () => phase === 'hidden',
    isDone: () => phase === 'done',
    // the spot this ghost occupies (or is flying to); null once caught
    getSpot: () => (phase === 'done' || phase === 'captured' ? null : targetSpot ?? spot.name),
    getState: () => state,
    setState,
    getExposure: () => Math.min(exposure, 1),
    emerge,
    onPropCaptured,
    update
  }
}
