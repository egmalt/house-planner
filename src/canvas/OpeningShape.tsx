import { Group, Line, Rect, Shape } from 'react-konva'
import { wallAngle, type Opening, type Wall } from '../model'
import type { KonvaEventObject } from 'konva/lib/Node'
import { canvasTheme } from './theme'

type Props = {
  wall: Wall
  opening: Opening
  scale: number
  selected?: boolean
  ghost?: boolean
  listening?: boolean
  onPointerDown?: (id: string, e: KonvaEventObject<MouseEvent | TouchEvent>) => void
}

export function OpeningShape({ wall, opening: o, scale, selected, ghost, listening, onPointerDown }: Props) {
  const t = wall.thickness
  const px = 1 / scale
  const x0 = o.offset
  const x1 = o.offset + o.width
  const stroke = selected ? canvasTheme.accent : canvasTheme.ink
  const down = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if ('button' in e.evt && e.evt.button !== 0) return
    e.cancelBubble = true
    onPointerDown?.(o.id, e)
  }
  const cursor = (value: string) => (e: KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage()
    if (stage) stage.container().style.cursor = value
  }

  return (
    <Group
      x={wall.a.x}
      y={wall.a.y}
      rotation={(wallAngle(wall) * 180) / Math.PI}
      listening={!!listening}
      opacity={ghost ? 0.75 : 1}
      onMouseDown={down}
      onTouchStart={down}
      onClick={(e) => {
        e.cancelBubble = true
      }}
      onMouseEnter={cursor(selected ? 'ew-resize' : 'pointer')}
      onMouseLeave={cursor('')}
    >
      <Rect
        x={x0}
        y={-t / 2 - 2 * px}
        width={o.width}
        height={t + 4 * px}
        fill={ghost ? canvasTheme.accentSoft : canvasTheme.opening}
        hitStrokeWidth={0}
      />
      {selected && (
        <Rect
          x={x0}
          y={-t / 2 - 4 * px}
          width={o.width}
          height={t + 8 * px}
          stroke={canvasTheme.accent}
          strokeWidth={2 * px}
          cornerRadius={2 * px}
          listening={false}
        />
      )}
      <Line points={[x0, -t / 2, x0, t / 2]} stroke={stroke} strokeWidth={1.5 * px} listening={false} />
      <Line points={[x1, -t / 2, x1, t / 2]} stroke={stroke} strokeWidth={1.5 * px} listening={false} />
      {o.type === 'window' ? (
        <WindowSymbol x0={x0} x1={x1} t={t} px={px} />
      ) : o.type === 'gate' ? (
        <GateSymbol o={o} t={t} px={px} />
      ) : (
        <DoorSymbol o={o} t={t} px={px} />
      )}
      <Rect x={x0} y={-Math.max(t / 2, 8 * px)} width={o.width} height={Math.max(t, 16 * px)} fill="transparent" />
    </Group>
  )
}

function GateSymbol({ o, t, px }: { o: Opening; t: number; px: number }) {
  const sign = o.side === 'left' ? -1 : 1
  const y0 = (sign * t) / 2
  const y1 = y0 + sign * 600
  const x0 = o.offset
  const x1 = o.offset + o.width
  return (
    <>
      <Line points={[x0, y0, x1, y0]} stroke={canvasTheme.ink} strokeWidth={1.2 * px} listening={false} />
      <Line
        points={[x0, y1, x1, y1]}
        stroke={canvasTheme.ink}
        strokeWidth={1.5 * px}
        dash={[8 * px, 5 * px]}
        listening={false}
      />
      <Line points={[x0, y0, x0, y1]} stroke={canvasTheme.inkMuted} strokeWidth={1 * px} dash={[4 * px, 4 * px]} listening={false} />
      <Line points={[x1, y0, x1, y1]} stroke={canvasTheme.inkMuted} strokeWidth={1 * px} dash={[4 * px, 4 * px]} listening={false} />
    </>
  )
}

function WindowSymbol({ x0, x1, t, px }: { x0: number; x1: number; t: number; px: number }) {
  const stroke = canvasTheme.ink
  return (
    <>
      <Rect x={x0} y={-t / 2} width={x1 - x0} height={t} stroke={stroke} strokeWidth={1.2 * px} fill="#eef7fb" />
      <Line points={[x0, -t / 6, x1, -t / 6]} stroke={stroke} strokeWidth={1 * px} />
      <Line points={[x0, t / 6, x1, t / 6]} stroke={stroke} strokeWidth={1 * px} />
    </>
  )
}

function DoorSymbol({ o, t, px }: { o: Opening; t: number; px: number }) {
  const hingeAtEnd = o.hinge === 'end'
  const sign = o.side === 'left' ? -1 : 1
  const hx = hingeAtEnd ? o.offset + o.width : o.offset
  const hy = (sign * t) / 2
  const r = o.width
  const leafAngle = sign > 0 ? Math.PI / 2 : -Math.PI / 2
  const closedAngle = hingeAtEnd ? Math.PI : 0
  const sweep = (((closedAngle - leafAngle) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  const anticlockwise = Math.abs(sweep - Math.PI / 2) > 1e-6

  return (
    <>
      <Line
        points={[hx, hy, hx, hy + sign * r]}
        stroke={canvasTheme.ink}
        strokeWidth={2 * px}
        lineCap="round"
      />
      <Shape
        stroke={canvasTheme.inkMuted}
        strokeWidth={1 * px}
        dash={[6 * px, 4 * px]}
        sceneFunc={(ctx, shape) => {
          ctx.beginPath()
          ctx.arc(hx, hy, r, leafAngle, closedAngle, anticlockwise)
          ctx.strokeShape(shape)
        }}
      />
    </>
  )
}
