// The villa outside is a toy, in the intro and in the ending: click things in the scene and they react.
// Every clickable thing in the SVG has data-poke="<name>" (index.html). A click plays its reaction
// (a sound + an animation), shows one of its lines in a speech bubble (OUTSIDE.lines in config.js),
// and counts it as a secret found.
// The animations are Web Animations, element.animate(): https://developer.mozilla.org/en-US/docs/Web/API/Element/animate
// (beyond the course). They animate translate / rotate / scale, separate from `transform`,
// so they add on top of the scene's own CSS animations instead of replacing them.
import { OUTSIDE } from './config.js'

// the opening film: a click there skips to the phone (intro.js), so nothing to poke yet
const OPENING = ['black', 'reveal', 'title', 'enter']
const SVG = 'http://www.w3.org/2000/svg'

export const createOutside = ({ $start, audio, lightning }) => {
  const $scene = $start.querySelector('.intro-scene')
  const $count = $start.querySelector('.poke-count')
  const $jarGhosts = [...$scene.querySelectorAll('.jar-ghost')]
  const ghosts = ['dusty', 'librarian', 'granny'] // the same order as the windows and the jar
  const total = new Set([...$scene.querySelectorAll('[data-poke]')].map(($el) => $el.dataset.poke)).size
  const found = new Set()
  const turns = {} // how many lines each thing has said: its lines take turns

  const outro = () => $start.dataset.act === 'outro'

  // a speech bubble where you clicked: floats up and fades
  const bubble = (text, x, y) => {
    const $bubble = document.createElement('p')
    $bubble.className = 'poke-bubble'
    $bubble.textContent = text
    $start.append($bubble)
    // centered on the click, but kept inside the window (things near the edge, like the mailbox)
    const half = $bubble.offsetWidth / 2 + 8
    $bubble.style.left = `${Math.min(Math.max(x, half), window.innerWidth - half)}px`
    $bubble.style.top = `${Math.max(y, $bubble.offsetHeight * 2 + 8)}px` // it floats up about 2x its height
    $bubble.animate(
      [
        { opacity: 0, translate: '-50% -60%' },
        { opacity: 1, translate: '-50% -130%', offset: 0.12 },
        { opacity: 1, translate: '-50% -150%', offset: 0.8 },
        { opacity: 0, translate: '-50% -190%' }
      ],
      { duration: OUTSIDE.bubbleTime * 1000, easing: 'ease-out' }
    ).finished.then(() => $bubble.remove())
  }

  const say = (key, x, y) => {
    const lines = OUTSIDE.lines[key]
    turns[key] = (turns[key] ?? -1) + 1
    bubble(lines[turns[key] % lines.length], x, y)
  }

  // a little jump (SVG units: 1px = 1 unit of the 1600 x 900 drawing)
  const hop = ($el, height, delay = 0) => $el.animate(
    [{ translate: '0 0' }, { translate: `0 ${-height}px`, offset: 0.4 }, { translate: '0 0' }],
    { duration: 380, delay, easing: 'ease-out' }
  )
  const blink = ($el, times, duration = times * 160) => $el.animate(
    Array.from({ length: times * 2 + 1 }, (_, i) => ({ opacity: i % 2 ? 0 : 1 })),
    { duration }
  )

  // name -> reaction; returns which lines to say (the name itself when nothing is returned)
  const reactions = {
    van: ($van) => {
      audio.honk()
      $van.animate(
        [{ translate: '0 0' }, { translate: '0 4px', scale: '1 0.97', offset: 0.3 }, { translate: '0 -6px', offset: 0.6 }, { translate: '0 0' }],
        { duration: 420, easing: 'ease-out' }
      )
      // in time with the honk-hooonk
      blink($van.querySelector('.headbeam'), 2, 700)
      blink($van.querySelector('.headlight'), 2, 700)
      if (!outro()) return
      // in the ending the ghosts in the jar jump with fright
      $jarGhosts.forEach(($ghost, i) => hop($ghost, 14, 60 + i * 70))
      return 'vanOutro'
    },
    // the three dark windows: the ghost hiding behind it shows itself for a moment
    // (in the ending it's in the jar: that one jumps instead)
    window: ($window, name) => {
      if (outro()) {
        audio.click()
        hop($jarGhosts[ghosts.indexOf(name)], 16)
        return 'emptyWindow'
      }
      if (name === 'dusty') audio.giggle()
      else if (name === 'librarian') audio.whoosh() // "shhh"
      else audio.moan()
      $window.animate(
        [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }],
        { duration: 1500 }
      )
    },
    // lightning: in the intro its flash also shows the three ghosts in their windows
    moon: ($moon) => {
      audio.howl()
      $moon.animate([{ scale: 1 }, { scale: 1.15, offset: 0.3 }, { scale: 1 }], { duration: 900, easing: 'ease-out' })
      setTimeout(() => lightning({ glimpse: !outro() }), 1200)
    },
    swing: ($swing) => {
      audio.creak()
      $swing.animate(
        ['0deg', '-28deg', '22deg', '-14deg', '7deg', '0deg'].map((rotate) => ({ rotate })),
        { duration: 2600, easing: 'ease-in-out' }
      )
    },
    mailbox: ($mailbox) => {
      audio.plop()
      hop($mailbox, 8)
      $mailbox.querySelector('.mail-flag').animate(
        [{ rotate: '0deg' }, { rotate: '80deg', offset: 0.2 }, { rotate: '80deg', offset: 0.8 }, { rotate: '0deg' }],
        { duration: 1800, easing: 'ease-in-out' }
      )
    },
    // three big puffs of smoke out of the chimney
    chimney: ($chimney) => {
      audio.whoosh()
      for (let i = 0; i < 3; i++) {
        const $puff = document.createElementNS(SVG, 'circle')
        $puff.setAttribute('cx', 940)
        $puff.setAttribute('cy', 292)
        $puff.setAttribute('r', 12)
        $puff.setAttribute('fill', '#9aa6d6')
        $puff.style.transformBox = 'fill-box' // grow around its own center, not the drawing's corner
        $puff.style.transformOrigin = 'center'
        $chimney.after($puff)
        $puff.animate(
          [{ opacity: 0.6, translate: '0 0', scale: 1 }, { opacity: 0, translate: `${-30 - i * 20}px ${-90 - i * 30}px`, scale: 3 }],
          { duration: 1600, delay: i * 180, easing: 'ease-out', fill: 'backwards' }
        ).finished.then(() => $puff.remove())
      }
    },
    door: ($door) => {
      audio.knock()
      $door.animate(
        [{ translate: '0 0' }, { translate: '1.5px 0' }, { translate: '-1.5px 0' }, { translate: '0 0' }],
        { duration: 120, iterations: 3 }
      )
    },
    // the lights in the house go out for a moment
    lamp: () => {
      audio.click()
      $scene.querySelectorAll('.villa .lit').forEach(($light) => $light.animate([{ opacity: 0.05 }, { opacity: 0.05 }], { duration: 1300 }))
      setTimeout(audio.click, 1300)
    },
    vane: ($vane) => {
      audio.whoosh()
      $vane.animate([{ rotate: '0deg' }, { rotate: '1080deg' }], { duration: 1500, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' })
    }
  }

  // a new secret: the counter goes up (and something special when you found them all)
  const discover = (name) => {
    if (found.has(name)) return
    found.add(name)
    $count.textContent = `Secrets found ${found.size}/${total}`
    $count.classList.remove('hidden')
    $count.animate([{ scale: 1.25 }, { scale: 1 }], { duration: 300, easing: 'ease-out' })
    if (found.size < total) return
    setTimeout(() => {
      audio.giggle()
      bubble(OUTSIDE.allFound, window.innerWidth / 2, window.innerHeight * 0.45)
    }, OUTSIDE.bubbleTime * 500)
  }

  $scene.addEventListener('click', (e) => {
    const $el = e.target.closest('[data-poke]')
    if (!$el || OPENING.includes($start.dataset.act)) return
    // the click is for the toy only (in the ending, a click elsewhere skips to the invoice)
    e.stopPropagation()
    // a click is allowed to start the sound (if the phone wasn't tapped yet)
    audio.start()
    const name = $el.dataset.poke
    const lines = ghosts.includes(name) ? reactions.window($el, name) : reactions[name]($el)
    say(lines ?? name, e.clientX, e.clientY)
    discover(name)
  })
}
