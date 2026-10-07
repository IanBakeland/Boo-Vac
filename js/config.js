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

export const VACUUM = {
  // nozzle tip (front of the floor head) relative to the camera: the suction cone starts here
  nozzleOffset: [0.22, -0.38, -0.78],
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
  // how far the smoke smears toward the nozzle at full power
  maxStretch: 0.35
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
  ghost: { file: 'models/ghost.glb', scale: 1.3 / 3.13 },   // 3.13 m tall in the file -> 1.3 m
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
    { name: 'Furniture_Table', model: 'table', position: near(TABLE, 0, 0.02, 0), rotationY: 90 },
    { name: 'Hide_Vase', model: 'vase', position: near(TABLE, 0.45, 0.77, 0) },
    { name: 'Furniture_Chair', model: 'chair', position: near(TABLE, 0, 0.02, 0.95), rotationY: 180 },
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
    // around the table, on the rug
    { model: 'pillow', position: near(TABLE, -0.8, 0.03, 0.65), rotationY: 20 },
    { model: 'book', position: near(TABLE, 0.9, 0.03, -0.6), rotationY: 25 },
    { model: 'cup', position: near(TABLE, -0.9, 0.03, -0.65), rotationY: 90 },
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
