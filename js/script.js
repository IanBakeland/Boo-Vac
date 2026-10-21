import * as THREE from 'three/webgpu'
import gsap from 'gsap'
import { uniform } from 'three/tsl'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'

import { CAMERA, MAX_DT, LAYOUT, PLAYER, PHYSICS, TANK, CLOG, MAX, DUST, SUCTION, TUG, GHOSTS, THROW, INVOICE, HUD, OUTRO } from './config.js'
import { createPhysics, checkSuctionForce } from './physics.js'
import { createAudio } from './audio.js'
import { createIntro } from './intro.js'
import { createVoice } from './voice.js'
import { createOutro } from './outro.js'
import { createPostfx } from './postfx.js'
import { createRoom } from './objects/room.js'
import { createProps } from './objects/props.js'
import { createFlashlight } from './objects/flashlight.js'
import { createVacuum } from './objects/vacuum.js'
import { createDust } from './objects/dust.js'
import { createGhost } from './objects/ghost.js'

// --- HTML elements ---
const canvas = document.querySelector('canvas.webgl')
const $start = document.querySelector('#start')
const $startButton = $start.querySelector('.start-button')
const $pause = document.querySelector('#pause')
const $resume = $pause.querySelector('.action')
const $soundLabel = $pause.querySelector('.sound-label')
const $pauseButtons = [...$pause.querySelectorAll('.pause-button')]
const $invoice = document.querySelector('#invoice')
const $hud = document.querySelector('#hud')
const $ghostCount = $hud.querySelector('.ghost-count')
const $tankCount = $hud.querySelector('.tank-count')
const $muteLabel = $hud.querySelector('.mute-label')
const $crosshair = document.querySelector('#crosshair')
const $mode = document.querySelector('#mode')
const $max = document.querySelector('#max')
const $maxState = $max.querySelector('.max-state')
const $tug = document.querySelector('#tug')
const $tugName = $tug.querySelector('.tug-name')
const $tugArrow = $tug.querySelector('.tug-arrow')
const $tugFill = $tug.querySelector('.tug-fill')
const $tugRounds = $tug.querySelector('.tug-rounds')
const $tankBill = $hud.querySelector('.tank-bill')
const $tallyIcons = $hud.querySelector('.tally-icons')
const $exposeFill = $crosshair.querySelector('.expose-fill')
const $prompt = document.querySelector('#prompt')
const $toast = document.querySelector('#toast')
const $vignette = document.querySelector('#vignette')
const $fps = document.querySelector('#fps')
const $curtain = document.querySelector('#curtain')
const $clog = document.querySelector('#clog')
const $clogPips = $clog.querySelector('.clog-pips')

// sound (starts on the first click, browsers don't allow sound before that)
const audio = createAudio()
// the boss's voice (Kokoro, WebGPU) starts loading right away, during the opening film
const voice = createVoice()
// the intro starts right away (a voicemail on your phone, while the models load)
const intro = createIntro({ audio, voice, $start })

// ?debug in the URL: collider lines, FPS, suction self-check, debug keys
const DEBUG = new URLSearchParams(window.location.search).has('debug')

// --- setup ---
const scene = new THREE.Scene()

const size = {
  width: window.innerWidth,
  height: window.innerHeight
}

const camera = new THREE.PerspectiveCamera(CAMERA.fov, size.width / size.height, CAMERA.near, CAMERA.far)
camera.position.fromArray(LAYOUT.spawn.position)
camera.lookAt(...LAYOUT.spawn.lookAt)
// the camera is in the scene because the vacuum and flashlight are its children
scene.add(camera)

// first person: the mouse turns the camera while the pointer is locked
// https://threejs.org/docs/#examples/en/controls/PointerLockControls
const controls = new PointerLockControls(camera, canvas)
// a refused lock is handled in lockPointer(): the addon's own error log isn't needed
document.removeEventListener('pointerlockerror', controls._onPointerlockError)

const renderer = new THREE.WebGPURenderer({
  canvas: canvas,
  antialias: true,
  alpha: false
})
renderer.setSize(size.width, size.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
// wait for the GPU: compute shaders (dust) need an initialized renderer
await renderer.init()

// --- the world ---
const room = await createRoom()
scene.add(room.mesh)
// physics: the house (walls, floors, ceilings) as triangle meshes, our furniture as boxes
const physics = await createPhysics()
physics.addTrimesh(room.shell)
// static furniture gets a fixed box; dynamic furniture (table, chair, vase) is added with the props
room.furniture.forEach((piece) => { if (!piece.userData.layout.dynamic) physics.addBox(piece) })

// props: every one gets a dynamic physics body
const props = await createProps({ physics })
scene.add(props.mesh)
room.furniture.forEach((piece) => { if (piece.userData.layout.dynamic) props.addMovable(piece) })
// one physics step now: Rapier only registers new colliders for collision checks during a step,
// so without it the player would have no collision in the very first frame
physics.step(PHYSICS.fixedStep)

if (DEBUG) {
  checkSuctionForce()
  physics.updateDebugLines()
  scene.add(physics.debugLines)
}

// the Shadertoy shaders' clock (Ether ghost aura, suction cone, beam, dust, VHS), updated every frame
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

// VHS filter over the frame (WGSL needs real WebGPU, like the dust)
const postfx = renderer.backend.isWebGPUBackend ? createPostfx({ renderer, scene, camera, iTime }) : null
const render = () => postfx ? postfx.render() : renderer.render(scene, camera)

// --- the ghosts ---
// game stats (for the HUD, and the invoice at the end)
const stats = { caught: 0, escapes: 0, startTime: 0, endTime: 0 }

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
  onCapture: (config) => {
    audio.capture()
    stats.caught++
    tallyCaught(config)
    const left = GHOSTS.length - stats.caught
    showToast(`${config.name} caught!`, left > 0 ? `${left} to go` : "That's all of them. Shift over!", config)
    // the last ghost: the shift is over
    if (stats.caught === GHOSTS.length) endShift()
  },
  onEscape: (config) => {
    stats.escapes++
    showToast(`${config.name} got away`, "It's hiding somewhere else now", config)
    // Dusty giggles at you, the others moan
    if (config.giggle) audio.giggle()
    else audio.moan()
  },
  onEmerge: (config) => {
    audio.moan()
    showToast(`${config.name} is out!`, 'Hold suck and keep it in your flashlight', config)
  },
  onThrow: (from) => throwBook(from)
})))
ghosts.forEach((g) => scene.add(g.mesh))
// the ghost you're fighting right now (or null)
const tuggingGhost = () => ghosts.find((g) => g.isTugging()) ?? null

// --- screens: game state machine (start -> playing <-> paused -> ending -> invoice) ---
const game = { state: 'start' }
let pausedAt = 0
const setGameState = (next) => {
  game.state = next
  const playing = next === 'playing'
  // leaving the start screen: the intro plays its own exit (into the house), then hides itself
  if (next !== 'start') intro.enter()
  $pause.classList.toggle('hidden', next !== 'paused')
  // paused: time stops (gsap tweens like a ghost flying off, and the shift clock) and the room behind goes gray
  const paused = next === 'paused'
  gsap.globalTimeline.paused(paused)
  document.body.classList.toggle('paused', paused)
  if (paused) pausedAt = performance.now()
  else if (pausedAt) {
    // the paused time doesn't count for the invoice
    if (stats.startTime) stats.startTime += performance.now() - pausedAt
    pausedAt = 0
  }
  $invoice.classList.toggle('hidden', next !== 'invoice')
  // the ending: the HUD stays a moment (the full ghost tally), the outro fades it out
  $hud.classList.toggle('hidden', !playing && next !== 'ending')
  $max.classList.toggle('hidden', !playing)
  $crosshair.classList.toggle('hidden', !playing)
  $mode.classList.toggle('hidden', !playing)
  // the clog panel: hidden outside play, updateHud shows it again (if still clogged) when you resume
  if (!playing) $clog.classList.add('hidden')
  shownClog = ''
  switch (next) {
    case 'playing':
      // the clock starts with the first click on "Start shift"
      if (!stats.startTime) stats.startTime = performance.now()
      break
    case 'paused':
      // Chrome refuses to lock the mouse again right away: Resume works after a moment
      $resume.classList.add('waiting')
      setTimeout(() => $resume.classList.remove('waiting'), PLAYER.relockDelay)
      // how the shift is going: the HUD's ghost tally and the tank
      $pause.querySelector('.pause-tally').innerHTML = $tallyIcons.innerHTML
      $pause.querySelector('.pause-stats').textContent = `${stats.caught}/${GHOSTS.length} caught · ${props.tank.length} sucked up`
      $resume.focus({ preventScroll: true })
      break
    case 'invoice':
      showInvoice()
      break
  }
}

// the last ghost is caught: the ending plays (js/outro.js), the mouse is free again, then the invoice
const outro = createOutro({ $start, $hud, $invoice, audio, flashlight, camera, showInvoice: () => setGameState('invoice') })
const endShift = () => {
  stats.endTime = performance.now()
  setGameState('ending')
  document.exitPointerLock()
  outro.play({ seconds: (stats.endTime - stats.startTime) / 1000, escapes: stats.escapes })
}

// the invoice: your pay minus everything the boss bills you for
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
// play again / restart: a new shift on a fresh page, so WebGPU, physics, ghosts, props, sound and every timer
// really start from zero (#again: the intro skips the voicemail you already heard)
const newShift = () => {
  $curtain.classList.add('closed')
  setTimeout(() => {
    history.replaceState(null, '', '#again')
    window.location.reload()
  }, OUTRO.replayFade * 1000)
}
$invoice.querySelector('.again-button').addEventListener('click', newShift)
// the pause screen's restart button (stopPropagation: a click on the pause screen itself resumes)
$pause.querySelector('.restart-button').addEventListener('click', (e) => {
  e.stopPropagation()
  newShift()
})
// sound on/off: the M key and the pause screen's button do the same
const toggleSound = () => {
  const muted = audio.toggleMute()
  $muteLabel.classList.toggle('hidden', !muted)
  $soundLabel.textContent = muted ? 'Sound: off' : 'Sound: on'
}
$pause.querySelector('.sound-button').addEventListener('click', (e) => {
  e.stopPropagation()
  toggleSound()
})

// --- HUD (only touches the DOM when a value changed) ---
// a ghost's color for the HUD (its Ether tint)
const ghostColor = (config) => `rgb(${config.tint.map((c) => Math.round(c * 255)).join(', ')})`

// the tally: one little ghost per ghost of the night, hollow until it's caught
const GHOST_PATH = 'M1 28 V14 A10 10 0 0 1 21 14 V28 L17 24 L13 28 L11 24 L9 28 L5 24 Z'
GHOSTS.forEach((config) => {
  const $icon = document.createElement('span')
  $icon.className = 'tally-ghost'
  $icon.title = config.name
  $icon.style.setProperty('--ghost', ghostColor(config))
  $icon.innerHTML = `<svg viewBox="0 0 22 30"><path d="${GHOST_PATH}"/><circle cx="7.5" cy="13" r="1.8"/><circle cx="14.5" cy="13" r="1.8"/></svg>`
  $tallyIcons.append($icon)
})
const tallyCaught = (config) => {
  const $icon = $tallyIcons.children[GHOSTS.indexOf(config)]
  $icon.classList.add('caught')
  $icon.animate([{ transform: 'scale(2.2)', filter: 'brightness(3)' }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: 600, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' })
}

// event titles: "Dusty is out!", "... caught!", "... got away", in the ghost's color
const showToast = (title, sub, config) => {
  $toast.querySelector('.toast-title').textContent = title
  $toast.querySelector('.toast-sub').textContent = sub
  $toast.style.setProperty('--ghost', config ? ghostColor(config) : '#ece4cc')
  $toast.getAnimations().forEach((animation) => animation.cancel())
  $toast.animate([
    { opacity: 0, transform: 'translateY(-8px) scale(1.06)', filter: 'blur(6px)' },
    { opacity: 1, transform: 'none', filter: 'blur(0)', offset: 0.1 },
    { opacity: 1, transform: 'none', filter: 'blur(0)', offset: 0.82 },
    { opacity: 0, transform: 'translateY(4px)', filter: 'blur(4px)' }
  ], { duration: HUD.toastTime * 1000, easing: 'ease-out' })
}

// a number that just changed gives a little jump
const bump = ($element) => $element.animate([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' })

let shownCaught = -1
let shownTank = -1
let shownMode = ''
let shownTug = ''
let shownRound = 0
let shownVignette = ''
let shownMax = ''
let shownPrompt = ''
let shownExpose = ''
let shownClog = ''
// exposure: the ring shows while a hidden ghost's exposure is rising (you're sucking at its spot)
let lastExposures = GHOSTS.map(() => 0)
let exposeShownFor = 0
const updateHud = (dt) => {
  if (stats.caught !== shownCaught) {
    shownCaught = stats.caught
    $ghostCount.textContent = shownCaught
  }
  if (props.tank.length !== shownTank) {
    if (shownTank >= 0) bump($tankCount)
    shownTank = props.tank.length
    $tankCount.textContent = shownTank
    $tankBill.textContent = `billed to you: €${shownTank * INVOICE.perItem}`
    $hud.style.setProperty('--tank', Math.min(shownTank / HUD.tankIconFull, 1))
  }
  // SUCK / BLOW under the reticle (and the reticle in that color) while the motor runs
  // (clogged and trying to suck: CLOGGED instead)
  const running = vacuum.state.power > 0.05
  const choked = clog.jammed && vacuum.state.mode === 'suck'
  const modeState = running ? (choked ? 'clogged' : vacuum.state.mode) : ''
  if (modeState !== shownMode) {
    shownMode = modeState
    $mode.textContent = modeState.toUpperCase()
    $mode.classList.remove('suck', 'blow', 'clogged')
    $crosshair.classList.remove('suck', 'blow')
    if (modeState) {
      $mode.classList.add(modeState)
      if (!choked) $crosshair.classList.add(modeState)
    }
  }
  // clogged: the panel under the reticle, one pip per item still stuck in the hose (they pop away as they fly out)
  const clogState = clog.jammed ? `${clog.items.length}-${vacuum.state.mode === 'blow'}` : 'off'
  if (clogState !== shownClog) {
    shownClog = clogState
    $clog.classList.toggle('hidden', !clog.jammed)
    $clog.classList.toggle('blowing', clog.jammed && vacuum.state.mode === 'blow')
    $hud.classList.toggle('clogged', clog.jammed)
    ;[...$clogPips.children].forEach(($pip, i) => $pip.classList.toggle('stuck', i < clog.items.length))
  }
  // exposure ring: the highest exposure that rose this frame (or less than a moment ago)
  let rising = -1
  ghosts.forEach((ghost, i) => {
    const exposure = ghost.isHidden() ? ghost.getExposure() : 0
    if (exposure > lastExposures[i]) rising = Math.max(rising, exposure)
    lastExposures[i] = exposure
  })
  exposeShownFor = rising >= 0 ? HUD.exposeLinger : Math.max(0, exposeShownFor - dt)
  if (rising >= 0) $crosshair.dataset.expose = rising
  const exposeState = exposeShownFor > 0 ? Math.round(Number($crosshair.dataset.expose) * 50) : 'off'
  if (exposeState !== shownExpose) {
    shownExpose = exposeState
    $crosshair.classList.toggle('exposing', exposeShownFor > 0)
    $exposeFill.style.strokeDashoffset = 100 - Number($crosshair.dataset.expose ?? 0) * 100
  }
  // tug meter: the arrow shows which way YOU must move the mouse (against the ghost)
  const fighting = tuggingGhost()
  const tugging = fighting !== null
  const { meter, pullDir, correct, round, rounds } = fighting?.tug ?? {}
  const tugState = tugging ? `${pullDir}-${correct}-${Math.round(meter * 50)}-${round}` : 'off'
  if (tugState !== shownTug) {
    shownTug = tugState
    $tug.classList.toggle('hidden', !tugging)
    $crosshair.classList.toggle('tugging', tugging)
    if (tugging) {
      const config = GHOSTS.find((c) => c.name === fighting.name)
      $tug.style.setProperty('--ghost', ghostColor(config))
      $tug.classList.toggle('correct', correct)
      $tug.classList.toggle('danger', !correct && meter < HUD.dangerMeter)
      $tug.dataset.dir = pullDir > 0 ? 'left' : 'right'
      $tugFill.style.width = `${meter * 100}%`
      $tugName.textContent = fighting.name
      $tugRounds.textContent = rounds > 1 ? '●'.repeat(round) + '○'.repeat(rounds - round) : ''
      // Granny Clock: the next round starts
      if (round > shownRound && shownRound > 0) showToast(`Round ${round}`, "She's not done with you yet", config)
    }
    shownRound = tugging ? round : 0
  }
  // tension: the screen edges close in as the meter runs low
  const vignette = tugging ? (1 - meter).toFixed(1) : '0'
  if (vignette !== shownVignette) {
    shownVignette = vignette
    $vignette.style.opacity = vignette
  }
  // a hint when it matters: a ghost is out and in view, but you're not pulling it yet
  const promptState = !tugging && !clog.jammed && ghosts.some((g) => g.isOut() && g.getVisibility() > HUD.promptVisibility) ? 'out' : ''
  if (promptState !== shownPrompt) {
    shownPrompt = promptState
    $prompt.classList.toggle('hidden', !promptState)
    $prompt.innerHTML = promptState ? '<span class="suck-text">hold left mouse</span> · keep it in your beam' : ''
  }
  // MAX gauge: a ring that drains while MAX runs and fills up again (in 5% steps)
  const maxState = `${maxActive}-${Math.round(maxCharge * 20)}-${maxCharge >= 1}`
  if (maxState !== shownMax) {
    const wasReady = $max.classList.contains('ready')
    shownMax = maxState
    $max.style.setProperty('--charge', maxCharge)
    $max.classList.toggle('active', maxActive)
    $max.classList.toggle('ready', !maxActive && maxCharge >= 1)
    $maxState.textContent = maxActive ? 'active!' : maxCharge >= 1 ? 'ready' : 'charging'
    // charged again: one short flash
    if (!wasReady && $max.classList.contains('ready')) $max.animate([{ filter: 'brightness(2.2)' }, { filter: 'brightness(1)' }], { duration: 500 })
  }
}

// ?debug: frames per second and the ghosts' exposure, updated twice a second
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

// --- MAX mode: press F when charged -> MAX.duration s of extra force, then recharge ---
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

// --- clogging: CLOG.capacity items in the hose and the vacuum jams ---
// Sucking does nothing then (no air flows); blowing shoots the items back out one by one
const clog = { items: [], jammed: false, timer: 0 }
// one pip per place in the hose, for the clog panel
for (let i = 0; i < CLOG.capacity; i++) {
  const $pip = document.createElement('span')
  $pip.className = 'clog-pip'
  $clogPips.append($pip)
}
const addToHose = (caught) => {
  clog.items.push(...caught)
  if (!clog.jammed && clog.items.length >= CLOG.capacity) {
    clog.jammed = true
    vacuum.state.clogged = true
    audio.clog()
    $clog.animate([{ transform: 'translateX(-50%) scale(1.25)', filter: 'brightness(2)' }, { transform: 'translateX(-50%) scale(1)', filter: 'brightness(1)' }], { duration: 400, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' })
  }
}
const ejectSpawn = new THREE.Vector3()
const ejectVelocity = new THREE.Vector3()
// one item flies out of the nozzle (a bit closer to you when a wall is in front of the nozzle)
const ejectOne = (aimDistance) => {
  const prop = clog.items.pop()
  const toNozzle = camera.position.distanceTo(vacuum.nozzle.position)
  const fraction = THREE.MathUtils.clamp((aimDistance - 0.3) / toNozzle, CLOG.ejectMinFraction, 1)
  ejectSpawn.lerpVectors(camera.position, vacuum.nozzle.position, fraction)
  ejectVelocity.copy(vacuum.nozzle.direction).multiplyScalar(CLOG.ejectSpeed)
  ejectVelocity.y += CLOG.ejectLift
  props.eject(prop, ejectSpawn, ejectVelocity)
  audio.eject()
  // the last one: the air flows again
  if (clog.items.length === 0) {
    clog.jammed = false
    vacuum.state.clogged = false
    audio.unclog()
    showToast('Unclogged!', 'Mind what you suck up')
  }
}
const updateClog = (dt, aimDistance) => {
  const { power, mode } = vacuum.state
  if (!clog.jammed || mode !== 'blow' || power < CLOG.ejectMinPower) {
    clog.timer = 0
    return
  }
  clog.timer -= dt
  if (clog.timer <= 0) {
    clog.timer = CLOG.ejectInterval
    ejectOne(aimDistance)
  }
}

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
  if (e.code === 'KeyM') toggleSound()
  // pause menu: arrow keys move between the buttons (Enter / Space press them)
  if (game.state === 'paused' && (e.code === 'ArrowDown' || e.code === 'ArrowUp')) {
    const step = e.code === 'ArrowDown' ? 1 : -1
    const current = $pauseButtons.indexOf(document.activeElement)
    $pauseButtons[(current + step + $pauseButtons.length) % $pauseButtons.length].focus()
    e.preventDefault()
  }
  // debug: G makes the nearest hidden ghost come out right away
  if (DEBUG && e.code === 'KeyG') {
    const hidden = ghosts.filter((g) => g.isHidden())
    hidden.sort((a, b) => a.center.distanceTo(camera.position) - b.center.distanceTo(camera.position))
    hidden[0]?.emerge()
  }
  // debug: P drops all props from 1 m higher
  if (DEBUG && e.code === 'KeyP') props.drop()
  // debug: O plays the ending right away (the same call as catching the last ghost)
  if (DEBUG && e.code === 'KeyO' && game.state === 'playing') endShift()
})
window.addEventListener('keyup', (e) => keys.delete(e.code))

// pointer lock needs a click: "Start shift" and the pause screen catch it.
// The browser may refuse (e.g. a click right after Esc): then nothing happens and you just click again
const lockPointer = () => canvas.requestPointerLock()?.catch?.(() => {})
let unlockedAt = 0
$startButton.addEventListener('click', () => {
  // the shift starts: nothing from the intro may keep playing
  intro.stop()
  audio.start()
  lockPointer()
})
$pause.addEventListener('click', () => {
  if (performance.now() - unlockedAt > PLAYER.relockDelay) {
    audio.start()
    lockPointer()
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

// --- the player ---
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

// --- the game loop ---
// THREE.Clock is deprecated since r183 (it logs a warning), Timer replaces it
// https://threejs.org/docs/#api/en/core/Timer
const timer = new THREE.Timer()
const viewDirection = new THREE.Vector3()

const draw = (timestamp) => {
  timer.update(timestamp)
  // (never negative: the very first frame can report a tiny negative delta)
  const dt = THREE.MathUtils.clamp(timer.getDelta(), 0, MAX_DT)

  // paused: time stands still. Nothing moves (ghosts, physics, MAX, dust, shaders), the frozen frame is still drawn
  if (game.state === 'paused') {
    render()
    return
  }
  // shader time only runs while playing (so it doesn't jump after a pause)
  iTime.value += dt

  if (controls.isLocked) movePlayer(dt)
  // tug-of-war: the mouse pulls instead of turning the camera, the camera follows the ghost
  let fighting = tuggingGhost()
  controls.enabled = fighting === null
  if (fighting) followGhost(dt, fighting)
  // the camera moved: update its matrices before reading the nozzle and lamp positions
  camera.updateMatrixWorld()
  // what's in the middle of the screen? the suction aims there
  camera.getWorldDirection(viewDirection)
  const aimDistance = physics.castAim(camera.position, viewDirection, SUCTION.range)
  vacuum.update(aimDistance)
  flashlight.update()

  updateMax(dt)
  const { power, mode, boost } = vacuum.state
  // clogged: sucking moves no air (nothing gets pulled), only blowing works
  const airPower = clog.jammed && mode === 'suck' ? 0 : power
  updateClog(dt, aimDistance)
  // the ghosts: animation, visibility in the beam, smoke stretched toward the nozzle while sucking
  const mouseDX = recentMouseDX()
  ghosts.forEach((ghost) => ghost.update(dt, {
    camera,
    lampPos: flashlight.uniforms.lampPos.value,
    lampDir: flashlight.uniforms.lampDir.value,
    nozzle: vacuum.nozzle,
    aimPoint: vacuum.aimPoint,
    power: mode === 'suck' ? airPower : 0,
    mouseDX
  }))

  // physics, with the suction force applied before every step
  physics.step(dt, (stepDt) => props.applySuction(vacuum.nozzle, airPower, mode, stepDt, boost))
  // sucking at (almost) full power: small props at the nozzle go into the hose (until it's full: clogged)
  if (mode === 'suck' && airPower >= TANK.captureMinPower) {
    const caught = props.capture(vacuum.nozzle, CLOG.capacity - clog.items.length)
    addToHose(caught)
    // clutter near the hiding spot exposes the ghost
    caught.forEach((prop) => ghosts.forEach((ghost) => ghost.onPropCaptured(prop)))
    if (caught.length > 0) audio.plop()
  }
  props.update()
  if (DEBUG) physics.updateDebugLines()
  // the vacuum sound follows the power, the mode, MAX and the tug meter (the tug may have just ended)
  fighting = tuggingGhost()
  audio.update({ power, mode, boost, tug: fighting?.tug.meter ?? 0, tugging: fighting !== null, clogged: clog.jammed })
  // dust: same suction as the props (MAX makes it stronger too)
  dust?.update(renderer, dt, airPower * boost, mode)
  postfx?.update(fighting !== null, fighting?.tug.meter ?? 0)
  updateHud(dt)
  if (DEBUG) updateFps(dt)
  render()
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

// --- everything is loaded: the shift can start ---
// no real WebGPU (old browser): three.js falls back to WebGL, the dust is off
if (!renderer.backend.isWebGPUBackend) document.querySelector('#no-webgpu').classList.remove('hidden')
// touch screens: the game needs a mouse and keyboard (it still renders)
if (window.matchMedia('(pointer: coarse)').matches) $start.querySelector('.touch-notice').classList.remove('hidden')

$startButton.disabled = false
$startButton.textContent = 'Start shift'

renderer.setAnimationLoop(draw)
