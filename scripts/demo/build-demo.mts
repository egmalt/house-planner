import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import proj4 from 'proj4'
import { close, load } from './vite-load.mts'

type Pt = { x: number; y: number }
type Rect = { x0: number; y0: number; x1: number; y1: number }
type Side = 'N' | 'S' | 'E' | 'W'
type Any = Record<string, unknown>

const root = fileURLToPath(new URL('../..', import.meta.url))
const out = (p: string) => `${root}/${p}`

const ROAD = { lat: 59.300621, lng: 24.857898, bearingDeg: -27.92 }
const ROTATION = ROAD.bearingDeg + 180
const LOT = { w: 30000, d: 45000, roadOffsetM: 4 }

const rad = (d: number) => (d * Math.PI) / 180
const aeqd = (lat: number, lng: number) => proj4('WGS84', `+proj=aeqd +lat_0=${lat} +lon_0=${lng} +x_0=0 +y_0=0 +ellps=WGS84 +units=m +no_defs`)
const xAxis = { e: Math.cos(rad(ROTATION)), n: Math.sin(rad(ROTATION)) }
const yAxis = { e: Math.sin(rad(ROTATION)), n: -Math.cos(rad(ROTATION)) }

const streetMid = { e: -LOT.roadOffsetM * yAxis.e, n: -LOT.roadOffsetM * yAxis.n }
const v0 = {
  e: streetMid.e - (LOT.w / 2000) * xAxis.e - (LOT.d / 1000) * yAxis.e,
  n: streetMid.n - (LOT.w / 2000) * xAxis.n - (LOT.d / 1000) * yAxis.n,
}
const [originLng, originLat] = aeqd(ROAD.lat, ROAD.lng).inverse([v0.e, v0.n])
const geo = { lat: Math.round(originLat * 1e8) / 1e8, lng: Math.round(originLng * 1e8) / 1e8, rotationDeg: Math.round(ROTATION * 1000) / 1000 }

const toLngLat = (p: Pt): [number, number] => {
  const c = Math.cos(rad(geo.rotationDeg))
  const s = Math.sin(rad(geo.rotationDeg))
  const e = (p.x * c + p.y * s) / 1000
  const n = (p.x * s - p.y * c) / 1000
  const [lng, lat] = aeqd(geo.lat, geo.lng).inverse([e, n])
  return [Math.round(lng * 1e8) / 1e8, Math.round(lat * 1e8) / 1e8]
}
const ring = (pts: Pt[]) => {
  const r = pts.map(toLngLat)
  return [[...r, r[0]]]
}
const rectPts = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
]

const walls: Any[] = []
const openings: Any[] = []
const furniture: Any[] = []
const rooms: Any[] = []
const wallById = new Map<string, Any>()

function wall(id: string, a: Pt, b: Pt, thickness: number, materialId: string, note?: string) {
  const w = { id, a, b, thickness, height: 2800, materialId, ...(note ? { note } : {}) }
  walls.push(w)
  wallById.set(id, w)
}

const unit = (w: Any) => {
  const a = w.a as Pt
  const b = w.b as Pt
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  return { ux: (b.x - a.x) / len, uy: (b.y - a.y) / len, len, a }
}

const along = (w: Any, p: Pt) => {
  const { ux, uy, a } = unit(w)
  return (p.x - a.x) * ux + (p.y - a.y) * uy
}

function opening(id: string, wallId: string, type: 'door' | 'window' | 'gate', from: number, to: number, height: number, sill: number, extra: Any = {}) {
  const w = wallById.get(wallId)!
  const horizontal = (w.a as Pt).y === (w.b as Pt).y
  const pa = horizontal ? { x: from, y: (w.a as Pt).y } : { x: (w.a as Pt).x, y: from }
  const pb = horizontal ? { x: to, y: (w.a as Pt).y } : { x: (w.a as Pt).x, y: to }
  const t0 = along(w, pa)
  const t1 = along(w, pb)
  const offset = Math.round(Math.min(t0, t1))
  const width = Math.round(Math.abs(t1 - t0))
  openings.push({ id, wallId, type, offset, width, height, sill, ...extra })
  return { offset, width }
}

function door(id: string, wallId: string, from: number, to: number, opensToward: Pt, hingeAt: number, height = 2000, note?: string) {
  const w = wallById.get(wallId)!
  const { ux, uy } = unit(w)
  const nRight = { x: -uy, y: ux }
  const mid = horizontalPoint(w, (from + to) / 2)
  const side = (opensToward.x - mid.x) * nRight.x + (opensToward.y - mid.y) * nRight.y > 0 ? 'right' : 'left'
  const tHinge = along(w, horizontalPoint(w, hingeAt))
  const tFrom = along(w, horizontalPoint(w, from))
  const tTo = along(w, horizontalPoint(w, to))
  const hinge = Math.abs(tHinge - Math.min(tFrom, tTo)) < 1 ? 'start' : 'end'
  opening(id, wallId, 'door', from, to, height, 0, { hinge, side, ...(note ? { note } : {}) })
}

function horizontalPoint(w: Any, v: number): Pt {
  const horizontal = (w.a as Pt).y === (w.b as Pt).y
  return horizontal ? { x: v, y: (w.a as Pt).y } : { x: (w.a as Pt).x, y: v }
}

const CATALOG_DIMS: Record<string, [w: number, d: number]> = {
  'bed-1600': [1700, 2100],
  nightstand: [450, 400],
  wardrobe: [1200, 600],
  dresser: [1000, 450],
  sofa: [2200, 950],
  armchair: [850, 850],
  'coffee-table': [1100, 600],
  'tv-stand': [1600, 420],
  bookcase: [800, 350],
  plant: [450, 450],
  'kitchen-base': [600, 600],
  'kitchen-drawers': [600, 600],
  'kitchen-upper': [600, 330],
  'kitchen-sink': [800, 600],
  stove: [600, 600],
  dishwasher: [600, 600],
  fridge: [600, 650],
  'dining-6': [1800, 1700],
  toilet: [380, 680],
  washbasin: [600, 460],
  vanity: [800, 480],
  bathtub: [1700, 750],
  shower: [900, 900],
  washer: [600, 600],
  'water-heater': [450, 470],
  'shoe-cabinet': [800, 320],
  'hall-wardrobe': [1600, 600],
  desk: [1200, 600],
  'office-chair': [650, 650],
  'floor-boiler': [500, 650],
}

const ROT: Record<Side, number> = { N: 0, E: 90, S: 180, W: 270 }

function put(id: string, type: string, room: Rect, side: Side, pos: number, opts: { w?: number; d?: number; h?: number; color?: string; note?: string; gap?: number } = {}) {
  const d = opts.d ?? CATALOG_DIMS[type]?.[1] ?? 600
  const gap = opts.gap ?? 0
  const x = side === 'E' ? room.x1 - d / 2 - gap : side === 'W' ? room.x0 + d / 2 + gap : pos
  const y = side === 'N' ? room.y0 + d / 2 + gap : side === 'S' ? room.y1 - d / 2 - gap : pos
  const item: Any = { id, type, x: Math.round(x), y: Math.round(y), rotationDeg: ROT[side] }
  if (opts.w !== undefined) item.w = opts.w
  if (opts.d !== undefined) item.d = opts.d
  if (opts.h !== undefined) item.h = opts.h
  if (opts.color) item.color = opts.color
  if (opts.note) item.note = opts.note
  furniture.push(item)
  return item
}

function free(id: string, type: string, x: number, y: number, rotationDeg = 0, opts: { w?: number; d?: number; color?: string; note?: string } = {}) {
  const item: Any = { id, type, x, y, rotationDeg, ...opts }
  furniture.push(item)
  return item
}

const room = (id: string, name: string, kind: string, r: Rect, at?: Pt) =>
  rooms.push({ id, name, kind, x: Math.round(at?.x ?? (r.x0 + r.x1) / 2), y: Math.round(at?.y ?? (r.y0 + r.y1) / 2) })

const EXT = 400
const PART = 120
const H = { x0: 4200, y0: 17200, x1: 19000, y1: 26400 }
const P = {
  p1: 8000,
  p2: 9800,
  p3: 19700,
  p4: 21800,
  p5: 23000,
  p6: 8000,
  p7: 11400,
  p8: 13800,
  p9: 16400,
  p10: 24000,
}
const h = PART / 2
const e = EXT / 2

wall('ext-back', { x: H.x0, y: H.y0 }, { x: H.x1, y: H.y0 }, EXT, 'teploblok-400', 'Garden facade (south-west)')
wall('ext-right', { x: H.x1, y: H.y0 }, { x: H.x1, y: H.y1 }, EXT, 'teploblok-400', 'Kitchen / utility gable')
wall('ext-front', { x: H.x1, y: H.y1 }, { x: H.x0, y: H.y1 }, EXT, 'teploblok-400', 'Street facade (north-east)')
wall('ext-left', { x: H.x0, y: H.y1 }, { x: H.x0, y: H.y0 }, EXT, 'teploblok-400', 'Bedroom gable')
wall('p1', { x: P.p1, y: H.y0 }, { x: P.p1, y: P.p4 }, PART, 'partition-120')
wall('p2', { x: P.p2, y: H.y0 }, { x: P.p2, y: P.p4 }, PART, 'partition-120')
wall('p3', { x: P.p1, y: P.p3 }, { x: P.p2, y: P.p3 }, PART, 'partition-120')
wall('p4', { x: H.x0, y: P.p4 }, { x: H.x1, y: P.p4 }, PART, 'partition-120')
wall('p5', { x: H.x0, y: P.p5 }, { x: P.p8, y: P.p5 }, PART, 'partition-120')
wall('p6', { x: P.p6, y: P.p5 }, { x: P.p6, y: H.y1 }, PART, 'partition-120')
wall('p7', { x: P.p7, y: P.p5 }, { x: P.p7, y: H.y1 }, PART, 'partition-120')
wall('p8', { x: P.p8, y: P.p5 }, { x: P.p8, y: H.y1 }, PART, 'partition-120')
wall('p9', { x: P.p9, y: P.p4 }, { x: P.p9, y: H.y1 }, PART, 'partition-120')
wall('p11', { x: P.p8, y: P.p4 }, { x: P.p8, y: P.p5 }, PART, 'partition-120')
wall('p10', { x: P.p9, y: P.p10 }, { x: H.x1, y: P.p10 }, PART, 'partition-120')

const G = { x0: 22100, y0: 32100, x1: 28900, y1: 38500 }
const GT = 200
wall('g-back', { x: G.x0, y: G.y0 }, { x: G.x1, y: G.y0 }, GT, 'smartblock-200')
wall('g-right', { x: G.x1, y: G.y0 }, { x: G.x1, y: G.y1 }, GT, 'smartblock-200')
wall('g-front', { x: G.x1, y: G.y1 }, { x: G.x0, y: G.y1 }, GT, 'smartblock-200', 'Gate wall, faces the street')
wall('g-left', { x: G.x0, y: G.y1 }, { x: G.x0, y: G.y0 }, GT, 'smartblock-200')

const R = {
  master: { x0: H.x0 + e, y0: H.y0 + e, x1: P.p1 - h, y1: P.p4 - h },
  ensuite: { x0: P.p1 + h, y0: H.y0 + e, x1: P.p2 - h, y1: P.p3 - h },
  wic: { x0: P.p1 + h, y0: P.p3 + h, x1: P.p2 - h, y1: P.p4 - h },
  living: { x0: P.p2 + h, y0: H.y0 + e, x1: H.x1 - e, y1: P.p4 - h },
  corridor: { x0: H.x0 + e, y0: P.p4 + h, x1: P.p8 - h, y1: P.p5 - h },
  entry: { x0: P.p8 + h, y0: P.p4 + h, x1: P.p9 - h, y1: H.y1 - e },
  bed2: { x0: H.x0 + e, y0: P.p5 + h, x1: P.p6 - h, y1: H.y1 - e },
  bed3: { x0: P.p6 + h, y0: P.p5 + h, x1: P.p7 - h, y1: H.y1 - e },
  bath: { x0: P.p7 + h, y0: P.p5 + h, x1: P.p8 - h, y1: H.y1 - e },
  pantry: { x0: P.p9 + h, y0: P.p4 + h, x1: H.x1 - e, y1: P.p10 - h },
  utility: { x0: P.p9 + h, y0: P.p10 + h, x1: H.x1 - e, y1: H.y1 - e },
  garage: { x0: G.x0 + GT / 2, y0: G.y0 + GT / 2, x1: G.x1 - GT / 2, y1: G.y1 - GT / 2 },
}
const center = (r: Rect): Pt => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 })

room('r-living', 'Living / Kitchen', 'living', R.living, { x: 11800, y: 21000 })
room('r-master', 'Master bedroom', 'bedroom', R.master, { x: 6100, y: 17950 })
room('r-ensuite', 'En-suite', 'bath', R.ensuite, { x: 8600, y: 19250 })
room('r-wic', 'Walk-in closet', 'storage', R.wic, { x: 8600, y: 21350 })
room('r-hall', 'Hall', 'hall', R.entry, { x: 15100, y: 22500 })
room('r-corridor', 'Corridor', 'hall', R.corridor, { x: 10800, y: 22400 })
room('r-bed2', 'Bedroom 2', 'bedroom', R.bed2, { x: 6150, y: 25750 })
room('r-bed3', 'Bedroom 3', 'bedroom', R.bed3, { x: 9500, y: 25750 })
room('r-bath', 'Bathroom', 'bath', R.bath, { x: 12600, y: 23300 })
room('r-pantry', 'Pantry', 'storage', R.pantry, { x: 17200, y: 22300 })
room('r-utility', 'Utility / Boiler', 'tech', R.utility, { x: 17300, y: 25200 })
room('r-garage', 'Garage', 'garage', R.garage, { x: 25500, y: 35300 })

door('d-front', 'ext-front', 14700, 15660, center(R.entry), 15660, 2100, 'Entrance door with thermal break, 960 × 2100')
door('d-terrace', 'ext-back', 14000, 15000, { x: 14500, y: 16000 }, 15000, 2200, 'Glazed terrace door, opens outward')
door('d-lk', 'p4', 14800, 15700, center(R.living), 14800, 2000, 'Glazed door hall → living')
door('d-corr', 'p11', 21950, 22850, { x: 13000, y: 22400 }, 21950, 2000, 'Glazed door hall → bedroom corridor')
door('d-living2', 'p4', 12300, 13200, center(R.living), 13200, 2000, 'Glazed door corridor → living')
door('d-master', 'p4', 7000, 7800, center(R.master), 7800)
door('d-ensuite', 'p1', 18300, 19000, center(R.ensuite), 18300)
door('d-wic', 'p1', 20300, 21000, center(R.wic), 21000)
door('d-bed2', 'p5', 7000, 7800, center(R.bed2), 7800)
door('d-bed3', 'p5', 8200, 9000, center(R.bed3), 8200)
door('d-bath', 'p5', 11800, 12500, center(R.bath), 11800)
door('d-pantry', 'p9', 22300, 23100, center(R.pantry), 22300)
door('d-utility', 'p9', 24300, 25100, center(R.utility), 24300)
door('d-garage', 'g-left', 34000, 34900, center(R.garage), 34900, 2100, 'Side door towards the house')

opening('win-master', 'ext-back', 'window', 5300, 7100, 1500, 800)
opening('win-ensuite', 'ext-back', 'window', 8750, 9350, 600, 1500)
opening('win-living', 'ext-back', 'window', 10400, 12800, 1500, 700)
opening('win-dining', 'ext-back', 'window', 15500, 17500, 1500, 800)
opening('win-kitchen', 'ext-right', 'window', 18500, 19500, 1000, 1100)
opening('win-utility', 'ext-right', 'window', 24900, 25500, 600, 1500)
opening('win-bath', 'ext-front', 'window', 12400, 13300, 600, 1500)
opening('win-bed3', 'ext-front', 'window', 9200, 10700, 1400, 800)
opening('win-bed2', 'ext-front', 'window', 5200, 6700, 1400, 800)
opening('win-bed2-side', 'ext-left', 'window', 24200, 25200, 1400, 800)
opening('win-hall', 'ext-front', 'window', 15900, 16200, 1500, 600)
opening('gate-1', 'g-front', 'gate', 25800, 28300, 2250, 0, { side: 'right', note: 'Sectional door 2500 × 2250' })
opening('gate-2', 'g-front', 'gate', 22700, 25200, 2250, 0, { side: 'right', note: 'Sectional door 2500 × 2250' })
opening('win-garage', 'g-back', 'window', 25000, 26000, 600, 1500)

const OAK = '#c9a27a'
const LINEN = '#e8e2d6'
const GRAPHITE = '#4b4f54'

put('f-m-bed', 'bed-1600', R.master, 'W', 19500, { color: LINEN })
put('f-m-ns1', 'nightstand', R.master, 'W', 18400, { color: OAK })
put('f-m-ns2', 'nightstand', R.master, 'W', 20600, { color: OAK })
put('f-m-dresser', 'dresser', R.master, 'S', 5300, { color: OAK })
free('f-m-chair', 'armchair', 7460, 17860, 0, { color: GRAPHITE })

put('f-es-shower', 'shower', R.ensuite, 'N', R.ensuite.x1 - 450)
put('f-es-wc', 'toilet', R.ensuite, 'E', 19000)
put('f-es-basin', 'washbasin', R.ensuite, 'N', R.ensuite.x0 + 300)

put('f-wic-wardrobe', 'wardrobe', R.wic, 'E', 20750, { w: 1800, color: OAK })

put('f-k-fridge', 'fridge', R.living, 'E', 17700)
put('f-k-base1', 'kitchen-base', R.living, 'E', 18300, { color: LINEN })
put('f-k-sink', 'kitchen-sink', R.living, 'E', 19000, { color: LINEN })
put('f-k-dw', 'dishwasher', R.living, 'E', 19700)
put('f-k-stove', 'stove', R.living, 'E', 20300)
put('f-k-drawers', 'kitchen-drawers', R.living, 'E', 20900, { color: LINEN })
put('f-k-base2', 'kitchen-base', R.living, 'E', 21470, { w: 540, color: LINEN })
put('f-k-upper', 'kitchen-upper', R.living, 'E', 20600, { w: 1200, color: LINEN })
free('f-dining', 'dining-6', 16200, 19400, 0, { color: OAK })
put('f-tv', 'tv-stand', R.living, 'W', 19500, { color: OAK })
free('f-sofa', 'sofa', 13100, 19500, 90, { color: '#8a9099' })
free('f-coffee', 'coffee-table', 11450, 19500, 90, { color: OAK })
put('f-books', 'bookcase', R.living, 'S', 11000, { color: OAK })
free('f-plant1', 'plant', 10200, 17750)

put('f-h-wardrobe', 'hall-wardrobe', R.entry, 'W', 24400, { color: OAK })
put('f-h-shoes', 'shoe-cabinet', R.entry, 'E', 25700, { color: OAK })

put('f-b2-bed', 'bed-1600', R.bed2, 'N', 5750, { color: LINEN })
put('f-b2-ns', 'nightstand', R.bed2, 'N', R.bed2.x0 + 225, { color: OAK })
put('f-b2-wardrobe', 'wardrobe', R.bed2, 'E', 25650, { w: 1000, color: OAK })
free('f-b2-plant', 'plant', R.bed2.x0 + 250, R.bed2.y1 - 250)

put('f-b3-bed', 'bed-1600', R.bed3, 'N', 10000, { color: LINEN })
put('f-b3-ns', 'nightstand', R.bed3, 'N', R.bed3.x1 - 225, { color: OAK })
put('f-b3-wardrobe', 'wardrobe', R.bed3, 'W', 25650, { w: 1000, color: OAK })

put('f-ba-tub', 'bathtub', R.bath, 'S', R.bath.x0 + 850)
put('f-ba-wc', 'toilet', R.bath, 'E', 24300)
put('f-ba-vanity', 'vanity', R.bath, 'W', 24300, { color: OAK })

put('f-p-shelf', 'bookcase', R.pantry, 'E', 22900, { w: 1800, color: LINEN, note: 'Pantry shelving' })

put('f-u-hp', 'floor-boiler', R.utility, 'E', 24500, { note: 'Air-to-water heat pump, indoor unit' })
put('f-u-washer', 'washer', R.utility, 'S', 18350)
put('f-u-heater', 'water-heater', R.utility, 'N', 17200, { note: 'Electric water heater, 80 L' })

put('f-g-bench', 'desk', R.garage, 'N', 24200, { w: 1600, color: OAK, note: 'Workbench' })

const site = {
  convention: 'y-down-clockwise',
  width: LOT.w,
  depth: LOT.d,
  geo,
  boundary: rectPts(0, 0, LOT.w, LOT.d),
  zones: [
    { id: 'zone-lawn', name: 'Lawn', kind: 'lawn', polygon: rectPts(500, 500, 29500, 44500) },
    { id: 'zone-terrace', name: 'Terrace', kind: 'paving', polygon: rectPts(9600, 13800, 17600, 17000) },
    { id: 'zone-drive', name: 'Driveway', kind: 'paving', polygon: rectPts(22000, 38600, 29000, 45000) },
    { id: 'zone-path', name: 'Front path', kind: 'paving', polygon: rectPts(14500, 26600, 15900, 45000) },
    { id: 'zone-gravel', name: 'Gravel parking', kind: 'fill', polygon: rectPts(17000, 40000, 21500, 45000) },
  ],
  street: { side: [2, 3], note: 'Demo Lane' },
  imagery: { offsetE: 0, offsetN: 0, rotationDeg: 0 },
  note: 'Demo plot 30 × 45 m in an open field near Kiili, Harju County, Estonia. Fictional lot; street side 2–3 (bottom of the plan) faces the gravel road.',
}

const sn: Any[] = []
const sp: Any[] = []
const snode = (id: string, x: number, y: number, kind: string, extra: Any = {}) => sn.push({ id, x, y, kind, ...extra })
const spipe = (id: string, from: string, to: string, diameter: number, location: 'inside' | 'outside', extra: Any = {}) =>
  sp.push({ id, from, to, diameter, slope: diameter === 50 ? 3 : 2, location, ...extra })

snode('s-es-shower', 9290, 17850, 'fixture', { fixture: 'shower', furnitureId: 'f-es-shower', label: 'En-suite shower' })
snode('s-es-basin', 8360, 17550, 'fixture', { fixture: 'sink', furnitureId: 'f-es-basin', label: 'En-suite basin' })
snode('s-es-wc', 9590, 19000, 'fixture', { fixture: 'toilet', furnitureId: 'f-es-wc', label: 'En-suite WC' })
snode('s-t1', 9600, 19300, 'junction', { label: 'Tee 45°' })
snode('s-c1', 9600, 21900, 'junction', { label: 'Bend 45°' })
snode('s-c2', 10100, 22400, 'junction', { label: 'Bend 45°' })
snode('s-c3', 12900, 22400, 'junction', { label: 'Bend 45°' })
snode('s-c4', 13600, 23100, 'junction', { label: 'Bend 45°' })
snode('s-ba-wc', 13400, 24300, 'fixture', { fixture: 'toilet', furnitureId: 'f-ba-wc', label: 'Bathroom WC' })
snode('s-ba-basin', 11600, 24300, 'fixture', { fixture: 'sink', furnitureId: 'f-ba-vanity', label: 'Bathroom basin' })
snode('s-ba-tub', 12310, 25825, 'fixture', { fixture: 'bath', furnitureId: 'f-ba-tub', label: 'Bathtub' })
snode('s-riser', 13600, 26000, 'riser', { height: 4000, label: 'Soil stack Ø110, vented through the roof' })
snode('s-k-sink', 18600, 19000, 'fixture', { fixture: 'kitchen', furnitureId: 'f-k-sink', label: 'Kitchen sink' })
snode('s-k-dw', 18300, 19700, 'fixture', { fixture: 'kitchen', furnitureId: 'f-k-dw', label: 'Dishwasher' })
snode('s-k1', 18600, 19700, 'junction', { label: 'Tee 45°' })
snode('s-u-hp', 18300, 24900, 'fixture', { fixture: 'boiler', furnitureId: 'f-u-hp', label: 'Heat pump safety valve drain' })
snode('s-u-washer', 18350, 25700, 'fixture', { fixture: 'washer', furnitureId: 'f-u-washer', label: 'Washing machine' })
snode('s-u1', 18600, 25300, 'junction', { label: 'Tee 45°' })
snode('s-u2', 17900, 26000, 'junction', { label: 'Bend 45°' })
snode('s-out', 13600, 26600, 'outlet', { label: 'Outlet through the foundation in a sleeve' })
snode('s-o1', 13600, 27600, 'cleanout', { label: 'Inspection chamber' })
snode('s-septic', 2200, 43300, 'septic', { model: 'Compact treatment plant, 5 PE', w: 1200, d: 1200, rotationDeg: 0, label: 'Treatment plant' })

spipe('sp1', 's-es-shower', 's-t1', 50, 'inside')
spipe('sp2', 's-es-basin', 's-t1', 50, 'inside')
spipe('sp3', 's-es-wc', 's-t1', 110, 'inside')
spipe('sp4', 's-t1', 's-c1', 110, 'inside')
spipe('sp5', 's-c1', 's-c2', 110, 'inside')
spipe('sp6', 's-c2', 's-c3', 110, 'inside')
spipe('sp7', 's-c3', 's-c4', 110, 'inside')
spipe('sp8', 's-c4', 's-riser', 110, 'inside')
spipe('sp9', 's-ba-wc', 's-riser', 110, 'inside')
spipe('sp10', 's-ba-basin', 's-riser', 50, 'inside')
spipe('sp11', 's-ba-tub', 's-riser', 50, 'inside')
spipe('sp12', 's-k-sink', 's-k1', 50, 'inside')
spipe('sp13', 's-k-dw', 's-k1', 50, 'inside')
spipe('sp14', 's-k1', 's-u1', 50, 'inside')
spipe('sp15', 's-u-hp', 's-u1', 50, 'inside')
spipe('sp16', 's-u-washer', 's-u1', 50, 'inside')
spipe('sp17', 's-u1', 's-u2', 50, 'inside')
spipe('sp18', 's-u2', 's-riser', 50, 'inside')
spipe('sp19', 's-riser', 's-out', 110, 'inside')
spipe('sp20', 's-out', 's-o1', 110, 'outside', { depth: 1200 })
spipe('sp21', 's-o1', 's-septic', 110, 'outside')

const wn: Any[] = []
const wp: Any[] = []
const wnode = (id: string, x: number, y: number, kind: string, extra: Any = {}) => wn.push({ id, x, y, kind, ...extra })
const wpipe = (id: string, from: string, to: string, line: string, diameter: number, location: 'inside' | 'outside', extra: Any = {}) =>
  wp.push({ id, from, to, line, diameter, material: location === 'outside' ? 'PE' : 'PEX', location, ...extra })

wnode('w-src', 29200, 800, 'source', { source: 'borehole', label: 'Borehole, 50 m from the treatment plant' })
wnode('w-j1', 21000, 25000, 'junction', { label: 'Turn to the house' })
wnode('w-entry', 19000, 25000, 'entry', { label: 'Entry in a Ø50 sleeve below frost depth' })
wnode('w-pump', 18500, 25000, 'pump', { model: 'Pressure tank 50 L + pressure switch', label: 'Hydrophore' })
wnode('w-filter', 18050, 25000, 'filter', { label: 'Sediment + 20" cartridge filter' })
wnode('w-cold', 17600, 25000, 'collector', { line: 'cold', outputs: 11, label: 'Cold manifold' })
wnode('w-heater', 17200, 24300, 'boiler', { furnitureId: 'f-u-heater', model: '80 L', label: 'Water heater' })
wnode('w-hot', 16900, 24700, 'collector', { line: 'hot', outputs: 5, label: 'Hot manifold' })
wnode('w-tap', 15200, 17000, 'tap_outdoor', { label: 'Frost-free garden tap on the terrace' })

wpipe('wp-src', 'w-src', 'w-j1', 'cold', 32, 'outside', { depth: 1800 })
wpipe('wp-in', 'w-j1', 'w-entry', 'cold', 32, 'outside', { depth: 1800 })
wpipe('wp-pump', 'w-entry', 'w-pump', 'cold', 25, 'inside')
wpipe('wp-filter', 'w-pump', 'w-filter', 'cold', 25, 'inside')
wpipe('wp-cold', 'w-filter', 'w-cold', 'cold', 25, 'inside')
wpipe('wp-heater', 'w-cold', 'w-heater', 'cold', 20, 'inside')
wpipe('wp-hot', 'w-heater', 'w-hot', 'hot', 20, 'inside')

const fixturesWater: { id: string; fixture: string; furnitureId: string; at: Pt; hot: boolean; label: string }[] = [
  { id: 'w-k-sink', fixture: 'kitchen', furnitureId: 'f-k-sink', at: { x: 18500, y: 19000 }, hot: true, label: 'Kitchen sink' },
  { id: 'w-k-dw', fixture: 'kitchen', furnitureId: 'f-k-dw', at: { x: 18500, y: 19700 }, hot: false, label: 'Dishwasher' },
  { id: 'w-u-washer', fixture: 'washer', furnitureId: 'f-u-washer', at: { x: 18350, y: 25800 }, hot: false, label: 'Washing machine' },
  { id: 'w-ba-wc', fixture: 'toilet', furnitureId: 'f-ba-wc', at: { x: 13500, y: 24300 }, hot: false, label: 'Bathroom WC' },
  { id: 'w-ba-basin', fixture: 'sink', furnitureId: 'f-ba-vanity', at: { x: 11600, y: 24300 }, hot: true, label: 'Bathroom basin' },
  { id: 'w-ba-tub', fixture: 'bath', furnitureId: 'f-ba-tub', at: { x: 12310, y: 25700 }, hot: true, label: 'Bathtub' },
  { id: 'w-es-wc', fixture: 'toilet', furnitureId: 'f-es-wc', at: { x: 9500, y: 19000 }, hot: false, label: 'En-suite WC' },
  { id: 'w-es-basin', fixture: 'sink', furnitureId: 'f-es-basin', at: { x: 8360, y: 17600 }, hot: true, label: 'En-suite basin' },
  { id: 'w-es-shower', fixture: 'shower', furnitureId: 'f-es-shower', at: { x: 9290, y: 17850 }, hot: true, label: 'En-suite shower' },
]
for (const f of fixturesWater) wnode(f.id, f.at.x, f.at.y, 'fixture', { fixture: f.fixture, furnitureId: f.furnitureId, label: f.label })

const coldNode = { x: 17600, y: 25000 }
const hotNode = { x: 16900, y: 24700 }
let lane = 0
function radial(prefix: string, from: string, fromAt: Pt, to: string, toAt: Pt, line: 'cold' | 'hot') {
  const k = lane++
  const laneY = 22300 + (k % 14) * 45
  const sx = fromAt.x - 40 - (k % 14) * 30
  const j1 = `${prefix}-a`
  const j2 = `${prefix}-b`
  const nearLane = Math.abs(toAt.y - laneY) < 400
  if (nearLane) {
    wnode(j1, sx, toAt.y, 'junction')
    wpipe(`${prefix}-1`, from, j1, line, 16, 'inside')
    wpipe(`${prefix}-2`, j1, to, line, 16, 'inside')
    return
  }
  wnode(j1, sx, laneY, 'junction')
  wnode(j2, toAt.x + (toAt.x > sx ? -150 : 150), laneY, 'junction')
  wpipe(`${prefix}-1`, from, j1, line, 16, 'inside')
  wpipe(`${prefix}-2`, j1, j2, line, 16, 'inside')
  wpipe(`${prefix}-3`, j2, to, line, 16, 'inside')
}
for (const f of fixturesWater) {
  if (f.id === 'w-u-washer') {
    wpipe('wl-washer', 'w-cold', f.id, 'cold', 16, 'inside')
    continue
  }
  radial(`wc-${f.id.slice(2)}`, 'w-cold', coldNode, f.id, f.at, 'cold')
  if (f.hot) radial(`wh-${f.id.slice(2)}`, 'w-hot', hotNode, f.id, f.at, 'hot')
}
wnode('w-tap-a', 15200, 23600, 'junction')
wpipe('wl-tap-1', 'w-cold', 'w-tap-a', 'cold', 16, 'inside')
wpipe('wl-tap-2', 'w-tap-a', 'w-tap', 'cold', 16, 'inside')

const ep: Any[] = []
const faceOf = (wallId: string, v: number, toward: Pt) => {
  const w = wallById.get(wallId)!
  const p = horizontalPoint(w, v)
  const half = (w.thickness as number) / 2
  const horizontal = (w.a as Pt).y === (w.b as Pt).y
  if (horizontal) return { x: p.x, y: p.y + (toward.y > p.y ? half : -half) }
  return { x: p.x + (toward.x > p.x ? half : -half), y: p.y }
}
let epN = 0
function pt(kind: string, wallId: string | null, v: number | Pt, toward: Pt | null, circuitId: string, height: number, extra: Any = {}) {
  const at = wallId ? faceOf(wallId, v as number, toward!) : (v as Pt)
  ep.push({ id: `ep${++epN}`, kind, x: Math.round(at.x), y: Math.round(at.y), height, ...(wallId ? { wallId } : {}), circuitId, ...extra })
}
const OUT_BACK = { x: 0, y: 0 }
const OUT_FRONT = { x: 0, y: 50000 }
const switchBy = (doorId: string, toward: Pt, circuitId: string, kind = 'switch', label?: string) => {
  const o = openings.find((x) => x.id === doorId)!
  const w = wallById.get(o.wallId as string)!
  const { ux, uy, a } = unit(w)
  const hingeStart = o.hinge === 'start'
  const t = hingeStart ? (o.offset as number) + (o.width as number) + 150 : (o.offset as number) - 150
  const p = { x: a.x + ux * t, y: a.y + uy * t }
  const horizontal = (w.a as Pt).y === (w.b as Pt).y
  pt(kind, o.wallId as string, horizontal ? p.x : p.y, toward, circuitId, 900, label ? { label } : {})
}

const circuits = [
  { id: 'c-l1', name: 'Lighting — bedrooms wing', kind: 'light', breaker: { type: 'MCB', rating: 10, curve: 'C' }, cable: '3x1.5', phase: 'L1' },
  { id: 'c-l2', name: 'Lighting — living, hall, utility', kind: 'light', breaker: { type: 'MCB', rating: 10, curve: 'C' }, cable: '3x1.5', phase: 'L2' },
  { id: 'c-s1', name: 'Sockets — living & dining', kind: 'socket', breaker: { type: 'RCBO', rating: 16, curve: 'C' }, cable: '3x2.5', phase: 'L3' },
  { id: 'c-s2', name: 'Sockets — kitchen worktop', kind: 'socket', breaker: { type: 'RCBO', rating: 16, curve: 'C' }, cable: '3x2.5', phase: 'L1' },
  { id: 'c-s3', name: 'Sockets — master suite', kind: 'socket', breaker: { type: 'RCBO', rating: 16, curve: 'C' }, cable: '3x2.5', phase: 'L2' },
  { id: 'c-s4', name: 'Sockets — bedrooms 2–3, hall', kind: 'socket', breaker: { type: 'RCBO', rating: 16, curve: 'C' }, cable: '3x2.5', phase: 'L3' },
  { id: 'c-w1', name: 'Bathrooms (IP44)', kind: 'wet', breaker: { type: 'RCBO', rating: 16, curve: 'C' }, cable: '3x2.5', phase: 'L1' },
  { id: 'c-w2', name: 'Washing machine', kind: 'wet', breaker: { type: 'RCBO', rating: 16, curve: 'C' }, cable: '3x2.5', phase: 'L2' },
  { id: 'c-w3', name: 'Water heater 80 L', kind: 'wet', breaker: { type: 'RCBO', rating: 16, curve: 'C' }, cable: '3x2.5', phase: 'L3' },
  { id: 'c-p1', name: 'Induction hob & oven', kind: 'power', breaker: { type: 'RCBO', rating: 32, curve: 'C' }, cable: '3x6', phase: 'L1' },
  { id: 'c-p2', name: 'Dishwasher', kind: 'power', breaker: { type: 'RCBO', rating: 16, curve: 'C' }, cable: '3x2.5', phase: 'L2' },
  { id: 'c-p3', name: 'Heat pump', kind: 'power', breaker: { type: 'RCBO', rating: 16, curve: 'C' }, cable: '3x2.5', phase: 'L3' },
  { id: 'c-p4', name: 'Borehole pump', kind: 'power', breaker: { type: 'RCBO', rating: 16, curve: 'C' }, cable: '3x2.5', phase: 'L1' },
  { id: 'c-o1', name: 'Outdoor & terrace', kind: 'outdoor', breaker: { type: 'RCBO', rating: 16, curve: 'C' }, cable: '3x2.5', phase: 'L2' },
  { id: 'c-g1', name: 'Garage (buried cable)', kind: 'garage', breaker: { type: 'RCBO', rating: 16, curve: 'C' }, cable: '3x2.5', phase: 'L3' },
]

const C = (r: Rect) => center(r)
pt('light', null, C(R.master), null, 'c-l1', 2800, { label: 'Master bedroom' })
pt('light', null, C(R.ensuite), null, 'c-l1', 2800, { label: 'En-suite' })
pt('light', null, C(R.wic), null, 'c-l1', 2800, { label: 'Walk-in closet' })
pt('light', null, { x: 6200, y: 22400 }, null, 'c-l1', 2800, { label: 'Corridor' })
pt('light', null, { x: 10600, y: 22400 }, null, 'c-l1', 2800, { label: 'Corridor' })
pt('light', null, C(R.bed2), null, 'c-l1', 2800, { label: 'Bedroom 2' })
pt('light', null, C(R.bed3), null, 'c-l1', 2800, { label: 'Bedroom 3' })
pt('light', null, C(R.bath), null, 'c-l1', 2800, { label: 'Bathroom' })
switchBy('d-master', C(R.master), 'c-l1')
switchBy('d-ensuite', C(R.master), 'c-l1', 'switch', 'En-suite (outside the door)')
switchBy('d-wic', C(R.master), 'c-l1', 'switch', 'Walk-in closet')
switchBy('d-bed2', C(R.bed2), 'c-l1')
switchBy('d-bed3', C(R.bed3), 'c-l1')
switchBy('d-bath', C(R.corridor), 'c-l1', 'switch', 'Bathroom (outside the door)')
pt('switch2', 'p4', 6200, C(R.corridor), 'c-l1', 900, { label: 'Corridor' })

pt('light', null, { x: 11700, y: 19500 }, null, 'c-l2', 2800, { label: 'Living' })
pt('light', null, { x: 16200, y: 19400 }, null, 'c-l2', 2800, { label: 'Dining' })
pt('light', null, { x: 17700, y: 19400 }, null, 'c-l2', 2800, { label: 'Kitchen' })
pt('light', null, { x: 15100, y: 22800 }, null, 'c-l2', 2800, { label: 'Hall' })
pt('light', null, { x: 15100, y: 25000 }, null, 'c-l2', 2800, { label: 'Entrance' })
pt('light', null, C(R.pantry), null, 'c-l2', 2800, { label: 'Pantry' })
pt('light', null, C(R.utility), null, 'c-l2', 2800, { label: 'Utility' })
switchBy('d-lk', C(R.living), 'c-l2', 'switch2', 'Living / dining')
pt('switch', 'p4', 16000, C(R.living), 'c-l2', 900, { label: 'Kitchen' })
switchBy('d-front', C(R.entry), 'c-l2', 'switch2', 'Hall / entrance')
switchBy('d-pantry', C(R.entry), 'c-l2', 'switch', 'Pantry (outside the door)')
switchBy('d-utility', C(R.entry), 'c-l2', 'switch', 'Utility (outside the door)')

pt('socket2', 'p2', 19000, C(R.living), 'c-s1', 300, { label: 'TV' })
pt('socket2', 'p2', 20000, C(R.living), 'c-s1', 300, { label: 'TV' })
pt('socket', 'ext-back', 10500, C(R.living), 'c-s1', 300)
pt('socket', 'ext-back', 13300, C(R.living), 'c-s1', 300, { label: 'Sofa' })
pt('socket', 'p4', 12000, C(R.living), 'c-s1', 300)
pt('socket', 'p4', 13800, C(R.living), 'c-s1', 300)
pt('socket', 'ext-back', 17800, C(R.living), 'c-s1', 300, { label: 'Dining' })

pt('socket2', 'ext-right', 18300, C(R.living), 'c-s2', 1100, { label: 'Worktop' })
pt('socket2', 'ext-right', 20900, C(R.living), 'c-s2', 1100, { label: 'Worktop' })
pt('socket2', 'ext-right', 21450, C(R.living), 'c-s2', 1100, { label: 'Worktop' })
pt('socket', 'ext-right', 17700, C(R.living), 'c-s2', 300, { label: 'Fridge', powerW: 300 })
pt('socket', 'ext-right', 20300, C(R.living), 'c-s2', 2000, { label: 'Cooker hood', powerW: 200 })

pt('socket', 'ext-left', 18300, C(R.master), 'c-s3', 700, { label: 'Bedside' })
pt('socket', 'ext-left', 20700, C(R.master), 'c-s3', 700, { label: 'Bedside' })
pt('socket', 'p4', 5900, C(R.master), 'c-s3', 900, { label: 'Dresser' })
pt('socket', 'ext-back', 7700, C(R.master), 'c-s3', 300, { label: 'Reading chair' })
pt('socket', 'p2', 20100, C(R.wic), 'c-s3', 300, { label: 'Walk-in closet' })

pt('socket', 'p5', 4700, C(R.bed2), 'c-s4', 700, { label: 'Bedside' })
pt('socket', 'ext-left', 25600, C(R.bed2), 'c-s4', 300)
pt('socket', 'p6', 24400, C(R.bed2), 'c-s4', 300)
pt('socket', 'p5', 11150, C(R.bed3), 'c-s4', 700, { label: 'Bedside' })
pt('socket', 'p7', 24000, C(R.bed3), 'c-s4', 300)
pt('socket', 'ext-front', 9000, C(R.bed3), 'c-s4', 300)
pt('socket', 'p5', 5800, C(R.corridor), 'c-s4', 300, { label: 'Corridor' })
pt('socket', 'p8', 23300, C(R.entry), 'c-s4', 300, { label: 'Hall' })

pt('socket_ip44', 'p1', 17700, C(R.ensuite), 'c-w1', 1100, { label: 'En-suite basin' })
pt('socket_ip44', 'p7', 23500, C(R.bath), 'c-w1', 1100, { label: 'Bathroom basin' })
pt('socket_ip44', 'ext-right', 25800, C(R.utility), 'c-w2', 1100, { label: 'Washing machine', powerW: 2200 })
pt('power', 'p10', 17700, C(R.utility), 'c-w3', 1900, { label: 'Water heater', powerW: 2000 })
pt('power', 'ext-right', 20300, C(R.living), 'c-p1', 600, { label: 'Induction hob + oven', powerW: 7000 })
pt('power', 'ext-right', 19700, C(R.living), 'c-p2', 300, { label: 'Dishwasher', powerW: 2000 })
pt('power', 'p10', 18450, C(R.utility), 'c-p3', 600, { label: 'Heat pump indoor unit', powerW: 3500 })
pt('power', 'p9', 25700, C(R.utility), 'c-p4', 600, { label: 'Borehole pump controller', powerW: 1100 })

pt('outdoor', 'ext-back', 16200, OUT_BACK, 'c-o1', 600, { label: 'Terrace' })
pt('light_wall', 'ext-back', 13700, OUT_BACK, 'c-o1', 2200, { label: 'Terrace' })
pt('light_wall', 'ext-back', 15300, OUT_BACK, 'c-o1', 2200, { label: 'Terrace' })
pt('light_wall', 'ext-front', 14450, OUT_FRONT, 'c-o1', 2200, { label: 'Front door' })
pt('switch', 'ext-back', 15200, C(R.living), 'c-o1', 900, { label: 'Terrace lights' })

pt('socket', 'g-back', 23000, C(R.garage), 'c-g1', 900, { label: 'Workbench' })
pt('socket', 'g-back', 27900, C(R.garage), 'c-g1', 300)
pt('socket', 'g-right', 37000, C(R.garage), 'c-g1', 2500, { label: 'Door operators' })
pt('light', null, { x: 24000, y: 35300 }, null, 'c-g1', 2800, { label: 'Garage' })
pt('light', null, { x: 27000, y: 35300 }, null, 'c-g1', 2800, { label: 'Garage' })
switchBy('d-garage', C(R.garage), 'c-g1', 'switch', 'Garage lights')

const panel = { id: 'panel', ...faceOf('p9', 23600, C(R.entry)), wallId: 'p9', modules: 36 }

const plan: Any = {
  version: 1,
  name: 'Demo: Nordic single-storey house with garage',
  resetEpoch: 2,
  site,
  materials: [
    {
      id: 'teploblok-400',
      name: 'Teploblok 400 × 200 × 400, three-layer block (200 structural + 150 EPS + 50 facade)',
      kind: 'block',
      thickness: 400,
      unitLength: 400,
      unitHeight: 200,
      jointMm: 10,
      price: 580,
      pricePer: 'pcs',
      url: 'https://teplobloki-sz.ru/teplobloki',
      source: 'teplobloki-sz.ru, price list',
      checkedAt: '2026-09-30',
      finish: 'plaster',
      note: 'External walls, painted facade layer',
    },
    {
      id: 'partition-120',
      name: 'Smart-Block partition block 390 × 120 × 200',
      kind: 'block',
      thickness: 120,
      unitLength: 390,
      unitHeight: 200,
      jointMm: 3,
      price: 158,
      pricePer: 'pcs',
      url: 'https://xn----7sbe2ajfduoho.xn--p1ai/',
      source: 'Smart-Block, manufacturer retail price',
      checkedAt: '2026-09-30',
      note: 'Interior partitions, plastered both sides',
    },
    {
      id: 'smartblock-200',
      name: 'Smart-Block 390 × 200 × 200, concrete-filled (garage)',
      kind: 'block',
      thickness: 200,
      unitLength: 390,
      unitHeight: 200,
      jointMm: 3,
      price: 192,
      pricePer: 'pcs',
      url: 'https://gssmarket.ru/ryadovoj-blok-390h200h200mm',
      source: 'GSSMarket, dealer price',
      checkedAt: '2026-09-30',
      finish: 'plaster',
      note: 'Unheated detached garage',
    },
  ],
  walls,
  openings,
  furniture,
  rooms,
  palette: { name: 'Nordic white', walls: 'RAL 9010', accent: 'RAL 7016', roof: 'RAL 7016', windows: 'RAL 7016', gates: 'RAL 7016', plinth: 'RAL 7016' },
  estimate: {
    lines: [
      { id: 'l-slab', name: 'Insulated slab foundation, house 15.2 × 9.6 m, turnkey', category: 'фундамент', qty: 146, unit: 'm²', price: 5500, url: 'https://top-fundament.ru/fundamenty/fundament-ushp', note: 'Starting price per m² of slab' },
      { id: 'l-garage-slab', name: 'Garage slab on grade 7.0 × 6.6 m', category: 'фундамент', qty: 46, unit: 'm²', price: 3000, url: 'https://sankt-peterburg.svaifund.ru/fundament-ushp/' },
      { id: 'l-terrace', name: 'Terrace paving on gravel base, 8.0 × 3.2 m', category: 'прочее', qty: 25.6, unit: 'm²' },
      { id: 'l-drive', name: 'Driveway and front path, concrete pavers', category: 'прочее', qty: 70, unit: 'm²' },
      { id: 'l-roof', name: 'Standing-seam steel roof, RAL 7016', category: 'кровля', qty: 210, unit: 'm²', note: 'House and garage incl. overhangs' },
      { id: 'l-paint', name: 'Facade paint, RAL 9010, two coats', category: 'прочее', qty: 190, unit: 'm²' },
      { id: 'l-masonry', name: 'Masonry labour: external walls and partitions', category: 'работы', qty: 1, unit: 'lot', note: 'Ask local contractors for a quote' },
    ],
    purchases: {},
    wasteSipPct: 5,
    notes: [
      'All quantities are generated from the plan; prices are examples, check them before ordering.',
      'Foundation: insulated slab with underfloor heating pipes in the screed.',
      'Garage is unheated; the power cable runs underground in a duct.',
      'Septic and borehole positions follow the 50 m separation rule.',
    ],
  },
  networks: {
    sewer: { floorLevel: 450, nodes: sn, pipes: sp },
    water: { nodes: wn, pipes: wp },
    electric: { panel, points: ep, circuits },
    heating: { collector: { id: 'collector', x: 12000, y: 22880, outputs: 12, label: 'Manifold cabinet in the corridor wall' }, loops: [], params: { supplyT: 50, returnT: 40, screedMm: 60, insulation: 'XPS 150', screedMix: 'cps', fixing: 'staples' } },
  },
}

const { autoLayout } = await load<{ autoLayout: (p: Any) => { heating: Any; notes: string[] } }>('/src/networks/heating/layout.ts')
const heat = autoLayout(plan)
const UNHEATED = new Set(['r-wic', 'r-pantry', 'r-utility'])
const loops = (heat.heating.loops as Any[])
  .filter((l) => !UNHEATED.has(l.roomId as string))
  .map((l) => {
    const parts = ((l.parts as Any[] | undefined) ?? []).filter((x) => !UNHEATED.has(x.roomId as string))
    if (parts.length) return { ...l, parts }
    const { parts: _p, linkPath: _l, ...rest } = l
    return { ...rest, roomName: String(l.roomName).replace(/ \+ (Pantry|Walk-in closet)$/, '') }
  })
loops.forEach((l, i) => (l.id = `hl${i + 1}`))
;(plan.networks as Any).heating = { ...heat.heating, collector: { ...(heat.heating.collector as Any), outputs: loops.length }, loops, params: ((plan.networks as Any).heating as Any).params }
console.log('heating notes:', heat.notes)

const { autoRoute } = await load<{ autoRoute: (p: Any, id: string) => Any[] }>('/src/networks/electric/route.ts')
const routes = circuits.flatMap((c) => autoRoute(plan, c.id))
;((plan.networks as Any).electric as Any).routes = routes

const { computeElectric } = await load<{ computeElectric: (p: Any) => { modules: number; panelSize: number } }>('/src/networks/electric/calc.ts')
const ec = computeElectric(plan)
panel.modules = ec.panelSize
await close()

writeFileSync(out('public/plans/demo.json'), JSON.stringify(plan, null, 1) + '\n')

const lot = (x0: number) => ring(rectPts(x0, 0, x0 + LOT.w, LOT.d))
const roadLine = [-45000, 75000].map((x) => toLngLat({ x, y: LOT.d + LOT.roadOffsetM * 1000 }))
const parcel = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { role: 'parcel', label: 'Lot 12', note: '30 × 45 m, 1350 m²' }, geometry: { type: 'Polygon', coordinates: lot(0) } },
    { type: 'Feature', properties: { role: 'neighbor', label: 'Lot 11' }, geometry: { type: 'Polygon', coordinates: lot(-LOT.w) } },
    { type: 'Feature', properties: { role: 'neighbor', label: 'Lot 13' }, geometry: { type: 'Polygon', coordinates: lot(LOT.w) } },
    { type: 'Feature', properties: { role: 'street', label: 'Demo Lane' }, geometry: { type: 'LineString', coordinates: roadLine } },
  ],
}
writeFileSync(out('public/data/parcel.geojson'), JSON.stringify(parcel, null, 1) + '\n')
console.log('geo', geo, 'walls', walls.length, 'openings', openings.length, 'furniture', furniture.length, 'points', ep.length, 'routes', routes.length, 'panel', ec.modules, ec.panelSize)
