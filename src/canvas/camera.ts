export type Camera = { x: number; y: number; scale: number; rotation?: number }

export const MIN_SCALE = 0.004
export const MAX_SCALE = 2

export const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))

export const normRot = (deg: number) => {
  const r = ((deg % 360) + 360) % 360
  return r > 180 ? r - 360 : r
}

type P = { x: number; y: number }

export function toScreen(cam: Camera, p: P): P {
  const r = ((cam.rotation ?? 0) * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  const x = p.x * cam.scale
  const y = p.y * cam.scale
  return { x: cam.x + x * c - y * s, y: cam.y + x * s + y * c }
}

export function toWorld(cam: Camera, p: P): P {
  const r = ((cam.rotation ?? 0) * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  const dx = p.x - cam.x
  const dy = p.y - cam.y
  return { x: (dx * c + dy * s) / cam.scale, y: (-dx * s + dy * c) / cam.scale }
}

export function anchorAt(cam: Camera, world: P, screen: P): Camera {
  const z = toScreen({ ...cam, x: 0, y: 0 }, world)
  return { ...cam, x: screen.x - z.x, y: screen.y - z.y }
}

export function visibleRect(cam: Camera, width: number, height: number) {
  const pts = [
    toWorld(cam, { x: 0, y: 0 }),
    toWorld(cam, { x: width, y: 0 }),
    toWorld(cam, { x: 0, y: height }),
    toWorld(cam, { x: width, y: height }),
  ]
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
}

const GRID_STEPS = [100, 500, 1000, 5000, 10000, 50000]

export function gridSteps(scale: number) {
  const minor = GRID_STEPS.find((s) => s * scale >= 8) ?? GRID_STEPS[GRID_STEPS.length - 1]
  const major = GRID_STEPS.find((s) => s > minor && s >= 1000 && s * scale >= 50) ?? minor * 10
  return { minor, major }
}

const LABEL_STEPS = [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000]

export const labelStep = (scale: number) =>
  LABEL_STEPS.find((s) => s * scale >= 56) ?? LABEL_STEPS[LABEL_STEPS.length - 1]

export function fitCamera(
  points: P[],
  width: number,
  height: number,
  padding: { left: number; top: number; right: number; bottom: number },
  rotation = 0,
): Camera {
  const unit = { x: 0, y: 0, scale: 1, rotation }
  const rp = points.map((p) => toScreen(unit, p))
  const xs = rp.map((p) => p.x)
  const ys = rp.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const w = Math.max(1, Math.max(...xs) - minX)
  const h = Math.max(1, Math.max(...ys) - minY)
  const availW = Math.max(50, width - padding.left - padding.right)
  const availH = Math.max(50, height - padding.top - padding.bottom)
  const scale = clampScale(Math.min(availW / w, availH / h))
  return {
    scale,
    rotation,
    x: padding.left + (availW - w * scale) / 2 - minX * scale,
    y: padding.top + (availH - h * scale) / 2 - minY * scale,
  }
}

export const readableAngle = (deg: number, viewRot = 0) => {
  let a = deg + viewRot
  a = ((a % 360) + 360) % 360
  if (a > 90 && a <= 270) a -= 180
  if (a > 270) a -= 360
  return a - viewRot
}

export function northAngle(rotationDeg: number) {
  const t = (rotationDeg * Math.PI) / 180
  return (Math.atan2(-Math.cos(t), Math.sin(t)) * 180) / Math.PI
}
