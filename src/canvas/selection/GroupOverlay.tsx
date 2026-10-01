import { Arc, Circle, Group, Line, Path, Rect } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { canvasTheme } from '../theme'

export const ROTATE_GAP_PX = 28

type Bounds = { minX: number; minY: number; maxX: number; maxY: number }

type Props = {
  bounds: Bounds
  scale: number
  onRotateStart?: (e: KonvaEventObject<MouseEvent | TouchEvent>) => void
}

export function GroupOverlay({ bounds: b, scale, onRotateStart }: Props) {
  const px = 1 / scale
  const cx = (b.minX + b.maxX) / 2
  const hy = b.minY - ROTATE_GAP_PX * px
  const down = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if ('button' in e.evt && e.evt.button !== 0) return
    e.cancelBubble = true
    onRotateStart?.(e)
  }
  const cursor = (value: string) => (e: KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage()
    if (stage) stage.container().style.cursor = value
  }
  return (
    <>
      <Rect
        x={b.minX - 6 * px}
        y={b.minY - 6 * px}
        width={b.maxX - b.minX + 12 * px}
        height={b.maxY - b.minY + 12 * px}
        stroke={canvasTheme.accent}
        strokeWidth={1.5 * px}
        dash={[6 * px, 4 * px]}
        listening={false}
      />
      {onRotateStart && (
        <>
          <Line points={[cx, b.minY - 6 * px, cx, hy]} stroke={canvasTheme.accent} strokeWidth={1.5 * px} listening={false} />
          <Circle
            x={cx}
            y={hy}
            radius={7 * px}
            hitStrokeWidth={12 * px}
            fill="#ffffff"
            stroke={canvasTheme.accent}
            strokeWidth={2.5 * px}
            shadowColor="rgba(0,0,0,0.25)"
            shadowBlur={4 * px}
            shadowOffsetY={1 * px}
            onMouseDown={down}
            onTouchStart={down}
            onMouseEnter={cursor('grab')}
            onMouseLeave={cursor('')}
          />
        </>
      )}
    </>
  )
}

export function CornerHint({ corner, center, scale }: { corner: { x: number; y: number }; center: { x: number; y: number }; scale: number }) {
  const px = 1 / scale
  const out = (Math.atan2(corner.y - center.y, corner.x - center.x) * 180) / Math.PI
  return (
    <Arc
      x={corner.x}
      y={corner.y}
      innerRadius={15 * px}
      outerRadius={17 * px}
      angle={70}
      rotation={out - 35}
      fill={canvasTheme.accent}
      listening={false}
    />
  )
}

const MOVE_ICON =
  'M0 -7 L-2.6 -4.2 M0 -7 L2.6 -4.2 M0 -7 L0 7 M0 7 L-2.6 4.2 M0 7 L2.6 4.2 M-7 0 L-4.2 -2.6 M-7 0 L-4.2 2.6 M-7 0 L7 0 M7 0 L4.2 -2.6 M7 0 L4.2 2.6'

export function MoveHandle({
  at,
  scale,
  viewRot,
  onStart,
}: {
  at: { x: number; y: number }
  scale: number
  viewRot: number
  onStart: (e: KonvaEventObject<MouseEvent | TouchEvent>) => void
}) {
  const down = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if ('button' in e.evt && e.evt.button !== 0) return
    e.cancelBubble = true
    onStart(e)
  }
  const cursor = (value: string) => (e: KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage()
    if (stage) stage.container().style.cursor = value
  }
  return (
    <Group
      x={at.x}
      y={at.y}
      scaleX={1 / scale}
      scaleY={1 / scale}
      rotation={-viewRot}
      onMouseDown={down}
      onTouchStart={down}
      onMouseEnter={cursor('move')}
      onMouseLeave={cursor('')}
    >
      <Circle
        radius={13}
        fill="#ffffff"
        stroke={canvasTheme.accent}
        strokeWidth={2}
        shadowColor="rgba(0,0,0,0.25)"
        shadowBlur={4}
        shadowOffsetY={1}
        hitStrokeWidth={8}
      />
      <Path data={MOVE_ICON} stroke={canvasTheme.accent} strokeWidth={1.8} lineCap="round" lineJoin="round" listening={false} />
    </Group>
  )
}

export function GuideLines({ guides, scale }: { guides: { a: { x: number; y: number }; b: { x: number; y: number } }[]; scale: number }) {
  const px = 1 / scale
  return (
    <>
      {guides.map((g, i) => (
        <Line
          key={i}
          points={[g.a.x, g.a.y, g.b.x, g.b.y]}
          stroke={canvasTheme.accent}
          strokeWidth={1.2 * px}
          dash={[5 * px, 4 * px]}
          listening={false}
        />
      ))}
    </>
  )
}
