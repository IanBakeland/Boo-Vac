import * as THREE from 'three/webgpu'
import { wgslFn, uniform, uv, colorSpaceToWorking } from 'three/tsl'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import gsap from 'gsap'

import { VACUUM, SUCTION_CONE, MODELS } from '../config.js'
import suctionShader from '../shaders/suction/fragment.wgsl?raw'

export const createVacuum = ({ camera, iTime }) => {
  // gsap animates object properties, so power lives in an object
  // mode: 'suck' or 'blow', boost: MAX multiplier (1 = off)
  const state = { power: 0, mode: 'suck', boost: 1 }
  const power = uniform(0)
  const flowDir = uniform(1)

  // the vacuum model in your right hand (loads in the background)
  const model = new THREE.Group()
  model.position.fromArray(VACUUM.model.position)
  model.rotation.fromArray(VACUUM.model.rotation.map(THREE.MathUtils.degToRad))
  camera.add(model)
  new GLTFLoader().load(MODELS.vacuum.file, (gltf) => {
    gltf.scene.scale.setScalar(MODELS.vacuum.scale)
    model.add(gltf.scene)
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

  // the swirl cone starts at the nozzle tip
  const mesh = new THREE.Mesh(geometry, material)
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

  const forward = new THREE.Vector3()
  const aimPoint = new THREE.Vector3()
  const coneForward = new THREE.Vector3(0, 0, -1)
  const localAim = new THREE.Vector3()
  // call after the camera moved (needs its world matrix)
  // aimDistance: how far the thing in the middle of the screen is (from a ray, see physics.castAim)
  const update = (aimDistance) => {
    // the swirl looks stronger in MAX mode
    power.value = state.power * (state.boost > 1 ? 1.6 : 1)
    mesh.getWorldPosition(nozzle.position)
    // aim point: what you look at (the crosshair). The nozzle sits next to your eyes, so pointing it
    // parallel to your view would miss close things: point it at the aim point instead
    camera.getWorldDirection(forward)
    aimPoint.copy(camera.position).addScaledVector(forward, Math.max(aimDistance, VACUUM.minAimDistance))
    nozzle.direction.subVectors(aimPoint, nozzle.position).normalize()
    // turn the swirl cone the same way (in camera space, because it's a child of the camera)
    localAim.copy(aimPoint)
    camera.worldToLocal(localAim)
    localAim.sub(mesh.position).normalize()
    mesh.quaternion.setFromUnitVectors(coneForward, localAim)
  }

  // aimPoint: what's under the crosshair (the ghosts use it: aiming at a hiding spot counts)
  return { state, nozzle, aimPoint, setMode, update }
}
