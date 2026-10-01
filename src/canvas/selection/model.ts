import { normalizeDeg, sitePolygon, type Plan, type Point } from '../../model'
import { fmtNum, t } from '../../i18n'
import { detectRooms, pointInPolygon } from '../../stats/rooms'
import { toScreen, type Camera } from '../camera'

export type SelKind = 'walls' | 'openings' | 'furniture' | 'rooms'
export type Selection = Record<SelKind, string[]>

export const SEL_KINDS: SelKind[] = ['walls', 'openings', 'furniture', 'rooms']

export const emptySel = (): Selection => ({ walls: [], openings: [], furniture: [], rooms: [] })

export const withoutLocked = (s: Selection, locked: { walls: boolean; furniture: boolean }): Selection => ({
  ...s,
  walls: locked.walls ? [] : s.walls,
  openings: locked.walls ? [] : s.openings,
  furniture: locked.furniture ? [] : s.furniture,
})

export const selSize = (s: Selection | null) => (s ? SEL_KINDS.reduce((n, k) => n + s[k].length, 0) : 0)

export const selHas = (s: Selection | null, kind: SelKind, id: string) => !!s && s[kind].includes(id)

export function pruneSel(plan: Plan, s: Selection): Selection {
  const ids = {
    walls: new Set(plan.walls.map((w) => w.id)),
    openings: new Set(plan.openings.map((o) => o.id)),
    furniture: new Set(plan.furniture.map((f) => f.id)),
    rooms: new Set((plan.rooms ?? []).map((r) => r.id)),
  }
  return {
    walls: s.walls.filter((id) => ids.walls.has(id)),
    openings: s.openings.filter((id) => ids.openings.has(id)),
    furniture: s.furniture.filter((id) => ids.furniture.has(id)),
    rooms: s.rooms.filter((id) => ids.rooms.has(id)),
  }
}

export function toggleSel(s: Selection, kind: SelKind, id: string): Selection {
  const list = s[kind]
  return { ...s, [kind]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] }
}

export function selectAll(plan: Plan): Selection {
  return {
    walls: plan.walls.map((w) => w.id),
    openings: plan.openings.map((o) => o.id),
    furniture: plan.furniture.map((f) => f.id),
    rooms: (plan.rooms ?? []).map((r) => r.id),
  }
}

function connectedWalls(plan: Plan, wallId: string, tol = 20): Set<string> {
  const seen = new Set([wallId])
  const queue = [wallId]
  const near = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y) <= tol
  while (queue.length) {
    const w = plan.walls.find((x) => x.id === queue.pop())
    if (!w) continue
    for (const o of plan.walls) {
      if (seen.has(o.id)) continue
      if ([o.a, o.b].some((p) => near(p, w.a) || near(p, w.b)) || [w.a, w.b].some((p) => near(p, o.a) || near(p, o.b))) {
        seen.add(o.id)
        queue.push(o.id)
      }
    }
  }
  return seen
}

export function buildingSel(plan: Plan, wallId: string): Selection {
  const b = detectRooms(plan).buildings.find((x) => x.walls.some((w) => w.id === wallId))
  const walls = b ? new Set(b.walls.map((w) => w.id)) : connectedWalls(plan, wallId)
  const outline = b?.outline ?? []
  const inside = (p: Point) => outline.length >= 3 && pointInPolygon(p, outline)
  return {
    walls: [...walls],
    openings: plan.openings.filter((o) => walls.has(o.wallId)).map((o) => o.id),
    furniture: plan.furniture.filter(inside).map((f) => f.id),
    rooms: (plan.rooms ?? []).filter(inside).map((r) => r.id),
  }
}

export type ScreenRect = { x0: number; y0: number; x1: number; y1: number }

export function rectSel(plan: Plan, cam: Camera, r: ScreenRect): Selection {
  const minX = Math.min(r.x0, r.x1)
  const maxX = Math.max(r.x0, r.x1)
  const minY = Math.min(r.y0, r.y1)
  const maxY = Math.max(r.y0, r.y1)
  const hit = (p: Point) => {
    const s = toScreen(cam, p)
    return s.x >= minX && s.x <= maxX && s.y >= minY && s.y <= maxY
  }
  const walls = plan.walls.filter((w) => hit(w.a) && hit(w.b)).map((w) => w.id)
  const ws = new Set(walls)
  return {
    walls,
    openings: plan.openings.filter((o) => ws.has(o.wallId)).map((o) => o.id),
    furniture: plan.furniture.filter(hit).map((f) => f.id),
    rooms: (plan.rooms ?? []).filter(hit).map((r) => r.id),
  }
}

export function mergeSel(a: Selection, b: Selection): Selection {
  const out = emptySel()
  for (const k of SEL_KINDS) out[k] = [...new Set([...a[k], ...b[k]])]
  return out
}

export function selPoints(plan: Plan, s: Selection): Point[] {
  const w = new Set(s.walls)
  const f = new Set(s.furniture)
  const r = new Set(s.rooms)
  return [
    ...plan.walls.filter((x) => w.has(x.id)).flatMap((x) => [x.a, x.b]),
    ...plan.furniture.filter((x) => f.has(x.id)),
    ...(plan.rooms ?? []).filter((x) => r.has(x.id)),
  ]
}

export function selBounds(plan: Plan, s: Selection) {
  const w = new Set(s.walls)
  const pts = selPoints(plan, s)
  if (pts.length === 0) return null
  const pad = Math.max(0, ...plan.walls.filter((x) => w.has(x.id)).map((x) => x.thickness / 2))
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  return { minX: Math.min(...xs) - pad, minY: Math.min(...ys) - pad, maxX: Math.max(...xs) + pad, maxY: Math.max(...ys) + pad }
}

export function selCenter(plan: Plan, s: Selection): Point | null {
  const b = selBounds(plan, s)
  return b ? { x: Math.round((b.minX + b.maxX) / 2), y: Math.round((b.minY + b.maxY) / 2) } : null
}

export function movePlan(plan: Plan, s: Selection, d: Point): Plan {
  const dx = Math.round(d.x)
  const dy = Math.round(d.y)
  if (!dx && !dy) return plan
  const w = new Set(s.walls)
  const f = new Set(s.furniture)
  const r = new Set(s.rooms)
  const sh = (p: Point) => ({ x: p.x + dx, y: p.y + dy })
  return {
    ...plan,
    walls: plan.walls.map((x) => (w.has(x.id) ? { ...x, a: sh(x.a), b: sh(x.b) } : x)),
    furniture: plan.furniture.map((x) => (f.has(x.id) ? { ...x, ...sh(x) } : x)),
    ...(plan.rooms ? { rooms: plan.rooms.map((x) => (r.has(x.id) ? { ...x, ...sh(x) } : x)) } : {}),
    ...(plan.networks ? { networks: netsTransform(plan, s, sh, 0) } : {}),
  }
}

export function rotatePlan(plan: Plan, s: Selection, deg: number, center: Point): Plan {
  if (!deg) return plan
  const rad = (deg * Math.PI) / 180
  const c = Math.cos(rad)
  const sn = Math.sin(rad)
  const rt = (p: Point) => {
    const x = p.x - center.x
    const y = p.y - center.y
    return { x: Math.round(center.x + x * c - y * sn), y: Math.round(center.y + x * sn + y * c) }
  }
  const w = new Set(s.walls)
  const f = new Set(s.furniture)
  const r = new Set(s.rooms)
  return {
    ...plan,
    walls: plan.walls.map((x) => (w.has(x.id) ? { ...x, a: rt(x.a), b: rt(x.b) } : x)),
    furniture: plan.furniture.map((x) => (f.has(x.id) ? { ...x, ...rt(x), rotationDeg: rotDeg(x.rotationDeg + deg) } : x)),
    ...(plan.rooms ? { rooms: plan.rooms.map((x) => (r.has(x.id) ? { ...x, ...rt(x) } : x)) } : {}),
    ...(plan.networks ? { networks: netsTransform(plan, s, rt, deg) } : {}),
  }
}

const rotDeg = (d: number) => (Number.isInteger(d) ? normalizeDeg(d) : Math.round(((((d % 360) + 360) % 360) * 10)) / 10)

export const wrapDeg = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180

export const formatDeg = (d: number) => `${d > 0 ? '+' : ''}${fmtNum(Math.round(d * 10) / 10, 1, 1)}°`

export function groupRotateDeg(plan: Plan, s: Selection, raw: number, shift: boolean): number {
  if (shift) return wrapDeg(Math.round(raw / 15) * 15)
  const fine = wrapDeg(Math.round(raw * 2) / 2)
  const axis = groupAxisDeg(plan, s)
  if (axis === null) return fine
  const targets = [0]
  const st = streetDeg(plan)
  if (st !== null) targets.push(st)
  let best: number | null = null
  for (const t of targets) {
    const m = ((((t - axis - raw) % 90) + 135) % 90) - 45
    if (Math.abs(m) <= 1 && (best === null || Math.abs(m) < Math.abs(best - raw))) best = raw + m
  }
  return best === null ? fine : wrapDeg(best)
}

export function groupAxisDeg(plan: Plan, s: Selection): number | null {
  const w = new Set(s.walls)
  let sx = 0
  let sy = 0
  for (const x of plan.walls) {
    if (!w.has(x.id)) continue
    const len = Math.hypot(x.b.x - x.a.x, x.b.y - x.a.y)
    const a = 4 * Math.atan2(x.b.y - x.a.y, x.b.x - x.a.x)
    sx += len * Math.cos(a)
    sy += len * Math.sin(a)
  }
  if (!sx && !sy) return null
  return ((Math.atan2(sy, sx) / 4) * 180) / Math.PI
}

export function streetDeg(plan: Plan): number | null {
  const side = plan.site.street?.side
  if (!side) return null
  const poly = sitePolygon(plan.site)
  const p = poly[side[0]]
  const q = poly[side[1]]
  if (!p || !q) return null
  return (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI
}

export function deletePlan(plan: Plan, s: Selection): Plan {
  const w = new Set(s.walls)
  const o = new Set(s.openings)
  const f = new Set(s.furniture)
  const r = new Set(s.rooms)
  return {
    ...plan,
    walls: plan.walls.filter((x) => !w.has(x.id)),
    openings: plan.openings.filter((x) => !o.has(x.id) && !w.has(x.wallId)),
    furniture: plan.furniture.filter((x) => !f.has(x.id)),
    ...(plan.rooms ? { rooms: plan.rooms.filter((x) => !r.has(x.id)) } : {}),
    ...(plan.networks ? { networks: netsDelete(plan, s) } : {}),
  }
}

const contourCache = new WeakMap<Plan, WeakMap<Selection, Point[][]>>()

function netContours(plan: Plan, s: Selection): Point[][] {
  let bySel = contourCache.get(plan)
  if (!bySel) contourCache.set(plan, (bySel = new WeakMap()))
  let polys = bySel.get(s)
  if (!polys) {
    polys = fullBuildings(detectRooms(plan).buildings, s).map((b) => b.footprint)
    bySel.set(s, polys)
  }
  return polys
}

const NET_TOL = 60

function netTest(plan: Plan, s: Selection) {
  const walls = new Set(s.walls)
  const polys = netContours(plan, s)
  const inside = (p: Point) =>
    polys.some(
      (poly) =>
        pointInPolygon(p, poly) ||
        poly.some((a, i) => {
          const q = segPoint(p, a, poly[(i + 1) % poly.length])
          return Math.hypot(p.x - q.x, p.y - q.y) <= NET_TOL
        }),
    )
  return (p: Point & { wallId?: string }) => (p.wallId ? walls.has(p.wallId) : false) || inside(p)
}

type Hit = (p: Point & { wallId?: string }) => boolean

function walkTransform(v: unknown, hit: Hit, f: (p: Point) => Point, deg: number): unknown {
  if (Array.isArray(v)) return v.map((x) => walkTransform(x, hit, f, deg))
  if (!v || typeof v !== 'object') return v
  const o = v as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [k, x] of Object.entries(o)) out[k] = walkTransform(x, hit, f, deg)
  if (typeof o.x === 'number' && typeof o.y === 'number' && hit(o as Point & { wallId?: string })) {
    Object.assign(out, f(o as Point))
    if (deg && typeof o.rotationDeg === 'number') out.rotationDeg = rotDeg(o.rotationDeg + deg)
  }
  return out
}

function walkDelete(v: unknown, hit: Hit): unknown {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v
  const o = v as Record<string, unknown>
  const gone = new Set<string>()
  const out: Record<string, unknown> = { ...o }
  for (const [k, x] of Object.entries(o)) {
    if (!Array.isArray(x)) continue
    out[k] = x.filter((it) => {
      const r = it as Record<string, unknown>
      const del = !!r && typeof r.x === 'number' && typeof r.y === 'number' && hit(r as Point & { wallId?: string })
      if (del && typeof r.id === 'string') gone.add(r.id)
      return !del
    })
  }
  for (const [k, x] of Object.entries(out)) {
    if (!Array.isArray(x)) continue
    out[k] = x.filter((it) => {
      const r = it as Record<string, unknown>
      return !(r && (gone.has(r.from as string) || gone.has(r.to as string)))
    })
  }
  return out
}

const KNOWN_NETS = new Set(['electric', 'sewer', 'heating'])

type Heating = NonNullable<NonNullable<Plan['networks']>['heating']>
type Loop = Heating['loops'][number]

const loopCenter = (l: Loop): Point => {
  const n = l.polygon.length || 1
  return { x: l.polygon.reduce((a, p) => a + p.x, 0) / n, y: l.polygon.reduce((a, p) => a + p.y, 0) / n }
}

function heatingTransform(h: Heating, hit: Hit, f: (p: Point) => Point): Heating {
  const path = <T extends Point>(ps: T[] | undefined) => ps && ps.map((p) => ({ ...p, ...f(p) }))
  return {
    ...h,
    ...(h.collector && hit(h.collector) ? { collector: { ...h.collector, ...f(h.collector) } } : {}),
    loops: h.loops.map((l) =>
      hit(loopCenter(l))
        ? {
            ...l,
            polygon: path(l.polygon) ?? l.polygon,
            ...(l.supplyPath ? { supplyPath: path(l.supplyPath) } : {}),
            ...(l.linkPath ? { linkPath: path(l.linkPath) } : {}),
            ...(l.excluded ? { excluded: l.excluded.map((e) => path(e) ?? e) } : {}),
            ...(l.parts
              ? {
                  parts: l.parts.map((pt) => ({
                    ...pt,
                    polygon: path(pt.polygon) ?? pt.polygon,
                    ...(pt.excluded ? { excluded: pt.excluded.map((e) => path(e) ?? e) } : {}),
                  })),
                }
              : {}),
          }
        : l,
    ),
  }
}

function heatingDelete(h: Heating, hit: Hit): Heating {
  return {
    ...h,
    collector: h.collector && !hit(h.collector) ? h.collector : undefined,
    loops: h.loops.filter((l) => !hit(loopCenter(l))),
  }
}

function otherNets(net: NonNullable<Plan['networks']>, fn: (v: unknown) => unknown) {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(net)) if (!KNOWN_NETS.has(k) && v && typeof v === 'object') out[k] = fn(v)
  return out
}

function netsTransform(plan: Plan, s: Selection, f: (p: Point) => Point, deg: number): Plan['networks'] {
  const net = plan.networks
  if (!net) return net
  const hit = netTest(plan, s)
  const el = net.electric
  const sw = net.sewer
  return {
    ...net,
    ...otherNets(net, (v) => walkTransform(v, hit, f, deg)),
    ...(net.heating ? { heating: heatingTransform(net.heating, hit, f) } : {}),
    ...(el
      ? {
          electric: {
            ...el,
            ...(el.panel && hit(el.panel) ? { panel: { ...el.panel, ...f(el.panel) } } : {}),
            points: el.points.map((p) => (hit(p) ? { ...p, ...f(p) } : p)),
            ...(el.routes
              ? {
                  routes: el.routes.map((r) => {
                    const a = hit(r.path[0])
                    const b = hit(r.path[r.path.length - 1])
                    if (!a && !b) return r
                    return { ...r, path: r.path.map((p) => (a && b) || hit(p) ? f(p) : p) }
                  }),
                }
              : {}),
          },
        }
      : {}),
    ...(sw
      ? {
          sewer: {
            ...sw,
            nodes: sw.nodes.map((n) =>
              hit(n)
                ? { ...n, ...f(n), ...(deg && n.rotationDeg !== undefined ? { rotationDeg: rotDeg(n.rotationDeg + deg) } : {}) }
                : n,
            ),
          },
        }
      : {}),
  }
}

function netsDelete(plan: Plan, s: Selection): Plan['networks'] {
  const net = plan.networks
  if (!net) return net
  const hit = netTest(plan, s)
  const el = net.electric
  const sw = net.sewer
  const gone = new Set(sw ? sw.nodes.filter(hit).map((n) => n.id) : [])
  const panel = el?.panel && !hit(el.panel) ? el.panel : undefined
  return {
    ...net,
    ...otherNets(net, (v) => walkDelete(v, hit)),
    ...(net.heating ? { heating: heatingDelete(net.heating, hit) } : {}),
    ...(el
      ? {
          electric: {
            ...el,
            panel,
            points: el.points.filter((p) => !hit(p)),
            ...(el.routes ? { routes: el.routes.filter((r) => !hit(r.path[0]) && !hit(r.path[r.path.length - 1])) } : {}),
          },
        }
      : {}),
    ...(sw
      ? { sewer: { ...sw, nodes: sw.nodes.filter((n) => !gone.has(n.id)), pipes: sw.pipes.filter((p) => !gone.has(p.from) && !gone.has(p.to)) } }
      : {}),
  }
}

export function streetAlignDeg(plan: Plan, s: Selection): number | null {
  const side = plan.site.street?.side
  if (!side) return null
  const poly = sitePolygon(plan.site)
  const p = poly[side[0]]
  const q = poly[side[1]]
  if (!p || !q) return null
  const street = Math.atan2(q.y - p.y, q.x - p.x)
  const w = new Set(s.walls)
  let sx = 0
  let sy = 0
  for (const x of plan.walls) {
    if (!w.has(x.id)) continue
    const len = Math.hypot(x.b.x - x.a.x, x.b.y - x.a.y)
    const a = 4 * Math.atan2(x.b.y - x.a.y, x.b.x - x.a.x)
    sx += len * Math.cos(a)
    sy += len * Math.sin(a)
  }
  if (!sx && !sy) return null
  const axis = Math.atan2(sy, sx) / 4
  let d = ((street - axis) * 180) / Math.PI
  d = ((d % 90) + 90) % 90
  if (d > 45) d -= 90
  const deg = Math.round(d * 10) / 10
  return Math.abs(deg) < 0.05 ? 0 : deg
}

export function selSummary(s: Selection) {
  return t('common:canvas.selSummary', {
    walls: t('common:canvas.walls', { count: s.walls.length }),
    openings: t('common:canvas.openings', { count: s.openings.length }),
    items: t('common:canvas.items', { count: s.furniture.length }),
  })
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

type Building = { walls: { id: string }[]; footprint: Point[] }

function dropCollinear(poly: Point[]): Point[] {
  const n = poly.length
  const out = poly.filter((p, i) => {
    const a = poly[(i - 1 + n) % n]
    const b = poly[(i + 1) % n]
    const ux = p.x - a.x
    const uy = p.y - a.y
    const vx = b.x - p.x
    const vy = b.y - p.y
    const lu = Math.hypot(ux, uy)
    const lv = Math.hypot(vx, vy)
    if (lu < 1 || lv < 1) return false
    return Math.abs(ux * vy - uy * vx) / (lu * lv) > 0.05
  })
  return out.length >= 3 ? out : poly
}

export function fullBuildings<B extends Building>(buildings: B[], s: Selection): B[] {
  const w = new Set(s.walls)
  return buildings.filter((b) => b.walls.length > 0 && b.walls.every((x) => w.has(x.id)))
}

export function groupPolys(plan: Plan, buildings: Building[], s: Selection): Point[][] {
  const full = fullBuildings(buildings, s)
  if (full.length) return full.map((b) => dropCollinear(b.footprint))
  const b = selBounds(plan, s)
  return b
    ? [[{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY }]]
    : []
}

export function polysCenter(polys: Point[][]): Point | null {
  const pts = polys.flat()
  if (!pts.length) return null
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  return { x: Math.round((Math.min(...xs) + Math.max(...xs)) / 2), y: Math.round((Math.min(...ys) + Math.max(...ys)) / 2) }
}

export function segPoint(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0
  return { x: a.x + dx * t, y: a.y + dy * t }
}

export type Guide = { a: Point; b: Point; d: number; kind: 'site' | 'building' }

function nearestToEdges(pts: Point[], poly: Point[]) {
  let best: { a: Point; b: Point; d: number } | null = null
  for (const p of pts) {
    for (let i = 0; i < poly.length; i++) {
      const q = segPoint(p, poly[i], poly[(i + 1) % poly.length])
      const d = Math.hypot(p.x - q.x, p.y - q.y)
      if (!best || d < best.d) best = { a: p, b: q, d }
    }
  }
  return best
}

export function groupGuides(plan: Plan, buildings: Building[], s: Selection): Guide[] {
  const polys = groupPolys(plan, buildings, s)
  const pts = polys.flat()
  if (!pts.length) return []
  const site = sitePolygon(plan.site)
  const edges: Guide[] = []
  for (let i = 0; i < site.length; i++) {
    const hit = nearestToEdges(pts, [site[i], site[(i + 1) % site.length]])
    if (hit) edges.push({ ...hit, kind: 'site' })
  }
  const out = edges.sort((x, y) => x.d - y.d).slice(0, 2)
  const w = new Set(s.walls)
  let near: Guide | null = null
  for (const b of buildings) {
    if (b.walls.some((x) => w.has(x.id))) continue
    for (const poly of polys) {
      const h1 = nearestToEdges(poly, b.footprint)
      const h2 = nearestToEdges(b.footprint, poly)
      const h = h1 && (!h2 || h1.d <= h2.d) ? h1 : h2 && { a: h2.b, b: h2.a, d: h2.d }
      if (h && (!near || h.d < near.d)) near = { ...h, kind: 'building' }
    }
  }
  return near ? [...out, near] : out
}

export const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M5 15a8 8 0 0 1 11-9.5" stroke="#fff" stroke-width="4.5"/><path d="M14 2.5l3.5 3.2-4.3 1.9" stroke="#fff" stroke-width="4.5"/><path d="M5 15a8 8 0 0 1 11-9.5" stroke="#2b2d33" stroke-width="1.8"/><path d="M14 2.5l3.5 3.2-4.3 1.9" stroke="#2b2d33" stroke-width="1.8"/></g></svg>',
)}") 12 12, alias`
