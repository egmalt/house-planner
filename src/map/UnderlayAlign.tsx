import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { Circle, Group, Line, Text } from 'react-konva'
import { useTranslation } from 'react-i18next'
import { fmtNum } from '../i18n'
import { Button } from '../ui'
import type { UnderlayAlign } from './useUnderlayAlign'
import type { ScreenView } from './tiles'
import './underlay-align.css'

const HANDLE_R = 13
const ARM_PX = 110
const PIVOT_COLOR = '#f26b1d'
const ROTATE_COLOR = '#2b2d33'

type Props = { align: UnderlayAlign; view: ScreenView }

export default function UnderlayAlignOverlay({ align, view }: Props) {
  if (!align.geo) return null
  const k = 1 / view.scale
  const a = (align.handleAngle * Math.PI) / 180
  const arm = ARM_PX * k
  const p = align.pivot
  const h = { x: p.x + Math.cos(a) * arm, y: p.y + Math.sin(a) * arm }
  const counter = -(view.rotationDeg ?? 0)

  const pos = (e: KonvaEventObject<DragEvent>) => ({ x: e.target.x(), y: e.target.y() })
  const angleOf = (node: Konva.Node) => (Math.atan2(node.y() - p.y, node.x() - p.x) * 180) / Math.PI
  const snapToArm = (node: Konva.Node) => {
    const t = (angleOf(node) * Math.PI) / 180
    node.position({ x: p.x + Math.cos(t) * arm, y: p.y + Math.sin(t) * arm })
  }

  const handle = (label: string, fill: string) => (
    <Group rotation={counter}>
      <Circle radius={HANDLE_R * k} fill={fill} stroke="#ffffff" strokeWidth={2 * k} shadowColor="#000" shadowBlur={4 * k} shadowOpacity={0.4} />
      <Text
        text={label}
        fontSize={12 * k}
        fontStyle="bold"
        fill="#ffffff"
        width={HANDLE_R * 2 * k}
        height={HANDLE_R * 2 * k}
        offsetX={HANDLE_R * k}
        offsetY={HANDLE_R * k}
        align="center"
        verticalAlign="middle"
        listening={false}
      />
    </Group>
  )

  return (
    <Group>
      <Line points={[p.x, p.y, h.x, h.y]} stroke={ROTATE_COLOR} strokeWidth={2 * k} dash={[6 * k, 4 * k]} listening={false} />
      <Group
        x={h.x}
        y={h.y}
        draggable
        onDragStart={align.startRotate}
        onDragMove={(e) => {
          snapToArm(e.target)
          align.rotate(angleOf(e.target))
        }}
        onDragEnd={(e) => {
          snapToArm(e.target)
          align.endRotate(angleOf(e.target))
        }}
        onMouseEnter={(e) => setCursor(e, 'grab')}
        onMouseLeave={(e) => setCursor(e, '')}
      >
        {handle('X', ROTATE_COLOR)}
      </Group>
      <Group
        x={p.x}
        y={p.y}
        draggable
        onDragStart={align.startMove}
        onDragMove={(e) => align.move(pos(e))}
        onDragEnd={(e) => align.endMove(pos(e))}
        onMouseEnter={(e) => setCursor(e, 'move')}
        onMouseLeave={(e) => setCursor(e, '')}
      >
        {handle('0', PIVOT_COLOR)}
      </Group>
    </Group>
  )
}

function setCursor(e: KonvaEventObject<MouseEvent>, cursor: string) {
  const c = e.target.getStage()?.container()
  if (c) c.style.cursor = cursor
}

export function UnderlayAlignControls({ align }: { align: UnderlayAlign }) {
  const { t } = useTranslation('map')
  if (!align.geo) return null
  const im = align.imagery
  return (
    <div className="underlay-align">
      <div className="underlay-align__buttons">
        <Button size="sm" title={t('underlay.ccw1')} onClick={() => align.nudge(-1)}>↺ 1°</Button>
        <Button size="sm" title={t('underlay.ccw01')} onClick={() => align.nudge(-0.1)}>↺ 0.1°</Button>
        <Button size="sm" title={t('underlay.cw01')} onClick={() => align.nudge(0.1)}>↻ 0.1°</Button>
        <Button size="sm" title={t('underlay.cw1')} onClick={() => align.nudge(1)}>↻ 1°</Button>
      </div>
      <div className="underlay-align__geo muted">
        {t('panel.imagery', { e: fmtNum(im.offsetE, 2, 2), n: fmtNum(im.offsetN, 2, 2), rot: fmtNum(im.rotationDeg, 3, 3) })}
      </div>
    </div>
  )
}
