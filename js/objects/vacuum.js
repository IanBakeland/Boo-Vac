import * as THREE from 'three/webgpu'
import { wgslFn, uniform, uv, colorSpaceToWorking } from 'three/tsl'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import gsap from 'gsap'

import { VACUUM, SUCTION_CONE, MODELS, TANK } from '../config.js'
import suctionShader from '../shaders/suction/fragment.wgsl?raw'

export const createVacuum = ({ camera, iTime }) => {
  // gsap animates object properties, so power lives in an object
  // mode: 'suck' or 'blow'
  // cap: max suction power (lower when the tank is full), boost: MAX multiplier (1 = off)
  const state = { power: 0, mode: 'suck', cap: 1, boost: 1 }
  const power = uniform(0)
  const flowDir = uniform(1)

  // the vacuum model in your right hand (loads in the background)
  const holder = new THREE.Group()
  holder.position.fromArray(VACUUM.model.position)
  holder.rotation.fromArray(VACUUM.model.rotation.map(THREE.MathUtils.degToRad))
  camera.add(holder)
  new GLTFLoader().load(MODELS.vacuum.file, (gltf) => {
    gltf.scene.scale.setScalar(MODELS.vacuum.scale)
    holder.add(gltf.scene)
  })

  // open cone along the cylinder's y axis, narrow end on top
  const geometry = new THREE.CylinderGeometry(
    SUCTION_CONE.radiusTop, SUCTION_CONE.radiusBottom, SUCTION_CONE.height,
    SUCTION_CONE.radialSegments, 1, true
  )
  // move the narrow end to the origin, then turn the cone so it opens along -z (camera forward)
  geometry.translate(0, -SUCTION_CONE.height / 2, 0)
  geometry.rotateX(Math.PI / 2)

  const suction = wgslFn(suctionShader)
  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  })
  material.colorNode = colorSpaceToWorking(suction({ uv: uv(), iTime, power, flowDir }), THREE.SRGBColorSpace)

  const mesh = new THREE.Mesh(geometry, material)
  // temporary nozzle spot (the vacuum model's Nozzle empty replaces this later)
  mesh.position.fromArray(VACUUM.nozzleOffset)
  camera.add(mesh)

  // mode 'suck' / 'blow' spins the motor up, null spins it down
  const setMode = (mode) => {
    if (mode) {
      state.mode = mode
      flowDir.value = mode === 'blow' ? -1 : 1
    }
    const tween = mode ? VACUUM.spinUp : VACUUM.spinDown
    gsap.to(state, { power: mode ? 1 : 0, duration: tween.duration, ease: tween.ease })
  }

  // nozzle in world space: where the suction comes from, and which way it points (where you look)
  const nozzle = { position: new THREE.Vector3(), direction: new THREE.Vector3() }

  // the power that really reaches the props: the tank-full cap only limits sucking
  const effectivePower = () => state.mode === 'suck' ? Math.min(state.power, state.cap) : state.power

  // call after the camera moved (needs its world matrix)
  const basePosition = holder.position.clone()
  const update = () => {
    // the swirl looks stronger in MAX mode
    power.value = effectivePower() * (state.boost > 1 ? 1.6 : 1)
    // tank full while sucking: the vacuum shakes in your hand
    const shaking = state.mode === 'suck' && state.cap < 1 && state.power > 0.1
    holder.position.copy(basePosition)
    if (shaking) holder.position.addScalar((Math.random() - 0.5) * 2 * TANK.fullJitter)
    mesh.getWorldPosition(nozzle.position)
    camera.getWorldDirection(nozzle.direction)
  }

  return { mesh, model: holder, state, nozzle, setMode, effectivePower, update }
}
