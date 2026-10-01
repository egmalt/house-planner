import type { Plan, Point } from '../../model'
import { t } from '../../i18n'
import { detectRooms, pointInPolygon, type DetectedBuilding, type RoomDetection, type RoomFace } from '../../stats/rooms'

export type RoomClass = 'wet' | 'tile' | 'dry' | 'boiler' | 'skip'

export type HeatRoom = {
  face: RoomFace
  building: DetectedBuilding
  labelId?: string
  name: string
  cls: RoomClass
  cover: 'tile' | 'laminate'
  exteriorWalls: { a: Point; b: Point; thickness: number }[]
  exteriorSides: number
  lossWm2: number
  tInside: number
}

const WET = /сан\.?\s?узел|санузел|с\/у|душ|ванн|туалет|уборн|постир|прачеч|bath|shower|toilet|\bwc\b|restroom|laundry|utility/i
const TILE = /кухн|прихож|коридор|холл|тамбур|крыльц|веранд|столов|kitchen|hall|corridor|entry|entrance|vestibule|porch|veranda|dining/i
const DRY = /спальн|зал\b|^зал|гостин|гардероб|кабинет|детск|комнат|bedroom|living|lounge|wardrobe|closet|office|study|nursery|kids|guest room|playroom/i
const BOILER = /кот[её]л|котельн|тепловой узел|топочн|boiler|furnace|mechanical/i
const SKIP = /саун|парилк|парн|гараж|баня|чердак|мансард.*холод|sauna|steam|garage|attic/i

export function classify(name: string, kind?: string): RoomClass {
  if (SKIP.test(name)) return 'skip'
  if (BOILER.test(name)) return 'boiler'
  if (WET.test(name)) return 'wet'
  if (TILE.test(name)) return 'tile'
  if (DRY.test(name)) return 'dry'
  if (/^(Помещение|Room) \d+$/.test(name)) return 'skip'
  if (kind === 'garage') return 'skip'
  if (kind === 'tech') return 'boiler'
  if (kind === 'bath') return 'wet'
  if (kind === 'kitchen' || kind === 'hall') return 'tile'
  return 'dry'
}

export const coverOf = (cls: RoomClass): 'tile' | 'laminate' => (cls === 'dry' ? 'laminate' : 'tile')

export const coverLabel = (c: 'tile' | 'laminate') => t(`networks:heating.cover.${c}`)

export function lossNorm(exteriorSides: number) {
  return exteriorSides >= 2 ? 70 : exteriorSides === 1 ? 60 : 50
}

function sides(walls: { a: Point; b: Point }[]) {
  const dirs: number[] = []
  for (const w of walls) {
    const ang = ((Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x) * 180) / Math.PI + 180) % 180
    if (!dirs.some((d) => Math.min(Math.abs(d - ang), 180 - Math.abs(d - ang)) < 20)) dirs.push(ang)
  }
  return walls.length ? Math.max(1, dirs.length) : 0
}

export function heatRooms(plan: Plan, det: RoomDetection = detectRooms(plan)): HeatRoom[] {
  const out: HeatRoom[] = []
  for (const b of det.buildings) {
    const outer = new Set(b.outlineEdges)
    for (const face of b.rooms) {
      const label = plan.rooms?.find((r) => face.labelIds.includes(r.id))
      const cls = classify(face.name, face.kind ?? label?.kind)
      const ext = face.edges
        .filter((e) => outer.has(e))
        .map((e) => ({ a: det.nodes[e.u], b: det.nodes[e.v], thickness: e.wall.thickness }))
        .filter((w) => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) > 300)
      const exteriorSides = sides(ext)
      out.push({
        face,
        building: b,
        labelId: face.labelIds[0],
        name: face.name,
        cls,
        cover: coverOf(cls),
        exteriorWalls: ext,
        exteriorSides,
        lossWm2: lossNorm(exteriorSides),
        tInside: cls === 'wet' ? 24 : 20,
      })
    }
  }
  return out
}

export function roomOfPoint(rooms: HeatRoom[], p: Point) {
  return rooms.find((r) => pointInPolygon(p, r.face.axisPolygon))
}
