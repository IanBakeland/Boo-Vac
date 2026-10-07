import * as THREE from 'three/webgpu'
import { uniform } from 'three/tsl'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'

import { CAMERA, MAX_DT, LAYOUT, PLAYER, PHYSICS, TANK, MAX, DUST, GHOST } from './config.js'
import { createPhysics, checkSuctionForce } from './physics.js'
import { createRoom } from './objects/room.js'
import { createProps } from './objects/props.js'
import { createFlashlight } from './objects/flashlight.js'
import { createVacuum } from './objects/vacuum.js'
import { createDust } from './objects/dust.js'
import { createGhost } from './objects/ghost.js'

const canvas = document.querySelector('canvas.webgl')
const scene = new THREE.Scene()

const size = {
  width: window.innerWidth,
  height: window.innerHeight
}

const camera = new THREE.PerspectiveCamera(CAMERA.fov, size.width / size.height, CAMERA.near, CAMERA.far)
camera.position.fromArray(LAYOUT.spawn.position)
camera.lookAt(...LAYOUT.spawn.lookAt)
// the camera is in the scene because the vacuum and flashlight will be its children
scene.add(camera)

// first person: the mouse turns the camera while the pointer is locked
// https://threejs.org/docs/#examples/en/controls/PointerLockControls
const controls = new PointerLockControls(camera, canvas)

const renderer = new THREE.WebGPURenderer({
  canvas: canvas,
  antialias: true,
  alpha: false
})
renderer.setSize(size.width, size.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
// wait for the GPU: compute shaders (dust) need an initialized renderer
await renderer.init()

const room = await createRoom()
scene.add(room.mesh)
// physics: the apartment as triangle meshes, our furniture as boxes
const physics = await createPhysics()
physics.addTrimesh(room.shell)
physics.addTrimesh(room.ceiling)
// static furniture gets a fixed box; dynamic furniture (table, chair, vase) is added with the props
room.furniture.forEach((piece) => { if (!piece.userData.layout.dynamic) physics.addBox(piece) })

// props: every one gets a dynamic physics body
const props = await createProps({ physics })
scene.add(props.mesh)
room.furniture.forEach((piece) => { if (piece.userData.layout.dynamic) props.addMovable(piece) })
// one physics step now: Rapier only registers new colliders for collision checks during a step,
// so without it the player would have no collision in the very first frame
physics.step(PHYSICS.fixedStep)

// ?debug in the URL: show every collider as lines
const DEBUG = new URLSearchParams(window.location.search).has('debug')
if (DEBUG) {
  checkSuctionForce()
  physics.updateDebugLines()
  scene.add(physics.debugLines)
}


// the Shadertoy shaders' clock (Ether ghost aura, suction cone, beam, dust), updated every frame
const iTime = uniform(0)

const vacuum = createVacuum({ camera, iTime })

// the ghost (model + Blender animations); for now it floats at a test spot
const ghost = await createGhost({ iTime })
ghost.mesh.position.fromArray(GHOST.testPosition)
scene.add(ghost.mesh)

// the flashlight is the only real light: the room gets the flashlight shader, props get the SpotLight
const flashlight = createFlashlight({ camera, iTime })
scene.add(flashlight.ambientLight)
flashlight.lightUp(room.mesh)

// dust specks: compute shader, only with real WebGPU (the WebGL fallback has no compute dust)
const dust = renderer.backend.isWebGPUBackend
  ? createDust({ iTime, nozzle: vacuum.nozzle, lamp: flashlight.uniforms })
  : null
if (dust) {
  scene.add(dust.mesh)
  renderer.compute(dust.init)
}

// --- input ---
// e.code is the physical key: WASD also works on AZERTY (there it's ZQSD)
const keys = new Set()
let jumpRequested = false
window.addEventListener('keydown', (e) => {
  keys.add(e.code)
  if (e.code === 'Space') {
    // no page scrolling, and holding space doesn't jump again and again
    e.preventDefault()
    if (!e.repeat) jumpRequested = true
  }
  // MAX: only with a full charge
  if (e.code === MAX.key && controls.isLocked && !maxActive && maxCharge >= 1) maxActive = true
  // debug: 1-5 switch the ghost's animation state
  const debugStates = { Digit1: 'emerged', Digit2: 'tug', Digit3: 'escape', Digit4: 'giggle', Digit5: 'captured' }
  if (DEBUG && debugStates[e.code]) ghost.setState(debugStates[e.code])
  // debug: P drops all props from 1 m higher
  if (DEBUG && e.code === 'KeyP') props.drop()
})
window.addEventListener('keyup', (e) => keys.delete(e.code))

// pointer lock needs a click: the start / pause overlays catch it
const $start = document.querySelector('#start')
const $pause = document.querySelector('#pause')
const $resume = $pause.querySelector('.action')
const $hud = document.querySelector('#hud')
const $tankCount = $hud.querySelector('.tank-count')
const $max = document.querySelector('#max')
const $maxFill = $max.querySelector('.max-fill')
// HUD: only touch the DOM when the value changed
let shownTank = -1
let shownMax = ''
const updateHud = () => {
  if (props.tank.length !== shownTank) {
    shownTank = props.tank.length
    $tankCount.textContent = shownTank
  }
  // MAX button: charge bar in 5% steps, so the DOM only changes ~20 times per charge
  const maxState = `${maxActive}-${Math.round(maxCharge * 20)}`
  if (maxState !== shownMax) {
    shownMax = maxState
    $maxFill.style.width = `${maxCharge * 100}%`
    $max.classList.toggle('active', maxActive)
    $max.classList.toggle('ready', !maxActive && maxCharge >= 1)
  }
}

// ?debug: frames per second, updated twice a second
const $fps = document.querySelector('#fps')
if (DEBUG) $fps.classList.remove('hidden')
let fpsFrames = 0
let fpsTime = 0
const updateFps = (dt) => {
  fpsFrames++
  fpsTime += dt
  if (fpsTime < 0.5) return
  $fps.textContent = `${Math.round(fpsFrames / fpsTime)} fps · ${dust ? DUST.count + ' dust' : 'no dust'}`
  fpsFrames = 0
  fpsTime = 0
}

// MAX mode: press F when charged -> 3 s of x2.5 force, then recharge
let maxCharge = 1
let maxActive = false
const updateMax = (dt) => {
  if (maxActive) {
    maxCharge -= dt / MAX.duration
    if (maxCharge <= 0) {
      maxCharge = 0
      maxActive = false
    }
  } else {
    maxCharge = Math.min(1, maxCharge + dt / MAX.recharge)
  }
  vacuum.state.boost = maxActive ? MAX.multiplier : 1
}
let unlockedAt = 0
$start.addEventListener('click', () => controls.lock())
$pause.addEventListener('click', () => {
  if (performance.now() - unlockedAt > PLAYER.relockDelay) controls.lock()
})
controls.addEventListener('lock', () => {
  $start.classList.add('hidden')
  $pause.classList.add('hidden')
  $hud.classList.remove('hidden')
  $max.classList.remove('hidden')
})
controls.addEventListener('unlock', () => {
  // Esc: pause, stop the vacuum and forget held keys
  unlockedAt = performance.now()
  $pause.classList.remove('hidden')
  $resume.classList.add('waiting')
  setTimeout(() => $resume.classList.remove('waiting'), PLAYER.relockDelay)
  vacuum.setMode(null)
  keys.clear()
})

// left mouse = suck, right mouse = blow
document.addEventListener('mousedown', (e) => {
  if (!controls.isLocked) return
  if (e.button === 0) vacuum.setMode('suck')
  if (e.button === 2) vacuum.setMode('blow')
})
document.addEventListener('mouseup', (e) => {
  if (!controls.isLocked) return
  // e.buttons: which buttons are still held (1 = left, 2 = right)
  if (e.buttons & 1) vacuum.setMode('suck')
  else if (e.buttons & 2) vacuum.setMode('blow')
  else vacuum.setMode(null)
})
// no right-click menu
window.addEventListener('contextmenu', (e) => e.preventDefault())

let verticalSpeed = 0
let grounded = true
const forwardDir = new THREE.Vector3()
const rightDir = new THREE.Vector3()
const desired = new THREE.Vector3()
const movePlayer = (dt) => {
  const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0)
  const right = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0)
  // where the camera looks, flattened onto the floor
  camera.getWorldDirection(forwardDir)
  forwardDir.y = 0
  forwardDir.normalize()
  rightDir.crossVectors(forwardDir, camera.up)
  // diagonal walking is not faster
  const length = Math.hypot(forward, right) || 1
  const step = PLAYER.walkSpeed * dt / length
  desired.copy(forwardDir).multiplyScalar(forward * step).addScaledVector(rightDir, right * step)

  // jumping and falling: gravity pulls the vertical speed down every frame
  if (jumpRequested && grounded) verticalSpeed = PLAYER.jumpSpeed
  jumpRequested = false
  verticalSpeed += PHYSICS.gravity * PLAYER.gravityScale * dt
  desired.y = verticalSpeed * dt

  // the physics character controller stops us at walls, furniture, floor and ceiling
  const result = physics.movePlayer(desired)
  grounded = result.grounded
  // standing on the floor, or bumped the ceiling: stop the vertical speed
  if (grounded && verticalSpeed < 0) verticalSpeed = 0
  if (verticalSpeed > 0 && result.movement.y < desired.y * 0.5) verticalSpeed = 0
  // the camera sits at eye height above the bottom of the capsule
  camera.position.set(result.position.x, result.position.y - PLAYER.height / 2 + CAMERA.eyeHeight, result.position.z)
}

// THREE.Clock is deprecated since r183 (it logs a warning), Timer replaces it
// https://threejs.org/docs/#api/en/core/Timer
const timer = new THREE.Timer()

const draw = (timestamp) => {
  timer.update(timestamp)
  const dt = Math.min(timer.getDelta(), MAX_DT)

  iTime.value = timer.getElapsed()

  if (controls.isLocked) movePlayer(dt)
  // the camera moved: update its matrices before reading the nozzle and lamp positions
  camera.updateMatrixWorld()
  vacuum.update()
  flashlight.update()

  updateMax(dt)
  const { power, mode, boost } = vacuum.state
  // the ghost: animation, visibility in the beam, smoke stretched toward the nozzle while sucking
  ghost.update(dt, {
    camera,
    lampPos: flashlight.uniforms.lampPos.value,
    lampDir: flashlight.uniforms.lampDir.value,
    nozzle: vacuum.nozzle,
    power: mode === 'suck' ? power : 0
  })

  // physics, with the suction force applied before every step
  physics.step(dt, (stepDt) => props.applySuction(vacuum.nozzle, power, mode, stepDt, boost))
  // sucking at (almost) full power: small props at the nozzle go into the tank
  if (mode === 'suck' && power >= TANK.captureMinPower) {
    // placeholder for the "plop" sound (step 4.8)
    if (props.capture(vacuum.nozzle) > 0 && DEBUG) console.log('plop', props.tank.length)
  }
  props.update()
  if (DEBUG) physics.updateDebugLines()
  // dust: same suction as the props (MAX makes it stronger too)
  dust?.update(renderer, dt, power * boost, mode)
  updateHud()
  if (DEBUG) updateFps(dt)
  renderer.render(scene, camera)
}

window.addEventListener('resize', () => {
  // Update size
  size.width = window.innerWidth
  size.height = window.innerHeight

  // Update camera
  camera.aspect = size.width / size.height
  camera.updateProjectionMatrix()

  // Update renderer
  renderer.setSize(size.width, size.height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

renderer.setAnimationLoop(draw)
