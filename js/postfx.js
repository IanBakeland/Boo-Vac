import * as THREE from 'three/webgpu'
import { wgslFn, uniform, pass, screenUV } from 'three/tsl'
import gsap from 'gsap'

import { VHS } from './config.js'
import vhsShader from './shaders/vhs/fragment.wgsl?raw'

// post-processing: the whole frame goes through the VHS shader (Shadertoy port) before it reaches the screen.
// Beyond the course: the course renders a shader into a RenderTarget by hand, RenderPipeline does the same for the whole scene
// https://threejs.org/examples/?q=webgpu_postprocessing
export const createPostfx = ({ renderer, scene, camera, iTime }) => {
  // gsap animates object properties, so amount lives in an object (0 = off, 1 = full VHS look)
  const state = { amount: 0 }
  const amount = uniform(0)
  const grain = uniform(VHS.calm.grain)
  const stripes = uniform(VHS.calm.stripes)
  const wobble = uniform(VHS.calm.wobble)
  const roll = uniform(VHS.calm.roll)

  // the scene rendered into a texture: our iChannel0
  const scenePass = pass(scene, camera)
  const sceneTex = scenePass.getTextureNode()

  const vhs = wgslFn(vhsShader)
  const renderPipeline = new THREE.RenderPipeline(renderer)
  // same texture node for the texture and the sampler parameter (course trick)
  renderPipeline.outputNode = vhs({
    sceneTex, sceneTexSampler: sceneTex, uv: screenUV,
    iTime, amount, grain, stripes, wobble, roll, vignette: uniform(VHS.vignette)
  })

  // the VHS look only while you fight a ghost: fade it in when a tug starts, out when it ends
  let on = false
  const setOn = (next) => {
    if (next === on) return
    on = next
    gsap.to(state, {
      amount: on ? 1 : 0, duration: VHS.fade, ease: 'power2.out', overwrite: true,
      onUpdate: () => { amount.value = state.amount }
    })
  }

  return {
    // tugging: a tug-of-war is going on. tug: 0-1, its meter. The tape gets worse the harder you pull
    update: (tugging, tug) => {
      setOn(tugging)
      grain.value = THREE.MathUtils.lerp(VHS.calm.grain, VHS.tug.grain, tug)
      stripes.value = THREE.MathUtils.lerp(VHS.calm.stripes, VHS.tug.stripes, tug)
      wobble.value = THREE.MathUtils.lerp(VHS.calm.wobble, VHS.tug.wobble, tug)
      roll.value = THREE.MathUtils.lerp(VHS.calm.roll, VHS.tug.roll, tug)
    },
    render: () => renderPipeline.render()
  }
}
