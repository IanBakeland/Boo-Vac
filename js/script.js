import * as THREE from 'three/webgpu'
import { wgslFn, uniform, uv, colorSpaceToWorking } from 'three/tsl'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

import { CAMERA, MAX_DT, ETHER, LAYOUT } from './config.js'
import { createRoom } from './objects/room.js'
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
// the camera is in the scene because the vacuum and flashlight will be its children
scene.add(camera)

// temporary: look around with the mouse (replaced by first-person controls in 2.7)
const controls = new OrbitControls(camera, canvas)
controls.target.fromArray(LAYOUT.spawn.lookAt)
controls.enableDamping = true
controls.dampingFactor = 0.05
// left mouse is for sucking, so orbit with the right mouse for now
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }

const renderer = new THREE.WebGPURenderer({
  canvas: canvas,
  antialias: true,
  alpha: false
})
renderer.setSize(size.width, size.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

const room = await createRoom()
scene.add(room.mesh)

// temporary lights so we can see the room (replaced by the flashlight in 2.6)
scene.add(new THREE.AmbientLight(0xffffff, 1.2))
const tempLight = new THREE.DirectionalLight(0xffffff, 2)
tempLight.position.set(2, 4, 3)
scene.add(tempLight)

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

// hold left mouse to suck
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) vacuum.setSucking(true)
})
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) vacuum.setSucking(false)
})

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

  controls.update(dt)
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
