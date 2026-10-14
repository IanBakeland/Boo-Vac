// unplugin-typegpu turns the 'use gpu' functions of TypeGPU into WGSL (js/objects/dust.js)
// https://docs.swmansion.com/TypeGPU/tooling/unplugin-typegpu/
import typegpu from 'unplugin-typegpu/vite'

export default { base: './', plugins: [typegpu()] };
