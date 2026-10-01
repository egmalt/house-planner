import { Shape } from 'react-konva'
import type { Context } from 'konva/lib/Context'
import { gridSteps, visibleRect, type Camera } from './camera'
import { canvasTheme } from './theme'

type Props = { cam: Camera; width: number; height: number; opacity?: number }

export function Grid({ cam, width, height, opacity = 1 }: Props) {
  const rect = visibleRect(cam, width, height)
  const { minor, major } = gridSteps(cam.scale)

  const draw = (ctx: Context, step: number, color: string) => {
    const x0 = Math.floor(rect.minX / step) * step
    const y0 = Math.floor(rect.minY / step) * step
    const c = ctx._context
    c.beginPath()
    for (let x = x0; x <= rect.maxX; x += step) {
      c.moveTo(x, rect.minY)
      c.lineTo(x, rect.maxY)
    }
    for (let y = y0; y <= rect.maxY; y += step) {
      c.moveTo(rect.minX, y)
      c.lineTo(rect.maxX, y)
    }
    c.strokeStyle = color
    c.lineWidth = 1 / cam.scale
    c.stroke()
  }

  return (
    <Shape
      listening={false}
      opacity={opacity}
      perfectDrawEnabled={false}
      sceneFunc={(ctx) => {
        draw(ctx, minor, canvasTheme.gridMinor)
        draw(ctx, major, canvasTheme.gridMajor)
      }}
    />
  )
}
