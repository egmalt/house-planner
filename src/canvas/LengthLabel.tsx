import { Group, Rect, Text } from 'react-konva'
import { formatLength, type Point } from '../model'
import { readableAngle } from './camera'
import { canvasTheme } from './theme'

type Props = {
  a: Point
  b: Point
  scale: number
  gap: number
  accent?: boolean
  away?: Point
  onDblClick?: () => void
  onClick?: () => void
  viewRot?: number
}

const FONT = 11
const HEIGHT = 18

export function labelAnchor(a: Point, b: Point, scale: number, gap: number, away?: Point, viewRot = 0) {
  const angle = readableAngle((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI, viewRot)
  const rad = (angle * Math.PI) / 180
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const nx = Math.sin(rad)
  const ny = -Math.cos(rad)
  const flip = away && (mx - away.x) * nx + (my - away.y) * ny < 0 ? -1 : 1
  const offset = flip * (gap + (HEIGHT / 2 + 3) / scale)
  return { x: mx + nx * offset, y: my + ny * offset, angle }
}

export function LengthLabel({ a, b, scale, gap, accent, away, onDblClick, onClick, viewRot = 0 }: Props) {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (len * scale < 36 && !accent) return null
  const { x, y, angle } = labelAnchor(a, b, scale, gap, away, viewRot)
  const text = formatLength(len)
  const width = text.length * 6.6 + 10
  return (
    <Group
      x={x}
      y={y}
      rotation={angle}
      scaleX={1 / scale}
      scaleY={1 / scale}
      listening={!!onDblClick}
      onDblClick={(e) => {
        e.cancelBubble = true
        onDblClick?.()
      }}
      onDblTap={(e) => {
        e.cancelBubble = true
        onDblClick?.()
      }}
      onMouseDown={(e) => {
        e.cancelBubble = true
      }}
      onClick={(e) => {
        e.cancelBubble = true
        onClick?.()
      }}
      onTap={(e) => {
        e.cancelBubble = true
        onClick?.()
      }}
    >
      <Rect
        x={-width / 2}
        y={-HEIGHT / 2}
        width={width}
        height={HEIGHT}
        cornerRadius={5}
        fill={accent ? canvasTheme.accent : 'rgba(255,255,255,0.92)'}
        stroke={accent ? undefined : canvasTheme.rulerLine}
        strokeWidth={1}
      />
      <Text
        x={-width / 2}
        y={-HEIGHT / 2}
        width={width}
        height={HEIGHT}
        align="center"
        verticalAlign="middle"
        text={text}
        fontSize={FONT}
        fontFamily={canvasTheme.font}
        fontStyle="600"
        fill={accent ? '#ffffff' : canvasTheme.ink}
      />
    </Group>
  )
}
