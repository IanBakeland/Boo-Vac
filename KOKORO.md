# KOKORO.md: de stem van de baas via WebGPU (Kokoro TTS)

> Plan voor één extra stap. De spec en regels blijven in [`AGENTS.md`](AGENTS.md).
> Zeg tegen je agent: *"Doe KOKORO.md, stap K.1"* (enzovoort), één stap tegelijk.

---

## Doel

De **baas** in de voicemail praat niet meer met de robotstem van het besturingssysteem (`speechSynthesis`), maar met **Kokoro-82M**: een klein AI-stemmodel dat **met WebGPU in de browser** draait (via `kokoro-js`, gebouwd op Transformers.js van Hugging Face).

Waarom:
- Een natuurlijke stem die op elke computer hetzelfde klinkt.
- Een echte **"additional WebGPU library"** voor de extra punten (AGENTS.md §1.2). Rapier en gsap tellen daar niet voor mee.
- Het staat in de cursus: `webgpu/README.md` → *Where to go from here* → `huggingface.co/spaces/webml-community/kokoro-webgpu` ("Text To Speech").

## Wat hetzelfde blijft (bewust)

- **"You have one new message."** en **"End of message."** blijven de robotstem van `speechSynthesis` (`INTRO.systemVoices`). Een vlakke computerstem past bij een voicemailsysteem, en zo is meteen te horen wie het systeem is en wie de baas.
- De beeps, het lockscreen, de voicemail-app, de skip-knop, de bliksem, het "lights out"-moment en `intro.stop()`.
- De tekst in `INTRO.lines` en het transcript.
- **Geen WebGPU of model niet op tijd klaar?** Dan praat de baas met `speechSynthesis`, precies zoals nu. De intro mag nooit vastlopen op Kokoro.

---

## Feiten (gecontroleerd op 21 oktober 2026)

| | |
|---|---|
| Pakket | `kokoro-js` **1.2.1** (npm, Apache-2.0), afhankelijk van `@huggingface/transformers ^3.5.1` + `phonemizer` |
| Model | `onnx-community/Kokoro-82M-v1.0-ONNX` (Hugging Face), Apache-2.0 |
| Laden | `await KokoroTTS.from_pretrained(modelId, { dtype, device: 'webgpu' })` |
| Spreken | `await tts.generate(text, { voice, speed })` → `RawAudio` met `.audio` (Float32Array) en `.sampling_rate` (24 000) |
| dtype + grootte | `fp32` 326 MB (aangeraden voor WebGPU) · `fp16` 163 MB · `q8` 92 MB · `q4f16` 155 MB |
| Download | Model én stemmen komen van huggingface.co, niet uit onze repo (de 15 MB-assetlimiet blijft gerespecteerd). Na de eerste keer staan ze in de browsercache. |
| Mannenstemmen (Engels) | Amerikaans: `am_fenrir` (C+), `am_michael` (C+), `am_puck` (C+) · Brits: `bm_george` (C), `bm_fable` (C), `bm_lewis` (D+) |

---

## Stappen

### K.1 Dependency installeren · 🧑🤖 · 15 min
- [x] `npm install kokoro-js` (dit is de toestemming voor de nieuwe dependency, AGENTS.md §14.5).
- `npm run build`. Faalt Vite op Transformers.js / ONNX Runtime, voeg dan het minimum toe aan `vite.config.js` (waarschijnlijk `optimizeDeps.exclude`), met een comment en een link naar de bron.
- **Klaar als:** `npm run build` slaagt en `npm run dev` werkt zoals voorheen.
- **Commit:** `kokoro: install kokoro-js`

### K.2 Testpagina: stem kiezen en tijden meten · 🤝 · 30 min
- Tijdelijke `?voicetest` in debug-modus (of een los HTML-bestand dat niet gecommit wordt). Die laadt het model, spreekt één zin van de baas in met elke kandidaatstem, en logt de tijden: download, laden, genereren per zin.
- Jij luistert en kiest de **stem**, de **speed** en de **dtype** (eerst `fp32`, dan `fp16` proberen: half zo groot, klinkt het nog goed?).
- Test in Chrome **incognito** (geen cache = het slechtste geval).
- **Klaar als:** stem, speed en dtype gekozen zijn en we weten hoe lang laden duurt. Testcode weer weg.

### K.3 `js/voice.js`: de Kokoro-stem · 🤖 · 1–2 h
Nieuw bestand, zelfde stijl als de andere modules (`createVoice()` die een object teruggeeft):
- `createVoice()` start **meteen bij het laden van de pagina** met downloaden, alleen als `navigator.gpu` bestaat. Zo gebeurt dat tijdens de openingsfilm, net zoals de game-modellen.
- Is het model klaar, dan genereert het **alle zinnen van de baas één voor één** (`INTRO.lines`) en bewaart de ruwe audio (Float32Array + sample rate). Daarvoor is nog geen AudioContext nodig.
- `voice.ready`: een Promise die resolvet als alle zinnen klaar zijn. Bij een fout: `console.warn` (geen error) en de terugvaloptie.
- `voice.has(i)`: is zin `i` klaar?
- Na de laatste zin: het model vrijgeven (`tts.model.dispose()`) zodat de GPU weer volledig voor de game is.
- Instellingen in `config.js`, in `INTRO`:
  ```js
  kokoro: {
    model: 'onnx-community/Kokoro-82M-v1.0-ONNX',
    dtype: 'fp32',      // uit K.2 (fp16 getest: klinkt als een kapotte microfoon)
    voice: 'am_liam',   // uit K.2 (gekozen na luisteren)
    speed: 1.05,        // uit K.2 (vervangt pitch/rate voor de baas)
    maxWait: 15         // s dat de play-knop wacht op Kokoro, daarna speechSynthesis
  }
  ```
- **Commit:** `kokoro: voice.js loads the model and prepares the boss's lines`

### K.4 Afspelen via Web Audio · 🤖 · 1 h
- `audio.js` krijgt één functie `audio.speech(samples, sampleRate)`. Die maakt een `AudioBuffer`, speelt het af via een `AudioBufferSourceNode` → `master` (zo werkt **mute** automatisch) en geeft een Promise terug die resolvet bij `onended`, plus een manier om te stoppen.
- De AudioContext bestaat al: `audio.start()` op de tik op de melding.
- **Commit:** `kokoro: play generated speech through the Web Audio master`

### K.5 De intro: baas = Kokoro, systeem = robot · 🤖 · 1–2 h
In `js/intro.js`, functie `say()`:
- **Systeemregels** (`system: true`): ongewijzigd, `speechSynthesis`.
- **Regels van de baas:** is `voice.has(i)` waar, dan speel je de Kokoro-audio af via `audio.speech(...)`. Anders `speechSynthesis` zoals nu.
- **Wachten:** de hint onder de telefoon toont *"Loading the voicemail…"* zolang Kokoro bezig is, tot maximaal `INTRO.kokoro.maxWait` seconden. Daarna speelt het bericht af met wat er klaar is (zinnen die nog niet klaar zijn: `speechSynthesis`). Geen WebGPU: de knop werkt meteen, zoals nu.
- **Golf:** `$wave` krijgt `talking` tijdens het afspelen, zoals nu.
- **Karaoke-ondertitels:** Kokoro geeft geen woordtijden. Schat ze: elk woord licht op na *(tekens tot dat woord / totaal aantal tekens) × duur van de audio*, en zet dat via `speakWord()` (bestaat al).
- **Voortgangsbalk:** gebruik voor Kokoro-zinnen de echte duur (`samples.length / sampleRate`) in plaats van de schatting op basis van het aantal woorden.
- **`stop()` / skip:** stopt ook de Kokoro-audio die op dat moment speelt.
- **Commit:** `kokoro: the boss speaks with Kokoro (WebGPU), the voicemail system stays speechSynthesis`

### K.6 Testen · 🧑🤖 · 1 h
- [ ] Chrome, **incognito**: laadtijd OK? Hoor je Kokoro, of de terugvaloptie als je heel snel op play klikt?
- [ ] Chrome met cache (tweede bezoek): de stem is meteen klaar.
- [ ] Safari 26 en Edge.
- [ ] Browser zonder WebGPU (bv. Firefox op Mac): de intro werkt zoals vroeger, zonder errors.
- [ ] Mute (M) en Skip werken ook tijdens een Kokoro-zin.
- [ ] Openingsfilm en game blijven vloeiend terwijl Kokoro rekent (GPU gedeeld met Three.js).
- [ ] Console: 0 errors, met en zonder `?debug`.
- [ ] `npm run build && npm run preview`, daarna de live URL na de deploy.

### K.7 Documentatie · 🤖 · 30 min
- `README.md`: in *What's inside*: "Voice of the boss: Kokoro-82M text-to-speech running on WebGPU (kokoro-js / Transformers.js)". In de credits: Kokoro-82M (hexgrad, Apache-2.0), `kokoro-js` (Apache-2.0).
- `AGENTS.md`: §0 stack, §1.2 tabel (*Additional WebGPU libraries*: TypeGPU **+ Kokoro**), §4.1 intro (de baas = Kokoro, het systeem = `speechSynthesis`), §4.7 audio, §5.1 bestandslijst (`js/voice.js`), §14.5 toegestane dependencies.
- **Commit:** `docs: Kokoro voice in README and AGENTS`

---

## Risico's

| Risico | Wat we doen |
|---|---|
| 160–330 MB download in incognito: de leerkracht klikt misschien te snel | Model laden vanaf het begin van de pagina, "Loading voice…" op de knop, `maxWait`, terugvaloptie `speechSynthesis` |
| Three.js en Kokoro rekenen tegelijk op de GPU | Na de zinnen het model vrijgeven; testen op een gewone laptop |
| Huggingface.co is traag of ligt plat | Fout opvangen met `console.warn`, terugvaloptie |
| Bundel groeit (Transformers.js, ONNX Runtime WASM) | Controleren met `npm run build`. De WASM van ONNX Runtime komt standaard van een CDN. |
| Vite-problemen met Transformers.js | K.1 lost dit eerst op, voor er echte code is |

## Uitleg voor je leerkracht (kort)

> "De voicemail van de baas wordt live in de browser gegenereerd door Kokoro, een klein AI-stemmodel. Met `kokoro-js` (Transformers.js) draait het op de GPU via WebGPU. De zinnen worden gegenereerd tijdens de openingsfilm en afgespeeld via de Web Audio API. Het voicemailsysteem zelf ('You have one new message') is bewust de robotstem van de browser gebleven. Zonder WebGPU valt de baas daar ook op terug."
