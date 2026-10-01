import { resolveFurniture } from '../furniture/catalog'
import { distance, sitePolygon, wallDirection, wallLength, type Plan, type Point } from '../model'

export type Measure = { points: Point[] }

function segmentClosest(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return a
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return { x: a.x + t * dx, y: a.y + t * dy }
}

export function measureTargets(plan: Plan) {
  const points: Point[] = []
  const segments: [Point, Point][] = []
  for (const w of plan.walls) {
    const d = wallDirection(w)
    const n = { x: -d.y, y: d.x }
    const h = w.thickness / 2
    points.push(w.a, w.b)
    for (const s of [1, -1]) {
      const a = { x: w.a.x + n.x * h * s, y: w.a.y + n.y * h * s }
      const b = { x: w.b.x + n.x * h * s, y: w.b.y + n.y * h * s }
      points.push(a, b)
      segments.push([a, b])
    }
    const len = wallLength(w)
    for (const o of plan.openings.filter((x) => x.wallId === w.id)) {
      for (const off of [o.offset, o.offset + o.width]) {
        if (off < 0 || off > len) continue
        const c = { x: w.a.x + d.x * off, y: w.a.y + d.y * off }
        points.push(c, { x: c.x + n.x * h, y: c.y + n.y * h }, { x: c.x - n.x * h, y: c.y - n.y * h })
      }
    }
  }
  for (const p of sitePolygon(plan.site)) points.push(p)
  for (const f of plan.furniture) {
    const r = resolveFurniture(f)
    const t = (f.rotationDeg * Math.PI) / 180
    const c = Math.cos(t)
    const s = Math.sin(t)
    points.push({ x: f.x, y: f.y })
    for (const [u, v] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      const lx = (u * r.w) / 2
      const ly = (v * r.d) / 2
      points.push({ x: f.x + lx * c - ly * s, y: f.y + lx * s + ly * c })
    }
  }
  return { points, segments }
}

export function snapMeasure(
  raw: Point,
  targets: ReturnType<typeof measureTargets>,
  scale: number,
  from: Point | null,
  angle: boolean,
): { point: Point; snapped: boolean } {
  if (from && angle) {
    const dx = raw.x - from.x
    const dy = raw.y - from.y
    const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
    const len = dx * Math.cos(a) + dy * Math.sin(a)
    return { point: { x: from.x + Math.cos(a) * len, y: from.y + Math.sin(a) * len }, snapped: true }
  }
  const r = 12 / scale
  let best: Point | null = null
  let bestD = r
  for (const p of targets.points) {
    const d = distance(raw, p)
    if (d < bestD) {
      best = p
      bestD = d
    }
  }
  if (best) return { point: best, snapped: true }
  const edgeR = 8 / scale
  let bestE: Point | null = null
  let bestED = edgeR
  for (const [a, b] of targets.segments) {
    const c = segmentClosest(raw, a, b)
    const d = distance(raw, c)
    if (d < bestED) {
      bestE = c
      bestED = d
    }
  }
  return bestE ? { point: bestE, snapped: true } : { point: raw, snapped: false }
}

export const polylineLength = (pts: Point[]) => pts.slice(1).reduce((s, p, i) => s + distance(pts[i], p), 0)
