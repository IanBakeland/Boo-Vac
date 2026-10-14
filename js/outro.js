// The ending, after the last ghost is caught:
//   1. in the room: the HUD fades, the house power comes back on (moonlight -> warm lamp light),
//      you click your flashlight off and take a breath (the camera zooms in a little and rises)
//   2. outside: the camera comes back out of the front door (the intro's dive, in reverse),
//      the three ghosts drop into a jar on the van, "Shift complete"
//   3. the invoice slides in and gets stamped, then "Play again"
// The outside part reuses the intro's villa: js sets data-act="outro" on #start, css/style.css animates it.
// A click skips straight to the invoice.
import gsap from 'gsap'
import { INTRO, OUTRO } from './config.js'

export const createOutro = ({ $start, $hud, $invoice, audio, flashlight, camera, showInvoice }) => {
  const $stamp = $invoice.querySelector('.invoice-stamp')
  const $again = $invoice.querySelector('.again-button')
  let timers = []
  const at = (seconds, callback) => timers.push(setTimeout(callback, seconds * 1000))
  let phase = 'off' // 'off' -> 'room' -> 'outside' -> 'invoice'
  let fanfarePlayed = false

  // when you clocked out: the intro's 23:58 + how long the shift took (past midnight it's Saturday)
  const clockOut = (seconds) => {
    const [hours, minutes] = INTRO.clock.split(':').map(Number)
    const total = hours * 60 + minutes + Math.round(seconds / 60)
    const date = total >= 24 * 60 ? INTRO.nextDate : INTRO.date
    const time = `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
    return `${date} · clocked out at ${time}`
  }

  const fanfare = () => {
    if (fanfarePlayed) return
    fanfarePlayed = true
    audio.fanfare()
  }

  // 2. back outside: the scene fades in, the camera pulls back out of the front door
  const goOutside = () => {
    phase = 'outside'
    // first one frame at normal size ('outside' has no CSS of its own): the browser draws the villa layer
    // (will-change in the CSS) at screen size. Shown straight at the 9x zoom of 'enter'/'outro', it would
    // try to draw it 9x bigger than the screen and the villa doesn't render
    $start.dataset.act = 'outside'
    $start.classList.remove('hidden', 'torch-on')
    delete $start.dataset.line
    $start.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 800, easing: 'ease-out' })
    requestAnimationFrame(() => requestAnimationFrame(() => { $start.dataset.act = 'outro' }))
  }

  // 3. the invoice: slides in (css), gets stamped, then "Play again" gets the focus (Enter works too)
  const toInvoice = () => {
    phase = 'invoice'
    $start.classList.add('outro-invoice')
    showInvoice()
    at(OUTRO.stampAt, () => {
      $stamp.classList.add('stamped')
      audio.stamp()
      $invoice.querySelector('.paper').animate(
        [{ translate: '0 0' }, { translate: '0 4px' }, { translate: '0 0' }],
        { duration: 180, easing: 'ease-out' }
      )
    })
    at(OUTRO.stampAt + 0.7, () => $again.focus({ preventScroll: true }))
  }

  // a click skips to the invoice (all ending animations jump to their end)
  const skip = () => {
    if (phase === 'off' || phase === 'invoice') return
    timers.forEach(clearTimeout)
    timers = []
    $start.classList.add('outro-fast')
    if (phase === 'room') goOutside()
    fanfare()
    toInvoice()
  }

  const play = ({ seconds, escapes }) => {
    phase = 'room'
    $start.querySelector('.outro-caption').textContent = clockOut(seconds)
    $start.querySelector('.outro-sub').textContent = escapes === 0
      ? 'Three ghosts in the jar. Not one of them got away.'
      : `Three ghosts in the jar. They got away ${escapes} time${escapes > 1 ? 's' : ''}, but not for long.`

    // 1. in the room
    $hud.classList.add('complete')
    at(OUTRO.hudFade, () => $hud.classList.add('hud-out'))
    at(OUTRO.lightsOnAt, () => {
      audio.clunk()
      flashlight.lightsOn({ color: OUTRO.houseLight, intensity: OUTRO.houseLightIntensity, duration: OUTRO.lightsOnTime })
    })
    at(OUTRO.flashlightOffAt, () => {
      flashlight.off()
      audio.click()
    })
    gsap.to(camera, { fov: OUTRO.fov, duration: OUTRO.outsideAt, ease: 'sine.inOut', onUpdate: () => camera.updateProjectionMatrix() })
    gsap.to(camera.position, { y: camera.position.y + OUTRO.rise, duration: OUTRO.outsideAt, ease: 'sine.inOut' })

    // 2. outside, 3. the invoice
    at(OUTRO.outsideAt, goOutside)
    at(OUTRO.fanfareAt, fanfare)
    at(OUTRO.invoiceAt, toInvoice)
    // a little later, so the click that caught the last ghost doesn't skip right away
    setTimeout(() => window.addEventListener('click', skip), 500)
  }

  return { play }
}
