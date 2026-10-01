import { useEffect, useMemo, useRef, useState } from 'react'
import { Group, Layer, Line, Rect, Text } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { HeatingLoop, Plan, Point } from '../../model'
import { fmtNum, t } from '../../i18n'
import { usePlanStore } from '../../store/planStore'
import { pointInPolygon } from '../../stats/rooms'
import { useLayers } from '../layers'
import { useNetworkEdit } from '../registry'
import { useSewerUi } from '../sewerStore'
import { computeHeating, type LoopCalc } from './calc'
import { snakeLines, spiralRings } from './geometry'
import { rerouteAll } from './layout'
import { allPolygons, deleteLoop, heatingOf, setCollector, withHeating } from './model'
import { useHeatingUi } from './store'

type Props = {
  plan: Plan
  scale: number
  viewRot: number
  worldPointer: () => Point | null
  interactive: boolean
}

const INK = '#2b2d33'
const SELECT = '#f26b1d'
const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif'
const HOT = [198, 40, 40]
const WARM = [239, 154, 154]
const COOL = [144, 202, 249]
const COLD = [21, 101, 192]

const mix = (a: number[], b: number[], t: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * Math.max(0, Math.min(1, t)))).join(',')})`

const isTyping = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

type Stroke = { points: number[]; color: string }

function loopStrokes(loop: HeatingLoop): Stroke[] {
  const link = loop.linkPath
  const partEntry = link?.length ? link[link.length - 1] : undefined
  return [
    ...zoneStrokes(loop, loop.supplyPath?.length ? loop.supplyPath[loop.supplyPath.length - 1] : undefined),
    ...(loop.parts ?? []).flatMap((p) => zoneStrokes({ ...loop, polygon: p.polygon, excluded: p.excluded }, partEntry)),
  ]
}

function zoneStrokes(loop: HeatingLoop, entry: Point | undefined): Stroke[] {
  if (loop.pattern === 'snake') {
    const path = snakeLines(loop)
    const n = path.length
    if (n < 2) return []
    const out: Stroke[] = []
    const chunk = Math.max(2, Math.ceil(n / 24))
    for (let i = 0; i < n - 1; i += chunk) {
      const seg = path.slice(i, Math.min(n, i + chunk + 1))
      const t = i / (n - 1)
      out.push({ points: seg.flatMap((p) => [p.x, p.y]), color: t < 0.5 ? mix(HOT, WARM, t * 2) : mix(COOL, COLD, (t - 0.5) * 2) })
    }
    return out
  }
  const rings = spiralRings(loop, entry)
  const k = rings.reduce((m, r) => Math.max(m, r.order), 0) + 1
  const nS = Math.ceil(k / 2)
  const nR = Math.floor(k / 2)
  return rings.map((r) => {
    const idx = r.supply ? r.order / 2 : (r.order - 1) / 2
    const t = idx / Math.max(1, (r.supply ? nS : nR) - 1)
    return { points: r.path.flatMap((p) => [p.x, p.y]), color: r.supply ? mix(HOT, WARM, t) : mix(COLD, COOL, t) }
  })
}

function Tag({ at, lines, scale, viewRot }: { at: Point; lines: string[]; scale: number; viewRot: number }) {
  const w = Math.max(...lines.map((l) => l.length)) * 6.3 + 14
  const h = lines.length * 15 + 8
  return (
    <Group x={at.x} y={at.y} scaleX={1 / scale} scaleY={1 / scale} rotation={-viewRot} listening={false}>
      <Rect x={-w / 2} y={-h - 14} width={w} height={h} cornerRadius={4} fill="#ffffff" stroke={INK} strokeWidth={0.6} opacity={0.96} />
      <Text x={-w / 2} y={-h - 9} width={w} align="center" text={lines.join('\n')} lineHeight={1.3} fontSize={11} fontFamily={FONT} fill={INK} />
    </Group>
  )
}

function loopTagLines(c: LoopCalc) {
  return [
    c.roomName,
    `${t('networks:heating.tag.length', { len: Math.round(c.lengthM), step: c.loop.stepMm })}${c.loop.pattern === 'snake' ? t('networks:heating.tag.snake') : ''}`,
    t('networks:heating.tag.area', { area: fmtNum(c.areaM2, 1, 1), power: Math.round(c.powerW), q: Math.round(c.qWm2) }),
  ]
}

export function HeatingLayer(props: Props) {
  const on = useLayers((s) => s.heating)
  return on ? <HeatingLayerInner {...props} /> : null
}

function HeatingLayerInner({ plan, scale, viewRot, worldPointer, interactive }: Props) {
  const editing = useNetworkEdit((st) => st.editing === 'heating') && interactive
  const selected = useHeatingUi((s) => s.selected)
  const collectorSelected = useHeatingUi((s) => s.collectorSelected)
  const commit = usePlanStore((s) => s.commit)
  const planTool = usePlanStore((s) => s.tool)
  const [hover, setHover] = useState<{ id: string; at: Point } | null>(null)
  const [preview, setPreview] = useState<Plan | null>(null)
  const layerRef = useRef<Konva.Layer>(null)
  const shownPlan = preview ?? plan
  const h = heatingOf(shownPlan)
  const calc = useMemo(() => computeHeating(plan), [plan])
  const strokes = useMemo(() => new Map(h.loops.map((l) => [l.id, loopStrokes(l)])), [h.loops])
  const editable = editing && planTool === 'select'

  useEffect(
    () =>
      usePlanStore.subscribe((st, prev) => {
        const picked = st.selectedWallId || st.selectedOpeningId || st.selectedFurnitureId || st.selectedZoneId || st.group
        const was = prev.selectedWallId || prev.selectedOpeningId || prev.selectedFurnitureId || prev.selectedZoneId || prev.group
        if (picked && picked !== was) useHeatingUi.getState().select(null)
      }),
    [],
  )

  useEffect(
    () =>
      useSewerUi.subscribe((st, prev) => {
        if (st.selected && !prev.selected) useHeatingUi.getState().select(null)
      }),
    [],
  )

  useEffect(() => {
    const stage = layerRef.current?.getStage()
    if (!stage) return
    const find = () => {
      const p = worldPointer()
      if (!p) return null
      const loops = heatingOf(usePlanStore.getState().plan ?? plan).loops
      const hit = [...loops].reverse().find((l) => allPolygons(l).some((poly) => pointInPolygon(p, poly)))
      return hit ? { id: hit.id, at: p } : null
    }
    const onMove = () => {
      if (useNetworkEdit.getState().editing === 'heating') return
      const f = find()
      setHover((cur) => (f?.id === cur?.id ? cur : f))
    }
    const onClick = (ev: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (ev.target === stage) useHeatingUi.getState().select(null)
      if (ev.type === 'tap') setHover(find())
    }
    stage.on('mousemove.heating', onMove)
    stage.on('mouseleave.heating', () => setHover(null))
    stage.on('click.heating tap.heating', onClick)
    return () => {
      stage.off('mousemove.heating mouseleave.heating click.heating tap.heating')
    }
  }, [worldPointer, plan])

  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      if (isTyping(ev) || ev.metaKey || ev.ctrlKey || !editing) return
      if (ev.key !== 'Delete' && ev.key !== 'Backspace') return
      const ui = useHeatingUi.getState()
      const current = usePlanStore.getState().plan
      if (!current || !ui.selected) return
      ev.preventDefault()
      commit(deleteLoop(current, ui.selected))
      ui.select(null)
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [editing, commit])

  const collectorDrag = (ev: KonvaEventObject<DragEvent>, end: boolean) => {
    const current = usePlanStore.getState().plan
    const col = current && heatingOf(current).collector
    if (!current || !col) return
    const at = { x: Math.round(ev.target.x() / 10) * 10, y: Math.round(ev.target.y() / 10) * 10 }
    ev.target.position(at)
    const moved = setCollector(current, { ...col, ...at })
    if (end) {
      setPreview(null)
      commit(withHeating(moved, () => rerouteAll(moved)))
    } else setPreview(moved)
  }

  const pickLoop = (id: string) => (ev: KonvaEventObject<MouseEvent | TouchEvent>) => {
    ev.cancelBubble = true
    if (!editing) return
    usePlanStore.getState().selectWall(null)
    useSewerUi.getState().select(null)
    useHeatingUi.getState().select(id)
  }

  const thin = 1 / scale
  const hoverCalc = hover ? calc.loops.find((c) => c.loop.id === hover.id) : undefined
  const col = h.collector
  const colW = col ? 16 + col.outputs * 3 : 0

  return (
    <Layer ref={layerRef}>
      {h.loops.map((l) => (
        <Group key={l.id} opacity={l.off ? 0.25 : 1} listening={false}>
          {(strokes.get(l.id) ?? []).map((s, i) => (
            <Line key={i} points={s.points} stroke={s.color} strokeWidth={Math.max(thin * 1.1, Math.min(16, 0.12 * l.stepMm))} lineJoin="round" lineCap="round" perfectDrawEnabled={false} />
          ))}
          {[...(l.excluded ?? []), ...(l.parts ?? []).flatMap((q) => q.excluded ?? [])].map((e, i) => (
            <Line key={`x${i}`} points={e.flatMap((p) => [p.x, p.y])} closed stroke="#8a8f98" strokeWidth={thin} dash={[4 * thin, 3 * thin]} fill="rgba(138,143,152,0.12)" />
          ))}
        </Group>
      ))}
      {h.loops.flatMap((l) =>
        [l.supplyPath, l.linkPath].map((path, pi) =>
          path && path.length > 1 ? (
            <Group key={`sp-${l.id}-${pi}`} opacity={l.off ? 0.25 : 0.95} listening={false}>
              <Line points={path.flatMap((p) => [p.x, p.y])} stroke="rgb(198,40,40)" strokeWidth={1.4 * thin} dash={[6 * thin, 6 * thin]} lineJoin="round" />
              <Line points={path.flatMap((p) => [p.x, p.y])} stroke="rgb(21,101,192)" strokeWidth={1.4 * thin} dash={[6 * thin, 6 * thin]} dashOffset={6 * thin} lineJoin="round" />
            </Group>
          ) : null,
        ),
      )}
      {h.loops.flatMap((l) => allPolygons(l).map((poly, pi) => (
        <Line
          key={`hit-${l.id}-${pi}`}
          points={poly.flatMap((p) => [p.x, p.y])}
          closed
          fill={editing ? 'rgba(0,0,0,0.001)' : undefined}
          stroke={selected === l.id ? SELECT : hover?.id === l.id ? INK : undefined}
          strokeWidth={(selected === l.id ? 2.2 : 1) * thin}
          dash={l.off ? [5 * thin, 4 * thin] : undefined}
          listening={editing}
          onMouseDown={(ev) => {
            if (ev.evt.button === 0) ev.cancelBubble = true
          }}
          onClick={pickLoop(l.id)}
          onTap={pickLoop(l.id)}
          onMouseEnter={(ev) => {
            const p = worldPointer()
            if (p) setHover({ id: l.id, at: p })
            const st = ev.target.getStage()
            if (st) st.container().style.cursor = 'pointer'
          }}
          onMouseLeave={(ev) => {
            setHover((cur) => (cur?.id === l.id ? null : cur))
            const st = ev.target.getStage()
            if (st) st.container().style.cursor = ''
          }}
        />
      )))}
      {col && (
        <Group
          x={col.x}
          y={col.y}
          draggable={editable}
          listening={editing}
          onDragMove={(ev) => collectorDrag(ev, false)}
          onDragEnd={(ev) => collectorDrag(ev, true)}
          onMouseDown={(ev) => {
            ev.cancelBubble = true
          }}
          onClick={(ev) => {
            ev.cancelBubble = true
            if (!editing) return
            usePlanStore.getState().selectWall(null)
            useHeatingUi.getState().selectCollector(true)
          }}
          onMouseEnter={(ev) => {
            const st = ev.target.getStage()
            if (st && editable) st.container().style.cursor = 'move'
          }}
          onMouseLeave={(ev) => {
            const st = ev.target.getStage()
            if (st) st.container().style.cursor = ''
          }}
        >
          <Group scaleX={1 / scale} scaleY={1 / scale} rotation={-viewRot}>
            {collectorSelected && <Rect x={-colW / 2 - 5} y={-14} width={colW + 10} height={28} cornerRadius={6} fill="rgba(242, 107, 29, 0.28)" />}
            <Rect x={-colW / 2} y={-9} width={colW} height={18} cornerRadius={2} fill="#ffffff" stroke={INK} strokeWidth={1.4} />
            <Rect x={-colW / 2} y={-9} width={colW} height={4} fill="rgb(198,40,40)" />
            <Rect x={-colW / 2} y={5} width={colW} height={4} fill="rgb(21,101,192)" />
            <Text x={-colW / 2} y={-5} width={colW} align="center" text={String(col.outputs)} fontSize={10} fontStyle="bold" fontFamily={FONT} fill={INK} />
          </Group>
        </Group>
      )}
      {hover && hoverCalc && <Tag at={hover.at} lines={loopTagLines(hoverCalc)} scale={scale} viewRot={viewRot} />}
      {hover && !hoverCalc && h.loops.find((l) => l.id === hover.id)?.off && <Tag at={hover.at} lines={[t('networks:heating.tag.excluded', { room: h.loops.find((l) => l.id === hover.id)?.roomName ?? '' })]} scale={scale} viewRot={viewRot} />}
    </Layer>
  )
}
