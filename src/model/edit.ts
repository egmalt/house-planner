import { wallLength } from './geometry'
import type { Furniture, Opening, Plan, Point, Wall, Zone } from './schema'
import { t } from '../i18n'

export type WallEnd = 'a' | 'b'
export type EndRef = { wallId: string; end: WallEnd }

const EPS = 0.5

export const samePoint = (p: Point, q: Point) => Math.abs(p.x - q.x) < EPS && Math.abs(p.y - q.y) < EPS

export function connectedEnds(plan: Plan, point: Point, exclude?: EndRef): EndRef[] {
  const out: EndRef[] = []
  for (const w of plan.walls) {
    for (const end of ['a', 'b'] as const) {
      if (exclude && exclude.wallId === w.id && exclude.end === end) continue
      if (samePoint(w[end], point)) out.push({ wallId: w.id, end })
    }
  }
  return out
}

function setEnds(plan: Plan, ends: EndRef[], map: (p: Point) => Point): Plan {
  if (ends.length === 0) return plan
  const byWall = new Map<string, Set<WallEnd>>()
  for (const r of ends) byWall.set(r.wallId, (byWall.get(r.wallId) ?? new Set()).add(r.end))
  const walls = plan.walls.map((w) => {
    const set = byWall.get(w.id)
    if (!set) return w
    return {
      ...w,
      a: set.has('a') ? map(w.a) : w.a,
      b: set.has('b') ? map(w.b) : w.b,
    }
  })
  return clampOpenings({ ...plan, walls })
}

export function endpointGroup(plan: Plan, ref: EndRef, detach: boolean): EndRef[] {
  const wall = plan.walls.find((w) => w.id === ref.wallId)
  if (!wall) return []
  return detach ? [ref] : [ref, ...connectedEnds(plan, wall[ref.end], ref)]
}

export function moveEndpoint(plan: Plan, ref: EndRef, to: Point, detach = false): Plan {
  const group = endpointGroup(plan, ref, detach)
  const clean = group.filter((r) => {
    const w = plan.walls.find((x) => x.id === r.wallId)
    if (!w) return false
    const other = w[r.end === 'a' ? 'b' : 'a']
    return !samePoint(other, to)
  })
  if (!clean.some((r) => r.wallId === ref.wallId && r.end === ref.end)) return plan
  return setEnds(plan, clean, () => ({ x: to.x, y: to.y }))
}

export function wallMoveGroup(plan: Plan, wallId: string, detach: boolean): EndRef[] {
  const wall = plan.walls.find((w) => w.id === wallId)
  if (!wall) return []
  const own: EndRef[] = [
    { wallId, end: 'a' },
    { wallId, end: 'b' },
  ]
  if (detach) return own
  return [
    ...own,
    ...connectedEnds(plan, wall.a).filter((r) => r.wallId !== wallId),
    ...connectedEnds(plan, wall.b).filter((r) => r.wallId !== wallId),
  ]
}

export function moveWall(plan: Plan, wallId: string, delta: Point, detach = false): Plan {
  if (delta.x === 0 && delta.y === 0) return plan
  const group = wallMoveGroup(plan, wallId, detach)
  const unique = group.filter((r, i) => group.findIndex((q) => q.wallId === r.wallId && q.end === r.end) === i)
  const moved = setEnds(plan, unique, (p) => ({ x: p.x + delta.x, y: p.y + delta.y }))
  return {
    ...moved,
    walls: moved.walls.filter((w) => !samePoint(w.a, w.b)),
  }
}

export function setWallLength(plan: Plan, wallId: string, lengthMm: number, detach = false): Plan {
  const wall = plan.walls.find((w) => w.id === wallId)
  if (!wall || !(lengthMm > 0)) return plan
  const len = wallLength(wall) || 1
  const to = {
    x: Math.round(wall.a.x + ((wall.b.x - wall.a.x) / len) * lengthMm),
    y: Math.round(wall.a.y + ((wall.b.y - wall.a.y) / len) * lengthMm),
  }
  return moveEndpoint(plan, { wallId, end: 'b' }, to, detach)
}

export function clampOpenings(plan: Plan): Plan {
  const walls = new Map<string, Wall>(plan.walls.map((w) => [w.id, w]))
  let changed = false
  const openings = plan.openings.map((o) => {
    const w = walls.get(o.wallId)
    if (!w) return o
    const len = wallLength(w)
    if (o.offset + o.width <= len + EPS) return o
    const offset = Math.max(0, Math.round(len - o.width))
    if (offset === o.offset) return o
    changed = true
    return { ...o, offset }
  })
  return changed ? { ...plan, openings } : plan
}

export function openingFits(plan: Plan, openingId: string) {
  const o = plan.openings.find((x) => x.id === openingId)
  const w = o && plan.walls.find((x) => x.id === o.wallId)
  return !!o && !!w && o.offset + o.width <= wallLength(w) + EPS
}

export const OPENING_SNAP = 50
export const MIN_OPENING_WIDTH = 300

export type OpeningSpec = Pick<Opening, 'type' | 'width' | 'height' | 'sill' | 'hinge' | 'side'>
export type OpeningPreset = 'entry' | 'interior' | 'gate' | 'window'

export const OPENING_PRESETS: Record<OpeningPreset, OpeningSpec & { label: string }> = {
  entry: { get label() { return t('plan:openingPresets.entry') }, type: 'door', width: 960, height: 2070, sill: 0, hinge: 'start', side: 'right' },
  interior: { get label() { return t('plan:openingPresets.interior') }, type: 'door', width: 800, height: 2000, sill: 0, hinge: 'start', side: 'right' },
  gate: { get label() { return t('plan:openingPresets.gate') }, type: 'gate', width: 2500, height: 2200, sill: 0, side: 'right' },
  window: { get label() { return t('plan:openingPresets.window') }, type: 'window', width: 1200, height: 1400, sill: 800 },
}

export const snapOffset = (v: number, step = OPENING_SNAP) => Math.round(v / step) * step

export function freeIntervals(plan: Plan, wallId: string, excludeId?: string): [number, number][] {
  const wall = plan.walls.find((w) => w.id === wallId)
  if (!wall) return []
  const len = wallLength(wall)
  const taken = plan.openings
    .filter((o) => o.wallId === wallId && o.id !== excludeId)
    .map((o) => [o.offset, o.offset + o.width] as [number, number])
    .sort((p, q) => p[0] - q[0])
  const out: [number, number][] = []
  let cursor = 0
  for (const [s, e] of taken) {
    if (s > cursor) out.push([cursor, s])
    cursor = Math.max(cursor, e)
  }
  if (len > cursor) out.push([cursor, len])
  return out
}

export function fitOffset(plan: Plan, wallId: string, width: number, desired: number, excludeId?: string): number | null {
  let best: number | null = null
  let bestDist = Infinity
  for (const [s, e] of freeIntervals(plan, wallId, excludeId)) {
    if (e - s < width - EPS) continue
    const lo = Math.ceil(s)
    const hi = Math.floor(e - width)
    const v = Math.min(hi, Math.max(lo, desired))
    const d = Math.abs(v - desired)
    if (d < bestDist) {
      best = v
      bestDist = d
    }
  }
  return best
}

export function addOpening(plan: Plan, wallId: string, spec: OpeningSpec, offset: number): { plan: Plan; id: string } | null {
  const at = fitOffset(plan, wallId, spec.width, offset)
  if (at === null) return null
  const used = new Set(plan.openings.map((o) => o.id))
  const prefix = spec.type === 'door' ? 'd' : spec.type === 'gate' ? 'g' : 'win'
  let n = plan.openings.filter((o) => o.type === spec.type).length + 1
  while (used.has(`${prefix}${n}`)) n += 1
  const id = `${prefix}${n}`
  const opening: Opening = {
    id,
    wallId,
    type: spec.type,
    offset: at,
    width: spec.width,
    height: spec.height,
    sill: spec.sill,
    ...(spec.type === 'door' ? { hinge: spec.hinge ?? 'start', side: spec.side ?? 'right' } : {}),
    ...(spec.type === 'gate' ? { side: spec.side ?? 'right' } : {}),
  }
  return { plan: { ...plan, openings: [...plan.openings, opening] }, id }
}

export function updateOpening(plan: Plan, id: string, patch: Partial<Omit<Opening, 'id'>>): Plan {
  return { ...plan, openings: plan.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)) }
}

export function moveOpening(plan: Plan, id: string, offset: number): Plan {
  const o = plan.openings.find((x) => x.id === id)
  if (!o) return plan
  const at = fitOffset(plan, o.wallId, o.width, offset, id)
  return at === null || at === o.offset ? plan : updateOpening(plan, id, { offset: at })
}

export function resizeOpening(plan: Plan, id: string, edge: 'start' | 'end', pos: number): Plan {
  const o = plan.openings.find((x) => x.id === id)
  if (!o) return plan
  const room = freeIntervals(plan, o.wallId, id).find(([s, e]) => s <= o.offset + EPS && e >= o.offset + o.width - EPS)
  if (!room) return plan
  if (edge === 'start') {
    const end = o.offset + o.width
    const start = Math.min(end - MIN_OPENING_WIDTH, Math.max(room[0], pos))
    return updateOpening(plan, id, { offset: Math.round(start), width: Math.round(end - start) })
  }
  const end = Math.max(o.offset + MIN_OPENING_WIDTH, Math.min(room[1], pos))
  return updateOpening(plan, id, { width: Math.round(end - o.offset) })
}

export function deleteOpening(plan: Plan, id: string): Plan {
  return { ...plan, openings: plan.openings.filter((o) => o.id !== id) }
}

export function updateWall(plan: Plan, id: string, patch: Partial<Omit<Wall, 'id' | 'a' | 'b'>>): Plan {
  return { ...plan, walls: plan.walls.map((w) => (w.id === id ? { ...w, ...patch } : w)) }
}

export function openingGaps(plan: Plan, wallId: string, offset: number, width: number, excludeId?: string) {
  const wall = plan.walls.find((w) => w.id === wallId)
  if (!wall) return null
  const len = wallLength(wall)
  const others = plan.openings.filter((o) => o.wallId === wallId && o.id !== excludeId)
  const before = Math.max(0, ...others.filter((o) => o.offset + o.width <= offset + EPS).map((o) => o.offset + o.width))
  const after = Math.min(len, ...others.filter((o) => o.offset >= offset + width - EPS).map((o) => o.offset))
  return { before: [before, offset] as [number, number], after: [offset + width, after] as [number, number] }
}

export function addFurniture(
  plan: Plan,
  item: Pick<Furniture, 'type' | 'x' | 'y' | 'rotationDeg'> & Partial<Pick<Furniture, 'w' | 'd' | 'h' | 'color'>>,
): { plan: Plan; id: string } {
  const used = new Set(plan.furniture.map((f) => f.id))
  let n = plan.furniture.length + 1
  while (used.has(`f${n}`)) n += 1
  const id = `f${n}`
  const f: Furniture = { ...item, id }
  return { plan: { ...plan, furniture: [...plan.furniture, f] }, id }
}

export function updateFurniture(plan: Plan, id: string, patch: Partial<Omit<Furniture, 'id'>>): Plan {
  return { ...plan, furniture: plan.furniture.map((f) => (f.id === id ? { ...f, ...patch } : f)) }
}

export function deleteFurniture(plan: Plan, id: string): Plan {
  return { ...plan, furniture: plan.furniture.filter((f) => f.id !== id) }
}

export const normalizeDeg = (deg: number) => ((Math.round(deg) % 360) + 360) % 360

export const PIER_MIN = 300
export const CORNER_MIN = 250

export function fitOffsetClear(plan: Plan, wallId: string, width: number, desired: number, excludeId?: string): number | null {
  const wall = plan.walls.find((w) => w.id === wallId)
  if (!wall) return null
  const len = wallLength(wall)
  let best: number | null = null
  let bestDist = Infinity
  for (const [s, e] of freeIntervals(plan, wallId, excludeId)) {
    const lo = s + (s <= EPS ? CORNER_MIN : PIER_MIN)
    const hi = e - (e >= len - EPS ? CORNER_MIN : PIER_MIN) - width
    if (hi < lo) continue
    const v = snapOffset(Math.min(hi, Math.max(lo, desired)))
    const clamped = Math.min(Math.floor(hi), Math.max(Math.ceil(lo), v))
    const d = Math.abs(clamped - desired)
    if (d < bestDist) {
      best = clamped
      bestDist = d
    }
  }
  return best
}

export const zoneKindLabels = Object.defineProperties(
  {},
  Object.fromEntries((['fill', 'lawn', 'paving', 'other'] as const).map((k) => [k, { enumerable: true, get: () => t(`plan:zoneKinds.${k}`) }])),
) as Record<Zone['kind'], string>

export function addZone(plan: Plan, polygon: Point[], kind: Zone['kind'] = 'fill'): { plan: Plan; id: string } {
  const zones = plan.site.zones ?? []
  const used = new Set(zones.map((z) => z.id))
  let n = zones.length + 1
  while (used.has(`z${n}`)) n += 1
  const id = `z${n}`
  const zone: Zone = { id, name: t('plan:zone.defaultName', { n }), kind, polygon: polygon.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })) }
  return { plan: { ...plan, site: { ...plan.site, zones: [...zones, zone] } }, id }
}

export function updateZone(plan: Plan, id: string, patch: Partial<Omit<Zone, 'id'>>): Plan {
  const zones = (plan.site.zones ?? []).map((z) => (z.id === id ? { ...z, ...patch } : z))
  return { ...plan, site: { ...plan.site, zones } }
}

export function deleteZone(plan: Plan, id: string): Plan {
  const zones = (plan.site.zones ?? []).filter((z) => z.id !== id)
  return { ...plan, site: { ...plan.site, zones } }
}
