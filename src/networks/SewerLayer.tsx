import { useEffect, useMemo, useRef, useState } from 'react'
import { useNetworkEdit } from './registry'
import { t } from '../i18n'
import { fmtPct } from './labels'
import { Arrow, Circle, Group, Layer, Line, Rect, Text } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { formatLength, type Plan, type Point, type SewerNode, type SewerPipe } from '../model'
import { usePlanStore } from '../store/planStore'
import { detectRooms } from '../stats/rooms'
import { useLayers } from './layers'
import { useSewerUi } from './sewerStore'
import { findTarget, type SewerTarget } from './sewerSnap'
import { traceClick } from './sewerTrace'
import { DEFAULT_SEPTIC, deleteNode, deletePipe, fixtureLabels, moveNode, nodeById, nodeKindLabels, pipeSlope, sewerOf } from './sewerModel'
import { septicCorners } from './sewerCalc'

export const PIPE_COLOR = '#cf5f1f'
const PIPE_DARK = '#7a3210'
const HALO = 'rgba(242, 107, 29, 0.28)'
const INK = '#2b2d33'
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

const pipeWidth = (p: SewerPipe, scale: number) => Math.max(p.diameter, (p.diameter >= 110 ? 3 : 1.6) / scale)

export const pipeCaption = (p: SewerPipe) =>
  `Ø${p.diameter} · ${fmtPct(pipeSlope(p))}${p.location === 'outside' ? ` · ${t('networks:shared.ui.outsideLower')}` : ''}`

function Tag({ at, text, scale, viewRot, strong }: { at: Point; text: string; scale: number; viewRot: number; strong?: boolean }) {
  const w = text.length * 6.4 + 12
  return (
    <Group x={at.x} y={at.y} scaleX={1 / scale} scaleY={1 / scale} rotation={-viewRot} listening={false}>
      <Rect x={-w / 2} y={-22} width={w} height={18} cornerRadius={4} fill={strong ? PIPE_DARK : '#ffffff'} stroke={PIPE_COLOR} strokeWidth={1} />
      <Text x={-w / 2} y={-19} width={w} align="center" text={text} fontSize={11} fontFamily={FONT} fill={strong ? '#ffffff' : INK} />
    </Group>
  )
}

function NodeIcon({ node, selected }: { node: SewerNode; selected: boolean }) {
  const halo = selected ? <Circle radius={12} fill={HALO} /> : null
  switch (node.kind) {
    case 'fixture':
      return (
        <>
          {halo}
          <Circle radius={6.5} fill="#ffffff" stroke={PIPE_COLOR} strokeWidth={2} />
          <Circle radius={2.6} fill={PIPE_COLOR} />
        </>
      )
    case 'riser':
      return (
        <>
          {halo}
          <Circle radius={8.5} fill="#ffffff" stroke={PIPE_DARK} strokeWidth={2} />
          <Circle radius={4.5} fill={PIPE_COLOR} />
        </>
      )
    case 'cleanout':
      return (
        <>
          {halo}
          <Rect x={-6} y={-6} width={12} height={12} fill="#ffffff" stroke={PIPE_DARK} strokeWidth={1.8} />
          <Line points={[-6, -6, 6, 6]} stroke={PIPE_DARK} strokeWidth={1.4} />
          <Line points={[-6, 6, 6, -6]} stroke={PIPE_DARK} strokeWidth={1.4} />
        </>
      )
    case 'outlet':
      return (
        <>
          {halo}
          <Rect x={-6} y={-6} width={12} height={12} rotation={45} fill={PIPE_DARK} stroke="#ffffff" strokeWidth={1.5} />
        </>
      )
    case 'septic':
      return halo
    default:
      return (
        <>
          {halo}
          <Circle radius={3.8} fill={PIPE_COLOR} stroke="#ffffff" strokeWidth={1} />
        </>
      )
  }
}

function Septic({ node, scale, viewRot, selected }: { node: SewerNode; scale: number; viewRot: number; selected: boolean }) {
  const w = node.w ?? DEFAULT_SEPTIC.w
  const d = node.d ?? DEFAULT_SEPTIC.d
  const hatch = Math.min(w, d) * 0.22
  return (
    <>
      <Group x={node.x} y={node.y} rotation={node.rotationDeg ?? 0} listening={false}>
        <Rect
          x={-w / 2}
          y={-d / 2}
          width={w}
          height={d}
          cornerRadius={Math.min(w, d) / 2}
          fill="rgba(207, 95, 31, 0.12)"
          stroke={selected ? PIPE_DARK : PIPE_COLOR}
          strokeWidth={(selected ? 2.5 : 1.6) / scale}
        />
        <Circle x={-w / 4} radius={hatch} fill="#ffffff" stroke={PIPE_COLOR} strokeWidth={1.2 / scale} />
        <Circle x={w / 4} radius={hatch} fill="#ffffff" stroke={PIPE_COLOR} strokeWidth={1.2 / scale} />
      </Group>
      <Group x={node.x} y={node.y} scaleX={1 / scale} scaleY={1 / scale} rotation={-viewRot} listening={false}>
        <Text x={-80} y={(Math.abs(Math.sin((((node.rotationDeg ?? 0) + viewRot) * Math.PI) / 180)) * w / 2 + Math.abs(Math.cos((((node.rotationDeg ?? 0) + viewRot) * Math.PI) / 180)) * d / 2) * scale + 4} width={160} align="center" text={node.model || node.label || nodeKindLabels.septic} fontSize={11} fontStyle="600" fontFamily={FONT} fill={PIPE_DARK} />
      </Group>
    </>
  )
}

export function SewerLayer(props: Props) {
  const on = useLayers((s) => s.sewer)
  return on ? <SewerLayerInner {...props} /> : null
}

function SewerLayerInner({ plan, scale, viewRot, worldPointer, interactive }: Props) {
  const editing = useNetworkEdit((st) => st.editing === 'sewer') && interactive
  const toolOn = useSewerUi((s) => s.tool)
  const tool = toolOn && editing
  const selected = useSewerUi((s) => s.selected)
  const hover = useSewerUi((s) => s.hover)
  const select = useSewerUi((s) => s.select)
  const setHover = useSewerUi((s) => s.setHover)
  const nextKind = useSewerUi((s) => s.nextKind)
  const planTool = usePlanStore((s) => s.tool)
  const commit = usePlanStore((s) => s.commit)
  const draft = useSewerUi((s) => s.draft)
  const setDraft = useSewerUi((s) => s.setDraft)
  const [cursor, setCursor] = useState<SewerTarget | null>(null)
  const [preview, setPreview] = useState<Plan | null>(null)
  const layerRef = useRef<Konva.Layer>(null)

  const shown = preview ?? plan
  const s = sewerOf(shown)
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
    if (draft && !nodeById(sewerOf(plan), draft)) setDraft(null)
  }, [plan, draft, setDraft])

  useEffect(
    () =>
      usePlanStore.subscribe((st, prev) => {
        const picked = st.selectedWallId || st.selectedOpeningId || st.selectedFurnitureId || st.selectedZoneId || st.group
        const was = prev.selectedWallId || prev.selectedOpeningId || prev.selectedFurnitureId || prev.selectedZoneId || prev.group
        if (picked && picked !== was) useSewerUi.getState().select(null)
      }),
    [],
  )

  useEffect(() => {
    const stage = layerRef.current?.getStage()
    if (!stage) return
    const onClick = (e: KonvaEventObject<MouseEvent>) => {
      if (e.target === stage) useSewerUi.getState().select(null)
    }
    stage.on('click.sewer tap.sewer', onClick)
    return () => {
      stage.off('click.sewer tap.sewer')
    }
  }, [])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey) return
      const ui = useSewerUi.getState()
      if (e.key === 'Enter' && draft) {
        setDraft(null)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && ui.selected && editing) {
        const current = usePlanStore.getState().plan
        if (!current) return
        e.preventDefault()
        const ref = ui.selected
        commit(ref.kind === 'node' ? deleteNode(current, ref.id) : deletePipe(current, ref.id))
        ui.select(null)
      }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [draft, editing, commit, setDraft])

  const draftNode = draft ? nodeById(s, draft) : undefined

  const targetAt = (shift: boolean) => {
    const raw = worldPointer()
    const current = usePlanStore.getState().plan
    if (!raw || !current) return null
    return findTarget(current, raw, scale, draftNode ? { x: draftNode.x, y: draftNode.y } : null, shift)
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
    if (!current || !t) return
    const step = traceClick(current, draft, t, nextKind, footprints)
    if (step.plan !== current) commit(step.plan)
    setDraft(step.draft)
  }

  const nodeDrag = (n: SewerNode) => (e: KonvaEventObject<DragEvent>) => {
    const raw = { x: e.target.x(), y: e.target.y() }
    const current = usePlanStore.getState().plan
    if (!current) return
    const t = findTarget({ ...current, networks: { ...current.networks, sewer: { ...sewerOf(current), pipes: [] } } }, raw, scale, null, false, n.id)
    const pt = t.kind === 'node' ? raw : t.point
    e.target.position(pt)
    setPreview(moveNode(current, n.id, pt))
  }

  const nodeDragEnd = (n: SewerNode) => (e: KonvaEventObject<DragEvent>) => {
    const current = usePlanStore.getState().plan
    setPreview(null)
    if (!current) return
    commit(moveNode(current, n.id, { x: e.target.x(), y: e.target.y() }))
  }

  const pickPipe = (p: SewerPipe) => (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true
    if (!editing) {
      setHover({ kind: 'pipe', id: p.id })
      return
    }
    usePlanStore.getState().selectWall(null)
    select({ kind: 'pipe', id: p.id })
  }

  const cursorPoint = cursor?.point ?? null
  const hoverPipe = hover?.kind === 'pipe' ? s.pipes.find((p) => p.id === hover.id) : undefined
  const selPipe = selected?.kind === 'pipe' ? s.pipes.find((p) => p.id === selected.id) : undefined
  const labelPipes = [hoverPipe, selPipe !== hoverPipe ? selPipe : undefined].filter(Boolean) as SewerPipe[]

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
      {s.nodes.filter((n) => n.kind === 'septic').map((n) => (
        <Septic key={`sep-${n.id}`} node={n} scale={scale} viewRot={viewRot} selected={selected?.id === n.id} />
      ))}
      {s.pipes.map((p) => {
        const a = nodeById(s, p.from)
        const b = nodeById(s, p.to)
        if (!a || !b) return null
        const len = Math.hypot(b.x - a.x, b.y - a.y)
        const ux = (b.x - a.x) / (len || 1)
        const uy = (b.y - a.y) / (len || 1)
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        const arrow = 7 / scale
        const w = pipeWidth(p, scale)
        const on = selected?.id === p.id || hover?.id === p.id
        return (
          <Group key={p.id}>
            {on && <Line points={[a.x, a.y, b.x, b.y]} stroke={HALO} strokeWidth={w + 10 / scale} lineCap="round" listening={false} />}
            <Line
              points={[a.x, a.y, b.x, b.y]}
              stroke={PIPE_COLOR}
              strokeWidth={w}
              lineCap={p.location === 'outside' ? 'butt' : 'round'}
              dash={p.location === 'outside' ? [Math.max(w * 2.4, 10 / scale), Math.max(w * 1.3, 6 / scale)] : undefined}
              hitStrokeWidth={Math.max(w, 12 / scale)}
              listening={!tool}
              onClick={pickPipe(p)}
              onTap={pickPipe(p)}
              onMouseEnter={() => setHover({ kind: 'pipe', id: p.id })}
              onMouseLeave={() => useSewerUi.getState().hover?.id === p.id && setHover(null)}
            />
            {len * scale > 26 && (
              <Arrow
                points={[mx - ux * arrow, my - uy * arrow, mx + ux * arrow, my + uy * arrow]}
                stroke={PIPE_DARK}
                fill={PIPE_DARK}
                strokeWidth={1.4 / scale}
                pointerLength={5 / scale}
                pointerWidth={5 / scale}
                listening={false}
              />
            )}
          </Group>
        )
      })}
      {s.nodes.map((n) => {
        const isSel = selected?.id === n.id
        const size = n.kind === 'septic' ? { w: n.w ?? DEFAULT_SEPTIC.w, d: n.d ?? DEFAULT_SEPTIC.d } : null
        return (
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
              if (useSewerUi.getState().hover?.id === n.id) setHover(null)
              const st = e.target.getStage()
              if (st) st.container().style.cursor = ''
            }}
          >
            {size ? (
              <Rect offsetX={size.w / 2} offsetY={size.d / 2} width={size.w} height={size.d} rotation={n.rotationDeg ?? 0} fill="rgba(0,0,0,0.001)" />
            ) : (
              <Circle radius={12 / scale} fill="rgba(0,0,0,0.001)" />
            )}
            <Group scaleX={1 / scale} scaleY={1 / scale} listening={false}>
              <NodeIcon node={n} selected={isSel} />
            </Group>
          </Group>
        )
      })}
      {s.nodes
        .filter((n) => n.kind === 'septic' && selected?.id === n.id)
        .map((n) => (
          <Line key={`sc-${n.id}`} points={septicCorners(n).flatMap((p) => [p.x, p.y])} closed stroke={HALO} strokeWidth={8 / scale} listening={false} />
        ))}
      {labelPipes.map((p) => {
        const a = nodeById(s, p.from)
        const b = nodeById(s, p.to)
        if (!a || !b) return null
        return (
          <Tag
            key={`t-${p.id}`}
            at={{ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }}
            text={`${pipeCaption(p)} · ${formatLength(Math.hypot(b.x - a.x, b.y - a.y))}`}
            scale={scale}
            viewRot={viewRot}
            strong={selected?.id === p.id}
          />
        )
      })}
      {hover?.kind === 'node' &&
        (() => {
          const n = nodeById(s, hover.id)
          if (!n || n.kind === 'septic') return null
          const text = n.label || (n.kind === 'fixture' && n.fixture ? fixtureLabels[n.fixture] : nodeKindLabels[n.kind])
          return <Tag at={{ x: n.x, y: n.y - 8 / scale }} text={text} scale={scale} viewRot={viewRot} />
        })()}
      {tool && draftNode && cursorPoint && (
        <>
          <Line
            points={[draftNode.x, draftNode.y, cursorPoint.x, cursorPoint.y]}
            stroke={PIPE_COLOR}
            strokeWidth={2 / scale}
            dash={[6 / scale, 4 / scale]}
            listening={false}
          />
          <Tag
            at={{ x: (draftNode.x + cursorPoint.x) / 2, y: (draftNode.y + cursorPoint.y) / 2 }}
            text={formatLength(Math.hypot(cursorPoint.x - draftNode.x, cursorPoint.y - draftNode.y))}
            scale={scale}
            viewRot={viewRot}
          />
        </>
      )}
      {tool && cursorPoint && (
        <Circle
          x={cursorPoint.x}
          y={cursorPoint.y}
          radius={(cursor?.kind === 'point' ? 4 : 8) / scale}
          fill={cursor?.kind === 'point' ? PIPE_COLOR : HALO}
          stroke={PIPE_COLOR}
          strokeWidth={1.5 / scale}
          listening={false}
        />
      )}
      {tool && cursor?.kind === 'fixture' && (
        <Tag at={{ x: cursor.point.x, y: cursor.point.y - 10 / scale }} text={t('networks:sewer.layer.connectFixture')} scale={scale} viewRot={viewRot} />
      )}
    </Layer>
  )
}
