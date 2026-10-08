// The intro: a voicemail from the boss on your phone.
// The voices are the browser's own speech synthesis (Web Speech API, no recordings):
// https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis
import { INTRO } from './config.js'

// $start: the start overlay with the phone in it
export const createIntro = ({ audio, $start }) => {
  const $phone = $start.querySelector('.phone')
  const $lock = $phone.querySelector('.screen-lock')
  const $voicemail = $phone.querySelector('.screen-voicemail')
  const $playButton = $phone.querySelector('.play-button')
  const $wave = $phone.querySelector('.message-wave')
  const $progress = $phone.querySelector('.message-progress-fill')
  const $elapsed = $phone.querySelector('.message-elapsed')
  const $total = $phone.querySelector('.message-total')
  const $transcript = $phone.querySelector('.message-transcript')
  const $hint = $start.querySelector('.intro-hint')

  $phone.querySelectorAll('.phone-clock').forEach(($clock) => { $clock.textContent = INTRO.clock })
  $phone.querySelector('.lock-date').textContent = INTRO.date
  // the notification shows the first words of the message
  $phone.querySelector('.notification-preview').textContent = `"${INTRO.lines[0].split(' ').slice(0, 6).join(' ')}…"`

  // the length of the message, estimated from the number of words (speech has no "duration")
  const words = [INTRO.systemIntro, ...INTRO.lines, INTRO.systemOutro].join(' ').split(' ').length
  const estimate = words * INTRO.readTime + INTRO.lines.length * INTRO.linePause
  const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
  $total.textContent = formatTime(estimate)

  let state = 'locked' // 'locked' -> 'ready' -> 'playing' -> 'done'
  let playStart = 0
  let progressTimer = null

  // pick a voice by name from a list (else the first English voice)
  const pickVoice = (names) => {
    const english = (window.speechSynthesis?.getVoices() ?? []).filter((voice) => voice.lang.startsWith('en'))
    return names.map((name) => english.find((voice) => voice.name.includes(name))).find(Boolean) ?? english[0] ?? null
  }

  // say one line; resolves when it's done (or after a reading time when there's no speech)
  const say = (text, { voices, pitch = 1, rate = 1, transcript = true }) => new Promise((resolve) => {
    if (state !== 'playing') return resolve()
    if (transcript) $transcript.textContent = text
    const synth = window.speechSynthesis
    if (!synth) {
      setTimeout(resolve, text.split(' ').length * INTRO.readTime * 1000)
      return
    }
    const line = new SpeechSynthesisUtterance(text)
    const voice = pickVoice(voices)
    if (voice) line.voice = voice
    line.pitch = pitch
    line.rate = rate
    // the sound wave bounces only while someone talks
    line.onstart = () => $wave.classList.add('talking')
    line.onend = line.onerror = () => {
      $wave.classList.remove('talking')
      resolve()
    }
    synth.speak(line)
  })
  const wait = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000))

  // 1. tap the notification: the voicemail app opens
  const open = () => {
    if (state !== 'locked') return
    state = 'ready'
    audio.start()
    audio.click()
    $phone.classList.remove('buzzing')
    $lock.classList.add('hidden')
    $voicemail.classList.remove('hidden')
    $hint.textContent = 'Press ▶ to listen'
  }

  // 2. play: "You have one new message", beep, the boss, "End of message", beep
  const play = async () => {
    if (state !== 'ready') return
    state = 'playing'
    $playButton.disabled = true
    $hint.classList.add('hidden')
    audio.click()
    audio.line(true)
    audio.musicVolume(INTRO.musicDuck)
    playStart = performance.now()
    progressTimer = setInterval(updateProgress, 200)

    const robot = { voices: INTRO.systemVoices, transcript: false }
    const boss = { voices: INTRO.preferredVoices, pitch: INTRO.pitch, rate: INTRO.rate }
    await say(INTRO.systemIntro, robot)
    if (state === 'playing') audio.beep()
    await wait(0.6)
    for (const text of INTRO.lines) {
      await say(text, boss)
      await wait(INTRO.linePause)
    }
    if (state === 'playing') audio.beep()
    await wait(0.5)
    await say(INTRO.systemOutro, robot)
    finish()
  }

  const updateProgress = () => {
    const seconds = (performance.now() - playStart) / 1000
    $elapsed.textContent = formatTime(Math.min(seconds, estimate))
    $progress.style.width = `${Math.min(seconds / estimate, 1) * 100}%`
  }

  // the message is over (or skipped): "Start shift" appears
  const finish = () => {
    if (state === 'done') return
    state = 'done'
    stop()
    $progress.style.width = '100%'
    $elapsed.textContent = $total.textContent
    $transcript.textContent = 'Three ghosts. One night.'
    $start.classList.add('message-done')
  }

  // silence everything from the intro (also when the shift starts, so nothing keeps playing)
  const stop = () => {
    window.speechSynthesis?.cancel()
    clearInterval(progressTimer)
    $wave.classList.remove('talking')
    audio.line(false)
    audio.musicVolume(1)
  }

  // skip: straight to the end (opens the app first if needed)
  const skip = () => {
    if (state === 'locked') open()
    state = 'playing'
    finish()
  }

  $phone.querySelector('.notification').addEventListener('click', open)
  $playButton.addEventListener('click', play)
  $phone.querySelector('.skip-button').addEventListener('click', skip)

  return { stop }
}
