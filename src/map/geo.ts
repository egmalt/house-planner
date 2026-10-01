import proj4 from 'proj4'
import { t } from '../i18n'
import type { Feature, FeatureCollection, Polygon, Position } from 'geojson'
import type { Opening, Plan, Point, Wall } from '../model'

export type Geo = { lat: number; lng: number; rotationDeg: number }
export type LngLat = [number, number]

const converters = new Map<string, proj4.Converter>()

function localProjection(lat: number, lng: number): proj4.Converter {
  const key = `${lat.toFixed(9)},${lng.toFixed(9)}`
  let c = converters.get(key)
  if (!c) {
    c = proj4('WGS84', `+proj=aeqd +lat_0=${lat} +lon_0=${lng} +x_0=0 +y_0=0 +ellps=WGS84 +units=m +no_defs`)
    converters.set(key, c)
  }
  return c
}

const rad = (d: number) => (d * Math.PI) / 180

export function normalizeDeg(d: number): number {
  const r = ((d % 360) + 360) % 360
  return Math.round(r * 1000) / 1000
}

export function roundGeo(g: Geo): Geo {
  return {
    lat: Math.round(g.lat * 1e8) / 1e8,
    lng: Math.round(g.lng * 1e8) / 1e8,
    rotationDeg: normalizeDeg(g.rotationDeg),
  }
}

export function planToEN(p: Point, rotationDeg: number): [number, number] {
  const c = Math.cos(rad(rotationDeg))
  const s = Math.sin(rad(rotationDeg))
  return [(p.x * c + p.y * s) / 1000, (p.x * s - p.y * c) / 1000]
}

export function enToPlan(e: number, n: number, rotationDeg: number): Point {
  const c = Math.cos(rad(rotationDeg))
  const s = Math.sin(rad(rotationDeg))
  return { x: (e * c + n * s) * 1000, y: (e * s - n * c) * 1000 }
}

export function planToLngLat(p: Point, geo: Geo): LngLat {
  const [e, n] = planToEN(p, geo.rotationDeg)
  const [lng, lat] = localProjection(geo.lat, geo.lng).inverse([e, n])
  return [lng, lat]
}

export function lngLatToPlan(ll: LngLat | Position, geo: Geo): Point {
  const [e, n] = localProjection(geo.lat, geo.lng).forward([ll[0], ll[1]])
  return enToPlan(e, n, geo.rotationDeg)
}

export function rotationFromHandle(origin: LngLat, handle: LngLat): number {
  const [e, n] = localProjection(origin[1], origin[0]).forward([handle[0], handle[1]])
  return normalizeDeg((Math.atan2(n, e) * 180) / Math.PI)
}

export function bearingForPlanUp(rotationDeg: number): number {
  return normalizeDeg(-rotationDeg)
}

export function siteRing(plan: Plan): Point[] {
  const { width, depth, boundary } = plan.site
  return boundary && boundary.length >= 3
    ? boundary
    : [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: depth },
        { x: 0, y: depth },
      ]
}

export function ringToFeature(points: Point[], geo: Geo, properties: Record<string, unknown> = {}): Feature<Polygon> {
  const ring = points.map((p) => planToLngLat(p, geo))
  return { type: 'Feature', properties, geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } }
}

function unit(w: Wall) {
  const dx = w.b.x - w.a.x
  const dy = w.b.y - w.a.y
  const len = Math.hypot(dx, dy) || 1
  return { ux: dx / len, uy: dy / len }
}

export function wallOutline(w: Wall): Point[] {
  const { ux, uy } = unit(w)
  const h = w.thickness / 2
  const nx = -uy * h
  const ny = ux * h
  const a = { x: w.a.x - ux * h, y: w.a.y - uy * h }
  const b = { x: w.b.x + ux * h, y: w.b.y + uy * h }
  return [
    { x: a.x + nx, y: a.y + ny },
    { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny },
    { x: a.x - nx, y: a.y - ny },
  ]
}

export function openingOutline(o: Opening, w: Wall): Point[] {
  const { ux, uy } = unit(w)
  const h = w.thickness / 2 + 20
  const nx = -uy * h
  const ny = ux * h
  const a = { x: w.a.x + ux * o.offset, y: w.a.y + uy * o.offset }
  const b = { x: a.x + ux * o.width, y: a.y + uy * o.width }
  return [
    { x: a.x + nx, y: a.y + ny },
    { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny },
    { x: a.x - nx, y: a.y - ny },
  ]
}

export function boundsOf(points: Point[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { minX, minY, maxX, maxY }
}

export function lngLatBounds(points: LngLat[]): [number, number, number, number] {
  const b = boundsOf(points.map(([x, y]) => ({ x, y })))
  return [b.minX, b.minY, b.maxX, b.maxY]
}

export function outerRing(input: unknown): Position[] {
  const gj = input as { type?: string } | null
  let ring: Position[] | undefined
  const fromGeometry = (g: { type?: string; coordinates?: unknown } | null | undefined) => {
    if (g?.type === 'Polygon') return (g.coordinates as Position[][])[0]
    if (g?.type === 'MultiPolygon') return (g.coordinates as Position[][][])[0][0]
    return undefined
  }
  if (Array.isArray(input)) ring = input as Position[]
  else if (gj?.type === 'FeatureCollection') {
    for (const f of (input as FeatureCollection).features) {
      ring = fromGeometry(f.geometry as { type?: string; coordinates?: unknown })
      if (ring) break
    }
  } else if (gj?.type === 'Feature') ring = fromGeometry((input as Feature).geometry as { type?: string; coordinates?: unknown })
  else ring = fromGeometry(gj as { type?: string; coordinates?: unknown })
  if (!ring) throw new Error(t('map:geojson.noPolygon'))
  const first = ring[0]
  const last = ring[ring.length - 1]
  const open = ring.length > 1 && first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring
  if (open.length < 3) throw new Error(t('map:geojson.tooFewVertices'))
  return open
}

function signedArea(points: { x: number; y: number }[]): number {
  let s = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    s += a.x * b.y - b.x * a.y
  }
  return s / 2
}

export function ringAreaM2(points: Point[]): number {
  return Math.abs(signedArea(points)) / 1e6
}

export function geoJSONToBoundary(input: unknown, geo: Geo): Point[] {
  return outerRing(input).map((ll) => {
    const p = lngLatToPlan(ll, geo)
    return { x: Math.round(p.x), y: Math.round(p.y) }
  })
}

export function geoFromPolygon(input: unknown, startIndex = 0): Geo {
  const ring = outerRing(input)
  const n = ring.length
  const origin0 = { lat: ring[0][1], lng: ring[0][0] }
  const en = ring.map((ll) => localProjection(origin0.lat, origin0.lng).forward([ll[0], ll[1]]))
  const cw = signedArea(en.map(([x, y]) => ({ x, y }))) < 0 ? ring : [...ring].reverse()
  const i = ((startIndex % n) + n) % n
  const o = cw[i]
  const next = cw[(i + 1) % n]
  const [e, nn] = localProjection(o[1], o[0]).forward([next[0], next[1]])
  return roundGeo({ lat: o[1], lng: o[0], rotationDeg: (Math.atan2(nn, e) * 180) / Math.PI })
}

export function siteFromGeoJSON(input: unknown, startIndex = 0) {
  const geo = geoFromPolygon(input, startIndex)
  const raw = geoJSONToBoundary(input, geo)
  const ordered = signedArea(raw) < 0 ? [...raw].reverse() : raw
  const o = ordered.reduce((best, p, i) => (Math.hypot(p.x, p.y) < Math.hypot(ordered[best].x, ordered[best].y) ? i : best), 0)
  const boundary = [...ordered.slice(o), ...ordered.slice(0, o)]
  const b = boundsOf(boundary)
  return { geo, boundary, width: b.maxX - b.minX, depth: b.maxY - b.minY }
}

export function rotatePlan(p: Point, deg: number): Point {
  const c = Math.cos(rad(deg))
  const s = Math.sin(rad(deg))
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }
}

export function moveImagery(geo: Geo, rotationDeg: number, pivot: Point, shift: Point = { x: 0, y: 0 }): Geo {
  const r = rotatePlan(pivot, rotationDeg)
  const t = { x: pivot.x - r.x + shift.x, y: pivot.y - r.y + shift.y }
  const back = rotatePlan({ x: -t.x, y: -t.y }, -rotationDeg)
  const [lng, lat] = planToLngLat(back, geo)
  return roundGeo({ lat, lng, rotationDeg: geo.rotationDeg + rotationDeg })
}

export type Imagery = { offsetE: number; offsetN: number; rotationDeg: number }

export const NO_IMAGERY: Imagery = { offsetE: 0, offsetN: 0, rotationDeg: 0 }

export function imageryOf(site: { imagery?: Partial<Imagery> | null }): Imagery {
  const im = site.imagery
  return {
    offsetE: im?.offsetE ?? 0,
    offsetN: im?.offsetN ?? 0,
    rotationDeg: im?.rotationDeg ?? 0,
  }
}

export const isIdentityImagery = (im: Imagery) => im.offsetE === 0 && im.offsetN === 0 && im.rotationDeg === 0

function rotEN(e: number, n: number, deg: number): [number, number] {
  const c = Math.cos(rad(deg))
  const s = Math.sin(rad(deg))
  return [e * c - n * s, e * s + n * c]
}

export function imageryToTrueEN(e: number, n: number, im: Imagery): [number, number] {
  const [re, rn] = rotEN(e, n, im.rotationDeg)
  return [re + im.offsetE, rn + im.offsetN]
}

export function trueToImageryEN(e: number, n: number, im: Imagery): [number, number] {
  return rotEN(e - im.offsetE, n - im.offsetN, -im.rotationDeg)
}

export function imageryLngLatToPlan(ll: LngLat | Position, geo: Geo, im: Imagery): Point {
  const proj = localProjection(geo.lat, geo.lng)
  const [e, n] = proj.forward([ll[0], ll[1]])
  const [te, tn] = imageryToTrueEN(e, n, im)
  return enToPlan(te, tn, geo.rotationDeg)
}

export function planToImageryLngLat(p: Point, geo: Geo, im: Imagery): LngLat {
  const [e, n] = planToEN(p, geo.rotationDeg)
  const [ie, iN] = trueToImageryEN(e, n, im)
  const [lng, lat] = localProjection(geo.lat, geo.lng).inverse([ie, iN])
  return [lng, lat]
}

export function trueLngLatToImagery(ll: LngLat | Position, geo: Geo, im: Imagery): LngLat {
  if (isIdentityImagery(im)) return [ll[0], ll[1]]
  const proj = localProjection(geo.lat, geo.lng)
  const [e, n] = proj.forward([ll[0], ll[1]])
  const [ie, iN] = trueToImageryEN(e, n, im)
  const [lng, lat] = proj.inverse([ie, iN])
  return [lng, lat]
}

export function roundImagery(im: Imagery): Imagery {
  return {
    offsetE: Math.round(im.offsetE * 100) / 100,
    offsetN: Math.round(im.offsetN * 100) / 100,
    rotationDeg: Math.round(im.rotationDeg * 1000) / 1000,
  }
}

export function moveImageryInPlan(im: Imagery, geo: Geo, rotationDeg: number, pivot: Point, shift: Point = { x: 0, y: 0 }): Imagery {
  const [pe, pn] = planToEN(pivot, geo.rotationDeg)
  const [de, dn] = planToEN(shift, geo.rotationDeg)
  const phi = -rotationDeg
  const [oe, on] = rotEN(im.offsetE - pe, im.offsetN - pn, phi)
  return roundImagery({ offsetE: oe + pe + de, offsetN: on + pn + dn, rotationDeg: im.rotationDeg + phi })
}

export function imageryFromDisplayedOrigin(geo: Geo, im: Imagery, originEN: [number, number], displayedAxisDeg?: number): Imagery {
  const r = displayedAxisDeg === undefined ? im.rotationDeg : geo.rotationDeg - displayedAxisDeg
  const [qe, qn] = rotEN(originEN[0], originEN[1], r)
  return roundImagery({ offsetE: -qe, offsetN: -qn, rotationDeg: r })
}

export function enOf(ll: LngLat | Position, geo: Geo): [number, number] {
  const [e, n] = localProjection(geo.lat, geo.lng).forward([ll[0], ll[1]])
  return [e, n]
}
