import * as THREE from 'three/webgpu'
import { wgslFn, uniform, uv, colorSpaceToWorking } from 'three/tsl'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'

import { CAMERA, MAX_DT, ETHER, LAYOUT, ROOM, PLAYER } from './config.js'
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
const props = await createProps()
scene.add(props.mesh)


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
window.addEventListener('keydown', (e) => keys.add(e.code))
window.addEventListener('keyup', (e) => keys.delete(e.code))

// pointer lock needs a click: the start / pause overlays catch it
const $start = document.querySelector('#start')
const $pause = document.querySelector('#pause')
const $resume = $pause.querySelector('.action')
let unlockedAt = 0
$start.addEventListener('click', () => controls.lock())
$pause.addEventListener('click', () => {
  if (performance.now() - unlockedAt > PLAYER.relockDelay) controls.lock()
})
controls.addEventListener('lock', () => {
  $start.classList.add('hidden')
  $pause.classList.add('hidden')
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

const movePlayer = (dt) => {
  const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0)
  const right = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0)
  // diagonal walking is not faster
  const length = Math.hypot(forward, right) || 1
  const step = PLAYER.walkSpeed * dt / length
  controls.moveForward(forward * step)
  controls.moveRight(right * step)
  // stay inside the room
  const maxX = ROOM.width / 2 - PLAYER.wallMargin
  const maxZ = ROOM.depth / 2 - PLAYER.wallMargin
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -maxX, maxX)
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -maxZ, maxZ)
}

// THREE.Clock is deprecated since r183 (it logs a warning), Timer replaces it
// https://threejs.org/docs/#api/en/core/Timer
const timer = new THREE.Timer()

const draw = (timestamp) => {
  timer.update(timestamp)
  const dt = Math.min(timer.getDelta(), MAX_DT)

  iTime.value = timer.getElapsed()
  vacuum.update()
  // test: smear the ghost down (toward the vacuum) while sucking
  stretch.value.set(0, -vacuum.state.power * ETHER.maxStretch)
  // billboard: the plane always faces the camera
  etherPlane.quaternion.copy(camera.quaternion)

  if (controls.isLocked) movePlayer(dt)
  // the camera moved: update its matrices before reading the lamp position
  camera.updateMatrixWorld()
  flashlight.update()
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
