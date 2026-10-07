import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

import { ROOM, CAMERA, MAX_DT } from './config.js'

const canvas = document.querySelector('canvas.webgl')
const scene = new THREE.Scene()

const size = {
  width: window.innerWidth,
  height: window.innerHeight
}

const camera = new THREE.PerspectiveCamera(CAMERA.fov, size.width / size.height, CAMERA.near, CAMERA.far)
camera.position.set(0, CAMERA.eyeHeight, ROOM.depth / 2)
// the camera is in the scene because the vacuum and flashlight will be its children
scene.add(camera)

// temporary: look around with the mouse (replaced by first-person controls in 2.10)
const controls = new OrbitControls(camera, canvas)
controls.target.set(0, 0, 0)
controls.enableDamping = true
controls.dampingFactor = 0.05

const renderer = new THREE.WebGPURenderer({
  canvas: canvas,
  antialias: true,
  alpha: false
})
renderer.setSize(size.width, size.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

// temporary test floor, same size as the room (removed in 2.10)
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(ROOM.width, ROOM.depth),
  new THREE.MeshBasicMaterial({ color: 0x808080 })
)
// a plane stands upright by default, lay it flat
floor.rotation.x = -Math.PI / 2
scene.add(floor)

// THREE.Clock is deprecated since r183 (it logs a warning), Timer replaces it
// https://threejs.org/docs/#api/en/core/Timer
const timer = new THREE.Timer()

const draw = (timestamp) => {
  timer.update(timestamp)
  const dt = Math.min(timer.getDelta(), MAX_DT)

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
