import { nextId, type Furniture, type Plan, type Point, type SewerDiameter, type SewerFixture, type SewerNetwork, type SewerNode, type SewerPipe } from '../model'
import { resolveFurniture } from '../furniture/catalog'
import { labelMap } from './labels'

export type NewSewerNode = Pick<SewerNode, 'x' | 'y' | 'kind'> &
  Partial<Pick<SewerNode, 'fixture' | 'label' | 'furnitureId' | 'height' | 'w' | 'd' | 'rotationDeg' | 'model' | 'depth'>>
export type NewSewerPipe = Pick<SewerPipe, 'from' | 'to' | 'diameter' | 'location'> & Partial<Pick<SewerPipe, 'slope' | 'depth' | 'material'>>

export const EMPTY_SEWER: SewerNetwork = { nodes: [], pipes: [] }

export const DEFAULT_FLOOR_LEVEL = 600
export const DEFAULT_RISER_HEIGHT = 3000
export const MIN_OUTSIDE_DEPTH = 1000
export const SEPTIC_TO_HOUSE_MIN = 5000
export const SEPTIC_TO_BOUNDARY_MIN = 1000
export const DEFAULT_SEPTIC = { w: 2500, d: 1100 }

export const fixtureLabels: Record<SewerFixture, string> = labelMap<SewerFixture>(['toilet', 'sink', 'bath', 'shower', 'washer', 'kitchen', 'boiler'], 'networks:sewer.fixture')

export const nodeKindLabels: Record<SewerNode['kind'], string> = labelMap<SewerNode['kind']>(['fixture', 'riser', 'cleanout', 'outlet', 'septic', 'junction'], 'networks:sewer.kind')

export const FURNITURE_FIXTURE: Record<string, SewerFixture> = {
  toilet: 'toilet',
  washbasin: 'sink',
  vanity: 'sink',
  bathtub: 'bath',
  shower: 'shower',
  washer: 'washer',
  'kitchen-sink': 'kitchen',
  dishwasher: 'kitchen',
  'water-heater': 'boiler',
  'gas-boiler': 'boiler',
  'floor-boiler': 'boiler',
}

export function minSlope(diameter: SewerDiameter, location: SewerPipe['location']) {
  if (diameter === 50) return 2.5
  if (diameter === 160) return 0.8
  return location === 'outside' ? 1 : 1.2
}

export function defaultSlope(diameter: SewerDiameter, location: SewerPipe['location']) {
  if (diameter === 50) return 3
  if (location === 'outside') return diameter === 160 ? 0.8 : 1
  return 2
}

export const pipeSlope = (p: SewerPipe) => p.slope ?? defaultSlope(p.diameter, p.location)

export const sewerOf = (plan: Plan): SewerNetwork => plan.networks?.sewer ?? EMPTY_SEWER

export const withSewer = (plan: Plan, fn: (s: SewerNetwork) => SewerNetwork): Plan => ({
  ...plan,
  networks: { ...plan.networks, sewer: fn(sewerOf(plan)) },
})

export const nodeById = (s: SewerNetwork, id: string) => s.nodes.find((n) => n.id === id)

export const pipeEnds = (s: SewerNetwork, p: SewerPipe) => {
  const a = nodeById(s, p.from)
  const b = nodeById(s, p.to)
  return a && b ? { a, b } : null
}

export const pipeLength = (s: SewerNetwork, p: SewerPipe) => {
  const e = pipeEnds(s, p)
  return e ? Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) : 0
}

export function fixtureOutlet(f: Furniture): Point {
  const r = resolveFurniture(f)
  const fixture = FURNITURE_FIXTURE[f.type]
  const local = fixture === 'shower' ? { x: 0, y: 0 } : { x: 0, y: -r.d / 2 + Math.min(150, r.d / 4) }
  const a = (f.rotationDeg * Math.PI) / 180
  return {
    x: Math.round(f.x + local.x * Math.cos(a) - local.y * Math.sin(a)),
    y: Math.round(f.y + local.x * Math.sin(a) + local.y * Math.cos(a)),
  }
}

export function addNode(plan: Plan, node: NewSewerNode): { plan: Plan; id: string } {
  const s = sewerOf(plan)
  const id = nextId('sn', s.nodes)
  return { plan: withSewer(plan, (x) => ({ ...x, nodes: [...x.nodes, { ...node, id } as SewerNode] })), id }
}

export function addPipe(plan: Plan, pipe: NewSewerPipe): { plan: Plan; id: string } {
  const s = sewerOf(plan)
  const id = nextId('sp', s.pipes)
  const next = withSewer(plan, (x) => ({ ...x, pipes: [...x.pipes, { ...pipe, id } as SewerPipe] }))
  return { plan: upsizeDownstream(next, pipe.to, pipe.diameter), id }
}

export function upsizeDownstream(plan: Plan, fromNode: string, diameter: SewerDiameter): Plan {
  let s = sewerOf(plan)
  const seen = new Set<string>()
  const queue = [fromNode]
  while (queue.length) {
    const n = queue.shift()!
    if (seen.has(n)) continue
    seen.add(n)
    for (const p of s.pipes) {
      if (p.from !== n) continue
      if (p.diameter < diameter) {
        const slope = p.slope === defaultSlope(p.diameter, p.location) ? defaultSlope(diameter, p.location) : p.slope
        s = { ...s, pipes: s.pipes.map((q) => (q.id === p.id ? { ...q, diameter, slope } : q)) }
      }
      queue.push(p.to)
    }
  }
  return withSewer(plan, () => s)
}

export function upstreamDiameter(s: SewerNetwork, nodeId: string): SewerDiameter | null {
  const node = nodeById(s, nodeId)
  if (node?.kind === 'fixture' && node.fixture === 'toilet') return 110
  const incoming = s.pipes.filter((p) => p.to === nodeId)
  if (!incoming.length) return null
  return incoming.reduce<SewerDiameter>((m, p) => (p.diameter > m ? p.diameter : m), 50)
}

export const updateNode = (plan: Plan, id: string, patch: Partial<SewerNode>): Plan =>
  withSewer(plan, (s) => ({ ...s, nodes: s.nodes.map((n) => (n.id === id ? ({ ...n, ...patch } as SewerNode) : n)) }))

export const updatePipe = (plan: Plan, id: string, patch: Partial<SewerPipe>): Plan => {
  const next = withSewer(plan, (s) => ({ ...s, pipes: s.pipes.map((p) => (p.id === id ? ({ ...p, ...patch } as SewerPipe) : p)) }))
  const pipe = sewerOf(next).pipes.find((p) => p.id === id)
  return pipe && patch.diameter ? upsizeDownstream(next, pipe.to, pipe.diameter) : next
}

export const reversePipe = (plan: Plan, id: string): Plan =>
  withSewer(plan, (s) => ({ ...s, pipes: s.pipes.map((p) => (p.id === id ? { ...p, from: p.to, to: p.from } : p)) }))

export const deletePipe = (plan: Plan, id: string): Plan =>
  withSewer(plan, (s) => ({ ...s, pipes: s.pipes.filter((p) => p.id !== id) }))

export function deleteNode(plan: Plan, id: string): Plan {
  const s = sewerOf(plan)
  const inc = s.pipes.filter((p) => p.to === id)
  const out = s.pipes.filter((p) => p.from === id)
  const node = nodeById(s, id)
  if (node && node.kind !== 'fixture' && node.kind !== 'septic' && inc.length === 1 && out.length === 1 && inc[0].from !== out[0].to) {
    const merged: SewerPipe = { ...out[0], from: inc[0].from, diameter: Math.max(inc[0].diameter, out[0].diameter) as SewerDiameter }
    return withSewer(plan, (x) => ({
      ...x,
      nodes: x.nodes.filter((n) => n.id !== id),
      pipes: x.pipes.filter((p) => p.id !== inc[0].id).map((p) => (p.id === out[0].id ? merged : p)),
    }))
  }
  return withSewer(plan, (x) => ({
    ...x,
    nodes: x.nodes.filter((n) => n.id !== id),
    pipes: x.pipes.filter((p) => p.from !== id && p.to !== id),
  }))
}

export function splitPipe(plan: Plan, pipeId: string, at: Point): { plan: Plan; id: string } | null {
  const s = sewerOf(plan)
  const pipe = s.pipes.find((p) => p.id === pipeId)
  if (!pipe) return null
  const added = addNode(plan, { x: at.x, y: at.y, kind: 'junction' })
  const s2 = sewerOf(added.plan)
  const secondId = nextId('sp', s2.pipes)
  const next = withSewer(added.plan, (x) => ({
    ...x,
    pipes: [
      ...x.pipes.map((p) => (p.id === pipeId ? { ...p, to: added.id } : p)),
      { ...pipe, id: secondId, from: added.id },
    ],
  }))
  return { plan: next, id: added.id }
}

export const moveNode = (plan: Plan, id: string, to: Point): Plan => updateNode(plan, id, { x: Math.round(to.x), y: Math.round(to.y) })

export function projectOnSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0
  const q = { x: a.x + dx * t, y: a.y + dy * t }
  return { point: q, t, dist: Math.hypot(p.x - q.x, p.y - q.y) }
}

export function segmentIntersection(p1: Point, p2: Point, q1: Point, q2: Point): { point: Point; t: number } | null {
  const r = { x: p2.x - p1.x, y: p2.y - p1.y }
  const s = { x: q2.x - q1.x, y: q2.y - q1.y }
  const den = r.x * s.y - r.y * s.x
  if (Math.abs(den) < 1e-9) return null
  const t = ((q1.x - p1.x) * s.y - (q1.y - p1.y) * s.x) / den
  const u = ((q1.x - p1.x) * r.y - (q1.y - p1.y) * r.x) / den
  if (t <= 1e-6 || t >= 1 - 1e-6 || u < 0 || u > 1) return null
  return { point: { x: p1.x + r.x * t, y: p1.y + r.y * t }, t }
}
