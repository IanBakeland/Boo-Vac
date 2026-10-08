// The intro: your phone rings, you pick up, the boss explains the job.
// The voice is the browser's own speech synthesis (Web Speech API, no recordings):
// https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis
import { INTRO } from './config.js'

// $start: the start overlay with the phone in it, onEnd: the call is over (show "Start shift")
export const createIntro = ({ audio, $start, onEnd }) => {
  const $phone = $start.querySelector('.phone')
  const $incoming = $phone.querySelector('.call-incoming')
  const $active = $phone.querySelector('.call-active')
  const $ended = $phone.querySelector('.call-ended')
  const $status = $phone.querySelector('.call-status')
  const $timer = $phone.querySelector('.call-timer')
  const $subtitle = $phone.querySelector('.call-subtitle')
  const $wave = $phone.querySelector('.call-wave')
  const $duration = $phone.querySelector('.call-duration')
  const $hint = $start.querySelector('.intro-hint')

  // the clock on the phone: two minutes to midnight
  $phone.querySelectorAll('.phone-clock').forEach(($clock) => { $clock.textContent = INTRO.clock })

  let state = 'ringing' // 'ringing' -> 'talking' -> 'ended'
  let ringTimer = null
  let callStart = 0
  let timerInterval = null

  // ringing: the phone buzzes (CSS), and once sound is allowed (after a click) you hear the ringtone
  const startRinging = () => {
    $phone.classList.add('ringing')
    audio.ring()
    clearInterval(ringTimer)
    ringTimer = setInterval(() => audio.ring(), INTRO.ringEvery * 1000)
  }
  const stopRinging = () => {
    $phone.classList.remove('ringing')
    clearInterval(ringTimer)
  }

  // pick the voice: an English voice, preferably one of the more natural ones
  const pickVoice = () => {
    const voices = window.speechSynthesis?.getVoices() ?? []
    const english = voices.filter((voice) => voice.lang.startsWith('en'))
    return INTRO.preferredVoices.map((name) => english.find((voice) => voice.name.includes(name))).find(Boolean) ?? english[0] ?? null
  }

  // say one line of the voicemail; resolves when it's done (or after a reading time without speech)
  const say = (text) => new Promise((resolve) => {
    $subtitle.textContent = text
    const synth = window.speechSynthesis
    if (!synth) {
      // no speech in this browser: just give enough time to read the subtitle
      setTimeout(resolve, text.split(' ').length * INTRO.readTime * 1000)
      return
    }
    const line = new SpeechSynthesisUtterance(text)
    const voice = pickVoice()
    if (voice) line.voice = voice
    line.pitch = INTRO.pitch
    line.rate = INTRO.rate
    // the sound wave moves only while he's talking
    line.onstart = () => $wave.classList.add('talking')
    line.onend = () => {
      $wave.classList.remove('talking')
      resolve()
    }
    line.onerror = () => {
      $wave.classList.remove('talking')
      resolve()
    }
    synth.speak(line)
  })

  const pause = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000))

  const accept = async () => {
    if (state !== 'ringing') return
    state = 'talking'
    audio.start()
    stopRinging()
    audio.click()
    audio.line(true)
    audio.musicVolume(INTRO.musicDuck)
    $incoming.classList.add('hidden')
    $active.classList.remove('hidden')
    $hint.classList.add('hidden')
    // the call timer: 0:00, 0:01, ...
    callStart = performance.now()
    timerInterval = setInterval(() => { $timer.textContent = formatTime(performance.now() - callStart) }, 250)
    $status.textContent = 'The boss'
    for (const text of INTRO.lines) {
      if (state !== 'talking') return
      await say(text)
      await pause(INTRO.linePause)
    }
    hangUp()
  }

  // declining doesn't help: the boss just calls again (and now you hear it ring)
  const decline = () => {
    if (state !== 'ringing') return
    audio.start()
    stopRinging()
    audio.click()
    $start.querySelector('.call-name-note').textContent = 'calling again…'
    setTimeout(startRinging, INTRO.callBackDelay * 1000)
  }

  const hangUp = () => {
    if (state === 'ended') return
    state = 'ended'
    window.speechSynthesis?.cancel()
    clearInterval(timerInterval)
    audio.click()
    audio.line(false)
    audio.musicVolume(1)
    $duration.textContent = `Call ended · ${formatTime(performance.now() - callStart)}`
    $active.classList.add('hidden')
    $ended.classList.remove('hidden')
    $start.classList.add('call-done')
    onEnd?.()
  }

  const formatTime = (ms) => {
    const seconds = Math.floor(ms / 1000)
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  }

  $phone.querySelector('.accept-button').addEventListener('click', accept)
  $phone.querySelector('.decline-button').addEventListener('click', decline)
  $phone.querySelector('.skip-button').addEventListener('click', hangUp)
  // some browsers load their voices a moment later
  window.speechSynthesis?.addEventListener?.('voiceschanged', pickVoice)

  // the phone starts ringing right away (silently: browsers only allow sound after a click)
  startRinging()
}
