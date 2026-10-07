// Every tunable number lives here (AGENTS.md §14.8)

// Room size in meters (1 unit = 1 m), floor at y = 0
export const ROOM = {
  width: 6,   // x
  depth: 5,   // z
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
