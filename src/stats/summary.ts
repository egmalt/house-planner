import { computeWallEstimate, sitePolygon, type Opening, type Point } from '../model'
import { t } from '../i18n'
import {
  detectRooms,
  edgeContains,
  openingPoint,
  polygonAreaM2,
  type DetectedBuilding,
  type PlanWithRooms,
  type RoomKind,
} from './rooms'

export const NORMS = {
  houseToBorderMm: 3000,
  houseToStreetMm: 5000,
  outbuildingToBorderMm: 1000,
  outbuildingToStreetMm: 5000,
  betweenBuildingsMm: 6000,
  minLightRatio: 1 / 8,
} as const

export const LIVING_KINDS: readonly RoomKind[] = ['living', 'bedroom']

export type StreetRef = number | [number, number] | { side: number | [number, number] } | Point[] | { a: Point; b: Point }

export type BuildingKind = 'house' | 'garage' | 'outbuilding'

export type RoomSummary = {
  id: string
  name: string
  kind?: RoomKind
  areaM2: number
  living: boolean
  windows: number
  glazingM2: number
  lightRatio: number | null
  lightOk: boolean | null
  polygon: Point[]
}

export type Clearance = {
  target: 'side' | 'street' | 'building'
  label: string
  side?: number
  otherBuildingId?: string
  distanceM: number
  normM: number
  ok: boolean
}

export type BuildingSummary = {
  id: string
  name: string
  kind: BuildingKind
  footprintM2: number
  footprint: Point[]
  totalAreaM2: number
  livingAreaM2: number
  livingRooms: number
  bedrooms: number
  baths: number
  exteriorPerimeterM: number
  partitionsLengthM: number
  heightM: number
  volumeM3: number
  doors: number
  windows: number
  gates: number
  glazingM2: number
  rooms: RoomSummary[]
  clearances: Clearance[]
}

export type PlanSummary = {
  totals: {
    totalAreaM2: number
    livingAreaM2: number
    livingRooms: number
    bedrooms: number
    baths: number
  }
  buildings: BuildingSummary[]
  site: {
    areaM2: number
    builtM2: number
    builtPct: number
    gaps: Clearance[]
    violations: number
  }
  estimate: { total: number; missingPrices: number; wastePct: number }
  unmatchedLabels: string[]
}

function segDist(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t)
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point) {
  const o = (p: Point, q: Point, r: Point) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x))
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0
}

function polylineDistance(p: Point[], q: Point[], closedP: boolean, closedQ: boolean) {
  const segs = (pts: Point[], closed: boolean) => {
    const out: [Point, Point][] = []
    for (let i = 0; i + 1 < pts.length; i++) out.push([pts[i], pts[i + 1]])
    if (closed && pts.length > 2) out.push([pts[pts.length - 1], pts[0]])
    return out
  }
  const sp = segs(p, closedP)
  const sq = segs(q, closedQ)
  let best = Infinity
  for (const [a, b] of sp) {
    for (const [c, d] of sq) {
      if (segmentsCross(a, b, c, d)) return 0
      best = Math.min(best, segDist(a, c, d), segDist(b, c, d), segDist(c, a, b), segDist(d, a, b))
    }
  }
  return best
}

const isPoint = (v: unknown): v is Point =>
  !!v && typeof (v as Point).x === 'number' && typeof (v as Point).y === 'number'

function streetLine(street: unknown, boundary: Point[]): { side?: number; line?: Point[] } {
  if (typeof street === 'number' && Number.isInteger(street)) {
    return { side: ((street % boundary.length) + boundary.length) % boundary.length }
  }
  if (Array.isArray(street) && street.length === 2 && street.every((v) => Number.isInteger(v))) {
    const n = boundary.length
    const [i, j] = street.map((v: number) => ((v % n) + n) % n)
    if (j === (i + 1) % n) return { side: i }
    if (i === (j + 1) % n) return { side: j }
    return {}
  }
  if (Array.isArray(street)) return street.length >= 2 && street.every(isPoint) ? { line: street } : {}
  if (street && typeof street === 'object') {
    const s = street as { a?: unknown; b?: unknown; side?: unknown }
    if (isPoint(s.a) && isPoint(s.b)) return { line: [s.a, s.b] }
    if (s.side !== undefined) return streetLine(s.side, boundary)
  }
  return {}
}

function classify(b: DetectedBuilding, gates: number, largestId: string): BuildingKind {
  const kinds = b.rooms.map((r) => r.kind).filter(Boolean)
  if (kinds.includes('garage')) return kinds.some((k) => LIVING_KINDS.includes(k!)) ? 'house' : 'garage'
  if (kinds.some((k) => k && k !== 'storage' && k !== 'tech')) return 'house'
  if (b.id === largestId) return 'house'
  return gates > 0 ? 'garage' : 'outbuilding'
}

const kindName = (kind: BuildingKind) => t(`plan:summary.buildingKinds.${kind}`)

const sideLabel = (i: number, n: number) => t('plan:summary.side', { from: i, to: (i + 1) % n })

export function computePlanSummary(plan: PlanWithRooms): PlanSummary {
  const detection = detectRooms(plan)
  const { nodes } = detection
  const wallById = new Map(plan.walls.map((w) => [w.id, w]))
  const boundary = sitePolygon(plan.site)
  const street = streetLine((plan.site as { street?: unknown }).street, boundary)
  const largestId = detection.buildings.reduce<DetectedBuilding | null>(
    (m, b) => (!m || b.footprintM2 > m.footprintM2 ? b : m),
    null,
  )?.id ?? ''

  const kindCount = new Map<BuildingKind, number>()
  const buildings: BuildingSummary[] = detection.buildings.map((b) => {
    const wallIds = new Set(b.walls.map((w) => w.id))
    const openings = plan.openings.filter((o) => wallIds.has(o.wallId))
    const count = (t: Opening['type']) => openings.filter((o) => o.type === t).length
    const windows = openings.filter((o) => o.type === 'window')

    const rooms: RoomSummary[] = b.rooms.map((r) => {
      const own = windows.filter((o) => {
        const w = wallById.get(o.wallId)!
        const p = openingPoint(w, o)
        return r.edges.some((e) => e.wall.id === w.id && edgeContains(nodes, e, p))
      })
      const glazingM2 = own.reduce((s, o) => s + (o.width * o.height) / 1e6, 0)
      const living = !!r.kind && LIVING_KINDS.includes(r.kind)
      const lightRatio = r.areaM2 > 0 ? glazingM2 / r.areaM2 : null
      return {
        id: r.id,
        name: r.name,
        kind: r.kind,
        areaM2: r.areaM2,
        living,
        windows: own.length,
        glazingM2,
        lightRatio: living ? lightRatio : null,
        lightOk: living && lightRatio !== null ? lightRatio >= NORMS.minLightRatio - 1e-9 : null,
        polygon: r.clearPolygon,
      }
    })

    const kind = classify(b, count('gate'), largestId)
    const n = (kindCount.get(kind) ?? 0) + 1
    kindCount.set(kind, n)
    const heightMm = Math.max(0, ...b.walls.map((w) => w.height))
    const axisLen = (edges: typeof b.interiorEdges) =>
      edges.reduce((s, e) => s + Math.hypot(nodes[e.v].x - nodes[e.u].x, nodes[e.v].y - nodes[e.u].y), 0) / 1000
    const livingRooms = rooms.filter((r) => r.living)

    const borderNorm = kind === 'house' ? NORMS.houseToBorderMm : NORMS.outbuildingToBorderMm
    const streetNorm = kind === 'house' ? NORMS.houseToStreetMm : NORMS.outbuildingToStreetMm
    const clearances: Clearance[] = boundary.map((p, i) => {
      const q = boundary[(i + 1) % boundary.length]
      const isStreet = street.side === i
      const d = polylineDistance(b.footprint, [p, q], true, false)
      const norm = isStreet ? streetNorm : borderNorm
      return {
        target: isStreet ? 'street' : 'side',
        label: isStreet ? t('plan:summary.sideStreet', { side: sideLabel(i, boundary.length) }) : sideLabel(i, boundary.length),
        side: i,
        distanceM: d / 1000,
        normM: norm / 1000,
        ok: d >= norm - 1,
      }
    })
    if (street.line) {
      const d = polylineDistance(b.footprint, street.line, true, false)
      clearances.push({ target: 'street', label: t('plan:summary.street'), distanceM: d / 1000, normM: streetNorm / 1000, ok: d >= streetNorm - 1 })
    }

    return {
      id: b.id,
      name: n > 1 ? `${kindName(kind)} ${n}` : kindName(kind),
      kind,
      footprintM2: b.footprintM2,
      footprint: b.footprint,
      totalAreaM2: rooms.reduce((s, r) => s + r.areaM2, 0),
      livingAreaM2: livingRooms.reduce((s, r) => s + r.areaM2, 0),
      livingRooms: livingRooms.length,
      bedrooms: rooms.filter((r) => r.kind === 'bedroom').length,
      baths: rooms.filter((r) => r.kind === 'bath').length,
      exteriorPerimeterM: axisLen(b.outlineEdges),
      partitionsLengthM: axisLen(b.interiorEdges),
      heightM: heightMm / 1000,
      volumeM3: (b.footprintM2 * heightMm) / 1000,
      doors: count('door'),
      windows: windows.length,
      gates: count('gate'),
      glazingM2: windows.reduce((s, o) => s + (o.width * o.height) / 1e6, 0),
      rooms,
      clearances,
    }
  })

  const gaps: Clearance[] = []
  for (let i = 0; i < buildings.length; i++) {
    for (let j = i + 1; j < buildings.length; j++) {
      const d = polylineDistance(buildings[i].footprint, buildings[j].footprint, true, true)
      const gap: Clearance = {
        target: 'building',
        label: `${buildings[i].name} — ${buildings[j].name}`,
        otherBuildingId: buildings[j].id,
        distanceM: d / 1000,
        normM: NORMS.betweenBuildingsMm / 1000,
        ok: d >= NORMS.betweenBuildingsMm - 1,
      }
      gaps.push(gap)
    }
  }

  const siteArea = polygonAreaM2(boundary)
  const builtM2 = buildings.reduce((s, b) => s + b.footprintM2, 0)
  const sum = (f: (b: BuildingSummary) => number, list = buildings) => list.reduce((s, b) => s + f(b), 0)
  const homes = buildings.filter((b) => b.kind === 'house')
  const estimate = computeWallEstimate(plan)

  return {
    totals: {
      totalAreaM2: sum((b) => b.totalAreaM2, homes),
      livingAreaM2: sum((b) => b.livingAreaM2, homes),
      livingRooms: sum((b) => b.livingRooms, homes),
      bedrooms: sum((b) => b.bedrooms, homes),
      baths: sum((b) => b.baths, homes),
    },
    buildings,
    site: {
      areaM2: siteArea,
      builtM2,
      builtPct: siteArea > 0 ? (builtM2 / siteArea) * 100 : 0,
      gaps,
      violations: gaps.filter((g) => !g.ok).length + sum((b) => b.clearances.filter((c) => !c.ok).length),
    },
    estimate: { total: estimate.total, missingPrices: estimate.missingPrices, wastePct: estimate.wastePct },
    unmatchedLabels: detection.unmatchedLabels.map((l) => l.name),
  }
}
