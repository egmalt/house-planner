import type { Opening, Point, Site, Wall } from './schema'
import { numberFormat, t } from '../i18n'

export const distance = (p: Point, q: Point) => Math.hypot(q.x - p.x, q.y - p.y)

export const wallLength = (w: Wall) => distance(w.a, w.b)

export const wallAngle = (w: Wall) => Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x)

export function wallDirection(w: Wall): Point {
  const len = wallLength(w) || 1
  return { x: (w.b.x - w.a.x) / len, y: (w.b.y - w.a.y) / len }
}

export function pointOnWall(w: Wall, offset: number): Point {
  const d = wallDirection(w)
  return { x: w.a.x + d.x * offset, y: w.a.y + d.y * offset }
}

export const openingCenter = (w: Wall, o: Opening) => pointOnWall(w, o.offset + o.width / 2)

export function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return distance(p, a)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy })
}

export const snapToGrid = (p: Point, step: number): Point => ({
  x: Math.round(p.x / step) * step,
  y: Math.round(p.y / step) * step,
})

export function snapOrthogonal(from: Point, to: Point): Point {
  return Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? { x: to.x, y: from.y } : { x: from.x, y: to.y }
}

export function formatNumber(v: number, maxDigits = 2) {
  return numberFormat({ maximumFractionDigits: maxDigits }).format(v)
}

export const formatMeters = (mm: number, maxDigits = 2) => formatNumber(mm / 1000, maxDigits)

export function formatLength(mm: number) {
  if (Math.abs(mm) >= 1000) return `${formatNumber(mm / 1000, 2)} ${t('common:units.m')}`
  return `${Math.round(mm)} ${t('common:units.mm')}`
}

export function nextId(prefix: string, items: { id: string }[]) {
  const used = new Set(items.map((i) => i.id))
  let n = items.length + 1
  while (used.has(`${prefix}${n}`)) n += 1
  return `${prefix}${n}`
}

export function sitePolygon(site: Site): Point[] {
  if (site.boundary && site.boundary.length >= 3) return site.boundary
  return [
    { x: 0, y: 0 },
    { x: site.width, y: 0 },
    { x: site.width, y: site.depth },
    { x: 0, y: site.depth },
  ]
}

export function polygonBounds(points: Point[]) {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
}

export function polygonAreaMm2(points: Point[]) {
  let a = 0
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]
    const q = points[(i + 1) % points.length]
    a += p.x * q.y - q.x * p.y
  }
  return Math.abs(a) / 2
}

export function polygonCentroid(points: Point[]): Point {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]
    const q = points[(i + 1) % points.length]
    const k = p.x * q.y - q.x * p.y
    a += k
    cx += (p.x + q.x) * k
    cy += (p.y + q.y) * k
  }
  if (Math.abs(a) < 1e-9) {
    const n = points.length || 1
    return { x: points.reduce((s, p) => s + p.x, 0) / n, y: points.reduce((s, p) => s + p.y, 0) / n }
  }
  return { x: cx / (3 * a), y: cy / (3 * a) }
}

export const polygonPerimeter = (points: Point[]) =>
  points.reduce((s, p, i) => s + distance(p, points[(i + 1) % points.length]), 0)
