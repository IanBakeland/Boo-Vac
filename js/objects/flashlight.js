import * as THREE from 'three/webgpu'
import { wgslFn, uniform, uv, texture, color, positionWorld, normalWorld, normalView, positionView, colorSpaceToWorking } from 'three/tsl'

import { FLASHLIGHT } from '../config.js'
import flashlightShader from '../shaders/flashlight/fragment.wgsl?raw'
import beamShader from '../shaders/beam/fragment.wgsl?raw'

export const createFlashlight = ({ camera, iTime }) => {
  // the lamp is held in the left hand: a child of the camera, so it follows the view
  const mesh = new THREE.Group()
  mesh.position.fromArray(FLASHLIGHT.offset)
  camera.add(mesh)

  const angle = THREE.MathUtils.degToRad(FLASHLIGHT.angle)

  // real light for the props and the ghost (standard materials), shadows off for performance
  const light = new THREE.SpotLight(FLASHLIGHT.color, FLASHLIGHT.intensity, FLASHLIGHT.distance, angle, FLASHLIGHT.penumbra, FLASHLIGHT.decay)
  // the spotlight points at its target: put the target 1 m in front of the lamp
  light.target.position.set(0, 0, -1)
  mesh.add(light, light.target)

  // dim moonlight so props outside the beam aren't pitch black (same value as the room shader's ambient)
  const ambientLight = new THREE.AmbientLight(FLASHLIGHT.ambientColor, FLASHLIGHT.ambientIntensity)

  // the same numbers as the SpotLight, as uniforms for the room shader
  const uniforms = {
    lampPos: uniform(new THREE.Vector3()),
    lampDir: uniform(new THREE.Vector3(0, 0, -1)),
    // three's spotlight: outer edge at `angle`, fully lit inside angle * (1 - penumbra)
    cosOuter: uniform(Math.cos(angle)),
    cosInner: uniform(Math.cos(angle * (1 - FLASHLIGHT.penumbra))),
    ambient: uniform(new THREE.Color(FLASHLIGHT.ambientColor).multiplyScalar(FLASHLIGHT.ambientIntensity)),
    lampColor: uniform(new THREE.Color(FLASHLIGHT.color).multiplyScalar(FLASHLIGHT.intensity)),
    range: uniform(FLASHLIGHT.distance)
  }

  const flashlight = wgslFn(flashlightShader)
  const materials = new Map()
  // give every mesh in `object` the flashlight material, keeping its own color/texture as albedo
  // (unlit basic materials, like the window, stay as they are)
  const lightUp = (object) => {
    object.traverse((child) => {
      if (!child.isMesh || child.material.isMeshBasicMaterial) return
      const original = child.material
      // meshes that share a material also share the new one
      if (!materials.has(original)) {
        let albedo = color(original.color)
        if (original.map) albedo = texture(original.map).rgb.mul(albedo)
        const material = new THREE.MeshBasicNodeMaterial({ side: original.side })
        material.colorNode = flashlight({ albedo, worldPos: positionWorld, normal: normalWorld, ...uniforms })
        materials.set(original, material)
      }
      child.material = materials.get(original)
    })
  }

  // visible beam: open cone, narrow end at the lamp, opening along -z like the light
  const beamRadius = Math.tan(angle) * FLASHLIGHT.beamLength
  const beamGeometry = new THREE.CylinderGeometry(0.03, beamRadius, FLASHLIGHT.beamLength, 32, 1, true)
  beamGeometry.translate(0, -FLASHLIGHT.beamLength / 2, 0)
  beamGeometry.rotateX(Math.PI / 2)
  const beamMaterial = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  })
  // how straight we look at the cone wall: 1 = head-on, 0 = edge-on
  const facing = normalView.dot(positionView.normalize().negate()).abs()
  beamMaterial.colorNode = colorSpaceToWorking(
    wgslFn(beamShader)({ uv: uv(), iTime, intensity: uniform(FLASHLIGHT.beamIntensity), facing }),
    THREE.SRGBColorSpace
  )
  mesh.add(new THREE.Mesh(beamGeometry, beamMaterial))

  const update = () => {
    // the room shader needs the lamp in world space
    mesh.getWorldPosition(uniforms.lampPos.value)
    camera.getWorldDirection(uniforms.lampDir.value)
  }

  return { mesh, ambientLight, lightUp, update }
}
