import { ClipType, ClipperD, EndType, FillRule, JoinType, areaD, differenceD, inflatePathsD, intersectD, simplifyPathsD, unionD, type PathD, type PathsD } from 'clipper2-ts'
import type { HeatingLoop, Point } from '../../model'

const PREC = 1

const clean = (paths: PathsD): Point[][] =>
  simplifyPathsD(paths, 2, true)
    .filter((p) => p.length >= 3 && Math.abs(areaD(p)) > 1)
    .map((p) => p.map((q) => ({ x: Math.round(q.x), y: Math.round(q.y) })))

export const areaOf = (paths: Point[][]) => paths.reduce((s, p) => s + areaD(p as PathD), 0)

export const inset = (paths: Point[][], d: number): Point[][] => clean(inflatePathsD(paths as PathsD, -d, JoinType.Miter, EndType.Polygon, 4, PREC))

export const grow = (paths: Point[][], d: number): Point[][] => clean(inflatePathsD(paths as PathsD, d, JoinType.Miter, EndType.Polygon, 4, PREC))

export const minus = (a: Point[][], b: Point[][]): Point[][] => (b.length ? clean(differenceD(a as PathsD, b as PathsD, FillRule.NonZero, PREC)) : a)

export const intersect = (a: Point[][], b: Point[][]): Point[][] => clean(intersectD(a as PathsD, b as PathsD, FillRule.NonZero, PREC))

export const union = (a: Point[][]): Point[][] => clean(unionD(a as PathsD, FillRule.NonZero))

export function strokeBuffer(segments: [Point, Point][], half: number): Point[][] {
  if (!segments.length) return []
  return clean(inflatePathsD(segments.map(([a, b]) => [a, b]) as PathsD, half, JoinType.Miter, EndType.Butt, 2, PREC))
}

export function outerAreaM2(paths: Point[][]) {
  return Math.max(0, areaOf(paths)) / 1e6
}

export const loopRegion = (loop: { polygon: Point[]; excluded?: Point[][] }): Point[][] => minus([loop.polygon], loop.excluded ?? [])

export const zoneAreaM2 = (z: { polygon: Point[]; excluded?: Point[][] }) => Math.abs(areaOf(loopRegion(z))) / 1e6

export const netAreaM2 = (loop: HeatingLoop) => zoneAreaM2(loop) + (loop.parts ?? []).reduce((s, p) => s + zoneAreaM2(p), 0)

export function rect(cx: number, cy: number, w: number, d: number, deg: number): Point[] {
  const a = (deg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ].map(([x, y]) => ({ x: Math.round(cx + x * c - y * s), y: Math.round(cy + x * s + y * c) }))
}

export function bbox(paths: Point[][]) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of paths) for (const q of p) {
    x0 = Math.min(x0, q.x)
    y0 = Math.min(y0, q.y)
    x1 = Math.max(x1, q.x)
    y1 = Math.max(y1, q.y)
  }
  return { x0, y0, x1, y1 }
}

export function splitStrips(poly: Point[][], n: number): Point[][][] {
  if (n <= 1) return [poly]
  const b = bbox(poly)
  const alongX = b.x1 - b.x0 >= b.y1 - b.y0
  const lo = alongX ? b.x0 : b.y0
  const hi = alongX ? b.x1 : b.y1
  const total = Math.abs(areaOf(poly))
  const slab = (a: number, z: number): Point[] =>
    alongX
      ? [{ x: a, y: b.y0 - 10 }, { x: z, y: b.y0 - 10 }, { x: z, y: b.y1 + 10 }, { x: a, y: b.y1 + 10 }]
      : [{ x: b.x0 - 10, y: a }, { x: b.x1 + 10, y: a }, { x: b.x1 + 10, y: z }, { x: b.x0 - 10, y: z }]
  const cuts = [lo]
  for (let k = 1; k < n; k++) {
    const target = (total * k) / n
    let a = cuts[cuts.length - 1]
    let z = hi
    for (let i = 0; i < 40; i++) {
      const m = (a + z) / 2
      if (Math.abs(areaOf(intersect(poly, [slab(lo, m)]))) < target) a = m
      else z = m
    }
    cuts.push(Math.round((a + z) / 2))
  }
  cuts.push(hi)
  return cuts.slice(1).map((z, i) => intersect(poly, [slab(cuts[i], z)])).filter((p) => p.length)
}

export type Ring = { path: Point[]; supply: boolean; order: number }

function rotateTo(path: Point[], at: Point) {
  let best = 0
  let bd = Infinity
  path.forEach((p, i) => {
    const d = Math.hypot(p.x - at.x, p.y - at.y)
    if (d < bd) {
      bd = d
      best = i
    }
  })
  return [...path.slice(best), ...path.slice(0, best)]
}

function trimEnd(path: Point[], gap: number) {
  const out = [...path]
  let left = gap
  while (out.length > 2 && left > 0) {
    const a = out[out.length - 2]
    const b = out[out.length - 1]
    const l = Math.hypot(b.x - a.x, b.y - a.y)
    if (l > left) {
      const t = (l - left) / l
      out[out.length - 1] = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      return out
    }
    out.pop()
    left -= l
  }
  return out
}

export function spiralRings(loop: HeatingLoop, entry: Point | undefined): Ring[] {
  const region = loopRegion(loop)
  const step = loop.stepMm
  const raw: Point[][][] = []
  for (let k = 0; k < 400; k++) {
    const r = inset(region, step / 2 + k * step)
    if (!r.length) break
    raw.push(r)
  }
  const at = entry ?? loop.polygon[0]
  const rings: Ring[] = []
  raw.forEach((paths, k) => {
    for (const p of paths) {
      const closed = rotateTo(p, at)
      rings.push({ path: trimEnd([...closed, closed[0]], step * 1.5), supply: k % 2 === 0, order: k })
    }
  })
  return rings
}

export function snakeLines(loop: HeatingLoop): Point[] {
  const region = inset(loopRegion(loop), loop.stepMm / 2)
  if (!region.length) return []
  const b = bbox(region)
  const alongX = b.x1 - b.x0 >= b.y1 - b.y0
  const lines: PathsD = []
  const step = loop.stepMm
  if (alongX) for (let y = b.y0; y <= b.y1 + 1; y += step) lines.push([{ x: b.x0 - 10, y }, { x: b.x1 + 10, y }])
  else for (let x = b.x0; x <= b.x1 + 1; x += step) lines.push([{ x, y: b.y0 - 10 }, { x, y: b.y1 + 10 }])
  const c = new ClipperD(PREC)
  c.addOpenSubjectPaths(lines)
  c.addClipPaths(region as PathsD)
  const closed: PathsD = []
  const open: PathsD = []
  c.execute(ClipType.Intersection, FillRule.NonZero, closed, open)
  const key = (p: PathD) => (alongX ? p[0].y : p[0].x)
  const segs = open
    .filter((p) => p.length >= 2)
    .map((p) => {
      const s = [p[0], p[p.length - 1]]
      return (alongX ? s[0].x > s[1].x : s[0].y > s[1].y) ? [s[1], s[0]] : s
    })
    .sort((a, b) => key(a) - key(b) || (alongX ? a[0].x - b[0].x : a[0].y - b[0].y))
  const out: Point[] = []
  segs.forEach((s, i) => {
    const seg = i % 2 ? [s[1], s[0]] : s
    out.push(...seg.map((p) => ({ x: p.x, y: p.y })))
  })
  return out
}

export function closestOnPolygon(poly: Point[], p: Point) {
  let best = { point: poly[0], s: 0, d: Infinity }
  let acc = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const l2 = dx * dx + dy * dy
    const l = Math.sqrt(l2)
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0
    const q = { x: a.x + dx * t, y: a.y + dy * t }
    const d = Math.hypot(p.x - q.x, p.y - q.y)
    if (d < best.d) best = { point: q, s: acc + l * t, d }
    acc += l
  }
  return { ...best, perimeter: acc }
}

export function walkBoundary(poly: Point[], from: Point, to: Point): Point[] {
  const a = closestOnPolygon(poly, from)
  const b = closestOnPolygon(poly, to)
  const per = a.perimeter
  const cum: number[] = []
  let acc = 0
  for (let i = 0; i < poly.length; i++) {
    cum.push(acc)
    const q = poly[(i + 1) % poly.length]
    acc += Math.hypot(q.x - poly[i].x, q.y - poly[i].y)
  }
  const fwd = (b.s - a.s + per) % per
  const forward = fwd <= per - fwd
  const span = forward ? fwd : per - fwd
  const pts: Point[] = [a.point]
  poly
    .map((p, i) => ({ p, d: forward ? (cum[i] - a.s + per) % per : (a.s - cum[i] + per) % per }))
    .filter((x) => x.d > 1e-6 && x.d < span)
    .sort((x, y) => x.d - y.d)
    .forEach((x) => pts.push(x.p))
  pts.push(b.point)
  return pts
}

export function simplifyPath(path: Point[]): Point[] {
  const out: Point[] = []
  for (const p of path) {
    const q = { x: Math.round(p.x), y: Math.round(p.y) }
    const last = out[out.length - 1]
    if (last && Math.hypot(last.x - q.x, last.y - q.y) < 5) continue
    if (out.length >= 2) {
      const a = out[out.length - 2]
      const cross = (last.x - a.x) * (q.y - a.y) - (last.y - a.y) * (q.x - a.x)
      if (Math.abs(cross) < 1e-3 * Math.hypot(last.x - a.x, last.y - a.y) * Math.hypot(q.x - a.x, q.y - a.y) + 1) out.pop()
    }
    out.push(q)
  }
  return out
}
