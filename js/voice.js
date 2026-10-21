// The boss's voice: Kokoro-82M, a small text-to-speech AI model that runs on the GPU with WebGPU
// (kokoro-js, built on Transformers.js by Hugging Face): https://github.com/hexgrad/kokoro/tree/main/kokoro.js
// (beyond the course: the course links the Kokoro WebGPU demo in webgpu/README.md, "Where to go from here")
// The model (and the voice) download from huggingface.co while the opening film plays, then every line
// of the boss is turned into raw audio, ready for the voicemail. No WebGPU or an error: the intro
// falls back to the browser's speechSynthesis for the boss.
import { INTRO } from './config.js'

export const createVoice = () => {
  // lines[i] = { samples, sampleRate } once line i is generated
  const lines = []

  const prepare = async () => {
    if (!navigator.gpu) return
    try {
      // imported only here: browsers without WebGPU never download Transformers.js
      const [{ KokoroTTS }, { StyleTextToSpeech2Model, AutoTokenizer }] = await Promise.all([
        import('kokoro-js'),
        import('@huggingface/transformers') // installed with kokoro-js
      ])
      const { model, dtype, voice, speed } = INTRO.kokoro
      // what KokoroTTS.from_pretrained() does, plus ONNX Runtime's log level at 3 (errors only):
      // its default (2) prints harmless warnings as console errors
      const [ttsModel, tokenizer] = await Promise.all([
        StyleTextToSpeech2Model.from_pretrained(model, { dtype, device: 'webgpu', session_options: { logSeverityLevel: 3 } }),
        AutoTokenizer.from_pretrained(model)
      ])
      const tts = new KokoroTTS(ttsModel, tokenizer)
      // one by one, so the first lines are ready as soon as possible
      for (const [i, text] of INTRO.lines.entries()) {
        const audio = await tts.generate(text, { voice, speed })
        lines[i] = { samples: audio.audio, sampleRate: audio.sampling_rate }
      }
      // all lines are ready: free the model, so the GPU is all for the game again
      await tts.model.dispose()
    } catch (error) {
      console.warn('Kokoro voice not available, the boss uses speechSynthesis:', error)
    }
  }

  return {
    // resolves when every line is ready (or when Kokoro gave up)
    ready: prepare(),
    has: (i) => Boolean(lines[i]),
    get: (i) => lines[i]
  }
}
