import type { Furniture, Plan, Point, Wall } from '../model'
import { resolveFurniture } from '../furniture/catalog'
import { pointInPolygon } from '../stats/rooms'
import { snapAngle } from '../canvas/snap'
import { FURNITURE_FIXTURE, fixtureOutlet, projectOnSegment, segmentIntersection, sewerOf } from './sewerModel'

export type SewerTarget =
  | { kind: 'node'; id: string; point: Point }
  | { kind: 'fixture'; furniture: Furniture; point: Point }
  | { kind: 'pipe'; id: string; point: Point }
  | { kind: 'point'; point: Point; wall?: boolean }

const NODE_PX = 12
const PIPE_PX = 8
const AXIS_PX = 10
const WALL_GAP = 80
const GRID = 50

function insideFurniture(f: Furniture, p: Point) {
  const r = resolveFurniture(f)
  const a = (-f.rotationDeg * Math.PI) / 180
  const dx = p.x - f.x
  const dy = p.y - f.y
  const lx = dx * Math.cos(a) - dy * Math.sin(a)
  const ly = dx * Math.sin(a) + dy * Math.cos(a)
  return Math.abs(lx) <= r.w / 2 && Math.abs(ly) <= r.d / 2
}

function wallSnap(p: Point, walls: Wall[], scale: number): Point | null {
  let best: { q: Point; d: number } | null = null
  for (const w of walls) {
    const pr = projectOnSegment(p, w.a, w.b)
    const reach = w.thickness / 2 + Math.max(250, 14 / scale)
    if (pr.dist > reach || pr.t <= 0 || pr.t >= 1) continue
    if (best && pr.dist >= best.d) continue
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1
    const nx = -(w.b.y - w.a.y) / len
    const ny = (w.b.x - w.a.x) / len
    const side = (p.x - pr.point.x) * nx + (p.y - pr.point.y) * ny >= 0 ? 1 : -1
    const off = w.thickness / 2 + WALL_GAP
    best = { q: { x: Math.round(pr.point.x + nx * off * side), y: Math.round(pr.point.y + ny * off * side) }, d: pr.dist }
  }
  return best?.q ?? null
}

export type SnapNet = {
  nodes: { id: string; x: number; y: number; kind: string; furnitureId?: string; w?: number; d?: number }[]
  pipes: { id: string; from: string; to: string; diameter: number }[]
}

export function findTarget(plan: Plan, raw: Point, scale: number, from: Point | null, shift: boolean, skipNode?: string, net?: SnapNet): SewerTarget {
  const s: SnapNet = net ?? sewerOf(plan)
  const nodeR = NODE_PX / scale
  let node: { id: string; point: Point; d: number } | null = null
  for (const n of s.nodes) {
    if (n.id === skipNode) continue
    const d = Math.hypot(n.x - raw.x, n.y - raw.y)
    const hit = n.kind === 'septic' ? d <= Math.max(nodeR, Math.min(n.w ?? 2500, n.d ?? 1100) / 2) : d <= nodeR
    if (hit && (!node || d < node.d)) node = { id: n.id, point: { x: n.x, y: n.y }, d }
  }
  if (node) return { kind: 'node', id: node.id, point: node.point }

  const fixtureAt = (near: boolean): SewerTarget | null => {
    for (const f of plan.furniture) {
      if (!FURNITURE_FIXTURE[f.type]) continue
      const out = fixtureOutlet(f)
      if (near ? Math.hypot(out.x - raw.x, out.y - raw.y) <= nodeR * 1.5 : insideFurniture(f, raw)) {
        const existing = s.nodes.find((n) => n.furnitureId === f.id && n.id !== skipNode)
        if (existing) return { kind: 'node', id: existing.id, point: { x: existing.x, y: existing.y } }
        return { kind: 'fixture', furniture: f, point: out }
      }
    }
    return null
  }
  const inFixture = fixtureAt(false)
  if (inFixture) return inFixture

  const pipeR = PIPE_PX / scale
  for (const p of s.pipes) {
    const a = s.nodes.find((n) => n.id === p.from)
    const b = s.nodes.find((n) => n.id === p.to)
    if (!a || !b || a.id === skipNode || b.id === skipNode) continue
    const pr = projectOnSegment(raw, a, b)
    if (pr.dist <= Math.max(pipeR, p.diameter / 2) && pr.t > 0.02 && pr.t < 0.98) {
      return { kind: 'pipe', id: p.id, point: { x: Math.round(pr.point.x), y: Math.round(pr.point.y) } }
    }
  }

  const nearFixture = fixtureAt(true)
  if (nearFixture) return nearFixture

  if (from && shift) return { kind: 'point', point: snapAngle(from, raw, GRID) }
  const wall = wallSnap(raw, plan.walls, scale)
  let pt = wall ?? { x: Math.round(raw.x / GRID) * GRID, y: Math.round(raw.y / GRID) * GRID }
  if (from) {
    const axis = AXIS_PX / scale
    if (Math.abs(pt.x - from.x) <= axis) pt = { ...pt, x: from.x }
    if (Math.abs(pt.y - from.y) <= axis) pt = { ...pt, y: from.y }
  }
  return { kind: 'point', point: pt, wall: !!wall }
}

export const insideAny = (p: Point, footprints: Point[][]) => footprints.some((poly) => pointInPolygon(p, poly))

export function firstCrossing(a: Point, b: Point, footprints: Point[][]): Point | null {
  let best: { point: Point; t: number } | null = null
  for (const poly of footprints) {
    for (let i = 0; i < poly.length; i++) {
      const hit = segmentIntersection(a, b, poly[i], poly[(i + 1) % poly.length])
      if (hit && (!best || hit.t < best.t)) best = hit
    }
  }
  return best ? { x: Math.round(best.point.x), y: Math.round(best.point.y) } : null
}
