import { nextId, type Plan, type Point, type WaterDiameter, type WaterLine, type WaterNetwork, type WaterNode, type WaterPipe } from '../model'
import { t } from '../i18n'
import { fmtM, labelMap } from './labels'

export type NewWaterNode = Pick<WaterNode, 'x' | 'y' | 'kind'> &
  Partial<Pick<WaterNode, 'fixture' | 'furnitureId' | 'label' | 'model' | 'source' | 'line' | 'outputs' | 'rotationDeg'>>
export type NewWaterPipe = Pick<WaterPipe, 'from' | 'to' | 'line' | 'diameter' | 'location'> & Partial<Pick<WaterPipe, 'material' | 'depth' | 'heated'>>

export const EMPTY_WATER: WaterNetwork = { nodes: [], pipes: [] }

export const FROST_DEPTH = 1500
export const WATER_TO_SEWER_MIN = 1500
export const SOURCE_TO_SEPTIC_MIN = 50000
export const SOURCE_TO_SEPTIC_PASSPORT_MIN = 15000

export const LINE_COLORS: Record<WaterLine, string> = { cold: '#2f6fd6', hot: '#d64545', recirc: '#d64545' }
export const LINE_DARK: Record<WaterLine, string> = { cold: '#173f85', hot: '#8a2020', recirc: '#8a2020' }
const LINES: WaterLine[] = ['cold', 'hot', 'recirc']
export const LINE_SHORT: Record<WaterLine, string> = labelMap(LINES, 'networks:water.lineShort')
export const LINE_LABELS: Record<WaterLine, string> = labelMap(LINES, 'networks:water.line')

export const waterKindLabels: Record<WaterNode['kind'], string> = labelMap<WaterNode['kind']>(
  ['source', 'entry', 'pump', 'filter', 'boiler', 'collector', 'fixture', 'junction', 'tap_outdoor'],
  'networks:water.kind',
)

export const DIAMETERS: WaterDiameter[] = [16, 20, 25, 32]

export const waterOf = (plan: Plan): WaterNetwork => plan.networks?.water ?? EMPTY_WATER

export const withWater = (plan: Plan, fn: (w: WaterNetwork) => WaterNetwork): Plan => ({
  ...plan,
  networks: { ...plan.networks, water: fn(waterOf(plan)) },
})

export const wNode = (w: WaterNetwork, id: string) => w.nodes.find((n) => n.id === id)

export const waterPipeLength = (w: WaterNetwork, p: WaterPipe) => {
  const a = wNode(w, p.from)
  const b = wNode(w, p.to)
  return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0
}

export const pipeMaterial = (p: WaterPipe) => p.material ?? (p.location === 'outside' ? 'PE' : 'PEX')

export const waterCaption = (p: WaterPipe) =>
  `${LINE_SHORT[p.line]} Ø${p.diameter} ${pipeMaterial(p)}${p.location === 'outside' ? ` · ${t('networks:shared.ui.outsideLower')}${p.depth !== undefined ? ` · ${t('networks:water.caption.depth', { depth: fmtM(p.depth) })}` : ''}` : ''}`

export function addWaterNode(plan: Plan, node: NewWaterNode): { plan: Plan; id: string } {
  const id = nextId('wn', waterOf(plan).nodes)
  return { plan: withWater(plan, (w) => ({ ...w, nodes: [...w.nodes, { ...node, id } as WaterNode] })), id }
}

export function addWaterPipe(plan: Plan, pipe: NewWaterPipe): { plan: Plan; id: string } {
  const id = nextId('wp', waterOf(plan).pipes)
  return { plan: withWater(plan, (w) => ({ ...w, pipes: [...w.pipes, { ...pipe, id } as WaterPipe] })), id }
}

export const updateWaterNode = (plan: Plan, id: string, patch: Partial<WaterNode>): Plan =>
  withWater(plan, (w) => ({ ...w, nodes: w.nodes.map((n) => (n.id === id ? ({ ...n, ...patch } as WaterNode) : n)) }))

export const updateWaterPipe = (plan: Plan, id: string, patch: Partial<WaterPipe>): Plan =>
  withWater(plan, (w) => ({ ...w, pipes: w.pipes.map((p) => (p.id === id ? ({ ...p, ...patch } as WaterPipe) : p)) }))

export const deleteWaterPipe = (plan: Plan, id: string): Plan => withWater(plan, (w) => ({ ...w, pipes: w.pipes.filter((p) => p.id !== id) }))

export function deleteWaterNode(plan: Plan, id: string): Plan {
  const w = waterOf(plan)
  const inc = w.pipes.filter((p) => p.to === id)
  const out = w.pipes.filter((p) => p.from === id)
  const node = wNode(w, id)
  if (node?.kind === 'junction' && inc.length === 1 && out.length === 1 && inc[0].from !== out[0].to) {
    return withWater(plan, (x) => ({
      ...x,
      nodes: x.nodes.filter((n) => n.id !== id),
      pipes: x.pipes.filter((p) => p.id !== inc[0].id).map((p) => (p.id === out[0].id ? { ...p, from: inc[0].from } : p)),
    }))
  }
  return withWater(plan, (x) => ({ ...x, nodes: x.nodes.filter((n) => n.id !== id), pipes: x.pipes.filter((p) => p.from !== id && p.to !== id) }))
}

export function splitWaterPipe(plan: Plan, pipeId: string, at: Point): { plan: Plan; id: string } | null {
  const pipe = waterOf(plan).pipes.find((p) => p.id === pipeId)
  if (!pipe) return null
  const added = addWaterNode(plan, { x: at.x, y: at.y, kind: 'junction' })
  const secondId = nextId('wp', waterOf(added.plan).pipes)
  return {
    plan: withWater(added.plan, (x) => ({
      ...x,
      pipes: [...x.pipes.map((p) => (p.id === pipeId ? { ...p, to: added.id } : p)), { ...pipe, id: secondId, from: added.id }],
    })),
    id: added.id,
  }
}

export const moveWaterNode = (plan: Plan, id: string, to: Point): Plan => updateWaterNode(plan, id, { x: Math.round(to.x), y: Math.round(to.y) })

export const collectorLine = (n: WaterNode): WaterLine => n.line ?? 'cold'
