// Every tunable number lives here (AGENTS.md §14.8)

// Room size in meters (1 unit = 1 m), floor at y = 0
// Size of the apartment after scaling (see MODELS.room): the player stays inside this box
export const ROOM = {
  width: 11.7, // x
  depth: 11.8, // z
  height: 2.66 // y (floor to ceiling)
}

export const CAMERA = {
  fov: 70,
  near: 0.05,
  far: 50,
  eyeHeight: 1.6
}

// Biggest time step per frame, so a lag spike (or a background tab) doesn't make things jump
export const MAX_DT = 0.05

export const PLAYER = {
  walkSpeed: 2.2,   // m/s
  // collision capsule standing on the floor: 30 cm radius (keeps you ~30 cm from walls), 1.7 m tall
  radius: 0.3,
  height: 1.7,
  skin: 0.01,       // tiny gap the character controller keeps from walls
  mass: 70,         // kg: how hard you push props when you walk into them
  stepHeight: 0.25, // walk over rugs and small steps up to this height
  snapDistance: 0.1,// stick to the floor when walking down small steps
  jumpSpeed: 3.2,   // m/s upward -> jumps about 0.35 m with gravityScale 1.5
  gravityScale: 1.5,// the player falls a bit faster than props: snappier jumps
  killY: -2,        // below this height something went wrong: back to the spawn point
  // Chrome refuses to re-lock the mouse within ~1 s after Esc, so wait before "click to resume"
  relockDelay: 1100 // ms
}

export const PHYSICS = {
  gravity: -9.81,
  fixedStep: 1 / 60, // seconds per physics step
  maxSteps: 3,       // max physics steps per frame
  // props spawn this much above their spot, so they never start inside the table/floor
  propLift: 0.005
}

// Shared suction model (AGENTS.md §7): one formula for props, dust and the ghost
export const SUCTION = {
  range: 3.0,        // m: no force beyond this distance from the nozzle
  innerAngle: 15,    // degrees: full force inside this cone
  outerAngle: 35,    // degrees: no force outside this cone (soft edge in between)
  pullStrength: 14,  // m/s² toward the nozzle
  swirlStrength: 5,  // m/s² around the nozzle axis (makes the spiral)
  blowStrength: 18   // m/s² away from the nozzle when blowing
}

export const TANK = {
  captureDistance: 0.5,  // m: a prop this close to the nozzle gets sucked in
  captureMaxSize: 0.5,   // m: bigger props (plants, pillows) are pulled but never sucked in
  captureMinPower: 0.5,  // the motor must be at least half spun up
  shrinkDuration: 0.15,  // s: shrink animation when a prop disappears into the nozzle
  maxPropSpeed: 8,       // m/s: speed limit for sucked props (like the course's per-particle limit)
  drag: 4                // per second, at full suction: slows props near the nozzle so they don't overshoot
}

// MAX mode (F): a short, very strong burst that also moves heavy furniture
export const MAX = {
  key: 'KeyF',
  multiplier: 4,   // suction / blow force x4
  duration: 3,     // s of MAX per full charge
  recharge: 8      // s to recharge from empty to full
}

// Dust specks (compute shader on the GPU, WebGPU only)
export const DUST = {
  count: 4000,         // specks (more = dustier, see the FPS with ?debug)
  size: 0.015,         // m (bigger than real dust, or you would not see it)
  minY: 0.05,          // m: lowest spawn height
  respawnDistance: 0.25, // m: a speck this close to the nozzle is "sucked in" and respawns elsewhere
  drag: 1.5,           // per second (air resistance)
  drift: 0.03,         // m/s²: slow floating when the vacuum is off
  color: 0xfff1d6,     // same warm white as the flashlight
  baseGlow: 0.015,     // faint glow outside the beam
  beamGlow: 1.5,       // brightness inside the beam
  beamRange: 7         // m: specks further from the lamp don't glitter
}

export const GHOST = {
  crossFade: 0.25,          // s: blend between two animation clips
  // visible only in the flashlight beam: same cone as the lamp (FLASHLIGHT.angle / penumbra)
  visibleRange: [5, 7],     // m: fully visible closer than 5 m, invisible beyond 7 m
  visibleRadius: 0.4,       // m: the ghost counts as a ball this big (not a point) for "is it in the beam?"
  visibilitySmoothing: 6,   // per second: how fast it fades in/out (no hard popping)
  // hiding: the spot trembles every few seconds
  trembleInterval: [3, 5],  // s: random time between two trembles
  trembleDuration: 0.8,     // s
  trembleAmount: 0.03,      // m: how far the spot shakes
  trembleAngle: 0.06,       // radians: how much it wobbles
  // hint: a small Ether wisp rising from the top of the hiding spot (visible in the beam),
  // growing with the exposure. On top, so it shows against the darker background
  hintStrength: [0.9, 1.5], // brightness at exposure 0 and at exposure 1
  hintSize: [0.6, 1.0],     // aura scale at exposure 0 and at exposure 1
  // exposure (0 -> 1): the ghost pops out at 1
  exposureRate: 0.5,        // per second while you suck at the spot (2 s)
  aimMargin: 0.3,           // m around the spot: the crosshair there counts as "at the spot"
  exposurePerProp: 0.2,     // per prop you suck up that stood near the spot
  propRadius: 1.5,          // m: "near the spot"
  // emerging: rises out of the spot (and a bit toward you, but never too close)
  emergeHeight: 0.15,       // m: the ghost's middle ends up this far above the spot
  emergeDistance: 0.5,      // m toward the player at most
  minPlayerDistance: 1.5,   // m: never closer to the player than this
  emergeDuration: 0.8,      // s
  hoverAmount: 0.05,        // m: gentle up and down floating
  hoverSpeed: 1.5,          // per second
  // escape: flies (through walls, it's a ghost) to another hiding spot
  escapeDuration: 1.5,      // s
  // capture: spirals into the nozzle and shrinks away
  captureDuration: 1.0,     // s
  captureSpiral: 0.3,       // m: radius of the spiral at the start
  captureTurns: 2           // turns around the nozzle on the way in
}

// The three ghosts. They all hide at the same time; catch them in any order.
// tint: Ether color (sRGB), hideSpot: where it hides first, tug: overrides for TUG (its personality)
export const GHOSTS = [
  {
    name: 'Dusty', // the tutorial: slow and weak, giggles when it gets away
    hideSpot: 'Hide_Vase',
    tint: [0.8, 0.88, 1.0],
    giggle: true,
    tug: { dirInterval: [1.5, 2.5], fillRate: 0.45, drainRate: 0.2 }
  },
  {
    name: 'The Librarian', // throws books at you during the tug
    hideSpot: 'Hide_Bookshelf',
    tint: [0.55, 1.0, 0.6],
    throwInterval: 2,
    tug: { dirInterval: [1.0, 1.8], fillRate: 0.35, drainRate: 0.22 }
  },
  {
    name: 'Granny Clock', // the boss: fast, strong, and you have to win twice
    hideSpot: 'Hide_Clock',
    tint: [0.85, 0.6, 1.0],
    rounds: 2,
    tug: { dirInterval: [0.9, 1.5], fillRate: 0.35, drainRate: 0.2, driftSpeed: 0.9 }
  }
]

// The Librarian's book throwing
export const THROW = {
  range: 2.5,   // m: picks the nearest book within this distance of the ghost
  speed: 7,     // m/s toward the player
  lift: 2.5,    // m/s upward, so it flies in an arc
  giggleTime: 0.8 // s: Dusty giggles this long before fleeing
}

// Tug-of-war (Dusty's numbers; every ghost gets its own in 4.6)
export const TUG = {
  minPower: 0.5,         // you must be sucking (motor at least half spun up)
  startStrength: 0.05,   // the suction must reach the ghost at least this much...
  startVisibility: 0.5,  // ...and it must be (half) visible in your beam
  startMeter: 0.4,       // the meter starts here (0 = it escapes, 1 = captured)
  roundMeter: 0.5,       // ...and here in the next round (Granny Clock)
  grace: 1.5,            // s at the start of a round without draining (time to read the arrow)
  reactTime: 0.35,       // s without draining after the ghost changes direction
  dirInterval: [1.5, 2.5], // s: the ghost picks a new pull direction this often
  fillRate: 0.45,        // per second while you pull the right way and suck
  drainRate: 0.2,        // per second otherwise
  inputWindow: 0.15,     // s: mouse movement is added up over this time...
  inputThreshold: 6,     // px: ...and must be at least this much, in the right direction
  driftSpeed: 0.6,       // m/s: the ghost drifts sideways in its pull direction
  driftResist: 0.3,      // drift x this while you pull correctly
  driftRange: 1.0,       // m: how far it can drift sideways...
  wallMargin: 0.4,       // m: ...but it stays this far from walls and furniture
  pullIn: 0.6,           // m: the full meter pulls the ghost this much closer
  lostTime: 1.0,         // s out of the beam: the tug ends (it escapes, step 4.5)
  lostVisibility: 0.3,   // "out of the beam" below this visibility
  aimSpeed: 6,           // per second: how fast the camera turns to follow the ghost
  shake: 0.015,          // m: screen shake at a full meter
  stretchMin: 0.4        // Ether stretch at an empty meter (x the suction), 1 at a full meter
}

// The invoice at the end of the shift (money in euro)
export const INVOICE = {
  perGhost: 100,       // you get paid per ghost
  shiftPay: 20,        // flat pay for the night
  perItem: 12,         // the client's property you sucked up is billed to you
  perEscape: 50,       // "overtime" for every ghost that got away
  vacuumBag: 4.99,     // joke line
  delay: 2.5           // s after the last capture before the invoice shows
}

export const VACUUM = {
  // nozzle tip (front of the floor head) relative to the camera: the suction cone starts here
  nozzleOffset: [0.22, -0.38, -0.78],
  // the suction aims from the nozzle at what's in the middle of the screen (the crosshair),
  // at least this far in front of your eyes (closer targets would make it point backwards)
  minAimDistance: 1.2,
  // the upright vacuum in your right hand, held by the handle and tipped forward,
  // diagonally from the bottom-right corner (rotation in degrees, XYZ order)
  model: { position: [0.359, -0.382, -0.504], rotation: [163.3, 62.2, -112.1] },
  spinUp: { duration: 0.4, ease: 'power2.out' },
  spinDown: { duration: 0.3, ease: 'power2.out' }
}

export const SUCTION_CONE = {
  radiusTop: 0.05,
  radiusBottom: 0.9,
  height: 2.5,
  radialSegments: 32
}

export const ETHER = {
  size: 1.3,         // m: the aura billboard around the ghost
  centerHeight: 0.45,// m above the ghost's root: middle of its body (where the aura sits)
  forward: 0.25,     // m: the aura floats this much in front of the body (toward you), or the body hides it
  // how far the smoke smears toward the nozzle at full power
  maxStretch: 0.6
}

// Every model the game loads. scale = wanted real size / size in the downloaded file,
// so 1 unit = 1 meter everywhere (sizes measured from the GLB files in step 2.3).
export const MODELS = {
  // "Apartment 2": a 1.7 x 1.7 miniature in the file. Doors are 0.3 high -> x7 makes them 2.1 m.
  // Then move its floor (y = -0.117 in the file) to y = 0 and its center to the origin.
  room: {
    file: 'models/apartment.glb',
    scale: [7, 7, 7],
    position: [0.12 * 7, 0.117 * 7, -0.203 * 7],
    hide: []
  },
  ghost: { file: 'models/ghost.glb', scale: 0.8 / 3.13 },   // 3.13 m tall in the file -> 0.8 m
  vacuum: { file: 'models/vacuum.glb', scale: 0.75 / 2.33 }, // 2.33 m -> 0.75 m
  furniture: {
    bookcase: { file: 'models/furniture/bookcase.glb', scale: 2.0 / 3.37 },     // 2 m high
    clock: { file: 'models/furniture/clock.glb', scale: 2.0 / 1.36 },           // 2 m high
    vase: { file: 'models/furniture/vase.glb', scale: 0.5 / 0.42 },             // 0.5 m high
    chair: { file: 'models/furniture/chair.glb', scale: 0.95 / 1.16 },          // 0.95 m high
    table: { file: 'models/furniture/table.glb', scale: 0.75 / 0.85 },          // 0.75 m high
    rug: { file: 'models/furniture/rug.glb', scale: 2.4 / 3.09 },               // 2.4 m long
    chandelier: { file: 'models/furniture/chandelier.glb', scale: 0.7 / 0.76 }  // 0.7 m wide
  },
  props: {
    book: { file: 'models/props/book.glb', scale: 0.22 / 0.2, density: 600 },               // 22 cm long
    bookStack: { file: 'models/props/book-stack.glb', scale: 0.3 / 0.86, density: 600 },    // 30 cm wide
    bottle: { file: 'models/props/bottle.glb', scale: 0.3 / 1.56, density: 500 },           // 30 cm high
    candle: { file: 'models/props/candle.glb', scale: 0.2 / 0.43, density: 400 },           // 20 cm high
    cup: { file: 'models/props/cup.glb', scale: 0.1 / 0.23, density: 400 },                 // 10 cm
    pillow: { file: 'models/props/pillow.glb', scale: 0.5 / 5.24, density: 100 },           // 50 cm wide
    plant: { file: 'models/props/plant.glb', scale: 0.8 / 5.93, density: 300 }              // 80 cm high
  }
}

// Where everything stands in the apartment (meters, origin = middle of the apartment, floor y = 0).
// x: kitchen (-) to window wall (+), z: hallway (-) to blue room (+), y: up.
// position = where the bottom-center of the model goes; rotationY in degrees.
// Three areas, one per ghost: our table in the living room, the empty blue room, the hallway.
const TABLE = [1.6, 0, -0.3]      // Dusty's vase stands on this table
const BLUE_ROOM = [-5.4, 0, 3.6]  // the Librarian's bookcase, against the left wall
const HALLWAY = [-1.5, 0, -5.3]   // Granny Clock, at the end of the hallway
// position next to an area: dx/dz meters away from it, at height y
const near = (area, dx, y, dz) => [area[0] + dx, y, area[2] + dz]

export const LAYOUT = {
  spawn: { position: [-0.6, CAMERA.eyeHeight, 0.9], lookAt: [TABLE[0], 1.0, TABLE[2]] },
  furniture: [
    { name: 'Furniture_Rug', model: 'rug', position: TABLE, rotationY: 90 },
    // dynamic: real physics bodies, heavy (mass in kg): only MAX mode can pull them (or you push them)
    { name: 'Furniture_Table', model: 'table', position: near(TABLE, 0, 0.02, 0), rotationY: 90, dynamic: true, mass: 30 },
    { name: 'Hide_Vase', model: 'vase', position: near(TABLE, 0.45, 0.77, 0), dynamic: true, mass: 3 },
    { name: 'Furniture_Chair', model: 'chair', position: near(TABLE, 0, 0.02, 0.95), rotationY: 180, dynamic: true, mass: 8 },
    { name: 'Furniture_Chandelier', model: 'chandelier', position: near(TABLE, 0, ROOM.height - 0.62, 0) },
    { name: 'Hide_Bookshelf', model: 'bookcase', position: BLUE_ROOM, rotationY: 90 },
    { name: 'Hide_Clock', model: 'clock', position: HALLWAY, rotationY: 0 }
  ],
  // suckable clutter (names Prop_Book_01, ... are made in props.js)
  // y = 0.77: on the table top, y = 0.03: on the rug, y = 0: on the floor
  props: [
    // on the table, around the vase (Dusty's hiding spot)
    { model: 'cup', position: near(TABLE, -0.3, 0.77, 0.15), rotationY: 20 },
    { model: 'cup', position: near(TABLE, 0.1, 0.77, -0.25), rotationY: 130 },
    { model: 'candle', position: near(TABLE, -0.5, 0.77, -0.15) },
    { model: 'candle', position: near(TABLE, 0.2, 0.77, 0.2) },
    { model: 'bottle', position: near(TABLE, -0.1, 0.77, -0.1) },
    { model: 'book', position: near(TABLE, -0.45, 0.77, 0.2), rotationY: 30 },
    { model: 'book', position: near(TABLE, 0.65, 0.77, 0.25), rotationY: -15 },
    // around the table, on the rug (not under it: the table's collider is one solid box down to the floor)
    { model: 'pillow', position: near(TABLE, -1.45, 0.03, 0.45), rotationY: 20 },
    { model: 'book', position: near(TABLE, 1.15, 0.03, -0.75), rotationY: 25 },
    { model: 'cup', position: near(TABLE, -1.1, 0.03, -0.7), rotationY: 90 },
    // books everywhere around the bookcase (the Librarian throws these)
    { model: 'book', position: near(BLUE_ROOM, 0.5, 0, 0.6), rotationY: 10 },
    { model: 'book', position: near(BLUE_ROOM, 0.7, 0, 0.3), rotationY: 70 },
    { model: 'book', position: near(BLUE_ROOM, 0.4, 0, -0.3), rotationY: -20 },
    { model: 'book', position: near(BLUE_ROOM, 0.9, 0, -0.1), rotationY: 45 },
    { model: 'book', position: near(BLUE_ROOM, 0.6, 0, -0.7), rotationY: 100 },
    { model: 'book', position: near(BLUE_ROOM, 1.05, 0, 0.45), rotationY: -60 },
    { model: 'book', position: near(BLUE_ROOM, 1.25, 0, 0.15), rotationY: 15 },
    { model: 'book', position: near(BLUE_ROOM, 0.3, 0, -1.1), rotationY: 80 },
    { model: 'bookStack', position: near(BLUE_ROOM, 0.45, 0, 1.0) },
    { model: 'bookStack', position: near(BLUE_ROOM, 0.8, 0, -0.95), rotationY: 30 },
    { model: 'pillow', position: near(BLUE_ROOM, 1.8, 0, 0.8), rotationY: 60 },
    { model: 'plant', position: near(BLUE_ROOM, 0.3, 0, 1.6) },
    // the clock's spot at the end of the hallway (Granny Clock's hiding spot)
    { model: 'bottle', position: near(HALLWAY, -0.45, 0, 0.3) },
    { model: 'bottle', position: near(HALLWAY, -0.25, 0, 0.7) },
    { model: 'cup', position: near(HALLWAY, 0.4, 0, 0.4), rotationY: 60 },
    { model: 'cup', position: near(HALLWAY, 0.55, 0, 0.05), rotationY: -30 },
    { model: 'candle', position: near(HALLWAY, -0.5, 0, 0.9) },
    { model: 'book', position: near(HALLWAY, 0.3, 0, 0.9), rotationY: 40 },
    { model: 'book', position: near(HALLWAY, -0.1, 0, 1.2), rotationY: -30 },
    { model: 'candle', position: near(HALLWAY, 0.5, 0, 1.4) },
    // scattered through the living room
    { model: 'pillow', position: [-0.2, 0, -1.4], rotationY: 60 },
    { model: 'cup', position: [0.4, 0, 1.1], rotationY: 200 },
    { model: 'bottle', position: [-1.0, 0, -0.6] },
    { model: 'plant', position: [4.6, 0, -0.8] },
    { model: 'candle', position: [3.4, 0, 0.3] },
    { model: 'candle', position: [3.6, 0, -0.1] }
  ],
  // no fake window needed: the apartment has a real window wall
  window: null,
  ceilingColor: 0xf2f2f2
}

export const FLASHLIGHT = {
  // lamp position relative to the camera (left hand: left, down, forward)
  offset: [-0.2, -0.15, -0.25],
  color: 0xfff1d6,      // warm white
  intensity: 20,        // candela (three's physical light units)
  angle: 25,            // half-angle of the cone in degrees
  penumbra: 0.4,        // 0 = hard edge, 1 = very soft edge
  distance: 10,         // light reaches 0 here
  decay: 2,             // inverse square falloff (physically correct)
  // moonlight: the only light outside the beam
  ambientColor: 0x8fa8ff,
  ambientIntensity: 0.25,
  // weak light spilling around your hands, so you can see the vacuum (reaches ~1 m)
  spillIntensity: 0.6,
  spillDistance: 1.2,
  // visible beam in the air: very faint, it must not wash out the room
  beamLength: 6,
  beamIntensity: 0.08
}
