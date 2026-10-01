import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Circle, Group, Layer, Line, Rect, Text } from 'react-konva'
import type Konva from 'konva'
import { useTranslation } from 'react-i18next'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { ElectricPoint, ElectricPointKind, Plan, Point } from '../../model'
import { usePlanStore } from '../../store/planStore'
import { useLayers } from '../layers'
import { useNetworkEdit } from '../registry'
import { useSewerUi } from '../sewerStore'
import { useElectricUi } from './store'
import {
  addPoint,
  ceilingOf,
  circuitColor,
  defaultHeight,
  deletePoints,
  electricOf,
  kindLabel,
  pointNormal,
  setPanel,
  snapToWallFace,
  updatePoints,
  withElectric,
} from './model'

type Props = {
  plan: Plan
  scale: number
  viewRot: number
  worldPointer: () => Point | null
  interactive: boolean
}

const INK = '#2b2d33'
const HALO = 'rgba(242, 107, 29, 0.28)'
const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif'
const REACH_PX = 40

const isTyping = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

const semi = (r: number, y0: number, n = 14) => {
  const pts: number[] = []
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI * i) / n
    pts.push(Math.cos(a) * r, y0 + Math.sin(a) * r)
  }
  return pts
}

function Symbol({ kind, color, r }: { kind: ElectricPointKind | 'panel'; color: string; r: number }) {
  const sw = Math.max(1.4, r / 6)
  const common = { stroke: color, strokeWidth: sw, lineCap: 'round' as const, lineJoin: 'round' as const }
  const h = r * 0.35
  const socket = (fill: boolean, dx = 0, rr = r) => (
    <>
      <Line points={[dx, 0, dx, h]} {...common} />
      <Line points={semi(rr, h).map((v, i) => (i % 2 ? v : v + dx))} closed fill={fill ? color : '#ffffff'} {...common} />
      <Line points={[dx - rr * 0.7, h + rr + sw * 1.6, dx + rr * 0.7, h + rr + sw * 1.6]} {...common} />
    </>
  )
  switch (kind) {
    case 'socket':
      return socket(false)
    case 'socket_ip44':
      return socket(true)
    case 'socket2':
      return (
        <>
          {socket(false, -r * 0.62, r * 0.6)}
          {socket(false, r * 0.62, r * 0.6)}
        </>
      )
    case 'outdoor':
      return (
        <>
          {socket(true)}
          <Rect x={-r * 1.15} y={h - sw} width={r * 2.3} height={r * 1.25 + sw * 3} stroke={color} strokeWidth={sw * 0.7} dash={[sw * 2, sw * 1.5]} />
        </>
      )
    case 'power':
      return (
        <>
          {socket(false)}
          <Line points={[-r * 0.45, h + r * 0.15, -r * 0.45, h + r * 0.75]} {...common} />
          <Line points={[0, h + r * 0.15, 0, h + r * 0.9]} {...common} />
          <Line points={[r * 0.45, h + r * 0.15, r * 0.45, h + r * 0.75]} {...common} />
        </>
      )
    case 'switch':
    case 'switch2': {
      const c = r * 0.45
      const cy = h + c
      const flag = (ang: number) => {
        const a = (ang * Math.PI) / 180
        const ex = Math.cos(a) * r * 1.3
        const ey = cy + Math.sin(a) * r * 1.3
        const tx = Math.cos(a + Math.PI / 2) * r * 0.45
        const ty = Math.sin(a + Math.PI / 2) * r * 0.45
        return (
          <>
            <Line points={[Math.cos(a) * c, cy + Math.sin(a) * c, ex, ey]} {...common} />
            <Line points={[ex, ey, ex + tx, ey + ty]} {...common} />
          </>
        )
      }
      return (
        <>
          <Line points={[0, 0, 0, h]} {...common} />
          <Circle x={0} y={cy} radius={c} fill="#ffffff" {...common} />
          {flag(45)}
          {kind === 'switch2' && flag(80)}
        </>
      )
    }
    case 'light':
    case 'light_wall': {
      const cy = kind === 'light_wall' ? h + r * 0.8 : 0
      const k = r * 0.8 * Math.SQRT1_2
      return (
        <>
          {kind === 'light_wall' && <Line points={[0, 0, 0, h]} {...common} />}
          <Circle x={0} y={cy} radius={r * 0.8} fill="#ffffff" {...common} />
          <Line points={[-k, cy - k, k, cy + k]} {...common} />
          <Line points={[-k, cy + k, k, cy - k]} {...common} />
        </>
      )
    }
    case 'junction':
      return (
        <>
          <Circle x={0} y={r * 0.5} radius={r * 0.45} fill="#ffffff" {...common} />
          <Circle x={0} y={r * 0.5} radius={sw} fill={color} />
        </>
      )
    case 'panel':
      return (
        <>
          <Rect x={-r * 1.4} y={0} width={r * 2.8} height={r * 1.2} fill="#ffffff" {...common} />
          <Line points={[-r * 1.4, 0, r * 1.4, 0, r * 1.4, r * 1.2]} closed fill={color} strokeEnabled={false} />
        </>
      )
  }
}

function Tag({ at, text, scale, viewRot }: { at: Point; text: string; scale: number; viewRot: number }) {
  const w = text.length * 6.3 + 12
  return (
    <Group x={at.x} y={at.y} scaleX={1 / scale} scaleY={1 / scale} rotation={-viewRot} listening={false}>
      <Rect x={-w / 2} y={-34} width={w} height={18} cornerRadius={4} fill="#ffffff" stroke={INK} strokeWidth={0.6} opacity={0.96} />
      <Text x={-w / 2} y={-31} width={w} align="center" text={text} fontSize={11} fontFamily={FONT} fill={INK} />
    </Group>
  )
}

function Mounted({
  at,
  normal,
  zoom,
  children,
  selected,
  r,
  ...rest
}: {
  at: Point
  normal: Point | null
  zoom: number
  children: ReactNode
  selected: boolean
  r: number
} & Record<string, unknown>) {
  const rotation = normal ? (Math.atan2(normal.y, normal.x) * 180) / Math.PI - 90 : 0
  return (
    <Group x={at.x} y={at.y} {...rest}>
      <Group scaleX={1 / zoom} scaleY={1 / zoom} rotation={rotation}>
        {selected && <Circle x={0} y={r * 0.6} radius={r * 1.9} fill={HALO} />}
        <Circle x={0} y={r * 0.6} radius={r * 1.5} fill="rgba(0,0,0,0.001)" />
        {children}
      </Group>
    </Group>
  )
}

export function ElectricLayer(props: Props) {
  const on = useLayers((s) => s.electric)
  return on ? <ElectricLayerInner {...props} /> : null
}

type Ghost = { point: Point; wallId?: string; normal: Point | null; ok: boolean }

function ElectricLayerInner({ plan, scale, viewRot, worldPointer, interactive }: Props) {
  const { t } = useTranslation('networks')
  const toolOn = useElectricUi((s) => s.tool)
  const editing = useNetworkEdit((st) => st.editing === 'electric') && interactive
  const tool = editing ? toolOn : null
  const selected = useElectricUi((s) => s.selected)
  const panelSelected = useElectricUi((s) => s.panelSelected)
  const planTool = usePlanStore((s) => s.tool)
  const commit = usePlanStore((s) => s.commit)
  const [ghost, setGhost] = useState<Ghost | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [preview, setPreview] = useState<Plan | null>(null)
  const layerRef = useRef<Konva.Layer>(null)
  const e = electricOf(preview ?? plan)
  const editable = editing && !tool && planTool === 'select'
  const r = Math.max(7, Math.min(16, 150 * scale))

  useEffect(() => {
    if (!tool) setGhost(null)
  }, [tool])

  useEffect(
    () =>
      usePlanStore.subscribe((st, prev) => {
        const picked = st.selectedWallId || st.selectedOpeningId || st.selectedFurnitureId || st.selectedZoneId || st.group
        const was = prev.selectedWallId || prev.selectedOpeningId || prev.selectedFurnitureId || prev.selectedZoneId || prev.group
        if (picked && picked !== was) useElectricUi.getState().select([])
        if (st.tool !== prev.tool && st.tool !== 'select') useElectricUi.getState().setTool(null)
      }),
    [],
  )

  useEffect(
    () =>
      useSewerUi.subscribe((st, prev) => {
        if (st.tool && !prev.tool) useElectricUi.getState().setTool(null)
        if (st.selected && !prev.selected) useElectricUi.getState().select([])
      }),
    [],
  )

  useEffect(() => {
    const stage = layerRef.current?.getStage()
    if (!stage) return
    const onClick = (ev: KonvaEventObject<MouseEvent>) => {
      if (ev.target === stage) useElectricUi.getState().select([])
    }
    stage.on('click.electric tap.electric', onClick)
    return () => {
      stage.off('click.electric tap.electric')
    }
  }, [])

  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      if (isTyping(ev) || ev.metaKey || ev.ctrlKey) return
      const ui = useElectricUi.getState()
      if ((ev.key === 'Delete' || ev.key === 'Backspace') && editing && (ui.selected.length || ui.panelSelected)) {
        const current = usePlanStore.getState().plan
        if (!current) return
        ev.preventDefault()
        commit(ui.panelSelected ? setPanel(current, undefined) : deletePoints(current, ui.selected))
        ui.select([])
      }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [editing, commit])

  const ghostAt = (): Ghost | null => {
    const raw = worldPointer()
    const current = usePlanStore.getState().plan
    if (!raw || !current || !tool) return null
    const ui = useElectricUi.getState()
    const kind = tool === 'light' ? ui.lightKind : null
    if (kind === 'light') return { point: { x: Math.round(raw.x / 50) * 50, y: Math.round(raw.y / 50) * 50 }, normal: null, ok: true }
    const snap = snapToWallFace(current, raw, REACH_PX / scale + 300)
    if (!snap) return { point: raw, normal: null, ok: false }
    return { point: snap.point, wallId: snap.wallId, normal: snap.normal, ok: true }
  }

  const onToolMove = (ev: KonvaEventObject<MouseEvent>) => {
    ev.cancelBubble = true
    setGhost(ghostAt())
  }

  const onToolClick = (ev: KonvaEventObject<MouseEvent | TouchEvent>) => {
    ev.cancelBubble = true
    if ('button' in ev.evt && ev.evt.button !== 0) return
    const current = usePlanStore.getState().plan
    const g = ghostAt()
    if (!current || !g?.ok || !tool) return
    const ui = useElectricUi.getState()
    if (tool === 'panel') {
      const prev = electricOf(current).panel
      commit(setPanel(current, { ...(prev ?? {}), id: prev?.id ?? 'panel', x: g.point.x, y: g.point.y, ...(g.wallId ? { wallId: g.wallId } : {}) }))
      ui.setTool(null)
      ui.selectPanel(true)
      return
    }
    const kind = tool === 'socket' ? ui.socketKind : tool === 'switch' ? ui.switchKind : ui.lightKind
    const circuit = ui.activeCircuit && electricOf(current).circuits.some((c) => c.id === ui.activeCircuit) ? ui.activeCircuit : undefined
    const height = kind === 'light' ? ceilingOf(current) : kind === 'junction' ? ceilingOf(current, g.wallId) - 150 : defaultHeight[kind]
    const res = addPoint(current, {
      kind,
      x: g.point.x,
      y: g.point.y,
      height,
      ...(g.wallId ? { wallId: g.wallId } : {}),
      ...(circuit ? { circuitId: circuit } : {}),
    })
    commit(res.plan)
    ui.select([res.id])
  }

  const snapDrag = (raw: Point, wallOnly: boolean) => {
    const current = usePlanStore.getState().plan
    if (!current) return null
    if (!wallOnly) return { point: { x: Math.round(raw.x / 50) * 50, y: Math.round(raw.y / 50) * 50 }, wallId: undefined as string | undefined }
    const s = snapToWallFace(current, raw, REACH_PX / scale + 300)
    return s ? { point: s.point, wallId: s.wallId as string | undefined } : null
  }

  const pointDrag = (p: ElectricPoint) => (ev: KonvaEventObject<DragEvent>) => {
    const s = snapDrag({ x: ev.target.x(), y: ev.target.y() }, p.kind !== 'light')
    const current = usePlanStore.getState().plan
    if (!s || !current) return
    ev.target.position(s.point)
    setPreview(updatePoints(current, [p.id], { x: s.point.x, y: s.point.y, wallId: s.wallId }))
  }

  const pointDragEnd = (p: ElectricPoint) => (ev: KonvaEventObject<DragEvent>) => {
    const current = usePlanStore.getState().plan
    setPreview(null)
    if (!current) return
    const s = snapDrag({ x: ev.target.x(), y: ev.target.y() }, p.kind !== 'light')
    if (!s) return
    const moved = updatePoints(current, [p.id], { x: s.point.x, y: s.point.y })
    commit(
      withElectric(moved, (x) => ({
        ...x,
        points: x.points.map((q) => {
          if (q.id !== p.id) return q
          const next = { ...q }
          if (s.wallId) next.wallId = s.wallId
          else delete next.wallId
          return next
        }),
      })),
    )
  }

  const panelDrag = (ev: KonvaEventObject<DragEvent>, end: boolean) => {
    const current = usePlanStore.getState().plan
    const panel = current && electricOf(current).panel
    const s = snapDrag({ x: ev.target.x(), y: ev.target.y() }, true)
    if (!current || !panel || !s) return
    ev.target.position(s.point)
    const next = setPanel(current, { ...panel, x: s.point.x, y: s.point.y, ...(s.wallId ? { wallId: s.wallId } : {}) })
    if (end) {
      setPreview(null)
      commit(next)
    } else setPreview(next)
  }

  const pick = (id: string) => (ev: KonvaEventObject<MouseEvent | TouchEvent>) => {
    ev.cancelBubble = true
    if (!editing) {
      setHover(id)
      return
    }
    const ui = useElectricUi.getState()
    const shift = 'shiftKey' in ev.evt && ev.evt.shiftKey
    usePlanStore.getState().selectWall(null)
    useSewerUi.getState().select(null)
    ui.select(shift ? (ui.selected.includes(id) ? ui.selected.filter((x) => x !== id) : [...ui.selected, id]) : [id])
  }

  const hoverPoint = e.points.find((p) => p.id === hover)
  const circuitName = (id?: string) => (id ? (e.circuits.find((c) => c.id === id)?.name ?? id) : t('electric.layerTag.noGroup'))

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
          onMouseDown={(ev) => {
            if (ev.evt.button === 0 && !ev.evt.shiftKey) return
            ev.cancelBubble = true
          }}
          onClick={onToolClick}
          onTap={onToolClick}
          onDblClick={(ev) => {
            ev.cancelBubble = true
          }}
          onContextMenu={(ev) => {
            ev.evt.preventDefault()
            ev.cancelBubble = true
            useElectricUi.getState().setTool(null)
          }}
          onMouseLeave={() => setGhost(null)}
        />
      )}
      {(e.routes ?? []).map((rt, i) => (
        <Line
          key={`rt-${i}`}
          points={rt.path.flatMap((p) => [p.x, p.y])}
          stroke={circuitColor(e, rt.circuitId)}
          strokeWidth={1.6 / scale}
          dash={[7 / scale, 4 / scale]}
          lineJoin="round"
          opacity={0.9}
          listening={false}
        />
      ))}
      {(e.routes ?? []).flatMap((rt, i) =>
        [rt.path[rt.path.length - 1]].map((p) => (
          <Circle key={`drop-${i}`} x={p.x} y={p.y} radius={2.2 / scale} fill={circuitColor(e, rt.circuitId)} listening={false} />
        )),
      )}
      {e.panel && (
        <Mounted
          at={e.panel}
          normal={pointNormal(plan, e.panel)}
          zoom={scale}
          r={r}
          selected={panelSelected}
          draggable={editable}
          onDragMove={(ev: KonvaEventObject<DragEvent>) => panelDrag(ev, false)}
          onDragEnd={(ev: KonvaEventObject<DragEvent>) => panelDrag(ev, true)}
          onMouseDown={(ev: KonvaEventObject<MouseEvent>) => {
            ev.cancelBubble = true
          }}
          onClick={(ev: KonvaEventObject<MouseEvent>) => {
            ev.cancelBubble = true
            if (!editing) return
            usePlanStore.getState().selectWall(null)
            useElectricUi.getState().selectPanel(true)
          }}
          onMouseEnter={() => setHover('panel')}
          onMouseLeave={() => setHover(null)}
          listening={!tool}
        >
          <Symbol kind="panel" color={INK} r={r} />
        </Mounted>
      )}
      {e.points.map((p) => (
        <Mounted
          key={p.id}
          at={p}
          normal={pointNormal(plan, p)}
          zoom={scale}
          r={r}
          selected={selected.includes(p.id)}
          draggable={editable}
          listening={!tool}
          onDragMove={pointDrag(p)}
          onDragEnd={pointDragEnd(p)}
          onMouseDown={(ev: KonvaEventObject<MouseEvent>) => {
            ev.cancelBubble = true
          }}
          onClick={pick(p.id)}
          onTap={pick(p.id)}
          onMouseEnter={(ev: KonvaEventObject<MouseEvent>) => {
            setHover(p.id)
            const st = ev.target.getStage()
            if (st && editable) st.container().style.cursor = 'move'
          }}
          onMouseLeave={(ev: KonvaEventObject<MouseEvent>) => {
            setHover((h) => (h === p.id ? null : h))
            const st = ev.target.getStage()
            if (st) st.container().style.cursor = ''
          }}
        >
          <Symbol kind={p.kind} color={circuitColor(e, p.circuitId)} r={r} />
        </Mounted>
      ))}
      {ghost && tool && (
        <Group opacity={ghost.ok ? 0.75 : 0.35} listening={false}>
          <Mounted at={ghost.point} normal={ghost.normal} zoom={scale} r={r} selected={false} listening={false}>
            <Symbol
              kind={
                tool === 'panel'
                  ? 'panel'
                  : tool === 'socket'
                    ? useElectricUi.getState().socketKind
                    : tool === 'switch'
                      ? useElectricUi.getState().switchKind
                      : useElectricUi.getState().lightKind
              }
              color={ghost.ok ? circuitColor(e, useElectricUi.getState().activeCircuit ?? undefined) : '#d9412b'}
              r={r}
            />
          </Mounted>
        </Group>
      )}
      {hoverPoint && (
        <Tag
          at={hoverPoint}
          scale={scale}
          viewRot={viewRot}
          text={`${hoverPoint.label ? `${hoverPoint.label} · ` : ''}${kindLabel(hoverPoint.kind)} · ${t('electric.layerTag.height', { height: hoverPoint.height })} · ${circuitName(hoverPoint.circuitId)}`}
        />
      )}
      {hover === 'panel' && e.panel && <Tag at={e.panel} scale={scale} viewRot={viewRot} text={t('electric.layerTag.panel')} />}
    </Layer>
  )
}
