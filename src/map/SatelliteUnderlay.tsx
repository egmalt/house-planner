import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type Konva from 'konva'
import { Group, Image as KonvaImage } from 'react-konva'
import type { Plan } from '../model'
import { imageryOf, roundGeo, type Geo, type Imagery } from './geo'
import {
  parentTile,
  tileKey,
  tileMatrix,
  tilesForView,
  tileUrl,
  zoomForScale,
  screenToPlan,
  viewCorners,
  type ScreenView,
  TILE_SIZE,
  type TileId,
} from './tiles'

export type UnderlayView = ScreenView

type Props = {
  plan: Plan
  view: UnderlayView
  opacity?: number
  geo?: Geo | null
  imagery?: Imagery | null
}

type Entry = { img: HTMLImageElement; ready: boolean; failed: boolean; waiters: Set<() => void> }

const cache = new Map<string, Entry>()
const CACHE_LIMIT = 600
const ANCESTOR_LEVELS = 6
const MARGIN_PX = 128
const SEAM_PX = 0.5

function loadTile(t: TileId, onReady: () => void): Entry {
  const key = tileKey(t)
  let e = cache.get(key)
  if (e) {
    cache.delete(key)
    cache.set(key, e)
    if (!e.ready && !e.failed) e.waiters.add(onReady)
    return e
  }
  const img = new window.Image()
  img.crossOrigin = 'anonymous'
  const entry: Entry = { img, ready: false, failed: false, waiters: new Set([onReady]) }
  img.onload = () => {
    entry.ready = true
    entry.waiters.forEach((w) => w())
    entry.waiters.clear()
  }
  img.onerror = () => {
    entry.failed = true
    entry.waiters.clear()
  }
  img.src = tileUrl(t)
  cache.set(key, entry)
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
  e = entry
  return e
}

const isReady = (t: TileId) => cache.get(tileKey(t))?.ready === true

function paint(canvas: HTMLCanvasElement, geo: Geo, im: Imagery, orderKey: string, view: UnderlayView, dpr: number) {
  const w = Math.max(1, Math.round(view.width * dpr))
  const h = Math.max(1, Math.round(view.height * dpr))
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  for (const key of orderKey ? orderKey.split('|') : []) {
    const e = cache.get(key)
    if (!e?.ready) continue
    const [z, x, y] = key.split('/').map(Number)
    const m = tileMatrix(geo, { z, x, y }, TILE_SIZE, im)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.translate(view.x, view.y)
    ctx.rotate(((view.rotationDeg ?? 0) * Math.PI) / 180)
    ctx.scale(view.scale, view.scale)
    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5])
    ctx.drawImage(e.img, 0, 0, TILE_SIZE + SEAM_PX, TILE_SIZE + SEAM_PX)
  }
}

export default function SatelliteUnderlay({ plan, view, opacity = 1, geo: override, imagery }: Props) {
  const src = override ?? plan.site.geo
  const lat = src?.lat
  const lng = src?.lng
  const rot = src?.rotationDeg
  const geo = useMemo(
    () => (lat !== undefined && lng !== undefined ? roundGeo({ lat, lng, rotationDeg: rot ?? 0 }) : null),
    [lat, lng, rot],
  )
  const imSrc = imagery ?? imageryOf(plan.site as { imagery?: Partial<Imagery> })
  const { offsetE: ie, offsetN: iN, rotationDeg: ir } = imSrc
  const im = useMemo<Imagery>(() => ({ offsetE: ie, offsetN: iN, rotationDeg: ir }), [ie, iN, ir])
  const [, setTick] = useState(0)
  const [complete, setComplete] = useState<{ geo: typeof geo; tiles: TileId[] }>({ geo: null, tiles: [] })

  const { x: vx, y: vy, scale: vs, width: vw, height: vh, rotationDeg: vr = 0 } = view
  const wanted = useMemo(() => {
    const v = { x: vx, y: vy, scale: vs, width: vw, height: vh, rotationDeg: vr }
    if (!geo || vs <= 0 || vw <= 0 || vh <= 0) return []
    const area = viewCorners(v, MARGIN_PX)
    const dpr = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1)
    return tilesForView(geo, area, zoomForScale(vs, geo.lat, dpr), undefined, im)
  }, [geo, im, vx, vy, vs, vw, vh, vr])

  useEffect(() => {
    let alive = true
    const bump = () => {
      if (!alive) return
      if (wanted.every(isReady)) setComplete({ geo, tiles: wanted })
      else setTick((n) => n + 1)
    }
    for (const t of wanted) loadTile(t, bump)
    if (wanted.length > 0 && wanted.every(isReady)) queueMicrotask(bump)
    return () => {
      alive = false
    }
  }, [wanted, geo])

  const allReady = wanted.length > 0 && wanted.every(isReady)

  const order = (() => {
    if (!geo) return []
    const seen = new Set<string>()
    const back: TileId[] = []
    const fallback: TileId[] = []
    const front: TileId[] = []
    const push = (list: TileId[], t: TileId) => {
      const k = tileKey(t)
      if (seen.has(k)) return
      seen.add(k)
      list.push(t)
    }
    if (!allReady && complete.geo === geo) for (const t of complete.tiles) if (isReady(t)) push(back, t)
    for (const t of wanted) {
      if (isReady(t)) continue
      for (let l = 1; l <= ANCESTOR_LEVELS && t.z - l >= 0; l++) {
        const p = parentTile(t, l)
        if (isReady(p)) {
          push(fallback, p)
          break
        }
      }
    }
    for (const t of wanted) if (isReady(t)) push(front, t)
    fallback.sort((a, b) => a.z - b.z)
    return [...back, ...fallback, ...front]
  })()

  const [canvas] = useState(() => document.createElement('canvas'))
  const imageRef = useRef<Konva.Image>(null)
  const dpr = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1)
  const orderKey = order.map(tileKey).join('|')

  useLayoutEffect(() => {
    if (!geo) return
    paint(canvas, geo, im, orderKey, view, dpr)
    imageRef.current?.getLayer()?.batchDraw()
  }, [canvas, geo, im, orderKey, view, dpr])

  if (!geo) return null
  const topLeft = screenToPlan(view, 0, 0)

  return (
    <Group opacity={opacity} listening={false}>
      <KonvaImage
        ref={imageRef}
        image={canvas}
        x={topLeft.x}
        y={topLeft.y}
        rotation={-(view.rotationDeg ?? 0)}
        width={view.width / view.scale}
        height={view.height / view.scale}
        perfectDrawEnabled={false}
        listening={false}
      />
    </Group>
  )
}
