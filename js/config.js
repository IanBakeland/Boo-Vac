// Every tunable number lives here (AGENTS.md §14.8)

// Room size in meters (1 unit = 1 m), floor at y = 0
// (inside size of the downloaded room after scaling, see MODELS.room)
export const ROOM = {
  width: 6,   // x
  depth: 6,   // z
  height: 2.8 // y
}

export const CAMERA = {
  fov: 70,
  near: 0.05,
  far: 50,
  eyeHeight: 1.6
}

// Biggest time step per frame, so a lag spike (or a background tab) doesn't make things jump
export const MAX_DT = 0.05

export const VACUUM = {
  // nozzle position relative to the camera (right, down, forward)
  nozzleOffset: [0.25, -0.3, -0.5],
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
  // the file is a 5 x 5 m box with 1.56 m high walls (inside):
  // stretch it to 6 x 6 x 2.8 m and move its floor to y = 0, centered on the origin
  room: {
    file: 'models/room.glb',
    scale: [6 / 5, 2.8 / 1.56, 6 / 5],
    position: [-1.54 * 6 / 5, 0.64 * 2.8 / 1.56, -0.42 * 6 / 5],
    // built-in office benches: they would look stretched, our own furniture replaces them
    hide: ['mesh1574848784', 'mesh1574848784_1', 'mesh1574848784_2']
  },
  ghost: { file: 'models/ghost.glb', scale: 1.3 / 3.13 },   // 3.13 m tall in the file -> 1.3 m
  vacuum: { file: 'models/vacuum.glb', scale: 1.0 / 2.33 }, // 2.33 m -> 1 m (tuned in 2.7)
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
    book: { file: 'models/props/book.glb', scale: 0.22 / 0.2 },               // 22 cm long
    bookStack: { file: 'models/props/book-stack.glb', scale: 0.3 / 0.86 },    // 30 cm wide
    bottle: { file: 'models/props/bottle.glb', scale: 0.3 / 1.56 },           // 30 cm high
    candle: { file: 'models/props/candle.glb', scale: 0.2 / 0.43 },           // 20 cm high
    cup: { file: 'models/props/cup.glb', scale: 0.1 / 0.23 },                 // 10 cm
    pillow: { file: 'models/props/pillow.glb', scale: 0.5 / 5.24 },           // 50 cm wide
    plant: { file: 'models/props/plant.glb', scale: 0.8 / 5.93 }              // 80 cm high
  }
}

// Where everything stands in the room (meters, origin = middle of the floor).
// x: left (-3) to right (+3), z: back wall (-3) to front wall (+3), y: up.
// position = where the bottom-center of the model goes; rotationY in degrees.
export const LAYOUT = {
  spawn: { position: [0, CAMERA.eyeHeight, 2.3], lookAt: [0, 1.2, -3] },
  furniture: [
    { name: 'Hide_Bookshelf', model: 'bookcase', position: [-2.78, 0, -1.2], rotationY: 90 },
    { name: 'Hide_Clock', model: 'clock', position: [2.55, 0, -2.8], rotationY: 0 },
    { name: 'Furniture_Rug', model: 'rug', position: [0, 0, -0.6], rotationY: 90 },
    { name: 'Furniture_Table', model: 'table', position: [0, 0.02, -0.6], rotationY: 90 },
    { name: 'Hide_Vase', model: 'vase', position: [0.45, 0.77, -0.6], rotationY: 0 },
    { name: 'Furniture_Chair', model: 'chair', position: [0, 0.02, 0.35], rotationY: 180 },
    { name: 'Furniture_Chandelier', model: 'chandelier', position: [0, 2.18, -0.6], rotationY: 0 }
  ],
  // suckable clutter (names Prop_Book_01, ... are made in props.js)
  // y = 0.77: on the table top, y = 0.03: on the rug, y = 0: on the floor
  props: [
    // on the table, around the vase (Dusty's hiding spot)
    { model: 'cup', position: [-0.3, 0.77, -0.45], rotationY: 20 },
    { model: 'cup', position: [0.1, 0.77, -0.85], rotationY: 130 },
    { model: 'candle', position: [-0.5, 0.77, -0.75] },
    { model: 'candle', position: [0.2, 0.77, -0.4] },
    { model: 'bottle', position: [-0.1, 0.77, -0.7] },
    { model: 'book', position: [-0.45, 0.77, -0.4], rotationY: 30 },
    { model: 'book', position: [0.65, 0.77, -0.35], rotationY: -15 },
    // books everywhere around the bookcase (the Librarian throws these)
    { model: 'book', position: [-2.3, 0, -0.6], rotationY: 10 },
    { model: 'book', position: [-2.1, 0, -0.9], rotationY: 70 },
    { model: 'book', position: [-2.4, 0, -1.5], rotationY: -20 },
    { model: 'book', position: [-1.9, 0, -1.3], rotationY: 45 },
    { model: 'book', position: [-2.2, 0, -1.9], rotationY: 100 },
    { model: 'book', position: [-1.75, 0, -0.75], rotationY: -60 },
    { model: 'book', position: [-1.55, 0.03, -1.05], rotationY: 15 },
    { model: 'book', position: [-2.5, 0, -2.3], rotationY: 80 },
    { model: 'bookStack', position: [-2.35, 0, -0.2] },
    { model: 'bookStack', position: [-2.0, 0, -2.15], rotationY: 30 },
    // the clock's corner (Granny Clock's hiding spot)
    { model: 'bottle', position: [2.1, 0, -2.6] },
    { model: 'bottle', position: [2.3, 0, -2.2] },
    { model: 'cup', position: [1.9, 0, -2.4], rotationY: 60 },
    { model: 'cup', position: [1.7, 0, -2.75], rotationY: -30 },
    { model: 'candle', position: [2.7, 0, -2.2] },
    { model: 'book', position: [2.0, 0, -2.0], rotationY: 40 },
    { model: 'book', position: [2.5, 0, -1.85], rotationY: -30 },
    { model: 'plant', position: [2.65, 0, -1.5] },
    // around the chair and on the rug
    { model: 'pillow', position: [-0.8, 0.03, 0.05], rotationY: 20 },
    { model: 'pillow', position: [0.9, 0, 0.5], rotationY: -40 },
    { model: 'book', position: [0.9, 0.03, -1.2], rotationY: 25 },
    { model: 'cup', position: [-0.9, 0.03, -1.25], rotationY: 90 },
    // front of the room and under the window
    { model: 'pillow', position: [-1.5, 0, 1.5], rotationY: 60 },
    { model: 'plant', position: [-2.6, 0, 2.6] },
    { model: 'plant', position: [2.6, 0, 2.6] },
    { model: 'cup', position: [0.6, 0, 1.3], rotationY: 200 },
    { model: 'bottle', position: [-1.0, 0, 1.0] },
    { model: 'candle', position: [2.6, 0, 0.3] },
    { model: 'candle', position: [2.65, 0, -0.1] }
  ],
  // fake window on the right wall (the room has none): a glowing plane for moonlight
  window: { position: [2.99, 1.5, -0.6], width: 1.2, height: 1.0, color: 0x50648f },
  ceilingColor: 0xd0dadd
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
  // visible beam in the air: very faint, it must not wash out the room
  beamLength: 6,
  beamIntensity: 0.08
}
