import { nextId, type HeatingCollector, type HeatingLoop, type HeatingNetwork, type HeatingParams, type HeatingStep, type Plan, type Point } from '../../model'
import { t } from '../../i18n'

export const EMPTY_HEATING: HeatingNetwork = { loops: [] }

export const DEFAULT_PIPE = '16x2 PEX-a'
export const PIPES = ['16x2 PEX-a', '16x2 PE-RT']
export const STEPS: HeatingStep[] = [100, 150, 200]
export const LOOP_MAX_M = 80
export const LOOP_HARD_MAX_M = 100
export const WALL_GAP = 100
export const PIPE_RESERVE = 0.05

export const DEFAULT_PARAMS: ResolvedParams = {
  supplyT: 45,
  returnT: 35,
  screedMm: 60,
  insulation: 'XPS 100',
  screedMix: 'cement-sand',
  fixing: 'staples',
}

export const heatingOf = (plan: Plan): HeatingNetwork => plan.networks?.heating ?? EMPTY_HEATING

export type ResolvedParams = { supplyT: number; returnT: number; floorT?: number; screedMm: number; insulation: string; screedMix: 'cement-sand' | 'cps'; fixing: 'mesh' | 'staples' }

export const paramsOf = (h: HeatingNetwork): ResolvedParams => {
  const p: HeatingParams = h.params ?? {}
  const d = DEFAULT_PARAMS
  return {
    supplyT: p.supplyT ?? d.supplyT,
    returnT: p.returnT ?? d.returnT,
    floorT: p.floorT,
    screedMm: p.screedMm ?? d.screedMm,
    insulation: p.insulation || d.insulation,
    screedMix: p.screedMix ?? d.screedMix,
    fixing: p.fixing ?? d.fixing,
  }
}

export const withHeating = (plan: Plan, fn: (h: HeatingNetwork) => HeatingNetwork): Plan => ({
  ...plan,
  networks: { ...plan.networks, heating: fn(heatingOf(plan)) },
})

export const updateLoop = (plan: Plan, id: string, patch: Partial<HeatingLoop>): Plan =>
  withHeating(plan, (h) => ({
    ...h,
    loops: h.loops.map((l) => {
      if (l.id !== id) return l
      const next = { ...l, ...patch } as HeatingLoop
      for (const k of Object.keys(patch) as (keyof HeatingLoop)[]) if (patch[k] === undefined) delete next[k]
      return next
    }),
  }))

export const deleteLoop = (plan: Plan, id: string): Plan => withHeating(plan, (h) => ({ ...h, loops: h.loops.filter((l) => l.id !== id) }))

export const setCollector = (plan: Plan, collector: HeatingCollector | undefined): Plan =>
  withHeating(plan, (h) => {
    const next = { ...h }
    if (collector) next.collector = collector
    else delete next.collector
    return next
  })

export const setParams = (plan: Plan, patch: Partial<HeatingParams>): Plan =>
  withHeating(plan, (h) => {
    const params = { ...h.params, ...patch }
    for (const k of Object.keys(patch) as (keyof HeatingParams)[]) if (patch[k] === undefined) delete params[k]
    return { ...h, params }
  })

export const loopId = (loops: HeatingLoop[]) => nextId('hl', loops)

export const pathLength = (path: Point[] | undefined) =>
  (path ?? []).reduce((s, p, i, a) => (i ? s + Math.hypot(p.x - a[i - 1].x, p.y - a[i - 1].y) : 0), 0)

export function polygonArea(poly: Point[]) {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    s += p.x * q.y - q.x * p.y
  }
  return Math.abs(s) / 2
}

export function centroid(poly: Point[]): Point {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const f = p.x * q.y - q.x * p.y
    a += f
    cx += (p.x + q.x) * f
    cy += (p.y + q.y) * f
  }
  if (Math.abs(a) < 1e-6) return { x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length }
  return { x: cx / (3 * a), y: cy / (3 * a) }
}

export const stepLabel = (s: number) => `${s} ${t('common:units.mm')}`

export type LoopZone = { polygon: Point[]; excluded?: Point[][]; roomId?: string; roomName?: string }

export const zonesOf = (l: HeatingLoop): LoopZone[] => [
  { polygon: l.polygon, excluded: l.excluded, roomId: l.roomId, roomName: l.roomName },
  ...(l.parts ?? []).map((p) => ({ polygon: p.polygon, excluded: p.excluded, roomId: p.roomId, roomName: p.roomName })),
]

export const allPolygons = (l: HeatingLoop) => zonesOf(l).map((z) => z.polygon)
