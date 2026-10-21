// The intro: a short film outside the villa, with a voicemail from the boss on your phone.
// It runs in acts: js sets data-act on #start, css/style.css does the animation of each act:
//   black -> reveal -> title -> buzz -> ready -> listen -> done -> enter
// While the boss talks, data-line = the line number ("out" after the last one): the scene reacts.
// The voicemail system talks with the browser's own speech synthesis (Web Speech API, no recordings):
// https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis
// The boss talks with Kokoro (js/voice.js, WebGPU), or with speech synthesis too when Kokoro isn't ready.
import { INTRO } from './config.js'

// the front door in the SVG drawing (viewBox 1600 x 900): the camera pushes in toward it
const SCENE_SIZE = [1600, 900]
const DOOR = [820, 610]

// $start: the start overlay with the scene and the phone in it; voice: the boss's Kokoro lines
export const createIntro = ({ audio, voice, $start }) => {
  const $phone = $start.querySelector('.phone')
  const $lock = $phone.querySelector('.screen-lock')
  const $voicemail = $phone.querySelector('.screen-voicemail')
  const $playButton = $phone.querySelector('.play-button')
  const $wave = $phone.querySelector('.message-wave')
  const $progress = $phone.querySelector('.message-progress-fill')
  const $elapsed = $phone.querySelector('.message-elapsed')
  const $total = $phone.querySelector('.message-total')
  const $subtitles = $start.querySelector('.subtitles')
  const $hint = $start.querySelector('.intro-hint')
  const $caption = $start.querySelector('.intro-caption')
  const $flash = $start.querySelector('.flash')

  $phone.querySelectorAll('.phone-clock').forEach(($clock) => { $clock.textContent = INTRO.clock })
  $phone.querySelector('.lock-date').textContent = INTRO.date
  // the notification shows the first words of the message
  $phone.querySelector('.notification-preview').textContent = `"${INTRO.lines[0].split(' ').slice(0, 6).join(' ')}…"`

  // the opening caption, one span per letter (the CSS shows them one by one, like a typewriter)
  const captionText = `${INTRO.date} · ${INTRO.clock}\n${INTRO.place}`
  $caption.replaceChildren(...[...captionText].map((char, i) => {
    if (char === '\n') return document.createElement('br')
    const $char = document.createElement('span')
    $char.textContent = char
    $char.style.setProperty('--i', i)
    return $char
  }))

  // the length of the message: the real duration of the Kokoro lines,
  // estimated from the number of words for the rest (speechSynthesis has no "duration")
  const wordTime = (text) => text.split(' ').length * INTRO.readTime
  const lineTime = (text, i) => voice.has(i) ? voice.get(i).samples.length / voice.get(i).sampleRate : wordTime(text)
  const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
  let estimate = 0
  const updateEstimate = () => {
    estimate = wordTime(INTRO.systemIntro) + wordTime(INTRO.systemOutro) +
      INTRO.lines.reduce((sum, text, i) => sum + lineTime(text, i) + INTRO.linePause, 0)
    $total.textContent = formatTime(estimate)
  }
  updateEstimate()

  let state = 'locked' // 'locked' -> 'ready' -> 'playing' -> 'done'
  let playStart = 0
  let progressTimer = null

  const setAct = (act) => { $start.dataset.act = act }
  // the scripted moments, kept so a skip (or the start of the shift) can cancel them
  let timers = []
  const at = (seconds, callback) => timers.push(setTimeout(callback, seconds * 1000))
  const wait = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000))

  // the camera aims at the door: its position on screen (the SVG covers the screen, anchored at the bottom)
  const aimAtDoor = () => {
    const scale = Math.max(window.innerWidth / SCENE_SIZE[0], window.innerHeight / SCENE_SIZE[1])
    const left = (window.innerWidth - SCENE_SIZE[0] * scale) / 2
    const top = window.innerHeight - SCENE_SIZE[1] * scale
    $start.style.setProperty('--door-x', `${left + DOOR[0] * scale}px`)
    $start.style.setProperty('--door-y', `${top + DOOR[1] * scale}px`)
  }
  aimAtDoor()
  window.addEventListener('resize', aimAtDoor)

  // parallax: the mouse position (-1..1 from the center) shifts the scene's depth layers (see the CSS)
  $start.addEventListener('mousemove', (e) => {
    $start.style.setProperty('--mouse-x', (e.clientX / window.innerWidth) * 2 - 1)
    $start.style.setProperty('--mouse-y', (e.clientY / window.innerHeight) * 2 - 1)
  })

  // lightning: a double flash over the scene and thunder (silent before the first click: no sound allowed yet)
  const lightning = ({ glimpse = false } = {}) => {
    $flash.animate(
      [{ opacity: 0 }, { opacity: 0.75, offset: 0.04 }, { opacity: 0.1, offset: 0.12 }, { opacity: 0.55, offset: 0.2 }, { opacity: 0 }],
      { duration: 1200, easing: 'ease-out' }
    )
    audio.thunder()
    // in the opening, the flash shows the three ghosts in their windows for a moment
    if (glimpse) {
      $start.classList.add('glimpse')
      setTimeout(() => $start.classList.remove('glimpse'), INTRO.lightningGlimpse * 1000)
    }
  }

  // 0. the opening: black, the caption, the villa in the night, lightning, the title, then the phone
  const showPhone = () => {
    if (state !== 'locked') return
    timers.forEach(clearTimeout)
    timers = []
    setAct('buzz')
    $phone.classList.add('buzzing')
    $hint.textContent = 'Your phone buzzes… you have a voicemail.'
  }
  setAct('black')
  at(INTRO.opening.reveal, () => setAct('reveal'))
  at(INTRO.opening.lightning, () => lightning({ glimpse: true }))
  at(INTRO.opening.title, () => setAct('title'))
  at(INTRO.opening.phone, showPhone)
  // impatient? a click anywhere during the opening jumps to the phone
  $start.addEventListener('click', () => {
    if (['black', 'reveal', 'title'].includes($start.dataset.act)) showPhone()
  })

  // pick a voice by name from a list (else the first English voice)
  const pickVoice = (names) => {
    const english = (window.speechSynthesis?.getVoices() ?? []).filter((voice) => voice.lang.startsWith('en'))
    return names.map((name) => english.find((voice) => voice.name.includes(name))).find(Boolean) ?? english[0] ?? null
  }

  // the subtitles: one span per word, so the spoken words can light up
  const showSubtitles = (text, system) => {
    let index = 0
    $subtitles.replaceChildren(...text.split(' ').map((word) => {
      const $word = document.createElement('span')
      $word.textContent = `${word} `
      $word.dataset.start = index
      index += word.length + 1
      return $word
    }))
    $subtitles.classList.toggle('system', system)
    $subtitles.classList.remove('karaoke')
  }
  // a word is being spoken: it and the words before it light up
  const speakWord = (charIndex) => {
    $subtitles.classList.add('karaoke')
    for (const $word of $subtitles.children) $word.classList.toggle('said', Number($word.dataset.start) <= charIndex)
  }

  // the boss says line i with Kokoro: Kokoro has no word timings, so every word lights up
  // when the audio reaches its share of the characters (characters before it / all characters)
  const sayKokoro = async (text, { samples, sampleRate }) => {
    const duration = samples.length / sampleRate
    for (const $word of $subtitles.children) {
      const start = Number($word.dataset.start)
      at(start / text.length * duration, () => speakWord(start))
    }
    $wave.classList.add('talking')
    await audio.speech(samples, sampleRate)
    $wave.classList.remove('talking')
  }

  // say one line; resolves when it's done (or after a reading time when there's no speech)
  // kokoro: the line's Kokoro audio, if it's ready
  const say = (text, { voices, pitch = 1, rate = 1, system = false, kokoro = null }) => new Promise((resolve) => {
    if (state !== 'playing') return resolve()
    showSubtitles(text, system)
    if (kokoro) {
      sayKokoro(text, kokoro).then(resolve)
      return
    }
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
    // not every voice reports word boundaries: then the whole line simply stays lit
    line.onboundary = (e) => { if (e.name === 'word') speakWord(e.charIndex) }
    line.onend = line.onerror = () => {
      $wave.classList.remove('talking')
      resolve()
    }
    synth.speak(line)
  })

  // 1. tap the notification: the voicemail app opens (this first click also unlocks the sound)
  const open = () => {
    if (state !== 'locked') return
    showPhone()
    state = 'ready'
    setAct('ready')
    audio.start()
    audio.click()
    $phone.classList.remove('buzzing')
    $lock.classList.add('hidden')
    $voicemail.classList.remove('hidden')
    $hint.textContent = 'Press ▶ to listen'
  }

  // 2. play: film mode (letterbox, the phone steps aside, slow push toward the house).
  //    "You have one new message", beep, the boss (the house reacts to every line), lights out, "End of message", beep
  const play = async () => {
    if (state !== 'ready') return
    $playButton.disabled = true
    audio.click()
    // Kokoro still busy? wait for it (at most maxWait s), then the lines that aren't ready use speechSynthesis
    $hint.textContent = 'Loading the voicemail…'
    await Promise.race([voice.ready, wait(INTRO.kokoro.maxWait)])
    if (state !== 'ready') return
    updateEstimate()
    state = 'playing'
    setAct('listen')
    audio.line(true)
    audio.musicVolume(INTRO.musicDuck)
    playStart = performance.now()
    progressTimer = setInterval(updateProgress, 200)

    const robot = { voices: INTRO.systemVoices, system: true }
    const boss = { voices: INTRO.preferredVoices, pitch: INTRO.pitch, rate: INTRO.rate }
    await say(INTRO.systemIntro, robot)
    if (state !== 'playing') return
    audio.beep()
    await wait(0.6)
    for (const [i, text] of INTRO.lines.entries()) {
      if (state !== 'playing') return
      $start.dataset.line = i
      await say(text, { ...boss, kokoro: voice.get(i) })
      await wait(INTRO.linePause)
    }
    if (state !== 'playing') return
    // "Good luck!" ... every light in the house goes out. A silence. Lightning.
    $start.dataset.line = 'out'
    $subtitles.replaceChildren()
    await wait(INTRO.lightsOutPause)
    if (state !== 'playing') return
    lightning()
    await wait(1.2)
    if (state !== 'playing') return
    audio.beep()
    await wait(0.5)
    await say(INTRO.systemOutro, robot)
    finish()
  }

  const updateProgress = () => {
    const seconds = (performance.now() - playStart) / 1000
    $elapsed.textContent = formatTime(Math.min(seconds, estimate))
    $progress.style.width = `${Math.min(seconds / estimate, 1) * 100}%`
  }

  // 3. the message is over (or skipped): the phone goes away, the lights stay out,
  //    your flashlight clicks on and points at the door, "Start shift" appears
  const finish = () => {
    if (state === 'done') return
    state = 'done'
    stop()
    $progress.style.width = '100%'
    $elapsed.textContent = $total.textContent
    $start.dataset.line = 'out'
    setAct('done')
    at(INTRO.torchDelay, () => {
      $start.classList.add('torch-on')
      audio.click()
    })
  }

  // silence everything from the intro (also when the shift starts, so nothing keeps playing)
  const stop = () => {
    window.speechSynthesis?.cancel()
    audio.stopSpeech()
    clearInterval(progressTimer)
    timers.forEach(clearTimeout)
    timers = []
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

  // 4. the shift really starts (the mouse is locked): dive into the door, black, then the game fades in
  // (only once: later the ending shows this scene again)
  let entered = false
  const enter = () => {
    if (entered) return
    entered = true
    stop()
    setAct('enter')
    audio.creak()
    setTimeout(() => $start.classList.add('hidden'), INTRO.enterTime * 1000)
  }

  // "Play again" reloads the page with #again: you heard the voicemail already, so straight to the briefing
  if (window.location.hash === '#again') {
    history.replaceState(null, '', window.location.pathname + window.location.search)
    state = 'playing'
    finish()
  }

  $phone.querySelector('.notification').addEventListener('click', open)
  $playButton.addEventListener('click', play)
  $phone.querySelector('.skip-button').addEventListener('click', skip)

  return { stop, enter, lightning }
}
