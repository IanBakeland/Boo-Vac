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
