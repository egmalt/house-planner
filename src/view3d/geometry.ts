import * as THREE from 'three'
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg'
import type { Opening, Point, Wall } from './types'

const EPS = 1

type V = { x: number; y: number }

const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y })
const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y })
const mul = (a: V, k: number): V => ({ x: a.x * k, y: a.y * k })
const len = (a: V) => Math.hypot(a.x, a.y)
const norm = (a: V): V => mul(a, 1 / (len(a) || 1))
const cross = (a: V, b: V) => a.x * b.y - a.y * b.x
const left = (a: V): V => ({ x: -a.y, y: a.x })
const same = (a: Point, b: Point) => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS

function intersect(p1: V, d1: V, p2: V, d2: V): V | null {
  const den = cross(d1, d2)
  if (Math.abs(den) < 1e-9) return null
  const t = cross(sub(p2, p1), d2) / den
  return add(p1, mul(d1, t))
}

type Arm = { wall: Wall; dir: V }

function armsAt(p: Point, walls: Wall[], self: Wall): Arm[] {
  const arms: Arm[] = []
  for (const w of walls) {
    if (w === self) continue
    if (same(w.a, p)) arms.push({ wall: w, dir: norm(sub(w.b, w.a)) })
    else if (same(w.b, p)) arms.push({ wall: w, dir: norm(sub(w.a, w.b)) })
  }
  return arms
}

const angle = (v: V) => Math.atan2(v.y, v.x)

function cornerSide(p: Point, dir: V, half: number, arms: Arm[], side: 1 | -1): V {
  const n = mul(left(dir), side)
  const base = add(p, mul(n, half))
  if (!arms.length) return base
  const a0 = angle(dir)
  let best: Arm | null = null
  let bestDelta = Infinity
  for (const arm of arms) {
    let delta = (angle(arm.dir) - a0) * side
    while (delta <= 0) delta += Math.PI * 2
    if (delta < bestDelta) {
      bestDelta = delta
      best = arm
    }
  }
  if (!best) return base
  const on = add(p, mul(left(best.dir), -side * (best.wall.thickness / 2)))
  const hit = intersect(base, dir, on, best.dir)
  if (!hit) return base
  const limit = Math.max(half, best.wall.thickness / 2) * 4
  return len(sub(hit, p)) > limit ? base : hit
}

export function wallFootprint(wall: Wall, walls: Wall[]): Point[] {
  const dir = norm(sub(wall.b, wall.a))
  const back = mul(dir, -1)
  const half = wall.thickness / 2
  const armsA = armsAt(wall.a, walls, wall)
  const armsB = armsAt(wall.b, walls, wall)
  const aL = cornerSide(wall.a, dir, half, armsA, 1)
  const aR = cornerSide(wall.a, dir, half, armsA, -1)
  const bR = cornerSide(wall.b, back, half, armsB, 1)
  const bL = cornerSide(wall.b, back, half, armsB, -1)
  return [aR, bR, bL, aL]
}

export function wallFrame(wall: Wall) {
  const d = sub(wall.b, wall.a)
  return { length: len(d), dir: norm(d), angle: Math.atan2(d.y, d.x) }
}

export function bounds(points: Point[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { minX, minY, maxX, maxY }
}

const M = 0.001

export function worldUV(source: THREE.BufferGeometry, capTop?: number) {
  const g = source.index ? source.toNonIndexed() : source
  const pos = g.getAttribute('position')
  const count = pos.count / 3
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const n = new THREE.Vector3()
  const caps: number[][] = []
  const sides: number[][] = []
  for (let i = 0; i < count; i++) {
    a.fromBufferAttribute(pos, i * 3)
    b.fromBufferAttribute(pos, i * 3 + 1)
    c.fromBufferAttribute(pos, i * 3 + 2)
    n.copy(c).sub(b).cross(new THREE.Vector3().copy(a).sub(b)).normalize()
    const horizontal = Math.abs(n.y) > 0.9
    const tx = -n.z
    const tz = n.x
    const tl = Math.hypot(tx, tz) || 1
    const tri: number[] = []
    for (const v of [a, b, c]) {
      const u = horizontal ? v.x : (v.x * tx + v.z * tz) / tl
      const w = horizontal ? -v.z : v.y
      tri.push(v.x, v.y, v.z, n.x, n.y, n.z, u, w)
    }
    const cy = (a.y + b.y + c.y) / 3
    const isCap = capTop !== undefined && horizontal && (cy > capTop - 1e-3 || cy < 1e-3)
    ;(isCap ? caps : sides).push(tri)
  }
  const all = [...caps, ...sides]
  const position = new Float32Array(all.length * 9)
  const normal = new Float32Array(all.length * 9)
  const uv = new Float32Array(all.length * 6)
  all.forEach((tri, t) => {
    for (let k = 0; k < 3; k++) {
      const o = k * 8
      position.set(tri.slice(o, o + 3), t * 9 + k * 3)
      normal.set(tri.slice(o + 3, o + 6), t * 9 + k * 3)
      uv.set(tri.slice(o + 6, o + 8), t * 6 + k * 2)
    }
  })
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(position, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  out.addGroup(0, caps.length * 3, 0)
  out.addGroup(caps.length * 3, sides.length * 3, 1)
  out.computeBoundingBox()
  out.computeBoundingSphere()
  return out
}

export function openingPlacement(wall: Wall, o: Opening) {
  const f = wallFrame(wall)
  const c = (o.offset + o.width / 2) / f.length
  const x = (wall.a.x + (wall.b.x - wall.a.x) * c) * M
  const z = (wall.a.y + (wall.b.y - wall.a.y) * c) * M
  const y = (o.sill + o.height / 2) * M
  return { position: [x, y, z] as [number, number, number], rotationY: -f.angle }
}

const evaluator = new Evaluator()
evaluator.attributes = ['position', 'normal']
evaluator.useGroups = false

export function wallSolid(wall: Wall, walls: Wall[], openings: Opening[]) {
  const shape = new THREE.Shape(wallFootprint(wall, walls).map((p) => new THREE.Vector2(p.x * M, -p.y * M)))
  const base = new THREE.ExtrudeGeometry(shape, { depth: wall.height * M, bevelEnabled: false })
  base.rotateX(-Math.PI / 2)
  base.deleteAttribute('uv')
  let brush = new Brush(base)
  brush.updateMatrixWorld()
  for (const o of openings) {
    const box = new THREE.BoxGeometry(o.width * M, o.height * M, wall.thickness * M + 0.3)
    box.deleteAttribute('uv')
    const cut = new Brush(box)
    const p = openingPlacement(wall, o)
    cut.position.set(...p.position)
    cut.rotation.y = p.rotationY
    cut.updateMatrixWorld()
    try {
      brush = evaluator.evaluate(brush, cut, SUBTRACTION)
    } catch {
      continue
    }
  }
  return worldUV(brush.geometry, wall.height * M)
}

export type SeamPattern = { dir: 'vertical' | 'horizontal'; step: number }

export function wallSeams(wall: Wall, openings: Opening[], pattern: SeamPattern) {
  const f = wallFrame(wall)
  const L = f.length
  const H = wall.height
  const nx = -f.dir.y
  const ny = f.dir.x
  const off = wall.thickness / 2 + 2
  const out: number[] = []
  const push = (s: number, y0: number, s2: number, y1: number) => {
    for (const side of [1, -1]) {
      const px = (t: number) => (wall.a.x + f.dir.x * t + nx * off * side) * M
      const pz = (t: number) => (wall.a.y + f.dir.y * t + ny * off * side) * M
      out.push(px(s), y0 * M, pz(s), px(s2), y1 * M, pz(s2))
    }
  }
  const margin = wall.thickness
  if (pattern.dir === 'vertical') {
    for (let s = pattern.step; s < L - margin; s += pattern.step) {
      if (s < margin) continue
      let spans: [number, number][] = [[0, H]]
      for (const o of openings) {
        if (s <= o.offset || s >= o.offset + o.width) continue
        spans = spans.flatMap(([y0, y1]) => {
          const r: [number, number][] = []
          if (o.sill > y0) r.push([y0, Math.min(y1, o.sill)])
          if (o.sill + o.height < y1) r.push([Math.max(y0, o.sill + o.height), y1])
          return r
        })
      }
      for (const [y0, y1] of spans) if (y1 - y0 > 1) push(s, y0, s, y1)
    }
  } else {
    for (let y = pattern.step; y < H - 1; y += pattern.step) {
      let spans: [number, number][] = [[margin / 2, L - margin / 2]]
      for (const o of openings) {
        if (y <= o.sill || y >= o.sill + o.height) continue
        spans = spans.flatMap(([s0, s1]) => {
          const r: [number, number][] = []
          if (o.offset > s0) r.push([s0, Math.min(s1, o.offset)])
          if (o.offset + o.width < s1) r.push([Math.max(s0, o.offset + o.width), s1])
          return r
        })
      }
      for (const [s0, s1] of spans) if (s1 - s0 > 1) push(s0, y, s1, y)
    }
  }
  return new Float32Array(out)
}

export function wallEdges(wall: Wall, walls: Wall[], openings: Opening[]) {
  const H = wall.height * M
  const fp = wallFootprint(wall, walls).map((p) => [p.x * M, p.y * M] as const)
  const out: number[] = []
  for (let i = 0; i < fp.length; i++) {
    const [x0, z0] = fp[i]
    const [x1, z1] = fp[(i + 1) % fp.length]
    out.push(x0, H, z0, x1, H, z1)
    out.push(x0, 0, z0, x0, H, z0)
  }
  const f = wallFrame(wall)
  const nx = -f.dir.y
  const ny = f.dir.x
  const half = wall.thickness / 2
  const at = (s: number, side: number, y: number) => [(wall.a.x + f.dir.x * s + nx * half * side) * M, y * M, (wall.a.y + f.dir.y * s + ny * half * side) * M]
  for (const o of openings) {
    const s0 = o.offset
    const s1 = o.offset + o.width
    const y0 = o.sill
    const y1 = o.sill + o.height
    for (const side of [1, -1]) {
      const c = [at(s0, side, y0), at(s1, side, y0), at(s1, side, y1), at(s0, side, y1)]
      for (let i = 0; i < 4; i++) {
        if (y0 === 0 && i === 0) continue
        out.push(...c[i], ...c[(i + 1) % 4])
      }
    }
    for (const [s, y] of [[s0, y0], [s1, y0], [s1, y1], [s0, y1]]) out.push(...at(s, 1, y), ...at(s, -1, y))
  }
  return new Float32Array(out)
}

type PlanLike = { walls: Wall[]; openings: Opening[] }

export function sanitizePlan<P extends PlanLike>(plan: P): P {
  const ok = (n: unknown) => typeof n === 'number' && Number.isFinite(n)
  const walls = (plan.walls ?? []).filter(
    (w) => w && ok(w.a?.x) && ok(w.a?.y) && ok(w.b?.x) && ok(w.b?.y) && ok(w.thickness) && ok(w.height) && w.thickness > 0 && w.height > 0 && Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) > 1,
  )
  const byId = new Map(walls.map((w) => [w.id, w]))
  const openings: Opening[] = []
  for (const o of plan.openings ?? []) {
    const w = o && byId.get(o.wallId)
    if (!w || !ok(o.offset) || !ok(o.width) || !ok(o.height)) continue
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y)
    const start = Math.min(Math.max(o.offset, 0), L)
    const width = Math.min(o.width, L - start)
    const sill = Math.min(Math.max(ok(o.sill) ? o.sill : 0, 0), w.height)
    const height = Math.min(o.height, w.height - sill)
    if (width < 10 || height < 10) continue
    openings.push({ ...o, offset: start, width, sill, height })
  }
  return { ...plan, walls, openings }
}

const key = (p: Point) => `${Math.round(p.x)}:${Math.round(p.y)}`

function wallLoop(walls: Wall[]): Point[] | null {
  const adj = new Map<string, Set<string>>()
  const pts = new Map<string, Point>()
  const link = (a: Point, b: Point) => {
    const ka = key(a)
    const kb = key(b)
    if (ka === kb) return
    pts.set(ka, a)
    pts.set(kb, b)
    if (!adj.has(ka)) adj.set(ka, new Set())
    if (!adj.has(kb)) adj.set(kb, new Set())
    adj.get(ka)!.add(kb)
    adj.get(kb)!.add(ka)
  }
  for (const w of walls) link(w.a, w.b)
  let pruned = true
  while (pruned) {
    pruned = false
    for (const [k, s] of adj) {
      if (s.size > 1) continue
      for (const n of s) adj.get(n)?.delete(k)
      adj.delete(k)
      pruned = true
    }
  }
  if (adj.size < 3 || [...adj.values()].some((s) => s.size !== 2)) return null
  const start = adj.keys().next().value as string
  const loop: Point[] = [pts.get(start)!]
  let prev = start
  let cur = [...adj.get(start)!][0]
  while (cur !== start) {
    loop.push(pts.get(cur)!)
    const next = [...adj.get(cur)!].find((n) => n !== prev)
    if (!next || loop.length > adj.size) return null
    prev = cur
    cur = next
  }
  return loop.length === adj.size ? loop : null
}

function hull(points: Point[]): Point[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (p.length < 3) return p
  const turn = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Point[] = []
  for (const q of p) {
    while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop()
    lower.push(q)
  }
  const upper: Point[] = []
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop()
    upper.push(q)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

function offsetPolygon(poly: Point[], d: number): Point[] {
  const area = poly.reduce((s, p, i) => s + cross(p, poly[(i + 1) % poly.length]), 0)
  const sign = area > 0 ? -1 : 1
  const n = poly.length
  return poly.map((p, i) => {
    const prev = poly[(i - 1 + n) % n]
    const next = poly[(i + 1) % n]
    const d1 = norm(sub(p, prev))
    const d2 = norm(sub(next, p))
    const o1 = add(prev, mul(left(d1), sign * d))
    const o2 = add(p, mul(left(d2), sign * d))
    const hit = intersect(o1, d1, o2, d2)
    return hit && len(sub(hit, p)) < d * 4 ? hit : add(p, mul(left(d1), sign * d))
  })
}

export function slabOutline(walls: Wall[], margin: number): Point[] {
  if (!walls.length) return []
  const loop = wallLoop(walls)
  if (loop) {
    const t = Math.max(...walls.map((w) => w.thickness))
    return offsetPolygon(loop, t / 2 + margin)
  }
  return offsetPolygon(hull(walls.flatMap((w) => wallFootprint(w, walls))), margin)
}

function touches(p: Point, w: Wall) {
  const d = sub(w.b, w.a)
  const l2 = d.x * d.x + d.y * d.y || 1
  const t = Math.max(0, Math.min(1, ((p.x - w.a.x) * d.x + (p.y - w.a.y) * d.y) / l2))
  return len(sub(p, add(w.a, mul(d, t)))) <= w.thickness
}

export function wallGroups(walls: Wall[]): Wall[][] {
  const parent = walls.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const a = walls[i]
      const b = walls[j]
      if (touches(a.a, b) || touches(a.b, b) || touches(b.a, a) || touches(b.b, a)) parent[find(i)] = find(j)
    }
  }
  const groups = new Map<number, Wall[]>()
  walls.forEach((w, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), w]))
  return [...groups.values()]
}

function inside(p: Point, poly: Point[]) {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit
  }
  return hit
}

export function exteriorWalls(walls: Wall[]): Set<string> {
  const out = new Set<string>()
  for (const group of wallGroups(walls)) {
    const outline = slabOutline(group, 0)
    for (const w of group) {
      if (outline.length < 3) {
        out.add(w.id)
        continue
      }
      const f = wallFrame(w)
      const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }
      const n = { x: -f.dir.y, y: f.dir.x }
      const d = w.thickness / 2 + 60
      const p1 = { x: mid.x + n.x * d, y: mid.y + n.y * d }
      const p2 = { x: mid.x - n.x * d, y: mid.y - n.y * d }
      if (!inside(p1, outline) || !inside(p2, outline)) out.add(w.id)
    }
  }
  return out
}
