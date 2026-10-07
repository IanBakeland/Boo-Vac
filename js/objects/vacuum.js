import * as THREE from 'three/webgpu'
import { wgslFn, uniform, uv, colorSpaceToWorking } from 'three/tsl'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import gsap from 'gsap'

import { VACUUM, SUCTION_CONE, MODELS } from '../config.js'
import suctionShader from '../shaders/suction/fragment.wgsl?raw'

export const createVacuum = ({ camera, iTime }) => {
  // gsap animates object properties, so power lives in an object
  // mode: 'suck' or 'blow'
  const state = { power: 0, mode: 'suck' }
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

  const update = () => {
    power.value = state.power
  }

  return { mesh, model: holder, state, setMode, update }
}
