// All sounds are generated with the Web Audio API (no files, no library):
// https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
// (beyond the course: oscillators, filters and gain envelopes)
import { AUDIO, MUSIC } from './config.js'

export const createAudio = () => {
  let context = null
  let master = null
  let muted = false
  // the parts of the continuous vacuum sound
  let motor = null
  let motorFilter = null
  let motorGain = null
  let air = null
  let airGain = null
  let noise = null

  // white noise: random samples, the raw material for hissing, whooshing and the plop
  const createNoise = (seconds) => {
    const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    return buffer
  }

  // the AudioContext may only start after a click (browser rule): call this from the Start button
  const start = () => {
    if (context) {
      context.resume()
      return
    }
    context = new AudioContext()
    master = context.createGain()
    master.gain.value = muted ? 0 : AUDIO.volume
    master.connect(context.destination)
    noise = createNoise(2)

    // motor: sawtooth -> lowpass -> gain. Pitch and brightness follow the power
    motor = context.createOscillator()
    motor.type = 'sawtooth'
    motor.frequency.value = AUDIO.motorPitch[0]
    motorFilter = context.createBiquadFilter()
    motorFilter.type = 'lowpass'
    motorFilter.frequency.value = AUDIO.motorCutoff[0]
    motorGain = context.createGain()
    motorGain.gain.value = 0
    motor.connect(motorFilter).connect(motorGain).connect(master)
    motor.start()

    // air: looping noise through a bandpass filter. High hiss = sucking, low rumble = blowing
    const airSource = context.createBufferSource()
    airSource.buffer = noise
    airSource.loop = true
    air = context.createBiquadFilter()
    air.type = 'bandpass'
    airGain = context.createGain()
    airGain.gain.value = 0
    airSource.connect(air).connect(airGain).connect(master)
    airSource.start()

    startMusic()
  }

  // --- background music: a drone, an eerie music box and (in the tug) a heartbeat ---
  // notes are scheduled a little ahead on the audio clock, so the timing never stutters
  // (https://web.dev/articles/audio-scheduling)
  let musicGain = null
  let reverb = null
  let lineSource = null
  // the boss's voicemail line that is playing now (Kokoro audio)
  let speechSource = null
  let drones = []
  let tension = -1 // tug meter while tugging, -1 when there's no tug (no heartbeat)
  let resolved = false // the shift is over: no more creepy phrases, the drone stays on A

  // reverb: a "big empty house" echo, made from noise that fades out over 3 s
  const createReverb = () => {
    const length = context.sampleRate * 3
    const impulse = context.createBuffer(2, length, context.sampleRate)
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel)
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3)
    }
    const convolver = context.createConvolver()
    convolver.buffer = impulse
    return convolver
  }

  const startMusic = () => {
    musicGain = context.createGain()
    musicGain.gain.value = MUSIC.volume
    musicGain.connect(master)
    reverb = createReverb()
    const wet = context.createGain()
    wet.gain.value = 0.6
    reverb.connect(wet).connect(musicGain)

    // drone: two low triangle waves through a lowpass that slowly opens and closes (breathing)
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 300
    const breathe = context.createOscillator()
    const breatheDepth = context.createGain()
    breathe.frequency.value = 0.07
    breatheDepth.gain.value = 180
    breathe.connect(breatheDepth).connect(filter.frequency)
    breathe.start()
    const droneGain = context.createGain()
    droneGain.gain.value = MUSIC.droneVolume
    filter.connect(droneGain)
    droneGain.connect(musicGain)
    droneGain.connect(reverb)
    drones = MUSIC.chords[0].map((frequency) => {
      const osc = context.createOscillator()
      osc.type = 'triangle'
      osc.frequency.value = frequency
      // slightly out of tune with itself: a slow, uneasy beating
      osc.detune.value = Math.random() * 10 - 5
      osc.connect(filter)
      osc.start()
      return osc
    })

    setInterval(scheduleMusic, 100)
  }

  // one music-box note: a sine plus a soft octave, a quick "ting" that rings out
  const musicBox = (frequency, time) => {
    const gain = context.createGain()
    gain.gain.setValueAtTime(0, time)
    gain.gain.linearRampToValueAtTime(MUSIC.boxVolume, time + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 1.8)
    gain.connect(musicGain)
    gain.connect(reverb)
    ;[[frequency, 1], [frequency * 2, 0.3]].forEach(([f, level]) => {
      const osc = context.createOscillator()
      osc.frequency.value = f
      const partial = context.createGain()
      partial.gain.value = level
      osc.connect(partial).connect(gain)
      osc.start(time)
      osc.stop(time + 1.9)
    })
  }

  // one heartbeat thump: a very low sine that drops in pitch
  const thump = (time, volume) => {
    const osc = context.createOscillator()
    osc.frequency.setValueAtTime(70, time)
    osc.frequency.exponentialRampToValueAtTime(35, time + 0.15)
    const gain = context.createGain()
    gain.gain.setValueAtTime(volume, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2)
    osc.connect(gain).connect(musicGain)
    osc.start(time)
    osc.stop(time + 0.22)
  }

  const randomBetween = ([min, max]) => min + Math.random() * (max - min)
  let nextPhrase = 0
  let nextChord = 0
  let chord = 0
  let nextHeart = 0
  const scheduleMusic = () => {
    const now = context.currentTime
    const ahead = now + 0.3
    const beat = 60 / MUSIC.tempo
    // the chords slowly alternate: the drone glides to the next one
    if (nextChord < ahead && !resolved) {
      nextChord = Math.max(nextChord, now)
      MUSIC.chords[chord].forEach((frequency, i) => drones[i].frequency.setTargetAtTime(frequency, nextChord, 1.5))
      chord = (chord + 1) % MUSIC.chords.length
      nextChord += MUSIC.chordBeats * beat
    }
    // a random phrase on the music box, then a rest
    if (nextPhrase < ahead && !resolved) {
      let time = Math.max(nextPhrase, now)
      const phrase = MUSIC.phrases[Math.floor(Math.random() * MUSIC.phrases.length)]
      phrase.forEach(([note, beats]) => {
        musicBox(MUSIC.scale[note], time)
        time += beats * beat
      })
      nextPhrase = time + Math.round(randomBetween(MUSIC.rest)) * beat
    }
    // heartbeat during the tug: "lub-dub", faster as the meter fills
    if (tension < 0) nextHeart = now
    else if (nextHeart < ahead) {
      const time = Math.max(nextHeart, now)
      thump(time, MUSIC.heartVolume)
      thump(time + 0.18, MUSIC.heartVolume * 0.6)
      nextHeart = time + MUSIC.heartbeat[0] + (MUSIC.heartbeat[1] - MUSIC.heartbeat[0]) * tension
    }
  }

  // smooth change of an audio parameter (no clicks)
  const glide = (param, value, time = 0.05) => param.setTargetAtTime(value, context.currentTime, time)

  // every frame: power 0-1, mode 'suck' / 'blow', boost (MAX > 1), tug meter 0-1, tugging: a tug is on,
  // clogged: the hose is jammed
  const update = ({ power, mode, boost, tug, tugging, clogged }) => {
    if (!context) return
    tension = tugging ? tug : -1
    // clogged and sucking: the motor whines higher and no air hisses through
    const choked = clogged && mode === 'suck'
    const boosted = (boost > 1 ? AUDIO.maxPitch : 1) * (choked ? AUDIO.clogPitch : 1)
    // the tug-of-war makes the motor strain: higher pitch as the meter fills
    const strain = 1 + tug * AUDIO.tugPitch
    const pitch = AUDIO.motorPitch[0] + (AUDIO.motorPitch[1] - AUDIO.motorPitch[0]) * power
    glide(motor.frequency, pitch * boosted * strain * (mode === 'blow' ? AUDIO.blowPitch : 1))
    glide(motorFilter.frequency, AUDIO.motorCutoff[0] + (AUDIO.motorCutoff[1] - AUDIO.motorCutoff[0]) * power)
    glide(motorGain.gain, power * AUDIO.motorVolume * (boost > 1 ? 1.4 : 1))
    if (mode === 'blow') {
      // blowing: a low, wide rumble ("whooo", breathing out)
      glide(air.frequency, AUDIO.blowAir[0] + (AUDIO.blowAir[1] - AUDIO.blowAir[0]) * power)
      glide(air.Q, 0.7)
      glide(airGain.gain, power * AUDIO.blowVolume)
    } else {
      // sucking: a high, narrow hiss that rises with the power ("shhhh", breathing in)
      glide(air.frequency, AUDIO.suckAir[0] + (AUDIO.suckAir[1] - AUDIO.suckAir[0]) * power * strain)
      glide(air.Q, 2.5)
      glide(airGain.gain, choked ? 0 : power * AUDIO.suckVolume)
    }
  }

  // a short tone that slides from one pitch to another, with a fade in and out
  const sweep = ({ from, to, duration, type = 'sine', volume = 0.3, vibrato = 0 }) => {
    if (!context) return
    const now = context.currentTime
    const osc = context.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(from, now)
    osc.frequency.exponentialRampToValueAtTime(to, now + duration)
    const gain = context.createGain()
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(volume, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration)
    osc.connect(gain).connect(master)
    // vibrato: a slow oscillator wobbling the pitch (ghostly)
    if (vibrato) {
      const lfo = context.createOscillator()
      const depth = context.createGain()
      lfo.frequency.value = 6
      depth.gain.value = vibrato
      lfo.connect(depth).connect(osc.frequency)
      lfo.start(now)
      lfo.stop(now + duration)
    }
    osc.start(now)
    osc.stop(now + duration)
  }

  // a burst of filtered noise (plop, whoosh, pfff)
  const burst = ({ duration, frequency, type = 'bandpass', volume = 0.4, sweepTo = null }) => {
    if (!context) return
    const now = context.currentTime
    const source = context.createBufferSource()
    source.buffer = noise
    const filter = context.createBiquadFilter()
    filter.type = type
    filter.frequency.setValueAtTime(frequency, now)
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, now + duration)
    const gain = context.createGain()
    gain.gain.setValueAtTime(volume, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration)
    source.connect(filter).connect(gain).connect(master)
    source.start(now)
    source.stop(now + duration)
  }

  return {
    start,
    update,
    // pausing: silence everything (and resume on the next click)
    pause: () => context?.suspend(),
    // the start of sucking goes UP ("vwoop"), the start of blowing goes DOWN ("pfff")
    modeStart: (mode) => {
      if (mode === 'suck') sweep({ from: 250, to: 900, duration: 0.18, type: 'triangle', volume: 0.15 })
      else {
        sweep({ from: 700, to: 180, duration: 0.2, type: 'triangle', volume: 0.15 })
        burst({ duration: 0.25, frequency: 500, type: 'lowpass', volume: 0.35 })
      }
    },
    // a prop disappears into the vacuum
    plop: () => {
      burst({ duration: 0.06, frequency: 1500, volume: 0.5 })
      sweep({ from: 600, to: 120, duration: 0.08, volume: 0.25 })
    },
    // MAX: a power-up sweep
    max: () => sweep({ from: 150, to: 1200, duration: 0.45, type: 'sawtooth', volume: 0.12 }),
    // a ghost slurped into the vacuum: a long falling, wobbling tone
    capture: () => sweep({ from: 900, to: 70, duration: 0.9, volume: 0.3, vibrato: 30 }),
    // a ghost comes out or flees: a low ghostly "oooOOooh"
    moan: () => sweep({ from: 260, to: 170, duration: 1.4, volume: 0.25, vibrato: 12 }),
    // Dusty giggles: a few quick high notes
    giggle: () => {
      if (!context) return
      for (let i = 0; i < 5; i++) {
        setTimeout(() => sweep({ from: 900 - i * 40, to: 650 - i * 40, duration: 0.09, type: 'triangle', volume: 0.18 }), i * 110)
      }
    },
    // the hose jams: a dull thunk and the motor choking down
    clog: () => {
      burst({ duration: 0.25, frequency: 220, type: 'lowpass', volume: 0.7 })
      sweep({ from: 500, to: 90, duration: 0.35, type: 'sawtooth', volume: 0.12 })
    },
    // a jammed item shoots out of the nozzle: "thwup"
    eject: () => {
      burst({ duration: 0.12, frequency: 900, sweepTo: 300, volume: 0.45 })
      sweep({ from: 150, to: 500, duration: 0.1, volume: 0.2 })
    },
    // the last item is out: the air flows again, a rising whoosh
    unclog: () => {
      sweep({ from: 300, to: 1200, duration: 0.25, type: 'triangle', volume: 0.15 })
      burst({ duration: 0.4, frequency: 600, sweepTo: 2500, volume: 0.25 })
    },
    // the Librarian throws a book
    whoosh: () => burst({ duration: 0.35, frequency: 400, sweepTo: 2000, volume: 0.3 }),
    // --- the phone in the intro (voicemail) ---
    // the voicemail beep: a clean 1 kHz tone (before and after the message)
    beep: () => sweep({ from: 1000, to: 1000, duration: 0.35, volume: 0.15 }),
    // lightning: a sharp crack and a long low rumble
    thunder: () => {
      burst({ duration: 0.3, frequency: 1500, type: 'highpass', volume: 0.25 })
      burst({ duration: 1.9, frequency: 160, type: 'lowpass', volume: 0.9 })
    },
    // the front door opens: a slow wobbling creak
    creak: () => sweep({ from: 140, to: 230, duration: 1.1, type: 'sawtooth', volume: 0.06, vibrato: 14 }),
    // --- the villa outside, clicked (js/outside.js) ---
    // the van's horn: two square waves a third apart, slightly flat at the end
    honk: () => {
      sweep({ from: 400, to: 385, duration: 0.35, type: 'square', volume: 0.07 })
      sweep({ from: 500, to: 482, duration: 0.35, type: 'square', volume: 0.07 })
    },
    // a wolf at the moon: up, then a long wobbling fall
    howl: () => {
      sweep({ from: 320, to: 640, duration: 0.6, volume: 0.15, vibrato: 6 })
      setTimeout(() => sweep({ from: 640, to: 330, duration: 1.4, volume: 0.15, vibrato: 10 }), 550)
    },
    // knuckles on a wooden door: two dull thuds
    knock: () => {
      burst({ duration: 0.08, frequency: 260, type: 'lowpass', volume: 0.9 })
      setTimeout(() => burst({ duration: 0.08, frequency: 260, type: 'lowpass', volume: 0.9 }), 180)
    },
    // --- the ending ---
    // the house power comes back on: a deep clunk and a little electric click
    clunk: () => {
      burst({ duration: 0.5, frequency: 90, type: 'lowpass', volume: 0.8 })
      burst({ duration: 0.06, frequency: 2200, volume: 0.25 })
    },
    // the music settles on A, and the music box plays the first major chord of the game
    fanfare: () => {
      if (!context) return
      resolved = true
      MUSIC.chords[0].forEach((frequency, i) => drones[i].frequency.setTargetAtTime(frequency, context.currentTime, 0.8))
      const start = context.currentTime + 0.05
      MUSIC.fanfare.forEach((frequency, i) => musicBox(frequency, start + i * MUSIC.fanfareStep))
    },
    // a rubber stamp on the invoice: a dull thud
    stamp: () => burst({ duration: 0.2, frequency: 180, type: 'lowpass', volume: 1 }),
    // tapping the phone: a short dry click
    click: () => burst({ duration: 0.04, frequency: 2500, type: 'highpass', volume: 0.5 }),
    // a soft hiss under the voicemail, like an old recording (on / off)
    line: (on) => {
      if (!context) return
      if (on && !lineSource) {
        lineSource = context.createBufferSource()
        lineSource.buffer = noise
        lineSource.loop = true
        const filter = context.createBiquadFilter()
        filter.type = 'bandpass'
        filter.frequency.value = 1800
        filter.Q.value = 0.5
        const lineGain = context.createGain()
        lineGain.gain.value = 0.025
        lineSource.connect(filter).connect(lineGain).connect(master)
        lineSource.start()
      } else if (!on && lineSource) {
        lineSource.stop()
        lineSource = null
      }
    },
    // the boss talks: raw samples from Kokoro (js/voice.js) -> AudioBuffer -> master (so mute works too)
    // resolves when the line is over (or stopped)
    speech: (samples, sampleRate) => new Promise((resolve) => {
      if (!context) return resolve()
      const buffer = context.createBuffer(1, samples.length, sampleRate)
      buffer.copyToChannel(samples, 0)
      speechSource = context.createBufferSource()
      speechSource.buffer = buffer
      speechSource.connect(master)
      speechSource.onended = resolve
      speechSource.start()
    }),
    stopSpeech: () => {
      speechSource?.stop()
      speechSource = null
    },
    // the music gets quieter while the boss talks
    musicVolume: (level) => {
      if (musicGain) glide(musicGain.gain, MUSIC.volume * level, 0.3)
    },
    toggleMute: () => {
      muted = !muted
      if (master) glide(master.gain, muted ? 0 : AUDIO.volume)
      return muted
    }
  }
}
