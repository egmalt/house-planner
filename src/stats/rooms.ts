import type { Opening, Plan, Point, Wall } from '../model'
import { t } from '../i18n'

export const NODE_TOLERANCE_MM = 20

export const roomKinds = ['living', 'bedroom', 'kitchen', 'bath', 'tech', 'hall', 'storage', 'garage'] as const
export type RoomKind = (typeof roomKinds)[number]

export type RoomLabel = { id: string; name: string; x: number; y: number; kind?: RoomKind }

export type PlanWithRooms = Plan & { rooms?: RoomLabel[] }

export type GraphEdge = { id: number; u: number; v: number; wall: Wall }

export type RoomFace = {
  id: string
  buildingId: string
  name: string
  kind?: RoomKind
  labelIds: string[]
  axisPolygon: Point[]
  clearPolygon: Point[]
  axisAreaM2: number
  areaM2: number
  edges: GraphEdge[]
}

export type DetectedBuilding = {
  id: string
  walls: Wall[]
  outline: Point[]
  outlineEdges: GraphEdge[]
  footprint: Point[]
  footprintM2: number
  interiorEdges: GraphEdge[]
  rooms: RoomFace[]
}

export type RoomDetection = {
  nodes: Point[]
  edges: GraphEdge[]
  buildings: DetectedBuilding[]
  unmatchedLabels: RoomLabel[]
}

const EPS = 1e-9

export function signedArea(poly: Point[]): number {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    s += p.x * q.y - q.x * p.y
  }
  return s / 2
}

export const polygonAreaM2 = (poly: Point[]) => Math.abs(signedArea(poly)) / 1e6

export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

function projectParam(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  return len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
}

function distToLine(p: Point, a: Point, b: Point, t: number) {
  return Math.hypot(p.x - (a.x + (b.x - a.x) * t), p.y - (a.y + (b.y - a.y) * t))
}

function segmentIntersection(a: Point, b: Point, c: Point, d: Point): Point | null {
  const rx = b.x - a.x
  const ry = b.y - a.y
  const sx = d.x - c.x
  const sy = d.y - c.y
  const den = rx * sy - ry * sx
  if (Math.abs(den) < EPS) return null
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null
  return { x: a.x + rx * t, y: a.y + ry * t }
}

function buildGraph(walls: Wall[], tol: number) {
  const raw: { p: Point; endpoint: boolean }[] = []
  for (const w of walls) {
    raw.push({ p: w.a, endpoint: true }, { p: w.b, endpoint: true })
  }
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const x = segmentIntersection(walls[i].a, walls[i].b, walls[j].a, walls[j].b)
      if (x) raw.push({ p: x, endpoint: false })
    }
  }
  for (const w of walls) {
    for (const other of walls) {
      if (other === w) continue
      for (const e of [other.a, other.b]) {
        const t = projectParam(e, w.a, w.b)
        if (t > 0 && t < 1 && distToLine(e, w.a, w.b, t) <= tol) {
          raw.push({ p: { x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t }, endpoint: false })
        }
      }
    }
  }

  const nodes: Point[] = []
  const members: { p: Point; endpoint: boolean }[][] = []
  const nodeOf = (p: Point) => {
    for (let i = 0; i < nodes.length; i++) if (Math.hypot(nodes[i].x - p.x, nodes[i].y - p.y) <= tol) return i
    return -1
  }
  const sorted = [...raw].sort((a, b) => Number(b.endpoint) - Number(a.endpoint))
  for (const r of sorted) {
    const i = nodeOf(r.p)
    if (i >= 0) members[i].push(r)
    else {
      nodes.push(r.p)
      members.push([r])
    }
  }
  for (let i = 0; i < nodes.length; i++) {
    const ends = members[i].filter((m) => m.endpoint)
    const src = ends.length ? ends : members[i]
    nodes[i] = {
      x: src.reduce((s, m) => s + m.p.x, 0) / src.length,
      y: src.reduce((s, m) => s + m.p.y, 0) / src.length,
    }
  }

  const edges: GraphEdge[] = []
  const seen = new Map<string, GraphEdge>()
  for (const w of walls) {
    const on: { t: number; n: number }[] = []
    for (let n = 0; n < nodes.length; n++) {
      const t = projectParam(nodes[n], w.a, w.b)
      const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y)
      if (t * len < -tol || (t - 1) * len > tol) continue
      if (distToLine(nodes[n], w.a, w.b, Math.max(0, Math.min(1, t))) <= tol) on.push({ t, n })
    }
    on.sort((a, b) => a.t - b.t)
    for (let k = 0; k + 1 < on.length; k++) {
      const u = on[k].n
      const v = on[k + 1].n
      if (u === v) continue
      const key = u < v ? `${u}:${v}` : `${v}:${u}`
      const prev = seen.get(key)
      if (prev) {
        if (w.thickness > prev.wall.thickness) prev.wall = w
        continue
      }
      const e: GraphEdge = { id: edges.length, u, v, wall: w }
      seen.set(key, e)
      edges.push(e)
    }
  }
  return { nodes, edges }
}

function pruneDangling(nodeCount: number, edges: GraphEdge[]) {
  let alive = edges
  for (;;) {
    const deg = new Array<number>(nodeCount).fill(0)
    for (const e of alive) {
      deg[e.u]++
      deg[e.v]++
    }
    const next = alive.filter((e) => deg[e.u] > 1 && deg[e.v] > 1)
    if (next.length === alive.length) return alive
    alive = next
  }
}

type HalfEdge = { from: number; to: number; edge: GraphEdge }

function traceFaces(nodes: Point[], edges: GraphEdge[]) {
  const out = new Map<number, HalfEdge[]>()
  for (const e of edges) {
    for (const [from, to] of [
      [e.u, e.v],
      [e.v, e.u],
    ]) {
      const list = out.get(from) ?? []
      list.push({ from, to, edge: e })
      out.set(from, list)
    }
  }
  const angle = (h: HalfEdge) => Math.atan2(nodes[h.to].y - nodes[h.from].y, nodes[h.to].x - nodes[h.from].x)
  for (const list of out.values()) list.sort((a, b) => angle(a) - angle(b))

  const used = new Set<HalfEdge>()
  const faces: HalfEdge[][] = []
  for (const list of out.values()) {
    for (const start of list) {
      if (used.has(start)) continue
      const face: HalfEdge[] = []
      let h = start
      while (!used.has(h)) {
        used.add(h)
        face.push(h)
        const around = out.get(h.to)!
        const twin = around.findIndex((x) => x.to === h.from && x.edge === h.edge)
        h = around[(twin - 1 + around.length) % around.length]
      }
      faces.push(face)
    }
  }
  return faces
}

function mergeCollinear(poly: Point[], dist: number[]) {
  const pts = [...poly]
  const d = [...dist]
  let changed = true
  while (changed && pts.length > 3) {
    changed = false
    for (let i = 0; i < pts.length; i++) {
      const prev = (i - 1 + pts.length) % pts.length
      const next = (i + 1) % pts.length
      const ax = pts[i].x - pts[prev].x
      const ay = pts[i].y - pts[prev].y
      const bx = pts[next].x - pts[i].x
      const by = pts[next].y - pts[i].y
      const cross = (ax * by - ay * bx) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1)
      if (Math.abs(cross) < 1e-6 && ax * bx + ay * by > 0 && Math.abs(d[prev] - d[i]) < 1e-6) {
        pts.splice(i, 1)
        d.splice(i, 1)
        changed = true
        break
      }
    }
  }
  return { pts, d }
}

export function offsetPolygon(poly: Point[], dist: number[]): Point[] {
  const ccw = signedArea(poly) > 0
  const src = ccw ? poly : [...poly].reverse()
  const srcDist = ccw ? dist : [...dist.slice(0, -1)].reverse().concat(dist.slice(-1))
  const { pts, d } = mergeCollinear(src, srcDist)
  const n = pts.length
  const lines = pts.map((p, i) => {
    const q = pts[(i + 1) % n]
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1
    const dir = { x: (q.x - p.x) / len, y: (q.y - p.y) / len }
    const nx = -dir.y
    const ny = dir.x
    return { p: { x: p.x + nx * d[i], y: p.y + ny * d[i] }, q: { x: q.x + nx * d[i], y: q.y + ny * d[i] }, dir }
  })
  const res: Point[] = []
  for (let i = 0; i < n; i++) {
    const a = lines[(i - 1 + n) % n]
    const b = lines[i]
    const den = a.dir.x * b.dir.y - a.dir.y * b.dir.x
    if (Math.abs(den) < 1e-9) {
      res.push(a.q, b.p)
      continue
    }
    const t = ((b.p.x - a.p.x) * b.dir.y - (b.p.y - a.p.y) * b.dir.x) / den
    res.push({ x: a.p.x + a.dir.x * t, y: a.p.y + a.dir.y * t })
  }
  return res
}

function faceGeometry(nodes: Point[], face: HalfEdge[], sign: 1 | -1) {
  const poly = face.map((h) => nodes[h.from])
  const dist = face.map((h) => (sign * h.edge.wall.thickness) / 2)
  return offsetPolygon(poly, dist)
}

export function detectRooms(plan: PlanWithRooms, tol = NODE_TOLERANCE_MM): RoomDetection {
  const walls = plan.walls.filter((w) => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) > tol)
  const { nodes, edges: allEdges } = buildGraph(walls, tol)
  const edges = pruneDangling(nodes.length, allEdges)

  const parent = nodes.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (const e of edges) parent[find(e.u)] = find(e.v)
  for (const e of allEdges) parent[find(e.u)] = find(e.v)

  const faces = traceFaces(nodes, edges)
  const byComponent = new Map<number, HalfEdge[][]>()
  for (const f of faces) {
    const c = find(f[0].from)
    byComponent.set(c, [...(byComponent.get(c) ?? []), f])
  }

  const labels = plan.rooms ?? []
  const usedLabels = new Set<string>()
  const buildings: DetectedBuilding[] = []
  const components = [...byComponent.entries()]
    .map(([c, fs]) => ({ c, fs, outer: fs.reduce((m, f) => (areaOf(nodes, f) < areaOf(nodes, m) ? f : m)) }))
    .filter((x) => areaOf(nodes, x.outer) < 0)
    .sort((a, b) => areaOf(nodes, a.outer) - areaOf(nodes, b.outer))

  let roomNo = 0
  components.forEach(({ c, fs, outer }, bi) => {
    const buildingId = `b${bi + 1}`
    const outerEdges = new Set(outer.map((h) => h.edge))
    const compWalls = new Set<Wall>()
    for (const e of allEdges) if (find(e.u) === c) compWalls.add(e.wall)
    const outline = outer.map((h) => nodes[h.from]).reverse()
    const footprint = faceGeometry(nodes, outer, -1)
    const rooms: RoomFace[] = fs
      .filter((f) => f !== outer && areaOf(nodes, f) > 0)
      .map((f, fi) => {
        const axisPolygon = f.map((h) => nodes[h.from])
        const clearPolygon = faceGeometry(nodes, f, 1)
        const inside = labels.filter((l) => !usedLabels.has(l.id) && pointInPolygon(l, axisPolygon))
        inside.forEach((l) => usedLabels.add(l.id))
        return {
          id: `${buildingId}-r${fi + 1}`,
          buildingId,
          name: inside.length ? inside.map((l) => l.name).join(' + ') : '',
          kind: inside.find((l) => l.kind)?.kind,
          labelIds: inside.map((l) => l.id),
          axisPolygon,
          clearPolygon,
          axisAreaM2: polygonAreaM2(axisPolygon),
          areaM2: Math.max(0, signedArea(clearPolygon)) / 1e6,
          edges: f.map((h) => h.edge),
        }
      })
      .sort((a, b) => b.areaM2 - a.areaM2)
    for (const r of rooms) if (!r.name) r.name = t('plan:summary.defaultRoom', { n: ++roomNo })
    buildings.push({
      id: buildingId,
      walls: [...compWalls],
      outline,
      outlineEdges: [...outerEdges],
      footprint,
      footprintM2: polygonAreaM2(footprint),
      interiorEdges: edges.filter((e) => find(e.u) === c && !outerEdges.has(e)),
      rooms,
    })
  })

  return { nodes, edges, buildings, unmatchedLabels: labels.filter((l) => !usedLabels.has(l.id)) }
}

function areaOf(nodes: Point[], face: HalfEdge[]) {
  return signedArea(face.map((h) => nodes[h.from]))
}

export function openingPoint(wall: Wall, o: Opening): Point {
  const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) || 1
  const t = (o.offset + o.width / 2) / len
  return { x: wall.a.x + (wall.b.x - wall.a.x) * t, y: wall.a.y + (wall.b.y - wall.a.y) * t }
}

export function edgeContains(nodes: Point[], e: GraphEdge, p: Point, tol = NODE_TOLERANCE_MM) {
  const a = nodes[e.u]
  const b = nodes[e.v]
  const t = projectParam(p, a, b)
  return t >= 0 && t <= 1 && distToLine(p, a, b, t) <= tol
}
