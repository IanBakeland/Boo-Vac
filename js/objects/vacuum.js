import * as THREE from 'three/webgpu'
import { wgslFn, uniform, uv, colorSpaceToWorking } from 'three/tsl'
import gsap from 'gsap'

import { VACUUM, SUCTION_CONE } from '../config.js'
import suctionShader from '../shaders/suction/fragment.wgsl?raw'

export const createVacuum = ({ camera, iTime }) => {
  // gsap animates object properties, so power lives in an object
  const state = { power: 0 }
  const power = uniform(0)

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
  material.colorNode = colorSpaceToWorking(suction({ uv: uv(), iTime, power }), THREE.SRGBColorSpace)

  const mesh = new THREE.Mesh(geometry, material)
  // temporary nozzle spot (the vacuum model's Nozzle empty replaces this later)
  mesh.position.fromArray(VACUUM.nozzleOffset)
  camera.add(mesh)

  const setSucking = (sucking) => {
    const tween = sucking ? VACUUM.spinUp : VACUUM.spinDown
    gsap.to(state, { power: sucking ? 1 : 0, duration: tween.duration, ease: tween.ease })
  }

  const update = () => {
    power.value = state.power
  }

  return { mesh, state, setSucking, update }
}
