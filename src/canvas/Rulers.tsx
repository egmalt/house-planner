import { Group, Rect, Shape, Text } from 'react-konva'
import { formatMeters } from '../model'
import { t } from '../i18n'
import { labelStep, visibleRect, type Camera } from './camera'
import { canvasTheme, RULER_SIZE } from './theme'

type Props = { cam: Camera; width: number; height: number; cursor: { x: number; y: number } | null; top?: number }

const meters = (mm: number) => formatMeters(mm, 1)

export function Rulers({ cam, width, height, cursor, top = 0 }: Props) {
  const T = top
  const rect = visibleRect(cam, width, height)
  const step = labelStep(cam.scale)
  const sub = step / 5
  const toX = (mm: number) => mm * cam.scale + cam.x
  const toY = (mm: number) => mm * cam.scale + cam.y

  const xs: number[] = []
  for (let v = Math.floor(rect.minX / step) * step; v <= rect.maxX; v += step) xs.push(v)
  const ys: number[] = []
  for (let v = Math.floor(rect.minY / step) * step; v <= rect.maxY; v += step) ys.push(v)

  return (
    <Group listening={false}>
      <Rect x={0} y={T} width={width} height={RULER_SIZE} fill={canvasTheme.ruler} />
      <Rect x={0} y={T} width={RULER_SIZE} height={height - T} fill={canvasTheme.ruler} />
      <Shape
        sceneFunc={(ctx) => {
          const c = ctx._context
          c.beginPath()
          for (let v = Math.floor(rect.minX / sub) * sub; v <= rect.maxX; v += sub) {
            const x = Math.round(toX(v)) + 0.5
            const len = Math.abs(v % step) < 1e-6 ? RULER_SIZE * 0.55 : RULER_SIZE * 0.22
            c.moveTo(x, T + RULER_SIZE)
            c.lineTo(x, T + RULER_SIZE - len)
          }
          for (let v = Math.floor(rect.minY / sub) * sub; v <= rect.maxY; v += sub) {
            const y = Math.round(toY(v)) + 0.5
            if (y < T + RULER_SIZE) continue
            const len = Math.abs(v % step) < 1e-6 ? RULER_SIZE * 0.55 : RULER_SIZE * 0.22
            c.moveTo(RULER_SIZE, y)
            c.lineTo(RULER_SIZE - len, y)
          }
          c.moveTo(0, T + RULER_SIZE + 0.5)
          c.lineTo(width, T + RULER_SIZE + 0.5)
          c.moveTo(RULER_SIZE + 0.5, T)
          c.lineTo(RULER_SIZE + 0.5, height)
          c.strokeStyle = canvasTheme.inkMuted
          c.lineWidth = 1
          c.stroke()
          if (cursor) {
            c.beginPath()
            c.moveTo(toX(cursor.x), T)
            c.lineTo(toX(cursor.x), T + RULER_SIZE)
            c.moveTo(0, toY(cursor.y))
            c.lineTo(RULER_SIZE, toY(cursor.y))
            c.strokeStyle = canvasTheme.accent
            c.stroke()
          }
        }}
      />
      {xs.map((v) => (
        <Text
          key={`x${v}`}
          x={toX(v) + 3}
          y={T + 3}
          text={meters(v)}
          fontSize={10}
          fontFamily={canvasTheme.font}
          fill={canvasTheme.ink}
        />
      ))}
      {ys.filter((v) => toY(v) - 3 > T + RULER_SIZE + 20).map((v) => (
        <Text
          key={`y${v}`}
          x={3}
          y={toY(v) - 3}
          rotation={-90}
          text={meters(v)}
          fontSize={10}
          fontFamily={canvasTheme.font}
          fill={canvasTheme.ink}
        />
      ))}
      <Rect x={0} y={T} width={RULER_SIZE} height={RULER_SIZE} fill={canvasTheme.ruler} />
      <Text
        x={0}
        y={T}
        width={RULER_SIZE}
        height={RULER_SIZE}
        align="center"
        verticalAlign="middle"
        text={t('common:units.m')}
        fontSize={10}
        fontFamily={canvasTheme.font}
        fill={canvasTheme.inkMuted}
      />
    </Group>
  )
}
