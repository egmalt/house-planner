import type { HeatingCollector, HeatingLoop, HeatingNetwork, HeatingStep, Plan, Point } from '../../model'
import { resolveFurniture } from '../../furniture/catalog'
import { detectRooms, type RoomDetection } from '../../stats/rooms'
import { edgeContains, openingPoint } from '../../stats/rooms'
import { closestOnPolygon, inset, intersect, minus, areaOf, rect, simplifyPath, splitStrips, strokeBuffer, walkBoundary, bbox } from './geometry'
import { DEFAULT_PIPE, LOOP_MAX_M, PIPE_RESERVE, WALL_GAP, centroid, heatingOf, pathLength } from './model'
import { heatRooms, roomOfPoint, type HeatRoom } from './rooms'
import { computeHeating } from './calc'
import { t } from '../../i18n'

export const FIXED_FURNITURE = new Set([
  'kitchen-base',
  'kitchen-drawers',
  'kitchen-corner',
  'kitchen-sink',
  'stove',
  'dishwasher',
  'fridge',
  'wardrobe',
  'hall-wardrobe',
  'bathtub',
  'shower',
  'gas-boiler',
  'floor-boiler',
  'masonry-stove',
  'fireplace',
])

const EDGE_STRIP = 1000
const EDGE_MIN_M2 = 3
const EDGE_ROOM_M2 = 12
const ALONG_WALL = 60
const MAX_OUTPUTS = 12
const MAX_LINK_M = 6

type Door = { at: Point; rooms: [HeatRoom, HeatRoom] }

function doorsOf(plan: Plan, det: RoomDetection, rooms: HeatRoom[]): Door[] {
  const out: Door[] = []
  for (const o of plan.openings) {
    if (o.type !== 'door') continue
    const wall = plan.walls.find((w) => w.id === o.wallId)
    if (!wall) continue
    const at = openingPoint(wall, o)
    const hit = rooms.filter((r) => r.face.edges.some((e) => e.wall.id === wall.id && edgeContains(det.nodes, e, at, wall.thickness)))
    if (hit.length === 2) out.push({ at, rooms: [hit[0], hit[1]] })
  }
  return out
}

function route(start: Point, from: HeatRoom | undefined, to: HeatRoom, doors: Door[]): { doors: Point[]; rooms: HeatRoom[] } | null {
  if (!from) return null
  if (from === to) return { doors: [], rooms: [from] }
  type Node = { at: Point; room: HeatRoom; cost: number; prev: Node | null; door: Door | null }
  const best = new Map<Door, number>()
  const queue: Node[] = [{ at: start, room: from, cost: 0, prev: null, door: null }]
  let done: Node | null = null
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost)
    const n = queue.shift()!
    if (n.room === to) {
      done = n
      break
    }
    for (const d of doors) {
      if (!d.rooms.includes(n.room) || d === n.door) continue
      const cost = n.cost + Math.hypot(d.at.x - n.at.x, d.at.y - n.at.y) + 1
      if ((best.get(d) ?? Infinity) <= cost) continue
      best.set(d, cost)
      queue.push({ at: d.at, room: d.rooms[0] === n.room ? d.rooms[1] : d.rooms[0], cost, prev: n, door: d })
    }
  }
  if (!done) return null
  const pts: Point[] = []
  const rs: HeatRoom[] = []
  for (let n: Node | null = done; n; n = n.prev) {
    rs.unshift(n.room)
    if (n.door) pts.unshift(n.door.at)
  }
  return { doors: pts, rooms: rs }
}

function hug(room: HeatRoom) {
  const r = inset([room.face.clearPolygon], ALONG_WALL)
  return r.sort((a, b) => Math.abs(areaOf([b])) - Math.abs(areaOf([a])))[0] ?? room.face.clearPolygon
}

export function supplyPath(collector: Point, polygon: Point[], room: HeatRoom | undefined, rooms: HeatRoom[], doors: Door[]): Point[] {
  const from = roomOfPoint(rooms, collector)
  const r = room ? route(collector, from, room, doors) : null
  if (!r) {
    const entry = closestOnPolygon(polygon, collector).point
    return simplifyPath([collector, { x: entry.x, y: collector.y }, entry])
  }
  const last = r.doors.length ? r.doors[r.doors.length - 1] : collector
  const entry = closestOnPolygon(polygon, last).point
  const way = [collector, ...r.doors, entry]
  const path: Point[] = [collector]
  for (let i = 0; i < way.length - 1; i++) {
    const ring = hug(r.rooms[i])
    path.push(...walkBoundary(ring, way[i], way[i + 1]), way[i + 1])
  }
  return simplifyPath(path)
}

function fixedRects(plan: Plan): Point[][] {
  return plan.furniture
    .filter((f) => FIXED_FURNITURE.has(f.type))
    .map((f) => {
      const r = resolveFurniture(f)
      return rect(f.x, f.y, r.w, r.d, f.rotationDeg ?? 0)
    })
}

function placeCollector(det: RoomDetection, rooms: HeatRoom[]): Point {
  const main = [...det.buildings].sort((a, b) => b.rooms.filter((r) => r.name).length - a.rooms.filter((r) => r.name).length || b.footprintM2 - a.footprintM2)[0]
  const center = main ? centroid(main.footprint) : { x: 0, y: 0 }
  const boiler = rooms.find((r) => r.cls === 'boiler')
  if (!boiler) return { x: Math.round(center.x), y: Math.round(center.y) }
  const ring = inset([boiler.face.clearPolygon], 150)[0] ?? boiler.face.clearPolygon
  const p = closestOnPolygon(ring, center).point
  return { x: Math.round(p.x), y: Math.round(p.y) }
}

export type LayoutResult = { heating: HeatingNetwork; notes: string[] }

export function autoLayout(plan: Plan): LayoutResult {
  const det = detectRooms(plan)
  const rooms = heatRooms(plan, det)
  const doors = doorsOf(plan, det, rooms)
  const prev = heatingOf(plan)
  const notes: string[] = []
  const at = prev.collector ? { x: prev.collector.x, y: prev.collector.y } : placeCollector(det, rooms)
  if (!prev.collector) {
    const b = rooms.find((r) => r.cls === 'boiler')
    notes.push(b ? t('networks:heating.layout.collectorInRoom', { room: b.name }) : t('networks:heating.layout.noBoilerRoom'))
  } else notes.push(t('networks:heating.layout.collectorKept'))
  const fixed = fixedRects(plan)
  const pipe = prev.loops[0]?.pipe ?? DEFAULT_PIPE
  const make = (room: HeatRoom, poly: Point[], step: HeatingStep, edge: boolean, suffix: string): HeatingLoop => {
    const excluded = intersect([poly], fixed)
    return {
      id: 'hl',
      ...(room.labelId ? { roomId: room.labelId } : {}),
      roomName: `${room.name}${edge ? t('networks:heating.layout.edgeSuffix') : ''}${suffix}`,
      polygon: poly,
      stepMm: step,
      pattern: 'spiral',
      pipe,
      supplyPath: supplyPath(at, poly, room, rooms, doors),
      ...(excluded.length ? { excluded } : {}),
      ...(edge ? { edge: true } : {}),
    }
  }
  const coilOf = (l: { polygon: Point[]; excluded?: Point[][] }, step: number) => (Math.abs(areaOf(minus([l.polygon], l.excluded ?? []))) / 1e6 / (step / 1000)) * (1 + PIPE_RESERVE)
  const measure = (room: HeatRoom, poly: Point[], step: HeatingStep) => {
    const feed = pathLength(supplyPath(at, poly, room, rooms, doors)) / 1000
    const coil = coilOf({ polygon: poly, excluded: intersect([poly], fixed) }, step)
    return { feed, coil, total: coil + 2 * feed * (1 + PIPE_RESERVE) }
  }
  const piece = (out: HeatingLoop[], room: HeatRoom, poly: Point[], step: HeatingStep, edge: boolean) => {
    const { feed, coil, total } = measure(room, poly, step)
    if (total <= LOOP_MAX_M) {
      out.push(make(room, poly, step, edge, ''))
      return 1
    }
    const room4coil = LOOP_MAX_M - 2 * feed * (1 + PIPE_RESERVE)
    const n = room4coil > 15 ? Math.ceil(coil / room4coil) : Math.ceil(total / LOOP_MAX_M)
    const parts = splitStrips([poly], n).flat().filter((p) => Math.abs(areaOf([p])) > 5e5)
    parts.forEach((p, i) => out.push(make(room, p, step, edge, ` · ${i + 1}/${parts.length}`)))
    return parts.length
  }
  type Mode = 'auto' | 'full100' | 'edge' | 'split100'
  const genRoom = (room: HeatRoom, mode: Mode): HeatingLoop[] | null => {
    const base = inset([room.face.clearPolygon], WALL_GAP).filter((p) => Math.abs(areaOf([p])) > 3e5)
    if (!base.length) return []
    const out: HeatingLoop[] = []
    const wet = room.cls === 'wet'
    if (mode === 'full100' || mode === 'split100') {
      for (const p of base) if (piece(out, room, p, 100, false) > 1 && mode === 'full100') return null
      return out
    }
    const bigEnough = mode === 'edge' || room.face.areaM2 > EDGE_ROOM_M2
    const buf = !wet && bigEnough && room.exteriorWalls.length ? strokeBuffer(room.exteriorWalls.map((w) => [w.a, w.b]), room.exteriorWalls[0].thickness / 2 + EDGE_STRIP) : []
    const edge = buf.length ? intersect(base, buf).filter((p) => Math.abs(areaOf([p])) > 5e5) : []
    const core = buf.length ? minus(base, buf).filter((p) => Math.abs(areaOf([p])) > 5e5) : []
    const minEdge = mode === 'edge' ? 1 : EDGE_MIN_M2
    const edgeFits = edge.length === 1 && measure(room, edge[0], 100).total <= LOOP_MAX_M
    if (edgeFits && core.length && Math.abs(areaOf(edge)) / 1e6 >= minEdge && Math.abs(areaOf(core)) / 1e6 >= minEdge) {
      edge.forEach((p) => piece(out, room, p, 100, true))
      core.forEach((p) => piece(out, room, p, 150, false))
    } else if (mode === 'edge') return null
    else base.forEach((p) => piece(out, room, p, wet ? 100 : 150, false))
    return out
  }

  const byRoom = new Map<HeatRoom, HeatingLoop[]>()
  for (const room of rooms) {
    if (room.cls === 'skip') {
      notes.push(t('networks:heating.layout.noHeating', { room: room.name }))
      continue
    }
    if (room.face.areaM2 < 1) continue
    byRoom.set(room, genRoom(room, 'auto') ?? [])
  }
  const keyOf = (r: HeatRoom) => r.labelId ?? r.face.id
  const collectorAt: HeatingCollector = { ...(prev.collector ?? {}), id: prev.collector?.id ?? 'collector', x: at.x, y: at.y, outputs: 1 }
  const evaluate = (loops: HeatingLoop[]) => computeHeating({ ...plan, networks: { ...plan.networks, heating: { ...prev, collector: collectorAt, loops } } })
  const flat = () => [...byRoom.values()].flat()
  const short = evaluate(flat()).rooms.filter((b) => !b.ok).map((b) => b.key)
  for (const room of byRoom.keys()) {
    if (!short.includes(keyOf(room)) || room.cls === 'wet') continue
    const was = byRoom.get(room)!
    let fixedIt = false
    for (const mode of ['full100', 'edge', 'split100'] as Mode[]) {
      const alt = genRoom(room, mode)
      if (!alt || !alt.length) continue
      byRoom.set(room, alt)
      if (evaluate(flat()).rooms.find((b) => b.key === keyOf(room))?.ok) {
        notes.push(t(mode === 'edge' ? 'networks:heating.layout.fixedEdge' : 'networks:heating.layout.fixedFull', { room: room.name }))
        fixedIt = true
        break
      }
      byRoom.set(room, was)
    }
    if (!fixedIt) notes.push(t('networks:heating.layout.needRadiator', { room: room.name }))
  }
  const roomOf = new Map<HeatingLoop, HeatRoom>()
  for (const [room, ls] of byRoom) for (const l of ls) roomOf.set(l, room)
  let loops = flat()
  for (const [room, ls] of byRoom) if (ls.length > 1 && ls.some((l) => / · \d+\/\d+$/.test(l.roomName ?? ''))) notes.push(t('networks:heating.layout.loopsInRoom', { room: room.name, count: ls.length }))

  while (loops.length > MAX_OUTPUTS) {
    let best: { a: HeatingLoop; b: HeatingLoop; link: Point[]; len: number } | null = null
    for (const a of loops)
      for (const b of loops) {
        if (a === b || a.stepMm !== b.stepMm || a.parts || b.parts || roomOf.get(a) === roomOf.get(b)) continue
        if (pathLength(a.supplyPath) > pathLength(b.supplyPath)) continue
        const entry = a.supplyPath?.[a.supplyPath.length - 1] ?? a.polygon[0]
        const link = supplyPath(entry, b.polygon, roomOf.get(b), rooms, doors)
        const linkM = pathLength(link) / 1000
        if (linkM > MAX_LINK_M) continue
        const len = coilOf(a, a.stepMm) + coilOf(b, b.stepMm) + 2 * (pathLength(a.supplyPath) / 1000 + linkM) * (1 + PIPE_RESERVE)
        if (len > LOOP_MAX_M) continue
        if (!best || len < best.len) best = { a, b, link, len }
      }
    if (!best) {
      notes.push(t('networks:heating.layout.cantMerge', { count: loops.length }))
      break
    }
    const { a, b, link } = best
    const merged: HeatingLoop = {
      ...a,
      roomName: `${a.roomName} + ${b.roomName}`,
      parts: [{ polygon: b.polygon, ...(b.roomId ? { roomId: b.roomId } : {}), ...(b.roomName ? { roomName: b.roomName } : {}), ...(b.excluded ? { excluded: b.excluded } : {}) }],
      linkPath: link,
    }
    roomOf.set(merged, roomOf.get(a)!)
    loops = loops.filter((l) => l !== b).map((l) => (l === a ? merged : l))
    notes.push(t('networks:heating.layout.merged', { a: a.roomName, b: b.roomName, len: Math.round(best.len) }))
  }

  loops.sort((a, b) => pathLength(a.supplyPath) - pathLength(b.supplyPath))
  loops.forEach((l, i) => (l.id = `hl${i + 1}`))
  const collector: HeatingCollector = { ...collectorAt, outputs: Math.max(loops.length, 1) }
  return { heating: { ...prev, collector, loops }, notes }
}

export function rerouteAll(plan: Plan): HeatingNetwork {
  const h = heatingOf(plan)
  if (!h.collector) return h
  const det = detectRooms(plan)
  const rooms = heatRooms(plan, det)
  const doors = doorsOf(plan, det, rooms)
  const at = { x: h.collector.x, y: h.collector.y }
  return {
    ...h,
    loops: h.loops.map((l) => {
      const room = rooms.find((r) => r.labelId && r.labelId === l.roomId) ?? roomOfPoint(rooms, centroid(l.polygon))
      const sp = supplyPath(at, l.polygon, room, rooms, doors)
      const part = l.parts?.[0]
      if (!part) return { ...l, supplyPath: sp }
      const partRoom = rooms.find((r) => r.labelId && r.labelId === part.roomId) ?? roomOfPoint(rooms, centroid(part.polygon))
      return { ...l, supplyPath: sp, linkPath: supplyPath(sp[sp.length - 1], part.polygon, partRoom, rooms, doors) }
    }),
  }
}

export const loopBox = (l: HeatingLoop) => bbox([l.polygon])
