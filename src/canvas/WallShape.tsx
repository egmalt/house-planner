import { Line } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Wall } from '../model'
import { canvasTheme } from './theme'

const points = (w: Wall) => [w.a.x, w.a.y, w.b.x, w.b.y]

export function WallOutline({ wall, scale, selected }: { wall: Wall; scale: number; selected: boolean }) {
  return (
    <Line
      points={points(wall)}
      stroke={selected ? canvasTheme.accent : canvasTheme.ink}
      strokeWidth={wall.thickness + (selected ? 6 : 2.5) / scale}
      lineCap="square"
      listening={false}
    />
  )
}

type FillProps = {
  wall: Wall
  color: string
  scale: number
  listening: boolean
  selected: boolean
  onSelect: (id: string) => void
  onDragStart: (id: string, e: KonvaEventObject<MouseEvent | TouchEvent>) => void
  onHover?: (id: string | null) => void
}

const setCursor = (e: KonvaEventObject<MouseEvent>, value: string) => {
  const stage = e.target.getStage()
  if (stage) stage.container().style.cursor = value
}

export function WallFill({ wall, color, scale, listening, selected, onSelect, onDragStart, onHover }: FillProps) {
  return (
    <Line
      points={points(wall)}
      stroke={color}
      strokeWidth={wall.thickness}
      lineCap="square"
      hitStrokeWidth={Math.max(wall.thickness, 12 / scale)}
      listening={listening}
      onMouseDown={(e) => {
        if (e.evt.button !== 0) return
        e.cancelBubble = true
        onSelect(wall.id)
        onDragStart(wall.id, e)
      }}
      onTouchStart={(e) => {
        e.cancelBubble = true
        onSelect(wall.id)
        onDragStart(wall.id, e)
      }}
      onClick={(e) => {
        e.cancelBubble = true
      }}
      onTap={(e) => {
        e.cancelBubble = true
      }}
      onMouseEnter={(e) => {
        setCursor(e, selected ? 'move' : 'pointer')
        onHover?.(wall.id)
      }}
      onMouseLeave={(e) => {
        setCursor(e, '')
        onHover?.(null)
      }}
    />
  )
}
