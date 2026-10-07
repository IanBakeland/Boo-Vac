import * as THREE from 'three/webgpu'
import { wgslFn, uniform, uv, colorSpaceToWorking } from 'three/tsl'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'

import { CAMERA, MAX_DT, ETHER, LAYOUT, PLAYER, PHYSICS, TANK } from './config.js'
import { createPhysics, checkSuctionForce } from './physics.js'
import { createRoom } from './objects/room.js'
import { createProps } from './objects/props.js'
import { createFlashlight } from './objects/flashlight.js'
import { createVacuum } from './objects/vacuum.js'
import etherShader from './shaders/ether/fragment.wgsl?raw'

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

const room = await createRoom()
scene.add(room.mesh)
// physics: the apartment as triangle meshes, our furniture as boxes
const physics = await createPhysics()
physics.addTrimesh(room.shell)
physics.addTrimesh(room.ceiling)
room.furniture.forEach((piece) => physics.addBox(piece))

// props: every one gets a dynamic physics body
const props = await createProps({ physics })
scene.add(props.mesh)
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


// uniforms are TSL nodes, we update their .value every frame
const iTime = uniform(0)
// square plane, so the shader works in a 1 x 1 space
const iResolution = uniform(new THREE.Vector2(1, 1))
// per-ghost color and how much the flashlight reveals it (0-1), set later
const tint = uniform(new THREE.Color(1, 1, 1))
const visibility = uniform(1)
// screen-space direction x amount the smoke smears toward the nozzle
const stretch = uniform(new THREE.Vector2(0, 0))

const ether = wgslFn(etherShader)
// additive: black adds nothing, so the black background of the shader is invisible
const etherMaterial = new THREE.MeshBasicNodeMaterial({
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false
})
// the shadertoy shader outputs display-ready (sRGB) colors, tell three to treat them as such
etherMaterial.colorNode = colorSpaceToWorking(ether({
  fragCoord: uv().mul(iResolution),
  iTime,
  iResolution,
  tint,
  visibility,
  stretch
}), THREE.SRGBColorSpace)
const etherPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), etherMaterial)
// temporary spot for the test ghost (it moves onto the real ghost in 4.2)
etherPlane.position.set(1.5, 1.3, -1.6)
scene.add(etherPlane)

const vacuum = createVacuum({ camera, iTime })

// the flashlight is the only real light: the room gets the flashlight shader, props get the SpotLight
const flashlight = createFlashlight({ camera, iTime })
scene.add(flashlight.ambientLight)
flashlight.lightUp(room.mesh)

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
const $tankFill = $hud.querySelector('.tank-fill')
$hud.querySelector('.tank-capacity').textContent = TANK.capacity
// HUD: only touch the DOM when the value changed
let shownTank = -1
const updateHud = () => {
  if (props.tank.length === shownTank) return
  shownTank = props.tank.length
  $tankCount.textContent = shownTank
  $tankFill.style.width = `${shownTank / TANK.capacity * 100}%`
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
  // test: smear the ghost down (toward the vacuum) while sucking
  stretch.value.set(0, -vacuum.state.power * ETHER.maxStretch)
  // billboard: the plane always faces the camera
  etherPlane.quaternion.copy(camera.quaternion)

  if (controls.isLocked) movePlayer(dt)
  // the camera moved: update its matrices before reading the nozzle and lamp positions
  camera.updateMatrixWorld()
  vacuum.update()
  flashlight.update()

  // physics, with the suction force applied before every step
  const { power, mode } = vacuum.state
  physics.step(dt, (stepDt) => props.applySuction(vacuum.nozzle, power, mode, stepDt))
  // sucking at (almost) full power: small props at the nozzle go into the tank
  if (mode === 'suck' && power >= TANK.captureMinPower) {
    // placeholder for the "plop" sound (step 4.8)
    if (props.capture(vacuum.nozzle) > 0 && DEBUG) console.log('plop', props.tank.length)
  }
  props.update()
  if (DEBUG) physics.updateDebugLines()
  updateHud()
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
