import { Circle, Group, Line, Rect, Text } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { distance, formatNumber, polygonAreaMm2, polygonCentroid, sitePolygon, snapToGrid, type Plan, type Point, type Zone } from '../model'
import { t } from '../i18n'
import { LengthLabel } from './LengthLabel'
import { GRID_SNAP, snapAngle } from './snap'
import { canvasTheme } from './theme'

let gravel: HTMLCanvasElement | null = null
function gravelPattern() {
  if (gravel || typeof document === 'undefined') return gravel
  const c = document.createElement('canvas')
  c.width = 12
  c.height = 12
  const ctx = c.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#ece9e3'
    ctx.fillRect(0, 0, 12, 12)
    ctx.fillStyle = '#b9b3a8'
    for (const [x, y] of [
      [2, 2],
      [8, 4],
      [5, 9],
      [10, 10],
    ]) {
      ctx.beginPath()
      ctx.arc(x, y, 0.9, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  gravel = c
  return c
}

const FILLS: Record<Zone['kind'], string> = {
  fill: '#ece9e3',
  lawn: '#e2efd9',
  paving: '#e8e2d8',
  other: '#eceef1',
}

type Props = {
  zone: Zone
  scale: number
  viewRot: number
  listening: boolean
  showDims: boolean
  selected: boolean
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
  onVertexDown: (index: number) => void
  onSideDblClick: (index: number, at: Point) => void
  worldPointer: () => Point | null
}

export function ZoneShape({ zone, scale, viewRot, listening, showDims, selected, onSelect, onHover, onVertexDown, onSideDblClick, worldPointer }: Props) {
  const px = 1 / scale
  const pts = zone.polygon
  const flat = pts.flatMap((p) => [p.x, p.y])
  const pattern = zone.kind === 'fill' ? gravelPattern() : null
  const c = polygonCentroid(pts)
  const area = polygonAreaMm2(pts) / 1e6
  const cursor = (value: string) => (e: KonvaEventObject<MouseEvent>) => {
    const st = e.target.getStage()
    if (st) st.container().style.cursor = value
  }
  return (
    <Group>
      <Line
        points={flat}
        closed
        fill={pattern ? undefined : FILLS[zone.kind]}
        fillPatternImage={(pattern ?? undefined) as HTMLImageElement | undefined}
        fillPatternScale={pattern ? { x: px, y: px } : undefined}
        stroke={selected ? canvasTheme.accent : zone.locked ? '#6f6a60' : '#8f8a80'}
        strokeWidth={(selected ? 2 : zone.locked ? 1.4 : 1) * px}
        dash={selected || zone.locked ? undefined : [6 * px, 3 * px]}
        listening={listening}
        onMouseEnter={(e) => {
          cursor('pointer')(e)
          onHover(zone.id)
        }}
        onMouseLeave={(e) => {
          cursor('')(e)
          onHover(null)
        }}
        onMouseDown={(e) => {
          if (e.evt.button !== 0) return
          e.cancelBubble = true
          onSelect(zone.id)
        }}
        onClick={(e) => {
          e.cancelBubble = true
        }}
        onDblClick={(e) => {
          e.cancelBubble = true
          if (zone.locked) return
          const p = worldPointer()
          if (!p) return
          let best = -1
          let bestD = Infinity
          pts.forEach((a, i) => {
            const b = pts[(i + 1) % pts.length]
            const d = distToSeg(p, a, b)
            if (d < bestD) {
              bestD = d
              best = i
            }
          })
          if (best >= 0 && bestD < 14 / scale) onSideDblClick(best, p)
        }}
      />
      {showDims && (
        <>
          {pts.map((a, i) => (
            <LengthLabel key={i} a={a} b={pts[(i + 1) % pts.length]} scale={scale} gap={0} away={c} viewRot={viewRot} />
          ))}
          <Group x={c.x} y={c.y} rotation={-viewRot} scaleX={px} scaleY={px} listening={false}>
            <Rect x={-70} y={-11} width={140} height={22} cornerRadius={6} fill="rgba(255,255,255,0.92)" />
            <Text
              x={-70}
              y={-11}
              width={140}
              height={22}
              align="center"
              verticalAlign="middle"
              text={`${zone.name} · ${formatNumber(area, 1)} ${t('common:units.m2')}`}
              fontSize={11.5}
              fontStyle="600"
              fontFamily={canvasTheme.font}
              fill={canvasTheme.ink}
            />
          </Group>
        </>
      )}
      {selected &&
        listening &&
        !zone.locked &&
        pts.map((p, i) => (
          <Circle
            key={`v${i}`}
            x={p.x}
            y={p.y}
            radius={6 * px}
            fill="#ffffff"
            stroke={canvasTheme.accent}
            strokeWidth={2 * px}
            hitStrokeWidth={10 * px}
            onMouseDown={(e) => {
              if (e.evt.button !== 0) return
              e.cancelBubble = true
              onVertexDown(i)
            }}
            onMouseEnter={cursor('crosshair')}
            onMouseLeave={cursor('')}
          />
        ))}
    </Group>
  )
}

function distToSeg(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy })
}

export function snapZonePoint(raw: Point, plan: Plan, scale: number, from: Point | null, angle: boolean, skip?: Point): Point {
  if (from && angle) return snapAngle(from, raw)
  const r = 12 / scale
  const site = sitePolygon(plan.site)
  const cands: Point[] = [...site, ...plan.walls.flatMap((w) => [w.a, w.b])]
  for (const z of plan.site.zones ?? []) cands.push(...z.polygon)
  let best: Point | null = null
  let bestD = r
  for (const p of cands) {
    if (skip && p === skip) continue
    const d = distance(raw, p)
    if (d < bestD) {
      best = p
      bestD = d
    }
  }
  if (best) return { x: best.x, y: best.y }
  const er = 8 / scale
  for (let i = 0; i < site.length; i += 1) {
    const a = site[i]
    const b = site[(i + 1) % site.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const l2 = dx * dx + dy * dy
    const t = l2 ? Math.max(0, Math.min(1, ((raw.x - a.x) * dx + (raw.y - a.y) * dy) / l2)) : 0
    const q = { x: a.x + t * dx, y: a.y + t * dy }
    if (distance(raw, q) < er) return { x: Math.round(q.x), y: Math.round(q.y) }
  }
  return snapToGrid(raw, GRID_SNAP)
}
