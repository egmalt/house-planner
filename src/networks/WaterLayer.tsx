import { useEffect, useMemo, useRef, useState } from 'react'
import { Arrow, Circle, Group, Layer, Line, Rect, Text } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { formatLength, type Plan, type Point, type WaterNode, type WaterPipe } from '../model'
import { usePlanStore } from '../store/planStore'
import { detectRooms } from '../stats/rooms'
import { showToast } from '../ui/Toast'
import { t } from '../i18n'
import { useLayers } from './layers'
import { useNetworkEdit } from './registry'
import { findTarget, type SewerTarget } from './sewerSnap'
import { fixtureLabels } from './sewerModel'
import { useWaterUi } from './waterStore'
import { waterClick } from './waterTrace'
import {
  LINE_COLORS,
  LINE_DARK,
  LINE_SHORT,
  collectorLine,
  deleteWaterNode,
  deleteWaterPipe,
  moveWaterNode,
  waterCaption,
  waterKindLabels,
  waterOf,
  wNode,
} from './waterModel'

const BLUE = LINE_COLORS.cold
const INK = '#2b2d33'
const HALO = 'rgba(47, 111, 214, 0.25)'
const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif'

type Props = {
  plan: Plan
  scale: number
  viewRot: number
  worldPointer: () => Point | null
  interactive: boolean
}

const isTyping = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

const pipeWidth = (p: WaterPipe, scale: number) => Math.max(p.diameter, (1 + p.diameter / 16) / scale)

function Tag({ at, text, scale, viewRot, color = BLUE }: { at: Point; text: string; scale: number; viewRot: number; color?: string }) {
  const w = text.length * 6.4 + 12
  return (
    <Group x={at.x} y={at.y} scaleX={1 / scale} scaleY={1 / scale} rotation={-viewRot} listening={false}>
      <Rect x={-w / 2} y={-24} width={w} height={18} cornerRadius={4} fill="#ffffff" stroke={color} strokeWidth={1} />
      <Text x={-w / 2} y={-21} width={w} align="center" text={text} fontSize={11} fontFamily={FONT} fill={INK} />
    </Group>
  )
}

function NodeIcon({ node, selected }: { node: WaterNode; selected: boolean }) {
  const halo = selected ? <Circle radius={13} fill={HALO} /> : null
  const hot = node.line === 'hot' || node.kind === 'boiler'
  const c = hot ? LINE_COLORS.hot : BLUE
  const dark = hot ? LINE_DARK.hot : LINE_DARK.cold
  switch (node.kind) {
    case 'source':
      return (
        <>
          {halo}
          <Circle radius={10} fill="#ffffff" stroke={dark} strokeWidth={2.2} />
          <Circle radius={5} fill={BLUE} />
        </>
      )
    case 'entry':
      return (
        <>
          {halo}
          <Rect x={-6} y={-6} width={12} height={12} rotation={45} fill={dark} stroke="#ffffff" strokeWidth={1.5} />
        </>
      )
    case 'pump':
      return (
        <>
          {halo}
          <Circle radius={9} fill="#ffffff" stroke={dark} strokeWidth={2} />
          <Line points={[-4, -5, 6, 0, -4, 5]} closed fill={dark} />
        </>
      )
    case 'filter':
      return (
        <>
          {halo}
          <Rect x={-7} y={-9} width={14} height={18} cornerRadius={3} fill="#ffffff" stroke={dark} strokeWidth={2} />
          <Line points={[-7, 9, 7, -9]} stroke={dark} strokeWidth={1.4} />
        </>
      )
    case 'boiler':
      return (
        <>
          {halo}
          <Circle radius={10} fill="#ffffff" stroke={LINE_DARK.hot} strokeWidth={2} />
          <Line points={[-9, 0, 9, 0]} stroke={LINE_DARK.hot} strokeWidth={1.4} />
          <Circle radius={3.5} y={4} fill={LINE_COLORS.hot} />
          <Circle radius={3.5} y={-4} fill={BLUE} />
        </>
      )
    case 'collector': {
      const n = Math.max(2, Math.min(8, node.outputs ?? 4))
      const w = 8 + n * 6
      return (
        <>
          {halo}
          <Rect x={-w / 2} y={-5} width={w} height={10} cornerRadius={2} fill={c} stroke="#ffffff" strokeWidth={1.2} />
          {Array.from({ length: n }, (_, i) => (
            <Line key={i} points={[-w / 2 + 7 + i * 6, 5, -w / 2 + 7 + i * 6, 10]} stroke={dark} strokeWidth={1.6} />
          ))}
        </>
      )
    }
    case 'fixture':
      return (
        <>
          {halo}
          <Circle radius={6} fill="#ffffff" stroke={c} strokeWidth={2} />
          <Circle radius={2.4} fill={c} />
        </>
      )
    case 'tap_outdoor':
      return (
        <>
          {halo}
          <Line points={[-7, -6, 7, -6, 0, -6, 0, 7]} stroke={dark} strokeWidth={2.4} lineCap="round" />
          <Circle radius={2.5} y={7} fill={BLUE} />
        </>
      )
    default:
      return (
        <>
          {halo}
          <Circle radius={3.4} fill={c} stroke="#ffffff" strokeWidth={1} />
        </>
      )
  }
}

export function WaterLayer(props: Props) {
  const on = useLayers((s) => s.water)
  return on ? <WaterLayerInner {...props} /> : null
}

function WaterLayerInner({ plan, scale, viewRot, worldPointer, interactive }: Props) {
  const editing = useNetworkEdit((st) => st.editing === 'water') && interactive
  const mode = useWaterUi((s) => s.mode)
  const tool = editing && mode !== 'select'
  const selected = useWaterUi((s) => s.selected)
  const hover = useWaterUi((s) => s.hover)
  const select = useWaterUi((s) => s.select)
  const setHover = useWaterUi((s) => s.setHover)
  const nextKind = useWaterUi((s) => s.nextKind)
  const draft = useWaterUi((s) => s.draft)
  const setDraft = useWaterUi((s) => s.setDraft)
  const planTool = usePlanStore((s) => s.tool)
  const commit = usePlanStore((s) => s.commit)
  const [cursor, setCursor] = useState<SewerTarget | null>(null)
  const [preview, setPreview] = useState<Plan | null>(null)
  const layerRef = useRef<Konva.Layer>(null)

  const shown = preview ?? plan
  const w = waterOf(shown)
  const walls = plan.walls
  const footprints = useMemo(() => detectRooms({ ...plan, walls } as Plan).buildings.map((b) => b.footprint), [walls])
  const editable = editing && !tool && planTool === 'select'

  useEffect(() => {
    if (!tool) {
      setDraft(null)
      setCursor(null)
    }
  }, [tool, setDraft])

  useEffect(() => {
    if (draft && !wNode(waterOf(plan), draft)) setDraft(null)
  }, [plan, draft, setDraft])

  useEffect(
    () =>
      usePlanStore.subscribe((st, prev) => {
        const picked = st.selectedWallId || st.selectedOpeningId || st.selectedFurnitureId || st.selectedZoneId || st.group
        const was = prev.selectedWallId || prev.selectedOpeningId || prev.selectedFurnitureId || prev.selectedZoneId || prev.group
        if (picked && picked !== was) useWaterUi.getState().select(null)
      }),
    [],
  )

  useEffect(() => {
    const stage = layerRef.current?.getStage()
    if (!stage) return
    const onClick = (e: KonvaEventObject<MouseEvent>) => {
      if (e.target === stage) useWaterUi.getState().select(null)
    }
    stage.on('click.water tap.water', onClick)
    return () => {
      stage.off('click.water tap.water')
    }
  }, [])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey) return
      const ui = useWaterUi.getState()
      if (e.key === 'Enter' && ui.draft) {
        ui.setDraft(null)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && ui.selected && editing) {
        const current = usePlanStore.getState().plan
        if (!current) return
        e.preventDefault()
        const ref = ui.selected
        commit(ref.kind === 'node' ? deleteWaterNode(current, ref.id) : deleteWaterPipe(current, ref.id))
        ui.select(null)
      }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [editing, commit])

  const draftNode = draft ? wNode(w, draft) : undefined

  const targetAt = (shift: boolean) => {
    const raw = worldPointer()
    const current = usePlanStore.getState().plan
    if (!raw || !current) return null
    return findTarget(current, raw, scale, draftNode ? { x: draftNode.x, y: draftNode.y } : null, shift, undefined, waterOf(current))
  }

  const onToolMove = (e: KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true
    const t = targetAt(e.evt.shiftKey)
    setCursor(t)
    const h = t?.kind === 'pipe' ? ({ kind: 'pipe', id: t.id } as const) : t?.kind === 'node' ? ({ kind: 'node', id: t.id } as const) : null
    if (h?.id !== hover?.id) setHover(h)
  }

  const onToolClick = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true
    if ('button' in e.evt && e.evt.button !== 0) return
    const current = usePlanStore.getState().plan
    const t = targetAt(e.evt.shiftKey)
    if (!current || !t || mode === 'select') return
    const step = waterClick(current, draft, t, nextKind, mode, footprints)
    if (step.message) showToast(step.message)
    if (step.plan !== current) commit(step.plan)
    setDraft(step.draft)
  }

  const nodeDrag = (n: WaterNode) => (e: KonvaEventObject<DragEvent>) => {
    const raw = { x: e.target.x(), y: e.target.y() }
    const current = usePlanStore.getState().plan
    if (!current) return
    const t = findTarget(current, raw, scale, null, false, n.id, { nodes: [], pipes: [] })
    const pt = t.point
    e.target.position(pt)
    setPreview(moveWaterNode(current, n.id, pt))
  }

  const nodeDragEnd = (n: WaterNode) => (e: KonvaEventObject<DragEvent>) => {
    const current = usePlanStore.getState().plan
    setPreview(null)
    if (current) commit(moveWaterNode(current, n.id, { x: e.target.x(), y: e.target.y() }))
  }

  const pickPipe = (p: WaterPipe) => (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true
    if (!editing) {
      setHover({ kind: 'pipe', id: p.id })
      return
    }
    usePlanStore.getState().selectWall(null)
    select({ kind: 'pipe', id: p.id })
  }

  const cursorPoint = cursor?.point ?? null
  const labelPipes = [hover, selected]
    .filter((r, i, a) => r?.kind === 'pipe' && a.findIndex((x) => x?.id === r.id) === i)
    .map((r) => w.pipes.find((p) => p.id === r!.id))
    .filter(Boolean) as WaterPipe[]
  const lineColor = mode === 'select' ? BLUE : LINE_COLORS[mode]
  const order = (p: WaterPipe) => (p.line === 'cold' ? 0 : p.line === 'hot' ? 1 : 2)

  return (
    <Layer ref={layerRef}>
      {tool && (
        <Rect
          x={-1e7}
          y={-1e7}
          width={2e7}
          height={2e7}
          fill="rgba(0,0,0,0.001)"
          onMouseMove={onToolMove}
          onMouseDown={(e) => {
            if (e.evt.button === 0 && !e.evt.shiftKey) return
            e.cancelBubble = true
          }}
          onClick={onToolClick}
          onTap={onToolClick}
          onDblClick={(e) => {
            e.cancelBubble = true
            setDraft(null)
          }}
          onContextMenu={(e) => {
            e.evt.preventDefault()
            e.cancelBubble = true
            setDraft(null)
          }}
          onMouseLeave={() => setCursor(null)}
        />
      )}
      {[...w.pipes].sort((a, b) => order(a) - order(b)).map((p) => {
        const a = wNode(w, p.from)
        const b = wNode(w, p.to)
        if (!a || !b) return null
        const len = Math.hypot(b.x - a.x, b.y - a.y)
        const ux = (b.x - a.x) / (len || 1)
        const uy = (b.y - a.y) / (len || 1)
        const shift = p.line === 'hot' ? 1 : p.line === 'recirc' ? 2 : 0
        const off = (shift * 4) / scale
        const ax = a.x - uy * off
        const ay = a.y + ux * off
        const bx = b.x - uy * off
        const by = b.y + ux * off
        const mx = (ax + bx) / 2
        const my = (ay + by) / 2
        const wd = pipeWidth(p, scale)
        const on = selected?.id === p.id || hover?.id === p.id
        const dash =
          p.line === 'recirc'
            ? [4 / scale, 3 / scale]
            : p.location === 'outside'
              ? [Math.max(wd * 2.4, 10 / scale), Math.max(wd * 1.3, 6 / scale)]
              : undefined
        const arrow = 6 / scale
        return (
          <Group key={p.id}>
            {on && <Line points={[ax, ay, bx, by]} stroke={HALO} strokeWidth={wd + 10 / scale} lineCap="round" listening={false} />}
            <Line
              points={[ax, ay, bx, by]}
              stroke={LINE_COLORS[p.line]}
              strokeWidth={wd}
              lineCap={dash ? 'butt' : 'round'}
              dash={dash}
              hitStrokeWidth={Math.max(wd, 12 / scale)}
              listening={!tool}
              onClick={pickPipe(p)}
              onTap={pickPipe(p)}
              onMouseEnter={() => setHover({ kind: 'pipe', id: p.id })}
              onMouseLeave={() => useWaterUi.getState().hover?.id === p.id && setHover(null)}
            />
            {len * scale > 40 && (
              <Arrow
                points={[mx - ux * arrow, my - uy * arrow, mx + ux * arrow, my + uy * arrow]}
                stroke={LINE_DARK[p.line]}
                fill={LINE_DARK[p.line]}
                strokeWidth={1.2 / scale}
                pointerLength={4 / scale}
                pointerWidth={4 / scale}
                listening={false}
              />
            )}
          </Group>
        )
      })}
      {w.nodes.map((n) => (
        <Group
          key={n.id}
          x={n.x}
          y={n.y}
          listening={editable || (!editing && n.kind !== 'junction')}
          draggable={editable}
          onMouseDown={(e) => {
            if (!editable || e.evt.button !== 0) return
            e.cancelBubble = true
            usePlanStore.getState().selectWall(null)
            select({ kind: 'node', id: n.id })
          }}
          onClick={(e) => {
            e.cancelBubble = true
          }}
          onTap={(e) => {
            e.cancelBubble = true
            if (!editing) setHover({ kind: 'node', id: n.id })
          }}
          onDragMove={nodeDrag(n)}
          onDragEnd={nodeDragEnd(n)}
          onMouseEnter={(e) => {
            setHover({ kind: 'node', id: n.id })
            const st = e.target.getStage()
            if (st && editable) st.container().style.cursor = 'move'
          }}
          onMouseLeave={(e) => {
            if (useWaterUi.getState().hover?.id === n.id) setHover(null)
            const st = e.target.getStage()
            if (st) st.container().style.cursor = ''
          }}
        >
          <Circle radius={13 / scale} fill="rgba(0,0,0,0.001)" />
          <Group scaleX={1 / scale} scaleY={1 / scale} rotation={-viewRot} listening={false}>
            <NodeIcon node={n} selected={selected?.id === n.id} />
          </Group>
        </Group>
      ))}
      {labelPipes.map((p) => {
        const a = wNode(w, p.from)
        const b = wNode(w, p.to)
        if (!a || !b) return null
        return (
          <Tag
            key={`t-${p.id}`}
            at={{ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }}
            text={`${waterCaption(p)} · ${formatLength(Math.hypot(b.x - a.x, b.y - a.y))}`}
            scale={scale}
            viewRot={viewRot}
            color={LINE_COLORS[p.line]}
          />
        )
      })}
      {hover?.kind === 'node' &&
        (() => {
          const n = wNode(w, hover.id)
          if (!n) return null
          const base = n.kind === 'fixture' && n.fixture ? fixtureLabels[n.fixture] : waterKindLabels[n.kind]
          const extra =
            n.kind === 'collector'
              ? ` ${LINE_SHORT[collectorLine(n) === 'hot' ? 'hot' : 'cold']} · ${t('networks:water.layer.outputs', { value: `${w.pipes.filter((p) => p.from === n.id).length}${n.outputs ? `/${n.outputs}` : ''}` })}`
              : n.kind === 'source'
                ? ` · ${t(n.source === 'well' ? 'networks:water.source.well' : 'networks:water.source.borehole').toLowerCase()}`
                : ''
          return <Tag at={{ x: n.x, y: n.y - 10 / scale }} text={`${n.label || base}${extra}${n.model ? ` · ${n.model}` : ''}`} scale={scale} viewRot={viewRot} />
        })()}
      {tool && draftNode && cursorPoint && (
        <>
          <Line
            points={[draftNode.x, draftNode.y, cursorPoint.x, cursorPoint.y]}
            stroke={lineColor}
            strokeWidth={2 / scale}
            dash={[6 / scale, 4 / scale]}
            listening={false}
          />
          <Tag
            at={{ x: (draftNode.x + cursorPoint.x) / 2, y: (draftNode.y + cursorPoint.y) / 2 }}
            text={formatLength(Math.hypot(cursorPoint.x - draftNode.x, cursorPoint.y - draftNode.y))}
            scale={scale}
            viewRot={viewRot}
            color={lineColor}
          />
        </>
      )}
      {tool && cursorPoint && (
        <Circle
          x={cursorPoint.x}
          y={cursorPoint.y}
          radius={(cursor?.kind === 'point' ? 4 : 8) / scale}
          fill={cursor?.kind === 'point' ? lineColor : HALO}
          stroke={lineColor}
          strokeWidth={1.5 / scale}
          listening={false}
        />
      )}
      {tool && cursor?.kind === 'fixture' && !draft && (
        <Tag at={{ x: cursor.point.x, y: cursor.point.y - 10 / scale }} text={t('networks:water.layer.fromCollector')} scale={scale} viewRot={viewRot} color={lineColor} />
      )}
    </Layer>
  )
}
