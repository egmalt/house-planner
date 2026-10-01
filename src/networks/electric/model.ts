import {
  nextId,
  type ElectricCircuit,
  type ElectricNetwork,
  type ElectricPanel,
  type ElectricPoint,
  type ElectricPointKind,
  type ElectricRoute,
  type Plan,
  type Point,
  type Wall,
} from '../../model'
import { fmtNum, t } from '../../i18n'

export const EMPTY_ELECTRIC: ElectricNetwork = { points: [], circuits: [] }

export const DEFAULT_CEILING = 2700
export const ROUTE_BELOW_CEILING = 150
export const PANEL_HEIGHT = 1700
export const PANEL_TAIL = 1500
export const CABLE_RESERVE = 0.15

export const POINT_KINDS: ElectricPointKind[] = ['socket', 'socket2', 'socket_ip44', 'power', 'switch', 'switch2', 'light', 'light_wall', 'junction', 'outdoor']

export const kindLabel = (k: ElectricPointKind) => t(`networks:electric.pointKind.${k}`)

export const defaultHeight: Record<ElectricPointKind, number> = {
  socket: 300,
  socket2: 300,
  socket_ip44: 1100,
  power: 600,
  switch: 900,
  switch2: 900,
  light: DEFAULT_CEILING,
  light_wall: 2000,
  junction: DEFAULT_CEILING - ROUTE_BELOW_CEILING,
  outdoor: 1000,
}

export const defaultPower: Record<ElectricPointKind, number> = {
  socket: 300,
  socket2: 500,
  socket_ip44: 500,
  power: 3500,
  switch: 0,
  switch2: 0,
  light: 50,
  light_wall: 30,
  junction: 0,
  outdoor: 1000,
}

export const CIRCUIT_KINDS: ElectricCircuit['kind'][] = ['light', 'socket', 'power', 'wet', 'outdoor', 'garage']

export const circuitKindLabel = (k: ElectricCircuit['kind']) => t(`networks:electric.circuitKind.${k}`)

export const circuitPresets: Record<ElectricCircuit['kind'], Pick<ElectricCircuit, 'breaker' | 'cable'>> = {
  light: { breaker: { type: 'MCB', rating: 10, curve: 'C' }, cable: '3x1.5' },
  socket: { breaker: { type: 'RCBO', rating: 16, curve: 'C' }, cable: '3x2.5' },
  power: { breaker: { type: 'MCB', rating: 32, curve: 'C' }, cable: '3x6' },
  wet: { breaker: { type: 'RCBO', rating: 16, curve: 'C' }, cable: '3x2.5' },
  outdoor: { breaker: { type: 'RCBO', rating: 16, curve: 'C' }, cable: '3x2.5' },
  garage: { breaker: { type: 'RCBO', rating: 16, curve: 'C' }, cable: '3x2.5' },
}

export const CABLES = ['3x1.5', '3x2.5', '3x4', '3x6', '5x2.5', '5x4', '5x6']
export const RATINGS = [6, 10, 13, 16, 20, 25, 32, 40, 50, 63]

export const CIRCUIT_COLORS = ['#e0452b', '#2a7de1', '#2f9e5b', '#9b4dca', '#d98a1d', '#0f9aa8', '#c2408f', '#6b7a1f', '#7a5230', '#4a55c9']
export const NO_CIRCUIT_COLOR = '#8a8f98'

export const isSocket = (k: ElectricPointKind) => k === 'socket' || k === 'socket2' || k === 'socket_ip44' || k === 'power' || k === 'outdoor'
export const isSwitch = (k: ElectricPointKind) => k === 'switch' || k === 'switch2'
export const isWallMounted = (k: ElectricPointKind) => k !== 'light'

export const electricOf = (plan: Plan): ElectricNetwork => plan.networks?.electric ?? EMPTY_ELECTRIC

export const withElectric = (plan: Plan, fn: (e: ElectricNetwork) => ElectricNetwork): Plan => ({
  ...plan,
  networks: { ...plan.networks, electric: fn(electricOf(plan)) },
})

export function circuitColor(e: ElectricNetwork, circuitId?: string) {
  const i = circuitId ? e.circuits.findIndex((c) => c.id === circuitId) : -1
  return i < 0 ? NO_CIRCUIT_COLOR : CIRCUIT_COLORS[i % CIRCUIT_COLORS.length]
}

export function parseCable(cable: string) {
  const m = /^(\d+)\s*[xх×*]\s*(\d+(?:[.,]\d+)?)$/i.exec(cable.trim())
  if (!m) return null
  return { cores: Number(m[1]), section: Number(m[2].replace(',', '.')) }
}

export const cableLabel = (cable: string) => {
  const c = parseCable(cable)
  return c ? `${c.cores}×${fmtNum(c.section)}` : cable
}

export function ceilingOf(plan: Plan, wallId?: string) {
  const w = wallId ? plan.walls.find((x) => x.id === wallId) : undefined
  if (w) return w.height
  const hs = plan.walls.map((x) => x.height)
  return hs.length ? Math.max(...hs) : DEFAULT_CEILING
}

export function projectOnWall(p: Point, w: Wall) {
  const dx = w.b.x - w.a.x
  const dy = w.b.y - w.a.y
  const l2 = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / l2))
  const q = { x: w.a.x + dx * t, y: w.a.y + dy * t }
  return { point: q, t, dist: Math.hypot(p.x - q.x, p.y - q.y) }
}

export function snapToWallFace(plan: Plan, p: Point, reach: number): { point: Point; wallId: string; normal: Point } | null {
  let best: { point: Point; wallId: string; normal: Point; d: number } | null = null
  for (const w of plan.walls) {
    const pr = projectOnWall(p, w)
    if (pr.dist > w.thickness / 2 + reach) continue
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1
    const n = { x: -(w.b.y - w.a.y) / len, y: (w.b.x - w.a.x) / len }
    const side = (p.x - pr.point.x) * n.x + (p.y - pr.point.y) * n.y >= 0 ? 1 : -1
    const face = { x: pr.point.x + n.x * side * (w.thickness / 2), y: pr.point.y + n.y * side * (w.thickness / 2) }
    const d = pr.dist - w.thickness / 2
    if (!best || d < best.d) best = { point: { x: Math.round(face.x), y: Math.round(face.y) }, wallId: w.id, normal: { x: n.x * side, y: n.y * side }, d }
  }
  return best && { point: best.point, wallId: best.wallId, normal: best.normal }
}

export function pointNormal(plan: Plan, p: { x: number; y: number; wallId?: string }): Point | null {
  const w = p.wallId ? plan.walls.find((x) => x.id === p.wallId) : undefined
  if (!w) return null
  const pr = projectOnWall(p, w)
  const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1
  const n = { x: -(w.b.y - w.a.y) / len, y: (w.b.x - w.a.x) / len }
  const side = (p.x - pr.point.x) * n.x + (p.y - pr.point.y) * n.y >= 0 ? 1 : -1
  return { x: n.x * side, y: n.y * side }
}

export function addPoint(plan: Plan, pt: Omit<ElectricPoint, 'id'>): { plan: Plan; id: string } {
  const id = nextId('ep', electricOf(plan).points)
  return { plan: withElectric(plan, (e) => ({ ...e, points: [...e.points, { ...pt, id } as ElectricPoint] })), id }
}

export const updatePoints = (plan: Plan, ids: string[], patch: Partial<ElectricPoint>): Plan =>
  withElectric(plan, (e) => ({ ...e, points: e.points.map((p) => (ids.includes(p.id) ? ({ ...p, ...patch } as ElectricPoint) : p)) }))

export const deletePoints = (plan: Plan, ids: string[]): Plan =>
  withElectric(plan, (e) => ({ ...e, points: e.points.filter((p) => !ids.includes(p.id)) }))

export const setPanel = (plan: Plan, panel: ElectricPanel | undefined): Plan =>
  withElectric(plan, (e) => {
    const next = { ...e }
    if (panel) next.panel = panel
    else delete next.panel
    return next
  })

export function addCircuit(plan: Plan, kind: ElectricCircuit['kind']): { plan: Plan; id: string } {
  const e = electricOf(plan)
  const id = nextId('c', e.circuits)
  const n = e.circuits.filter((c) => c.kind === kind).length + 1
  const circuit: ElectricCircuit = { id, name: t('networks:electric.circuitName', { kind: circuitKindLabel(kind), n }), kind, ...structuredClone(circuitPresets[kind]) }
  return { plan: withElectric(plan, (x) => ({ ...x, circuits: [...x.circuits, circuit] })), id }
}

export const updateCircuit = (plan: Plan, id: string, patch: Partial<ElectricCircuit>): Plan =>
  withElectric(plan, (e) => ({ ...e, circuits: e.circuits.map((c) => (c.id === id ? ({ ...c, ...patch } as ElectricCircuit) : c)) }))

export const deleteCircuit = (plan: Plan, id: string): Plan =>
  withElectric(plan, (e) => ({
    ...e,
    circuits: e.circuits.filter((c) => c.id !== id),
    points: e.points.map((p) => {
      if (p.circuitId !== id) return p
      const rest = { ...p }
      delete rest.circuitId
      return rest
    }),
    ...(e.routes ? { routes: e.routes.filter((r) => r.circuitId !== id) } : {}),
  }))

export const setRoutes = (plan: Plan, circuitIds: string[], routes: ElectricRoute[]): Plan =>
  withElectric(plan, (e) => ({ ...e, routes: [...(e.routes ?? []).filter((r) => !circuitIds.includes(r.circuitId)), ...routes] }))

export const pathLength = (path: Point[]) => path.reduce((s, p, i) => (i ? s + Math.hypot(p.x - path[i - 1].x, p.y - path[i - 1].y) : 0), 0)
