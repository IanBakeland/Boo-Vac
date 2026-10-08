// All sounds are generated with the Web Audio API (no files, no library):
// https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
// (beyond the course: oscillators, filters and gain envelopes)
import { AUDIO } from './config.js'

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
  }

  // smooth change of an audio parameter (no clicks)
  const glide = (param, value, time = 0.05) => param.setTargetAtTime(value, context.currentTime, time)

  // every frame: power 0-1, mode 'suck' / 'blow', boost (MAX > 1), tug meter 0-1
  const update = ({ power, mode, boost, tug }) => {
    if (!context) return
    const boosted = boost > 1 ? AUDIO.maxPitch : 1
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
      glide(airGain.gain, power * AUDIO.suckVolume)
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
    // the Librarian throws a book
    whoosh: () => burst({ duration: 0.35, frequency: 400, sweepTo: 2000, volume: 0.3 }),
    toggleMute: () => {
      muted = !muted
      if (master) glide(master.gain, muted ? 0 : AUDIO.volume)
      return muted
    }
  }
}
