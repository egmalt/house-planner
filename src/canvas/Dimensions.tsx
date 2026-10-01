import { Group, Line, Rect, Text } from 'react-konva'
import { wallAngle, type Point, type Wall } from '../model'
import { readableAngle } from './camera'
import { canvasTheme } from './theme'

type Props = {
  wall: Wall
  spans: [number, number][]
  scale: number
  toward?: Point
  viewRot?: number
}

const LABEL_H = 16

export function Dimensions({ wall, spans, scale, toward, viewRot = 0 }: Props) {
  const px = 1 / scale
  const angle = wallAngle(wall)
  const nx = -Math.sin(angle)
  const ny = Math.cos(angle)
  const mid = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 }
  const sign = toward && (toward.x - mid.x) * nx + (toward.y - mid.y) * ny < 0 ? -1 : 1
  const off = sign * (wall.thickness / 2 + 16 * px)
  const deg = (angle * 180) / Math.PI
  const readable = readableAngle(deg, viewRot) - deg

  return (
    <Group x={wall.a.x} y={wall.a.y} rotation={(angle * 180) / Math.PI} listening={false}>
      {spans
        .filter(([s, e]) => e - s > 1)
        .map(([s, e]) => {
          const text = `${Math.round(e - s)}`
          const w = text.length * 6.4 + 8
          const fits = (e - s) * scale > w + 6
          return (
            <Group key={`${s}-${e}`}>
              <Line points={[s, off, e, off]} stroke={canvasTheme.accent} strokeWidth={1 * px} />
              <Line points={[s, off - 5 * px, s, off + 5 * px]} stroke={canvasTheme.accent} strokeWidth={1 * px} />
              <Line points={[e, off - 5 * px, e, off + 5 * px]} stroke={canvasTheme.accent} strokeWidth={1 * px} />
              {fits && (
              <Group
                x={(s + e) / 2}
                y={off}
                rotation={readable}
                scaleX={px}
                scaleY={px}
              >
                <Rect x={-w / 2} y={-LABEL_H / 2} width={w} height={LABEL_H} cornerRadius={4} fill="#ffffff" stroke={canvasTheme.accent} strokeWidth={1} />
                <Text
                  x={-w / 2}
                  y={-LABEL_H / 2}
                  width={w}
                  height={LABEL_H}
                  align="center"
                  verticalAlign="middle"
                  text={text}
                  fontSize={10.5}
                  fontStyle="600"
                  fontFamily={canvasTheme.font}
                  fill={canvasTheme.accent}
                />
              </Group>
              )}
            </Group>
          )
        })}
    </Group>
  )
}
