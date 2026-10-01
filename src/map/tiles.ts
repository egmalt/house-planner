import { t } from '../i18n'
import type { Point } from '../model'
import { imageryLngLatToPlan, NO_IMAGERY, planToImageryLngLat, type Geo, type Imagery } from './geo'

export type TileId = { z: number; x: number; y: number }
export type ViewRect = { minX: number; minY: number; maxX: number; maxY: number }
export type TilePlacement = { x: number; y: number; rotation: number; scaleX: number; scaleY: number; skewX: number }

export const TILE_SIZE = 256
export const IMAGERY_MAX_ZOOM = 18
export const IMAGERY_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
export const imageryAttribution = () => t('map:attribution')

const EARTH_CIRCUMFERENCE = 40075016.686
const MAX_TILES = 160

export const tileKey = (t: TileId) => `${t.z}/${t.x}/${t.y}`

export const tileUrl = (t: TileId) =>
  IMAGERY_URL.replace('{z}', String(t.z)).replace('{y}', String(t.y)).replace('{x}', String(t.x))

export function lngLatToTile(lng: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z
  const r = (lat * Math.PI) / 180
  return {
    x: ((lng + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n,
  }
}

export function tileToLngLat(x: number, y: number, z: number): [number, number] {
  const n = 2 ** z
  const lng = (x / n) * 360 - 180
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI
  return [lng, lat]
}

export function metersPerTilePixel(lat: number, z: number): number {
  return (EARTH_CIRCUMFERENCE * Math.cos((lat * Math.PI) / 180)) / (TILE_SIZE * 2 ** z)
}

export function zoomForScale(scale: number, lat: number, pixelRatio = 1): number {
  const screenMetersPerPx = 1 / (1000 * scale * pixelRatio)
  const z = Math.ceil(Math.log2((EARTH_CIRCUMFERENCE * Math.cos((lat * Math.PI) / 180)) / (TILE_SIZE * screenMetersPerPx)) + 0.5)
  return Math.max(0, Math.min(IMAGERY_MAX_ZOOM, z))
}

export function rectCornersLngLat(geo: Geo, rect: ViewRect, im: Imagery = NO_IMAGERY): [number, number][] {
  return [
    planToImageryLngLat({ x: rect.minX, y: rect.minY }, geo, im),
    planToImageryLngLat({ x: rect.maxX, y: rect.minY }, geo, im),
    planToImageryLngLat({ x: rect.maxX, y: rect.maxY }, geo, im),
    planToImageryLngLat({ x: rect.minX, y: rect.maxY }, geo, im),
  ]
}

export type ViewArea = ViewRect | Point[]

const areaCornersLngLat = (geo: Geo, area: ViewArea, im: Imagery) =>
  Array.isArray(area) ? area.map((p) => planToImageryLngLat(p, geo, im)) : rectCornersLngLat(geo, area, im)

export function tileRange(geo: Geo, area: ViewArea, z: number, im: Imagery = NO_IMAGERY) {
  const pts = areaCornersLngLat(geo, area, im).map(([lng, lat]) => lngLatToTile(lng, lat, z))
  const n = 2 ** z
  const clamp = (v: number) => Math.max(0, Math.min(n - 1, v))
  return {
    minX: clamp(Math.floor(Math.min(...pts.map((p) => p.x)))),
    maxX: clamp(Math.floor(Math.max(...pts.map((p) => p.x)))),
    minY: clamp(Math.floor(Math.min(...pts.map((p) => p.y)))),
    maxY: clamp(Math.floor(Math.max(...pts.map((p) => p.y)))),
  }
}

export type ScreenView = { x: number; y: number; scale: number; width: number; height: number; rotationDeg?: number }

export function screenToPlan(view: ScreenView, sx: number, sy: number): Point {
  const a = ((view.rotationDeg ?? 0) * Math.PI) / 180
  const dx = sx - view.x
  const dy = sy - view.y
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: (dx * c + dy * s) / view.scale, y: (-dx * s + dy * c) / view.scale }
}

export function viewCorners(view: ScreenView, marginPx = 0): Point[] {
  const m = marginPx
  return [
    screenToPlan(view, -m, -m),
    screenToPlan(view, view.width + m, -m),
    screenToPlan(view, view.width + m, view.height + m),
    screenToPlan(view, -m, view.height + m),
  ]
}

export function tilesForView(geo: Geo, area: ViewArea, zoom: number, maxTiles = MAX_TILES, im: Imagery = NO_IMAGERY): TileId[] {
  let z = Math.max(0, Math.min(IMAGERY_MAX_ZOOM, Math.round(zoom)))
  let r = tileRange(geo, area, z, im)
  while (z > 0 && (r.maxX - r.minX + 1) * (r.maxY - r.minY + 1) > maxTiles) {
    z -= 1
    r = tileRange(geo, area, z, im)
  }
  const out: TileId[] = []
  for (let y = r.minY; y <= r.maxY; y++) for (let x = r.minX; x <= r.maxX; x++) out.push({ z, x, y })
  return out
}

export function parentTile(t: TileId, levels = 1): TileId {
  const k = 2 ** levels
  return { z: t.z - levels, x: Math.floor(t.x / k), y: Math.floor(t.y / k) }
}

export function tileCornersPlan(geo: Geo, t: TileId, im: Imagery = NO_IMAGERY): { nw: Point; ne: Point; sw: Point } {
  return {
    nw: imageryLngLatToPlan(tileToLngLat(t.x, t.y, t.z), geo, im),
    ne: imageryLngLatToPlan(tileToLngLat(t.x + 1, t.y, t.z), geo, im),
    sw: imageryLngLatToPlan(tileToLngLat(t.x, t.y + 1, t.z), geo, im),
  }
}

export function affineFromCorners(nw: Point, ne: Point, sw: Point, size = TILE_SIZE): TilePlacement {
  const ux = (ne.x - nw.x) / size
  const uy = (ne.y - nw.y) / size
  const vx = (sw.x - nw.x) / size
  const vy = (sw.y - nw.y) / size
  const rot = Math.atan2(uy, ux)
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  const rvx = c * vx + s * vy
  const rvy = -s * vx + c * vy
  return {
    x: nw.x,
    y: nw.y,
    rotation: (rot * 180) / Math.PI,
    scaleX: Math.hypot(ux, uy),
    scaleY: rvy,
    skewX: rvx / rvy,
  }
}

export function tilePlacement(geo: Geo, t: TileId, im: Imagery = NO_IMAGERY): TilePlacement {
  const { nw, ne, sw } = tileCornersPlan(geo, t, im)
  return affineFromCorners(nw, ne, sw)
}

export function tileMatrix(geo: Geo, t: TileId, size = TILE_SIZE, im: Imagery = NO_IMAGERY): [number, number, number, number, number, number] {
  const { nw, ne, sw } = tileCornersPlan(geo, t, im)
  return [(ne.x - nw.x) / size, (ne.y - nw.y) / size, (sw.x - nw.x) / size, (sw.y - nw.y) / size, nw.x, nw.y]
}
