import { Circle, Group, Line, Rect, Text } from 'react-konva'
import { t } from '../i18n'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Opening, Wall } from '../model'
import { readableAngle } from './camera'
import { canvasTheme } from './theme'

export type HandleKind = 'a' | 'b' | 'move'

type Props = {
  wall: Wall
  scale: number
  onStart: (kind: HandleKind, e: KonvaEventObject<MouseEvent | TouchEvent>) => void
  onAdd?: (type: 'door' | 'window') => void
  viewRot?: number
  buttonsAt?: number
}

const R = 6.5

export function Handles({ wall, scale, onStart, onAdd, viewRot = 0, buttonsAt }: Props) {
  const px = 1 / scale
  const start = (kind: HandleKind) => (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if ('button' in e.evt && e.evt.button !== 0) return
    e.cancelBubble = true
    onStart(kind, e)
  }
  const cursor = (value: string) => (e: KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage()
    if (stage) stage.container().style.cursor = value
  }
  const mid = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 }
  const angle = (Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x) * 180) / Math.PI
  const arm = 4

  return (
    <>
      {(['a', 'b'] as const).map((end) => (
        <Circle
          key={end}
          x={wall[end].x}
          y={wall[end].y}
          radius={R * px}
          hitStrokeWidth={10 * px}
          fill="#ffffff"
          stroke={canvasTheme.accent}
          strokeWidth={2.5 * px}
          shadowColor="rgba(0,0,0,0.25)"
          shadowBlur={4 * px}
          shadowOffsetY={1 * px}
          onMouseDown={start(end)}
          onTouchStart={start(end)}
          onMouseEnter={cursor('crosshair')}
          onMouseLeave={cursor('')}
        />
      ))}
      <Group
        x={mid.x}
        y={mid.y}
        rotation={angle}
        scaleX={px}
        scaleY={px}
        onMouseDown={start('move')}
        onTouchStart={start('move')}
        onMouseEnter={cursor('move')}
        onMouseLeave={cursor('')}
      >
        <Circle radius={R + 2} fill={canvasTheme.accent} stroke="#ffffff" strokeWidth={2} hitStrokeWidth={8} />
        <Line points={[-arm, 0, arm, 0]} stroke="#ffffff" strokeWidth={1.6} lineCap="round" listening={false} />
        <Line points={[0, -arm, 0, arm]} stroke="#ffffff" strokeWidth={1.6} lineCap="round" listening={false} />
      </Group>
      {onAdd && (
        <Group
          x={buttonsAt === undefined ? mid.x : wall.a.x + ((wall.b.x - wall.a.x) / (Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) || 1)) * buttonsAt}
          y={buttonsAt === undefined ? mid.y : wall.a.y + ((wall.b.y - wall.a.y) / (Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) || 1)) * buttonsAt}
          rotation={readableAngle(angle, viewRot)}
          scaleX={px}
          scaleY={px}
        >
          {(
            [
              ['door', t('common:canvas.addDoor'), -62],
              ['window', t('common:canvas.addWindow'), 8],
            ] as const
          ).map(([type, text, x]) => (
            <Group
              key={type}
              x={x}
              y={-(wall.thickness * scale) / 2 - 30}
              onMouseDown={(e) => {
                e.cancelBubble = true
              }}
              onClick={(e) => {
                e.cancelBubble = true
                onAdd(type)
              }}
              onTap={(e) => {
                e.cancelBubble = true
                onAdd(type)
              }}
              onMouseEnter={cursor('pointer')}
              onMouseLeave={cursor('')}
            >
              <Rect width={56} height={22} cornerRadius={11} fill="#ffffff" stroke={canvasTheme.accent} strokeWidth={1.2} shadowColor="rgba(0,0,0,0.15)" shadowBlur={4} shadowOffsetY={1} />
              <Text width={56} height={22} align="center" verticalAlign="middle" text={text} fontSize={11} fontStyle="600" fontFamily={canvasTheme.font} fill={canvasTheme.accent} />
            </Group>
          ))}
        </Group>
      )}
    </>
  )
}

type OpeningHandlesProps = {
  wall: Wall
  opening: Opening
  scale: number
  onStart: (edge: 'op-start' | 'op-end', e: KonvaEventObject<MouseEvent | TouchEvent>) => void
}

export function OpeningHandles({ wall, opening, scale, onStart }: OpeningHandlesProps) {
  const px = 1 / scale
  const angle = (Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x) * 180) / Math.PI
  const start = (edge: 'op-start' | 'op-end') => (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if ('button' in e.evt && e.evt.button !== 0) return
    e.cancelBubble = true
    onStart(edge, e)
  }
  const cursor = (value: string) => (e: KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage()
    if (stage) stage.container().style.cursor = value
  }
  return (
    <Group x={wall.a.x} y={wall.a.y} rotation={angle}>
      {(
        [
          ['op-start', opening.offset],
          ['op-end', opening.offset + opening.width],
        ] as const
      ).map(([edge, x]) => (
        <Rect
          key={edge}
          x={x - 4 * px}
          y={-9 * px}
          width={8 * px}
          height={18 * px}
          cornerRadius={3 * px}
          fill="#ffffff"
          stroke={canvasTheme.accent}
          strokeWidth={2 * px}
          hitStrokeWidth={10 * px}
          onMouseDown={start(edge)}
          onTouchStart={start(edge)}
          onMouseEnter={cursor('ew-resize')}
          onMouseLeave={cursor('')}
        />
      ))}
    </Group>
  )
}

type RotateProps = {
  x: number
  y: number
  rotationDeg: number
  depth: number
  scale: number
  onStart: () => void
}

export function FurnitureRotateHandle({ x, y, rotationDeg, depth, scale, onStart }: RotateProps) {
  const px = 1 / scale
  const dist = depth / 2 + 22 * px
  const cursor = (value: string) => (e: KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage()
    if (stage) stage.container().style.cursor = value
  }
  return (
    <Group x={x} y={y} rotation={rotationDeg}>
      <Line points={[0, -depth / 2, 0, -dist]} stroke={canvasTheme.accent} strokeWidth={1.2 * px} listening={false} />
      <Circle
        y={-dist}
        radius={6 * px}
        fill="#ffffff"
        stroke={canvasTheme.accent}
        strokeWidth={2 * px}
        hitStrokeWidth={10 * px}
        onMouseDown={(e) => {
          if (e.evt.button !== 0) return
          e.cancelBubble = true
          onStart()
        }}
        onTouchStart={(e) => {
          e.cancelBubble = true
          onStart()
        }}
        onMouseEnter={cursor('grab')}
        onMouseLeave={cursor('')}
      />
    </Group>
  )
}
