import { distance, snapToGrid, type Point, type Wall } from '../model'

export const GRID_SNAP = 100
const ENDPOINT_SNAP_PX = 12

export type Snap = { point: Point; kind: 'endpoint' | 'grid' | 'angle' }

export function snapAngle(from: Point, raw: Point, step = GRID_SNAP): Point {
  const dx = raw.x - from.x
  const dy = raw.y - from.y
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
  const ux = Math.round(Math.cos(angle) * 1e9) / 1e9
  const uy = Math.round(Math.sin(angle) * 1e9) / 1e9
  const proj = dx * ux + dy * uy
  const diagonal = ux !== 0 && uy !== 0
  if (!diagonal) {
    const len = Math.round(proj / step) * step
    return { x: Math.round(from.x + ux * len), y: Math.round(from.y + uy * len) }
  }
  const leg = Math.round((proj * Math.SQRT1_2) / step) * step
  return { x: from.x + Math.sign(ux) * leg, y: from.y + Math.sign(uy) * leg }
}

export function snapPoint(
  raw: Point,
  walls: Wall[],
  scale: number,
  from: Point | null,
  angle: boolean,
  skip?: (wallId: string, end: 'a' | 'b') => boolean,
): Snap {
  if (from && angle) return { point: snapAngle(from, raw), kind: 'angle' }
  const radius = ENDPOINT_SNAP_PX / scale
  let best: Point | null = null
  let bestDist = radius
  for (const w of walls) {
    for (const end of ['a', 'b'] as const) {
      if (skip?.(w.id, end)) continue
      const d = distance(raw, w[end])
      if (d <= bestDist) {
        best = w[end]
        bestDist = d
      }
    }
  }
  if (best) return { point: { x: best.x, y: best.y }, kind: 'endpoint' }
  return { point: snapToGrid(raw, GRID_SNAP), kind: 'grid' }
}
