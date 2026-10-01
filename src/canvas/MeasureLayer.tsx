import { Circle, Group, Line, Rect, Text } from 'react-konva'
import { formatNumber, type Point } from '../model'
import { t } from '../i18n'
import { readableAngle } from './camera'
import type { Measure } from './measure'
import { canvasTheme } from './theme'

type Props = {
  measures: Measure[]
  active: Measure | null
  cursor: Point | null
  scale: number
  viewRot: number
}

const INK = '#1f6feb'

function Segment({ a, b, scale, viewRot, live }: { a: Point; b: Point; scale: number; viewRot: number; live?: boolean }) {
  const px = 1 / scale
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (len < 1) return null
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
  const shown = readableAngle(deg, viewRot)
  const nx = -(b.y - a.y) / len
  const ny = (b.x - a.x) / len
  const tick = 6 * px
  const angleText = `${formatNumber(((-deg % 360) + 360) % 360, 0)}°`
  const m = `${formatNumber(len / 1000, 2)} ${t('common:units.m')}`
  const text = live ? `${m} · ${angleText}` : m
  const w = text.length * 6.6 + 12
  return (
    <Group listening={false}>
      <Line points={[a.x, a.y, b.x, b.y]} stroke={INK} strokeWidth={1.6 * px} dash={live ? [6 * px, 4 * px] : undefined} />
      <Line points={[a.x - nx * tick, a.y - ny * tick, a.x + nx * tick, a.y + ny * tick]} stroke={INK} strokeWidth={1.6 * px} />
      <Line points={[b.x - nx * tick, b.y - ny * tick, b.x + nx * tick, b.y + ny * tick]} stroke={INK} strokeWidth={1.6 * px} />
      <Group x={(a.x + b.x) / 2} y={(a.y + b.y) / 2} rotation={shown} scaleX={px} scaleY={px}>
        <Rect x={-w / 2} y={-22} width={w} height={18} cornerRadius={5} fill={INK} />
        <Text
          x={-w / 2}
          y={-22}
          width={w}
          height={18}
          align="center"
          verticalAlign="middle"
          text={text}
          fontSize={11}
          fontStyle="600"
          fontFamily={canvasTheme.font}
          fill="#ffffff"
        />
      </Group>
    </Group>
  )
}

export function MeasureLayer({ measures, active, cursor, scale, viewRot }: Props) {
  const px = 1 / scale
  const all = active ? [...measures, active] : measures
  const last = active?.points.at(-1)
  return (
    <>
      {all.map((m, i) =>
        m.points.slice(1).map((p, j) => <Segment key={`${i}-${j}`} a={m.points[j]} b={p} scale={scale} viewRot={viewRot} />),
      )}
      {all.flatMap((m, i) =>
        m.points.map((p, j) => <Circle key={`p${i}-${j}`} x={p.x} y={p.y} radius={3 * px} fill={INK} listening={false} />),
      )}
      {last && cursor && <Segment a={last} b={cursor} scale={scale} viewRot={viewRot} live />}
      {cursor && <Circle x={cursor.x} y={cursor.y} radius={4 * px} stroke={INK} strokeWidth={1.5 * px} listening={false} />}
    </>
  )
}
