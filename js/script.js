import * as THREE from 'three/webgpu'
import { uniform } from 'three/tsl'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'

import { CAMERA, MAX_DT, LAYOUT, PLAYER, PHYSICS, TANK, MAX, DUST, SUCTION, TUG, GHOSTS, THROW, INVOICE } from './config.js'
import { createPhysics, checkSuctionForce } from './physics.js'
import { createRoom } from './objects/room.js'
import { createProps } from './objects/props.js'
import { createFlashlight } from './objects/flashlight.js'
import { createVacuum } from './objects/vacuum.js'
import { createDust } from './objects/dust.js'
import { createGhost } from './objects/ghost.js'
import { createAudio } from './audio.js'

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
// wait for the GPU: compute shaders (dust) need an initialized renderer
await renderer.init()

const room = await createRoom()
scene.add(room.mesh)
// physics: the apartment as triangle meshes, our furniture as boxes
const physics = await createPhysics()
physics.addTrimesh(room.shell)
physics.addTrimesh(room.ceiling)
// static furniture gets a fixed box; dynamic furniture (table, chair, vase) is added with the props
room.furniture.forEach((piece) => { if (!piece.userData.layout.dynamic) physics.addBox(piece) })

// props: every one gets a dynamic physics body
const props = await createProps({ physics })
scene.add(props.mesh)
room.furniture.forEach((piece) => { if (piece.userData.layout.dynamic) props.addMovable(piece) })
// one physics step now: Rapier only registers new colliders for collision checks during a step,
// so without it the player would have no collision in the very first frame
physics.step(PHYSICS.fixedStep)

// ?debug in the URL: show every collider as lines
const DEBUG = new URLSearchParams(window.location.search).has('debug')
if (DEBUG) {
  checkSuctionForce()
  physics.updateDebugLines()
  scene.add(physics.debugLines)
}


// the Shadertoy shaders' clock (Ether ghost aura, suction cone, beam, dust), updated every frame
const iTime = uniform(0)

const vacuum = createVacuum({ camera, iTime })

// the flashlight is the only real light: the room gets the flashlight shader, props get the SpotLight
const flashlight = createFlashlight({ camera, iTime })
scene.add(flashlight.ambientLight)
flashlight.lightUp(room.mesh)

// dust specks: compute shader, only with real WebGPU (the WebGL fallback has no compute dust)
const dust = renderer.backend.isWebGPUBackend
  ? createDust({ iTime, nozzle: vacuum.nozzle, lamp: flashlight.uniforms })
  : null
if (dust) {
  scene.add(dust.mesh)
  renderer.compute(dust.init)
}

// sound (starts on the first click, browsers don't allow sound before that)
const audio = createAudio()

// the Librarian: the nearest book near the ghost flies at the player
const throwBook = (from) => {
  let nearest = null
  let nearestDistance = THROW.range
  props.props.forEach((prop) => {
    if (!prop.body || !prop.mesh.name.startsWith('Prop_Book')) return
    const p = prop.body.translation()
    const distance = Math.hypot(p.x - from.x, p.y - from.y, p.z - from.z)
    if (distance < nearestDistance) {
      nearest = prop
      nearestDistance = distance
    }
  })
  if (!nearest) return
  audio.whoosh()
  const p = nearest.body.translation()
  const toPlayer = new THREE.Vector3(camera.position.x - p.x, camera.position.y - p.y, camera.position.z - p.z).normalize()
  nearest.body.setLinvel({ x: toPlayer.x * THROW.speed, y: toPlayer.y * THROW.speed + THROW.lift, z: toPlayer.z * THROW.speed }, true)
  nearest.body.setAngvel({ x: Math.random() * 10, y: Math.random() * 10, z: Math.random() * 10 }, true)
}

// game stats (for the HUD, and the invoice at the end)
const stats = { caught: 0, escapes: 0, startTime: 0, endTime: 0 }

// the three ghosts (model + Blender animations + Ether aura), all hiding at the same time:
// catch them in any order. A small Ether wisp shows where each one hides.
const ghosts = await Promise.all(GHOSTS.map((config) => createGhost({
  iTime,
  config,
  hidingSpots: room.hidingSpots,
  castAim: physics.castAim,
  // spots taken by the other ghosts (an escaping ghost picks a free one)
  takenSpots: () => ghosts.map((g) => g.getSpot()).filter((spot) => spot !== null),
  // only one tug-of-war at a time
  canStartTug: () => !ghosts.some((g) => g.isTugging()),
  onCapture: () => {
    audio.capture()
    stats.caught++
    // the last ghost: the shift is over
    if (stats.caught === GHOSTS.length) endShift()
  },
  onEscape: (config) => {
    stats.escapes++
    // Dusty giggles at you, the others moan
    if (config.giggle) audio.giggle()
    else audio.moan()
  },
  onEmerge: () => audio.moan(),
  onThrow: (from) => throwBook(from)
})))
ghosts.forEach((g) => scene.add(g.mesh))
// the ghost you're fighting right now (or null)
const tuggingGhost = () => ghosts.find((g) => g.isTugging()) ?? null

// --- input ---
// e.code is the physical key: WASD also works on AZERTY (there it's ZQSD)
const keys = new Set()
let jumpRequested = false
window.addEventListener('keydown', (e) => {
  keys.add(e.code)
  if (e.code === 'Space') {
    // no page scrolling, and holding space doesn't jump again and again
    e.preventDefault()
    if (!e.repeat) jumpRequested = true
  }
  // MAX: only with a full charge
  if (e.code === MAX.key && controls.isLocked && !maxActive && maxCharge >= 1) {
    maxActive = true
    audio.max()
  }
  // M: sound on/off
  if (e.code === 'KeyM') $muteLabel.classList.toggle('hidden', !audio.toggleMute())
  // debug: G makes the nearest hidden ghost come out right away
  if (DEBUG && e.code === 'KeyG') {
    const hidden = ghosts.filter((g) => g.isHidden())
    hidden.sort((a, b) => a.center.distanceTo(camera.position) - b.center.distanceTo(camera.position))
    hidden[0]?.emerge()
  }
  // debug: P drops all props from 1 m higher
  if (DEBUG && e.code === 'KeyP') props.drop()
})
window.addEventListener('keyup', (e) => keys.delete(e.code))

// pointer lock needs a click: the start / pause overlays catch it
const $start = document.querySelector('#start')
const $pause = document.querySelector('#pause')
const $resume = $pause.querySelector('.action')
const $startButton = $start.querySelector('.start-button')
const $hud = document.querySelector('#hud')
const $tankCount = $hud.querySelector('.tank-count')
const $ghostCount = $hud.querySelector('.ghost-count')
const $max = document.querySelector('#max')
const $crosshair = document.querySelector('#crosshair')
const $tug = document.querySelector('#tug')
const $tugArrow = $tug.querySelector('.tug-arrow')
const $tugName = $tug.querySelector('.tug-name')
const $tugFill = $tug.querySelector('.tug-fill')
const $maxFill = $max.querySelector('.max-fill')
const $mode = document.querySelector('#mode')
const $muteLabel = $hud.querySelector('.mute-label')
// HUD: only touch the DOM when the value changed
let shownTank = -1
let shownCaught = -1
let shownMax = ''
let shownTug = ''
let shownMode = ''
const updateHud = () => {
  if (stats.caught !== shownCaught) {
    shownCaught = stats.caught
    $ghostCount.textContent = shownCaught
  }
  if (props.tank.length !== shownTank) {
    shownTank = props.tank.length
    $tankCount.textContent = shownTank
  }
  // SUCK / BLOW under the crosshair (and the crosshair in that color) while the motor runs
  const running = vacuum.state.power > 0.05
  const modeState = running ? vacuum.state.mode : ''
  if (modeState !== shownMode) {
    shownMode = modeState
    $mode.textContent = modeState.toUpperCase()
    $mode.classList.remove('suck', 'blow')
    $crosshair.classList.remove('suck', 'blow')
    if (modeState) {
      $mode.classList.add(modeState)
      $crosshair.classList.add(modeState)
    }
  }
  // tug meter: the arrow shows which way YOU must move the mouse (against the ghost)
  const fighting = tuggingGhost()
  const tugging = fighting !== null
  const { meter, pullDir, correct, round, rounds } = fighting?.tug ?? {}
  const tugState = tugging ? `${pullDir}-${correct}-${Math.round(meter * 50)}-${round}` : 'off'
  if (tugState !== shownTug) {
    shownTug = tugState
    $tug.classList.toggle('hidden', !tugging)
    $tug.classList.toggle('correct', correct)
    $tugArrow.textContent = pullDir > 0 ? '◀ PULL' : 'PULL ▶'
    $tugFill.style.width = `${(meter ?? 0) * 100}%`
    if (tugging) $tugName.textContent = rounds > 1 ? `${fighting.name} · round ${round}/${rounds}` : fighting.name
  }
  // MAX button: charge bar in 5% steps, so the DOM only changes ~20 times per charge
  const maxState = `${maxActive}-${Math.round(maxCharge * 20)}`
  if (maxState !== shownMax) {
    shownMax = maxState
    $maxFill.style.width = `${maxCharge * 100}%`
    $max.classList.toggle('active', maxActive)
    $max.classList.toggle('ready', !maxActive && maxCharge >= 1)
  }
}

// ?debug: frames per second, updated twice a second
const $fps = document.querySelector('#fps')
if (DEBUG) $fps.classList.remove('hidden')
let fpsFrames = 0
let fpsTime = 0
const updateFps = (dt) => {
  fpsFrames++
  fpsTime += dt
  if (fpsTime < 0.5) return
  const exposures = ghosts.map((g) => `${g.name.split(' ').pop()} ${g.getExposure().toFixed(2)}`).join(', ')
  $fps.textContent = `${Math.round(fpsFrames / fpsTime)} fps · ${dust ? DUST.count + ' dust' : 'no dust'} · exposure ${exposures}`
  fpsFrames = 0
  fpsTime = 0
}

// MAX mode: press F when charged -> 3 s of x2.5 force, then recharge
let maxCharge = 1
let maxActive = false
const updateMax = (dt) => {
  if (maxActive) {
    maxCharge -= dt / MAX.duration
    if (maxCharge <= 0) {
      maxCharge = 0
      maxActive = false
    }
  } else {
    maxCharge = Math.min(1, maxCharge + dt / MAX.recharge)
  }
  vacuum.state.boost = maxActive ? MAX.multiplier : 1
}
// --- game state machine: start -> playing <-> paused -> invoice ---
const game = { state: 'start' }
const $invoice = document.querySelector('#invoice')
const setGameState = (next) => {
  game.state = next
  const playing = next === 'playing'
  $start.classList.toggle('hidden', next !== 'start')
  $pause.classList.toggle('hidden', next !== 'paused')
  $invoice.classList.toggle('hidden', next !== 'invoice')
  $hud.classList.toggle('hidden', !playing)
  $max.classList.toggle('hidden', !playing)
  $crosshair.classList.toggle('hidden', !playing)
  $mode.classList.toggle('hidden', !playing)
  switch (next) {
    case 'playing':
      // the clock starts with the first click on "Start shift"
      if (!stats.startTime) stats.startTime = performance.now()
      break
    case 'paused':
      // Chrome refuses to lock the mouse again right away: show "click to resume" after a moment
      $resume.classList.add('waiting')
      setTimeout(() => $resume.classList.remove('waiting'), PLAYER.relockDelay)
      break
    case 'invoice':
      showInvoice()
      break
  }
}

let unlockedAt = 0
$startButton.addEventListener('click', () => {
  audio.start()
  controls.lock()
})
$pause.addEventListener('click', () => {
  if (performance.now() - unlockedAt > PLAYER.relockDelay) {
    audio.start()
    controls.lock()
  }
})
controls.addEventListener('lock', () => setGameState('playing'))
controls.addEventListener('unlock', () => {
  // Esc: stop the vacuum and forget held keys; pause (unless the shift is over)
  unlockedAt = performance.now()
  vacuum.setMode(null)
  keys.clear()
  if (game.state === 'playing') {
    setGameState('paused')
    audio.pause()
  }
})

// the last ghost is caught: a moment to enjoy it, then the invoice (and the mouse is free again)
const endShift = () => {
  stats.endTime = performance.now()
  setTimeout(() => {
    setGameState('invoice')
    document.exitPointerLock()
  }, INVOICE.delay * 1000)
}

// --- the invoice: your pay minus everything the boss bills you for ---
const euro = (amount) => `${amount < 0 ? '−' : ''}€${Math.abs(amount).toFixed(2)}`
const showInvoice = () => {
  const seconds = Math.round((stats.endTime - stats.startTime) / 1000)
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  const items = props.tank.length
  const lines = [
    ['Ghost removal', `${stats.caught} × €${INVOICE.perGhost}`, stats.caught * INVOICE.perGhost],
    ['Night shift', time, INVOICE.shiftPay],
    ["Client's property sucked up", `${items} × €${INVOICE.perItem}`, -items * INVOICE.perItem],
    ['Overtime (ghosts that got away)', `${stats.escapes} × €${INVOICE.perEscape}`, -stats.escapes * INVOICE.perEscape],
    ['1 cat, returned', '', 0],
    ['Vacuum bag (used)', '', -INVOICE.vacuumBag]
  ]
  const total = lines.reduce((sum, line) => sum + line[2], 0)
  // stars: start at 5, lose one per escape and one per 8 items of the client's stuff
  const stars = THREE.MathUtils.clamp(5 - stats.escapes - Math.floor(items / 8), 1, 5)
  const notes = { 5: 'Employee of the month!', 4: 'Solid work. Mind the furniture.', 3: 'Not bad for a first night.', 2: 'We need to talk about your technique.', 1: "Don't call us, we'll call you." }
  $invoice.querySelector('.invoice-meta').textContent = `Invoice #BV-${String(Math.floor(Math.random() * 9000) + 1000)} · Villa, night shift`
  $invoice.querySelector('.invoice-lines').innerHTML = lines.map(([label, detail, amount]) =>
    `<tr><td>${label}</td><td class="detail">${detail}</td><td class="amount ${amount < 0 ? 'minus' : ''}">${euro(amount)}</td></tr>`).join('')
  const $total = $invoice.querySelector('.invoice-total')
  $total.textContent = `Total: ${euro(total)}`
  $total.classList.toggle('minus', total < 0)
  $invoice.querySelector('.invoice-stars').textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars)
  $invoice.querySelector('.invoice-note').textContent = `"${notes[stars]}" — the boss`
}
$invoice.querySelector('.again-button').addEventListener('click', () => window.location.reload())

// tug-of-war input: horizontal mouse movement, added up over the last TUG.inputWindow seconds
const mouseMoves = []
document.addEventListener('mousemove', (e) => {
  if (controls.isLocked) mouseMoves.push({ time: performance.now(), dx: e.movementX })
})
const recentMouseDX = () => {
  const since = performance.now() - TUG.inputWindow * 1000
  while (mouseMoves.length && mouseMoves[0].time < since) mouseMoves.shift()
  return mouseMoves.reduce((sum, move) => sum + move.dx, 0)
}

// during the tug the camera follows the ghost (the mouse is busy pulling)
const aimMatrix = new THREE.Matrix4()
const aimQuaternion = new THREE.Quaternion()
const followGhost = (dt, ghost) => {
  aimMatrix.lookAt(camera.position, ghost.center, camera.up)
  aimQuaternion.setFromRotationMatrix(aimMatrix)
  camera.quaternion.slerp(aimQuaternion, Math.min(1, dt * TUG.aimSpeed))
  // screen shake: stronger as the meter fills
  const shake = TUG.shake * ghost.tug.meter
  camera.position.x += (Math.random() - 0.5) * 2 * shake
  camera.position.y += (Math.random() - 0.5) * 2 * shake
}

// left mouse = suck, right mouse = blow
document.addEventListener('mousedown', (e) => {
  if (!controls.isLocked) return
  const mode = e.button === 0 ? 'suck' : e.button === 2 ? 'blow' : null
  if (!mode) return
  vacuum.setMode(mode)
  // a different start sound for sucking (rising) and blowing (falling)
  audio.modeStart(mode)
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

let verticalSpeed = 0
let grounded = true
const forwardDir = new THREE.Vector3()
const rightDir = new THREE.Vector3()
const desired = new THREE.Vector3()
const movePlayer = (dt) => {
  const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0)
  const right = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0)
  // where the camera looks, flattened onto the floor
  camera.getWorldDirection(forwardDir)
  forwardDir.y = 0
  forwardDir.normalize()
  rightDir.crossVectors(forwardDir, camera.up)
  // diagonal walking is not faster
  const length = Math.hypot(forward, right) || 1
  const step = PLAYER.walkSpeed * dt / length
  desired.copy(forwardDir).multiplyScalar(forward * step).addScaledVector(rightDir, right * step)

  // jumping and falling: gravity pulls the vertical speed down every frame
  if (jumpRequested && grounded) verticalSpeed = PLAYER.jumpSpeed
  jumpRequested = false
  verticalSpeed += PHYSICS.gravity * PLAYER.gravityScale * dt
  desired.y = verticalSpeed * dt

  // the physics character controller stops us at walls, furniture, floor and ceiling
  const result = physics.movePlayer(desired)
  grounded = result.grounded
  // standing on the floor, or bumped the ceiling: stop the vertical speed
  if (grounded && verticalSpeed < 0) verticalSpeed = 0
  if (verticalSpeed > 0 && result.movement.y < desired.y * 0.5) verticalSpeed = 0
  // the camera sits at eye height above the bottom of the capsule
  camera.position.set(result.position.x, result.position.y - PLAYER.height / 2 + CAMERA.eyeHeight, result.position.z)
}

// THREE.Clock is deprecated since r183 (it logs a warning), Timer replaces it
// https://threejs.org/docs/#api/en/core/Timer
const timer = new THREE.Timer()

const viewDirection = new THREE.Vector3()
const draw = (timestamp) => {
  timer.update(timestamp)
  const dt = Math.min(timer.getDelta(), MAX_DT)

  iTime.value = timer.getElapsed()

  if (controls.isLocked) movePlayer(dt)
  // tug-of-war: the mouse pulls instead of turning the camera, the camera follows the ghost
  const fighting = tuggingGhost()
  controls.enabled = fighting === null
  if (fighting) followGhost(dt, fighting)
  // the camera moved: update its matrices before reading the nozzle and lamp positions
  camera.updateMatrixWorld()
  // what's in the middle of the screen? the suction aims there
  camera.getWorldDirection(viewDirection)
  vacuum.update(physics.castAim(camera.position, viewDirection, SUCTION.range))
  flashlight.update()

  updateMax(dt)
  const { power, mode, boost } = vacuum.state
  // the ghosts: animation, visibility in the beam, smoke stretched toward the nozzle while sucking
  const mouseDX = recentMouseDX()
  ghosts.forEach((ghost) => ghost.update(dt, {
    camera,
    lampPos: flashlight.uniforms.lampPos.value,
    lampDir: flashlight.uniforms.lampDir.value,
    nozzle: vacuum.nozzle,
    aimPoint: vacuum.aimPoint,
    power: mode === 'suck' ? power : 0,
    mouseDX
  }))

  // physics, with the suction force applied before every step
  physics.step(dt, (stepDt) => props.applySuction(vacuum.nozzle, power, mode, stepDt, boost))
  // sucking at (almost) full power: small props at the nozzle go into the tank
  if (mode === 'suck' && power >= TANK.captureMinPower) {
    const caught = props.capture(vacuum.nozzle)
    // clutter near the hiding spot exposes the ghost
    caught.forEach((prop) => ghosts.forEach((ghost) => ghost.onPropCaptured(prop)))
    if (caught.length > 0) audio.plop()
  }
  props.update()
  if (DEBUG) physics.updateDebugLines()
  // the vacuum sound follows the power, the mode, MAX and the tug meter
  audio.update({ power, mode, boost, tug: tuggingGhost()?.tug.meter ?? 0 })
  // dust: same suction as the props (MAX makes it stronger too)
  dust?.update(renderer, dt, power * boost, mode)
  updateHud()
  if (DEBUG) updateFps(dt)
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

// no real WebGPU (old browser): three.js falls back to WebGL, the dust is off
if (!renderer.backend.isWebGPUBackend) document.querySelector('#no-webgpu').classList.remove('hidden')
// touch screens: the game needs a mouse and keyboard (it still renders)
if (window.matchMedia('(pointer: coarse)').matches) $start.querySelector('.touch-notice').classList.remove('hidden')

// everything is loaded: the shift can start
$startButton.disabled = false
$startButton.textContent = 'Start shift'

renderer.setAnimationLoop(draw)
