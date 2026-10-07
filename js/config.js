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
  // fake window on the right wall (the room has none): a glowing plane for moonlight
  window: { position: [2.99, 1.5, -0.6], width: 1.2, height: 1.0, color: 0x8fa8d8 },
  ceilingColor: 0xd0dadd
}
