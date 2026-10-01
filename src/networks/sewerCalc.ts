import { sitePolygon, type Plan, type Point, type SewerNetwork, type SewerNode, type SewerPipe } from '../model'
import { detectRooms } from '../stats/rooms'
import {
  DEFAULT_FLOOR_LEVEL,
  DEFAULT_RISER_HEIGHT,
  DEFAULT_SEPTIC,
  MIN_OUTSIDE_DEPTH,
  SEPTIC_TO_BOUNDARY_MIN,
  SEPTIC_TO_HOUSE_MIN,
  fixtureLabels,
  minSlope,
  pipeLength,
  pipeSlope,
  projectOnSegment,
  sewerOf,
} from './sewerModel'
import { t } from '../i18n'
import { fmtM, fmtPct, type ItemUnit } from './labels'

export type SewerItemKind = 'pipe' | 'elbow' | 'tee' | 'reducer' | 'cleanout' | 'clamp' | 'sleeve' | 'corrugation' | 'vent' | 'septic'

export type SewerItem = {
  key: string
  kind: SewerItemKind
  name: string
  qty: number
  unit: ItemUnit
  diameter?: number
  angle?: number
  lengthMm?: number
  location?: SewerPipe['location']
  model?: string
}

export type SewerRef = { kind: 'node' | 'pipe'; id: string }

export type SewerWarning = { text: string; ref?: SewerRef }

export type PipeLevel = { start: number; end: number; drop: number; length: number; slope: number; vertical: number }

export type SepticInfo = { nodeId: string; model: string; depth: number | null; toHouse: number | null; toBoundary: number | null }

export type SewerCalc = {
  lengths: { diameter: number; location: SewerPipe['location']; lengthMm: number }[]
  items: SewerItem[]
  nodeLevel: Record<string, number>
  pipeLevel: Record<string, PipeLevel>
  outlets: { nodeId: string; depth: number }[]
  septics: SepticInfo[]
  warnings: SewerWarning[]
  floorLevel: number
}

const pipeName = (d: number, location: SewerPipe['location']) =>
  t(location === 'outside' ? 'networks:sewer.item.pipeOutside' : 'networks:sewer.item.pipeInside', { d })

function dir(a: Point, b: Point) {
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
  return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }
}

function turnDeg(s: SewerNetwork, inPipe: SewerPipe, outPipe: SewerPipe) {
  const n = (id: string) => s.nodes.find((x) => x.id === id)
  const a = n(inPipe.from)
  const m = n(inPipe.to)
  const b = n(outPipe.to)
  if (!a || !m || !b) return 0
  const u = dir(a, m)
  const v = dir(m, b)
  const cos = Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y))
  return (Math.acos(cos) * 180) / Math.PI
}

export function septicCorners(n: SewerNode): Point[] {
  const w = n.w ?? DEFAULT_SEPTIC.w
  const d = n.d ?? DEFAULT_SEPTIC.d
  const a = ((n.rotationDeg ?? 0) * Math.PI) / 180
  return [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ].map(([x, y]) => ({ x: n.x + x * Math.cos(a) - y * Math.sin(a), y: n.y + x * Math.sin(a) + y * Math.cos(a) }))
}

function segSegDist(a: Point, b: Point, c: Point, d: Point) {
  return Math.min(
    projectOnSegment(a, c, d).dist,
    projectOnSegment(b, c, d).dist,
    projectOnSegment(c, a, b).dist,
    projectOnSegment(d, a, b).dist,
  )
}

function polyDist(p: Point[], q: Point[]) {
  let best = Infinity
  for (let i = 0; i < p.length; i++)
    for (let j = 0; j < q.length; j++) best = Math.min(best, segSegDist(p[i], p[(i + 1) % p.length], q[j], q[(j + 1) % q.length]))
  return best
}

export function computeSewer(plan: Plan): SewerCalc {
  const s = sewerOf(plan)
  const floorLevel = s.floorLevel ?? DEFAULT_FLOOR_LEVEL
  const warnings: SewerWarning[] = []
  const items = new Map<string, SewerItem>()
  const add = (it: Omit<SewerItem, 'qty'>, qty: number) => {
    if (qty <= 0) return
    const cur = items.get(it.key)
    items.set(it.key, { ...it, qty: (cur?.qty ?? 0) + qty })
  }
  const outSuffix = (loc: SewerPipe['location']) => (loc === 'outside' ? { key: '-out', out: true, location: loc } : { key: '', out: false, location: loc })
  const elbow = (d: number, angle: 45 | 87, qty = 1, loc: SewerPipe['location'] = 'inside') => {
    const o = outSuffix(loc)
    add({ key: `elbow-${d}-${angle}${o.key}`, kind: 'elbow', name: t(o.out ? 'networks:sewer.item.elbowOut' : 'networks:sewer.item.elbow', { angle, d }), unit: 'pcs', diameter: d, angle, location: o.location }, qty)
  }

  const inc = new Map<string, SewerPipe[]>()
  const out = new Map<string, SewerPipe[]>()
  for (const n of s.nodes) {
    inc.set(n.id, [])
    out.set(n.id, [])
  }
  for (const p of s.pipes) {
    inc.get(p.to)?.push(p)
    out.get(p.from)?.push(p)
  }

  const nodeLevel: Record<string, number> = {}
  const pipeLevel: Record<string, PipeLevel> = {}
  const indeg = new Map(s.nodes.map((n) => [n.id, inc.get(n.id)!.length]))
  const queue = s.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id)
  const done = new Set<string>()
  while (queue.length) {
    const id = queue.shift()!
    done.add(id)
    const incoming = inc.get(id)!
    nodeLevel[id] = incoming.length ? Math.min(...incoming.map((p) => pipeLevel[p.id]?.end ?? floorLevel)) : floorLevel
    const node = s.nodes.find((n) => n.id === id)
    if (node?.kind === 'septic' && node.depth !== undefined && !incoming.length) nodeLevel[id] = -node.depth
    for (const p of out.get(id)!) {
      const length = pipeLength(s, p)
      const slope = pipeSlope(p)
      let start = nodeLevel[id]
      if (p.depth !== undefined) start = -p.depth
      else if (p.location === 'outside') start = Math.min(start, -MIN_OUTSIDE_DEPTH)
      const vertical = Math.max(0, nodeLevel[id] - start)
      const drop = (length * slope) / 100
      pipeLevel[p.id] = { start, end: start - drop, drop, length, slope, vertical }
      const k = (indeg.get(p.to) ?? 1) - 1
      indeg.set(p.to, k)
      if (k === 0) queue.push(p.to)
    }
  }
  if (done.size < s.nodes.length) warnings.push({ text: t('networks:sewer.warn.loop') })

  const lengthMap = new Map<string, { diameter: number; location: SewerPipe['location']; lengthMm: number }>()
  const addLength = (d: number, location: SewerPipe['location'], mm: number) => {
    const key = `${d}-${location}`
    const cur = lengthMap.get(key) ?? { diameter: d, location, lengthMm: 0 }
    cur.lengthMm += mm
    lengthMap.set(key, cur)
  }

  for (const p of s.pipes) {
    const lv = pipeLevel[p.id]
    const length = lv?.length ?? pipeLength(s, p)
    addLength(p.diameter, p.location, length)
    if (lv?.vertical && lv.vertical > 50) {
      addLength(p.diameter, 'inside', lv.vertical)
      elbow(p.diameter, 87)
      elbow(p.diameter, 45, 2)
      add({ key: `clamp-${p.diameter}`, kind: 'clamp', name: t('networks:sewer.item.clamp', { d: p.diameter }), unit: 'pcs', diameter: p.diameter }, Math.ceil(lv.vertical / 2000))
    }
    const min = minSlope(p.diameter, p.location)
    const slope = pipeSlope(p)
    if (slope + 1e-9 < min) {
      warnings.push({ text: t('networks:sewer.warn.slopeLow', { id: p.id, slope: fmtPct(slope), min: fmtPct(min), d: p.diameter }), ref: { kind: 'pipe', id: p.id } })
    }
    if (p.location === 'inside') {
      const step = p.diameter * 10
      add({ key: `clamp-${p.diameter}`, kind: 'clamp', name: t('networks:sewer.item.clamp', { d: p.diameter }), unit: 'pcs', diameter: p.diameter }, Math.max(1, Math.ceil(length / step)))
    }
    if (p.location === 'outside' && lv && -lv.start < MIN_OUTSIDE_DEPTH - 1) {
      warnings.push({ text: t('networks:sewer.warn.shallow', { id: p.id, depth: fmtM(-lv.start), min: fmtM(MIN_OUTSIDE_DEPTH) }), ref: { kind: 'pipe', id: p.id } })
    }
    const upstream = inc.get(p.from) ?? []
    const bigger = upstream.find((u) => u.diameter > p.diameter)
    if (bigger) warnings.push({ text: t('networks:sewer.warn.thinner', { id: p.id, d: p.diameter, up: bigger.diameter }), ref: { kind: 'pipe', id: p.id } })
  }

  const buildings = detectRooms(plan).buildings
  const boundary = sitePolygon(plan.site)
  const outlets: SewerCalc['outlets'] = []
  const septics: SepticInfo[] = []

  for (const n of s.nodes) {
    const ins = inc.get(n.id)!
    const outs = out.get(n.id)!
    const main = outs.reduce<number>((m, p) => Math.max(m, p.diameter), 0) || ins.reduce<number>((m, p) => Math.max(m, p.diameter), 0)
    const ref: SewerRef = { kind: 'node', id: n.id }
    const loc: SewerPipe['location'] = (outs[0] ?? ins[0])?.location ?? 'inside'
    const o = outSuffix(loc)
    if (!main && n.kind !== 'septic') continue

    if (n.kind === 'fixture') {
      if (n.fixture === 'toilet') add({ key: 'corrugation-110', kind: 'corrugation', name: t('networks:sewer.item.corrugation'), unit: 'pcs', diameter: 110 }, 1)
      else elbow(main, 87)
      if (n.fixture === 'toilet' && outs.some((p) => p.diameter < 110)) {
        warnings.push({ text: t('networks:sewer.warn.toiletPipe', { id: n.id }), ref })
      }
    }

    if (n.kind === 'riser') {
      const h = n.height ?? DEFAULT_RISER_HEIGHT
      addLength(110, 'inside', h)
      add({ key: 'cleanout-110', kind: 'cleanout', name: t('networks:sewer.item.cleanout', { d: 110 }), unit: 'pcs', diameter: 110 }, 1)
      add({ key: 'vent-110', kind: 'vent', name: t('networks:sewer.item.vent'), unit: 'pcs', diameter: 110 }, 1)
      add({ key: 'clamp-110', kind: 'clamp', name: t('networks:sewer.item.clamp', { d: 110 }), unit: 'pcs', diameter: 110 }, Math.ceil(h / 2000))
      for (const p of ins) {
        const key = p.diameter < 110 ? `tee-110x${p.diameter}-87` : 'tee-110-87'
        add({ key, kind: 'tee', name: p.diameter < 110 ? t('networks:sewer.item.tee87Reduced', { branch: p.diameter }) : t('networks:sewer.item.tee87'), unit: 'pcs', diameter: 110, angle: 87 }, 1)
      }
      elbow(110, 45, 2)
      if (outs.some((p) => p.diameter < 110)) warnings.push({ text: t('networks:sewer.warn.riserPipe', { id: n.id }), ref })
      continue
    }

    if (n.kind === 'cleanout') add({ key: `cleanout-${main}${o.key}`, kind: 'cleanout', name: t(o.out ? 'networks:sewer.item.cleanoutOut' : 'networks:sewer.item.cleanout', { d: main }), unit: 'pcs', diameter: main, location: loc }, 1)
    if (n.kind === 'outlet') {
      add({ key: `sleeve-${main}`, kind: 'sleeve', name: t('networks:sewer.item.sleeve', { d: main }), unit: 'pcs', diameter: main }, 1)
      const o = outs[0] && pipeLevel[outs[0].id]
      if (o) outlets.push({ nodeId: n.id, depth: -o.start })
    }

    if (n.kind === 'septic') {
      add({ key: 'septic', kind: 'septic', name: n.model ? t('networks:sewer.item.septicModel', { model: n.model }) : t('networks:sewer.item.septic'), unit: 'pcs', model: n.model }, 1)
      const corners = septicCorners(n)
      const toHouse = buildings.length ? Math.min(...buildings.map((b) => polyDist(corners, b.footprint))) : null
      const toBoundary = boundary.length >= 3 ? polyDist(corners, boundary) : null
      const level = ins.length ? nodeLevel[n.id] : n.depth !== undefined ? -n.depth : null
      septics.push({ nodeId: n.id, model: n.model ?? '', depth: level === null || level === undefined ? null : -level, toHouse, toBoundary })
      if (toHouse !== null && toHouse < SEPTIC_TO_HOUSE_MIN)
        warnings.push({ text: t('networks:sewer.warn.septicHouse', { name: n.model ?? n.id, dist: fmtM(toHouse), min: fmtM(SEPTIC_TO_HOUSE_MIN) }), ref })
      if (toBoundary !== null && toBoundary < SEPTIC_TO_BOUNDARY_MIN)
        warnings.push({ text: t('networks:sewer.warn.septicBoundary', { name: n.model ?? n.id, dist: fmtM(toBoundary), min: fmtM(SEPTIC_TO_BOUNDARY_MIN) }), ref })
      continue
    }

    const deg = ins.length + outs.length
    if (deg >= 3) {
      const branch = Math.min(...ins.map((p) => p.diameter), main)
      const tees = deg - 2
      const key = (branch < main ? `tee-${main}x${branch}-45` : `tee-${main}-45`) + o.key
      add({ key, kind: 'tee', name: branch < main ? t(o.out ? 'networks:sewer.item.tee45ReducedOut' : 'networks:sewer.item.tee45Reduced', { main, branch }) : t(o.out ? 'networks:sewer.item.tee45Out' : 'networks:sewer.item.tee45', { d: main }), unit: 'pcs', diameter: main, angle: 45, location: loc }, tees)
      continue
    }
    if (ins.length === 1 && outs.length === 1) {
      const a = ins[0]
      const b = outs[0]
      if (a.diameter !== b.diameter) {
        const big = Math.max(a.diameter, b.diameter)
        const small = Math.min(a.diameter, b.diameter)
        add({ key: `reducer-${big}x${small}`, kind: 'reducer', name: t('networks:sewer.item.reducer', { big, small }), unit: 'pcs', diameter: big }, 1)
      }
      const turn = turnDeg(s, a, b)
      if (turn > 15 && turn <= 60) elbow(b.diameter, 45, 1, loc)
      else if (turn > 60) {
        elbow(b.diameter, 87, 1, loc)
        if (turn > 100) elbow(b.diameter, 45, 1, loc)
        if (n.kind !== 'cleanout')
          warnings.push({ text: t('networks:sewer.warn.sharpTurn', { id: n.id, deg: Math.round(turn) }), ref })
      }
    }
    if (ins.length && !outs.length && n.kind !== 'outlet') {
      warnings.push({ text: t('networks:sewer.warn.deadEnd', { id: n.id }), ref })
    }
  }

  const fixtures = s.nodes.filter((n) => n.kind === 'fixture' && !(out.get(n.id) ?? []).length)
  for (const f of fixtures) warnings.push({ text: t('networks:shared.warn.notConnected', { name: f.fixture ? fixtureLabels[f.fixture] : f.id }), ref: { kind: 'node', id: f.id } })

  for (const l of lengthMap.values()) {
    const m = Math.ceil(l.lengthMm / 100) / 10
    add({ key: `pipe-${l.diameter}-${l.location}`, kind: 'pipe', name: pipeName(l.diameter, l.location), unit: 'm', diameter: l.diameter, lengthMm: l.lengthMm, location: l.location }, m)
  }

  const order: SewerItemKind[] = ['septic', 'pipe', 'elbow', 'tee', 'reducer', 'cleanout', 'sleeve', 'corrugation', 'vent', 'clamp']
  const list = [...items.values()].sort(
    (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || (b.diameter ?? 0) - (a.diameter ?? 0) || a.key.localeCompare(b.key),
  )

  return {
    lengths: [...lengthMap.values()].sort((a, b) => b.diameter - a.diameter || a.location.localeCompare(b.location)),
    items: list,
    nodeLevel,
    pipeLevel,
    outlets,
    septics,
    warnings,
    floorLevel,
  }
}

