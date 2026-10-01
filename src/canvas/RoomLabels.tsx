import { Group, Line, Rect, Text } from 'react-konva'
import { formatNumber, type Point } from '../model'
import { t } from '../i18n'
import type { RoomFace } from '../stats/rooms'
import { canvasTheme } from './theme'

function centroid(poly: Point[]): Point {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const k = p.x * q.y - q.x * p.y
    a += k
    cx += (p.x + q.x) * k
    cy += (p.y + q.y) * k
  }
  if (Math.abs(a) < 1e-9) {
    const n = poly.length || 1
    return { x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n }
  }
  return { x: cx / (3 * a), y: cy / (3 * a) }
}

export function RoomHover({ room, scale, viewRot }: { room: RoomFace; scale: number; viewRot: number }) {
  const px = 1 / scale
  const c = centroid(room.clearPolygon)
  const text = `${room.name} · ${formatNumber(room.areaM2, 1)} ${t('common:units.m2')}`
  const w = text.length * 7 + 16
  return (
    <Group listening={false}>
      <Line
        points={room.clearPolygon.flatMap((p) => [p.x, p.y])}
        closed
        fill="rgba(242, 107, 29, 0.08)"
        stroke="rgba(242, 107, 29, 0.35)"
        strokeWidth={1 * px}
      />
      <Group x={c.x} y={c.y} rotation={-viewRot} scaleX={px} scaleY={px}>
        <Rect x={-w / 2} y={-11} width={w} height={22} cornerRadius={6} fill="rgba(255,255,255,0.95)" shadowColor="rgba(0,0,0,0.12)" shadowBlur={4} />
        <Text
          x={-w / 2}
          y={-11}
          width={w}
          height={22}
          align="center"
          verticalAlign="middle"
          text={text}
          fontSize={12}
          fontStyle="600"
          fontFamily={canvasTheme.font}
          fill={canvasTheme.ink}
        />
      </Group>
    </Group>
  )
}
