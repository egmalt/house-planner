import { z } from 'zod'

export const CLIENT_VERSION = 6

const mm = z.number().finite()
const positiveMm = mm.positive()
const id = z.string().min(1)

export const pointSchema = z.looseObject({ x: mm, y: mm })

export const materialKindSchema = z.enum([
  'sip',
  'pir',
  'brick',
  'block',
  'timber',
  'frame',
  'concrete',
  'glass',
  'other',
])

export const pricePerSchema = z.enum(['pcs', 'm2', 'm3', 'm'])

export const materialSchema = z.looseObject({
  id,
  name: z.string().min(1),
  kind: materialKindSchema,
  url: z.string().optional(),
  thickness: positiveMm,
  length: positiveMm.optional(),
  height: positiveMm.optional(),
  panelWidth: positiveMm.optional(),
  panelHeight: positiveMm.optional(),
  unitLength: positiveMm.optional(),
  unitHeight: positiveMm.optional(),
  jointMm: mm.nonnegative().optional(),
  price: z.number().nonnegative().optional(),
  pricePer: pricePerSchema.optional(),
  source: z.string().optional(),
  checkedAt: z.string().optional(),
  color: z.string().optional(),
  finish: z.enum(['osb', 'plaster', 'timber', 'planken']).optional(),
  note: z.string().optional(),
})

export const wallSchema = z.looseObject({
  id,
  a: pointSchema,
  b: pointSchema,
  thickness: positiveMm,
  height: positiveMm,
  materialId: id.optional(),
  note: z.string().optional(),
})

export const openingSchema = z.looseObject({
  id,
  wallId: id,
  type: z.enum(['door', 'window', 'gate']),
  offset: mm.nonnegative(),
  width: positiveMm,
  height: positiveMm,
  sill: mm.nonnegative().default(0),
  hinge: z.enum(['start', 'end']).optional(),
  side: z.enum(['left', 'right']).optional(),
  note: z.string().optional(),
})

export const furnitureSchema = z.looseObject({
  id,
  type: z.string().min(1),
  x: mm,
  y: mm,
  rotationDeg: z.number().finite().default(0),
  w: positiveMm.optional(),
  d: positiveMm.optional(),
  h: positiveMm.optional(),
  color: z.string().optional(),
  note: z.string().optional(),
})

export const roomLabelSchema = z.looseObject({
  id,
  name: z.string().min(1),
  x: mm,
  y: mm,
  kind: z.enum(['living', 'bedroom', 'kitchen', 'bath', 'tech', 'hall', 'storage', 'garage']).optional(),
})

export const zoneSchema = z.looseObject({
  id,
  name: z.string().min(1),
  kind: z.enum(['fill', 'lawn', 'paving', 'other']),
  polygon: z.array(pointSchema).min(3),
  locked: z.boolean().optional(),
})

export const siteSchema = z.looseObject({
  convention: z.string().optional(),
  width: positiveMm,
  depth: positiveMm,
  geo: z
    .looseObject({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      rotationDeg: z.number().finite().default(0),
    })
    .optional(),
  boundary: z.array(pointSchema).min(3).optional(),
  zones: z.array(zoneSchema).optional(),
  street: z.looseObject({ side: z.tuple([z.number().int(), z.number().int()]), note: z.string().optional() }).optional(),
  imagery: z
    .looseObject({ offsetE: z.number().finite(), offsetN: z.number().finite(), rotationDeg: z.number().finite() })
    .optional(),
  note: z.string().optional(),
})

export const estimateCategorySchema = z.enum([
  'фундамент',
  'стены',
  'перекрытия',
  'кровля',
  'окна-двери',
  'утепление',
  'крепёж',
  'инженерия',
  'работы',
  'прочее',
])

export const estimateLineSchema = z.looseObject({
  id,
  name: z.string().min(1),
  category: estimateCategorySchema,
  materialId: id.optional(),
  qty: z.number().nonnegative(),
  unit: z.string().min(1),
  price: z.number().nonnegative().optional(),
  url: z.string().optional(),
  note: z.string().optional(),
})

export const purchaseSchema = z.looseObject({
  done: z.boolean(),
  date: z.string().optional(),
  actualPrice: z.number().nonnegative().optional(),
  qty: z.number().nonnegative().optional(),
  shop: z.string().optional(),
  note: z.string().optional(),
})

export const estimateSchema = z.looseObject({
  lines: z.array(estimateLineSchema).default([]),
  purchases: z.record(z.string(), purchaseSchema).default({}),
  wasteSipPct: z.number().min(0).max(100).optional(),
  notes: z.array(z.string()).optional(),
})

export const sewerNodeKindSchema = z.enum(['fixture', 'riser', 'cleanout', 'outlet', 'septic', 'junction'])
export const sewerFixtureSchema = z.enum(['toilet', 'sink', 'bath', 'shower', 'washer', 'kitchen', 'boiler'])
export const sewerDiameterSchema = z.union([z.literal(50), z.literal(110), z.literal(160)])

export const sewerNodeSchema = z.looseObject({
  id,
  x: mm,
  y: mm,
  kind: sewerNodeKindSchema,
  fixture: sewerFixtureSchema.optional(),
  label: z.string().optional(),
  furnitureId: z.string().optional(),
  height: positiveMm.optional(),
  w: positiveMm.optional(),
  d: positiveMm.optional(),
  rotationDeg: z.number().finite().optional(),
  model: z.string().optional(),
  depth: mm.nonnegative().optional(),
})

export const sewerPipeSchema = z.looseObject({
  id,
  from: id,
  to: id,
  diameter: sewerDiameterSchema,
  slope: z.number().positive().max(100).optional(),
  depth: mm.nonnegative().optional(),
  location: z.enum(['inside', 'outside']),
  material: z.string().optional(),
})

export const networkMaterialSchema = z.looseObject({
  id,
  name: z.string().min(1),
  kind: z.string().optional(),
  diameter: positiveMm.optional(),
  angle: z.number().finite().optional(),
  length: positiveMm.optional(),
  price: z.number().nonnegative().optional(),
  pricePer: pricePerSchema.optional(),
  url: z.string().optional(),
  source: z.string().optional(),
  checkedAt: z.string().optional(),
  note: z.string().optional(),
})

export const sewerSchema = z.looseObject({
  nodes: z.array(sewerNodeSchema).default([]),
  pipes: z.array(sewerPipeSchema).default([]),
  materials: z.array(networkMaterialSchema).optional(),
  floorLevel: mm.optional(),
})

export const electricPointKindSchema = z.enum([
  'socket',
  'socket2',
  'socket_ip44',
  'power',
  'switch',
  'switch2',
  'light',
  'light_wall',
  'junction',
  'outdoor',
])

export const electricPointSchema = z.looseObject({
  id,
  kind: electricPointKindSchema,
  x: mm,
  y: mm,
  height: mm.nonnegative(),
  wallId: id.optional(),
  circuitId: id.optional(),
  label: z.string().optional(),
  powerW: z.number().nonnegative().optional(),
})

export const electricCircuitSchema = z.looseObject({
  id,
  name: z.string(),
  kind: z.enum(['light', 'socket', 'power', 'wet', 'outdoor', 'garage']),
  breaker: z.looseObject({
    type: z.enum(['MCB', 'RCBO', 'RCD']),
    rating: z.number().positive(),
    curve: z.string().optional(),
  }),
  cable: z.string().min(1),
  phase: z.enum(['L1', 'L2', 'L3']).optional(),
})

export const electricPanelSchema = z.looseObject({
  id,
  x: mm,
  y: mm,
  wallId: id.optional(),
  modules: z.number().int().positive().optional(),
})

export const electricRouteSchema = z.looseObject({
  circuitId: id,
  path: z.array(pointSchema).min(2),
})

export const electricSchema = z.looseObject({
  panel: electricPanelSchema.optional(),
  points: z.array(electricPointSchema).default([]),
  circuits: z.array(electricCircuitSchema).default([]),
  routes: z.array(electricRouteSchema).optional(),
  materials: z.array(networkMaterialSchema).optional(),
})

export const waterNodeSchema = z.looseObject({
  id,
  x: mm,
  y: mm,
  kind: z.enum(['source', 'entry', 'pump', 'filter', 'boiler', 'collector', 'fixture', 'junction', 'tap_outdoor']),
  fixture: sewerFixtureSchema.optional(),
  furnitureId: z.string().optional(),
  label: z.string().optional(),
  model: z.string().optional(),
  source: z.enum(['well', 'borehole']).optional(),
  line: z.enum(['cold', 'hot']).optional(),
  outputs: z.number().int().positive().optional(),
  rotationDeg: z.number().finite().optional(),
})

export const waterPipeSchema = z.looseObject({
  id,
  from: id,
  to: id,
  line: z.enum(['cold', 'hot', 'recirc']),
  diameter: z.union([z.literal(16), z.literal(20), z.literal(25), z.literal(32)]),
  material: z.enum(['PEX', 'PPR', 'PE']).optional(),
  location: z.enum(['inside', 'outside']),
  depth: mm.nonnegative().optional(),
  heated: z.boolean().optional(),
})

export const waterSchema = z.looseObject({
  nodes: z.array(waterNodeSchema).default([]),
  pipes: z.array(waterPipeSchema).default([]),
  materials: z.array(networkMaterialSchema).optional(),
})

export const heatingStepSchema = z.union([z.literal(100), z.literal(150), z.literal(200)])

export const heatingLoopSchema = z.looseObject({
  id,
  roomId: z.string().optional(),
  roomName: z.string().optional(),
  polygon: z.array(pointSchema).min(3),
  stepMm: heatingStepSchema,
  pattern: z.enum(['spiral', 'snake']),
  pipe: z.string().min(1),
  supplyPath: z.array(pointSchema).optional(),
  excluded: z.array(z.array(pointSchema).min(3)).optional(),
  parts: z
    .array(
      z.looseObject({
        polygon: z.array(pointSchema).min(3),
        roomId: z.string().optional(),
        roomName: z.string().optional(),
        excluded: z.array(z.array(pointSchema).min(3)).optional(),
      }),
    )
    .optional(),
  linkPath: z.array(pointSchema).optional(),
  edge: z.boolean().optional(),
  off: z.boolean().optional(),
})

export const heatingCollectorSchema = z.looseObject({
  id,
  x: mm,
  y: mm,
  outputs: z.number().int().positive(),
  label: z.string().optional(),
})

export const heatingParamsSchema = z.looseObject({
  supplyT: z.number().finite().optional(),
  returnT: z.number().finite().optional(),
  floorT: z.number().finite().optional(),
  screedMm: positiveMm.optional(),
  insulation: z.string().optional(),
  screedMix: z.enum(['cement-sand', 'cps']).optional(),
  fixing: z.enum(['mesh', 'staples']).optional(),
})

export const heatingSchema = z.looseObject({
  collector: heatingCollectorSchema.optional(),
  loops: z.array(heatingLoopSchema).default([]),
  params: heatingParamsSchema.optional(),
  materials: z.array(networkMaterialSchema).optional(),
})

export const networksSchema = z.looseObject({
  sewer: sewerSchema.optional(),
  water: waterSchema.optional(),
  electric: electricSchema.optional(),
  heating: heatingSchema.optional(),
})

const ralSchema = z.string().regex(/^RAL \d{4}$/)

export const paletteSchema = z.looseObject({
  name: z.string().optional(),
  walls: ralSchema.optional(),
  accent: ralSchema.optional(),
  roof: ralSchema.optional(),
  windows: ralSchema.optional(),
  gates: ralSchema.optional(),
  plinth: ralSchema.optional(),
})

export const planSchema = z
  .looseObject({
    version: z.literal(1),
    name: z.string().min(1),
    rev: z.number().int().nonnegative().optional(),
    updatedAt: z.string().optional(),
    author: z.string().optional(),
    resetEpoch: z.number().int().nonnegative().optional(),
    site: siteSchema,
    materials: z.array(materialSchema).default([]),
    walls: z.array(wallSchema).default([]),
    openings: z.array(openingSchema).default([]),
    furniture: z.array(furnitureSchema).default([]),
    rooms: z.array(roomLabelSchema).optional(),
    estimate: estimateSchema.optional(),
    networks: networksSchema.optional(),
    palette: paletteSchema.optional(),
  })
  .superRefine((plan, ctx) => {
    const unique = (items: { id: string }[], path: string) => {
      const seen = new Set<string>()
      items.forEach((item, i) => {
        if (seen.has(item.id)) {
          ctx.addIssue({ code: 'custom', path: [path, i, 'id'], message: `Duplicate id "${item.id}"` })
        }
        seen.add(item.id)
      })
    }
    unique(plan.materials, 'materials')
    unique(plan.walls, 'walls')
    unique(plan.openings, 'openings')
    unique(plan.furniture, 'furniture')

    const water = plan.networks?.water
    if (water) {
      unique(water.nodes, 'networks.water.nodes')
      unique(water.pipes, 'networks.water.pipes')
      const ids = new Set(water.nodes.map((n) => n.id))
      water.pipes.forEach((p, i) => {
        for (const end of ['from', 'to'] as const) {
          if (!ids.has(p[end])) ctx.addIssue({ code: 'custom', path: ['networks', 'water', 'pipes', i, end], message: `Missing node "${p[end]}"` })
        }
      })
    }
    const sewer = plan.networks?.sewer
    if (sewer) {
      unique(sewer.nodes, 'networks.sewer.nodes')
      unique(sewer.pipes, 'networks.sewer.pipes')
      const nodeIds = new Set(sewer.nodes.map((n) => n.id))
      sewer.pipes.forEach((p, i) => {
        for (const end of ['from', 'to'] as const) {
          if (!nodeIds.has(p[end])) {
            ctx.addIssue({ code: 'custom', path: ['networks', 'sewer', 'pipes', i, end], message: `Missing node "${p[end]}"` })
          }
        }
        if (p.from === p.to) ctx.addIssue({ code: 'custom', path: ['networks', 'sewer', 'pipes', i], message: 'Pipe connects a node to itself' })
      })
    }

    const electric = plan.networks?.electric
    if (electric) {
      unique(electric.points, 'networks.electric.points')
      unique(electric.circuits, 'networks.electric.circuits')
    }

    const heating = plan.networks?.heating
    if (heating) unique(heating.loops, 'networks.heating.loops')

    const materialIds = new Set(plan.materials.map((m) => m.id))
    const walls = new Map(plan.walls.map((w) => [w.id, w]))

    plan.walls.forEach((w, i) => {
      if (w.materialId && !materialIds.has(w.materialId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['walls', i, 'materialId'],
          message: `Missing material "${w.materialId}"`,
        })
      }
      if (w.a.x === w.b.x && w.a.y === w.b.y) {
        ctx.addIssue({ code: 'custom', path: ['walls', i], message: 'Zero-length wall' })
      }
    })

    plan.openings.forEach((o, i) => {
      const wall = walls.get(o.wallId)
      if (!wall) {
        ctx.addIssue({ code: 'custom', path: ['openings', i, 'wallId'], message: `Missing wall "${o.wallId}"` })
      }
    })
  })

export type Point = z.infer<typeof pointSchema>
export type MaterialKind = z.infer<typeof materialKindSchema>
export type Material = z.infer<typeof materialSchema>
export type Wall = z.infer<typeof wallSchema>
export type Opening = z.infer<typeof openingSchema>
export type Site = z.infer<typeof siteSchema>
export type Plan = z.infer<typeof planSchema>
export type Palette = z.infer<typeof paletteSchema>
export type Furniture = z.infer<typeof furnitureSchema>
export type Zone = z.infer<typeof zoneSchema>
export type RoomLabelItem = z.infer<typeof roomLabelSchema>
export type PricePer = z.infer<typeof pricePerSchema>
export type EstimateCategory = z.infer<typeof estimateCategorySchema>
export type EstimateLine = z.infer<typeof estimateLineSchema>
export type Purchase = z.infer<typeof purchaseSchema>
export type Estimate = z.infer<typeof estimateSchema>
export type SewerNode = z.infer<typeof sewerNodeSchema>
export type SewerPipe = z.infer<typeof sewerPipeSchema>
export type SewerNetwork = z.infer<typeof sewerSchema>
export type SewerDiameter = z.infer<typeof sewerDiameterSchema>
export type SewerFixture = z.infer<typeof sewerFixtureSchema>
export type SewerNodeKind = z.infer<typeof sewerNodeKindSchema>
export type NetworkMaterial = z.infer<typeof networkMaterialSchema>
export type Networks = z.infer<typeof networksSchema>
export type WaterNode = z.infer<typeof waterNodeSchema>
export type WaterPipe = z.infer<typeof waterPipeSchema>
export type WaterNetwork = z.infer<typeof waterSchema>
export type WaterLine = WaterPipe['line']
export type WaterDiameter = WaterPipe['diameter']
export type ElectricPointKind = z.infer<typeof electricPointKindSchema>
export type ElectricPoint = z.infer<typeof electricPointSchema>
export type ElectricCircuit = z.infer<typeof electricCircuitSchema>
export type ElectricPanel = z.infer<typeof electricPanelSchema>
export type ElectricRoute = z.infer<typeof electricRouteSchema>
export type ElectricNetwork = z.infer<typeof electricSchema>
export type HeatingLoop = z.infer<typeof heatingLoopSchema>
export type HeatingCollector = z.infer<typeof heatingCollectorSchema>
export type HeatingParams = z.infer<typeof heatingParamsSchema>
export type HeatingNetwork = z.infer<typeof heatingSchema>
export type HeatingStep = z.infer<typeof heatingStepSchema>

export type ParseResult = { ok: true; plan: Plan } | { ok: false; error: string }

export function parsePlan(data: unknown): ParseResult {
  const result = planSchema.safeParse(data)
  if (result.success) return { ok: true, plan: result.data }
  return { ok: false, error: z.prettifyError(result.error) }
}
