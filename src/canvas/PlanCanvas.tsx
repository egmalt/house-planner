import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { Circle, Layer, Line, Stage } from 'react-konva'
import type Konva from 'konva'
import { useTranslation } from 'react-i18next'
import type { KonvaEventObject } from 'konva/lib/Node'
import { FurnitureSymbol2D } from '../furniture/Symbol2D'
import { resolveFurniture } from '../furniture/catalog'
import {
  addFurniture,
  addZone,
  deleteZone,
  updateZone,
  deleteFurniture,
  normalizeDeg,
  updateFurniture,
  OPENING_PRESETS,
  addOpening,
  deleteOpening,
  distanceToSegment,
  formatMeters,
  fitOffset,
  fitOffsetClear,
  moveOpening,
  openingGaps,
  resizeOpening,
  snapOffset,
  updateOpening,
  wallDirection,
  type Opening,
  type Wall,
  endpointGroup,
  findMaterial,
  materialColor,
  moveEndpoint,
  moveWall,
  setWallLength,
  sitePolygon,
  wallColor,
  wallLength,
  wallMoveGroup,
  type EndRef,
  type Plan,
  type Point,
} from '../model'
import { redo, undo, usePlanStore } from '../store/planStore'
import { setBusy } from '../storage/busy'
import { isViewOnly, useViewOnly } from '../store/viewOnly'
import { anchorAt, clampScale, fitCamera, northAngle, normRot, toScreen, toWorld, type Camera } from './camera'
import { ViewControls } from './ViewControls'
import { MeasureLayer } from './MeasureLayer'
import { snapZonePoint, ZoneShape } from './ZoneShape'
import { measureTargets, polylineLength, snapMeasure, type Measure } from './measure'
import { RoomHover } from './RoomLabels'
import { detectRooms, pointInPolygon, type RoomFace } from '../stats/rooms'
import { showToast } from '../ui/Toast'
import { useUnderlayAlign, type UnderlayAlign } from '../map/useUnderlayAlign'
import { Grid } from './Grid'
import { FurnitureRotateHandle, Handles, OpeningHandles, type HandleKind } from './Handles'
import { labelAnchor, LengthLabel } from './LengthLabel'
import { Dimensions } from './Dimensions'
import { OpeningShape } from './OpeningShape'
import { Rulers } from './Rulers'
import { GRID_SNAP, snapAngle, snapPoint, type Snap } from './snap'
import { canvasTheme, RULER_SIZE } from './theme'
import { useElementSize } from './useElementSize'
import { SewerLayer, WaterLayer, layerLocks, lockedToast, stopEdit, useBaseOpacity, useLayerLocks, useLayers, useNetworkEdit } from '../networks'
import { ElectricLayer } from '../networks/electric'
import { HeatingLayer } from '../networks/heating'
import { WallFill, WallOutline } from './WallShape'
import { buildingSel, CornerHint, formatDeg, groupRotateDeg, wrapDeg, emptySel, groupGuides, groupPolys, GroupOverlay, GuideLines, mergeSel, MoveHandle, movePlan, polysCenter, rectSel, ROTATE_CURSOR, rotatePlan, selBounds, selCenter, selHas, selectAll, toggleSel, withoutLocked, type ScreenRect, type SelKind, type Selection } from './selection'

const narrowView = () => window.innerWidth <= 760
const rulerTop = () => 0
const headerBottom = () => (narrowView() ? 24 + 6 + 52 : 24 + 8 + 52)
const chromeRect = (selector: string) => {
  const r = document.querySelector(selector)?.getBoundingClientRect()
  return r && r.width > 0 && r.height > 0 ? r : null
}
const fitPadding = (el?: HTMLElement | null) => {
  if (narrowView()) return { left: RULER_SIZE + 12, top: headerBottom() + 12, right: 12, bottom: 86 }
  const c = el?.getBoundingClientRect()
  const header = chromeRect('.header')
  const toolbar = chromeRect('.toolbar')
  const panel = chromeRect('.inspector')
  const left = c && toolbar && toolbar.right < c.left + c.width / 2 ? toolbar.right - c.left : RULER_SIZE
  const right = c && panel && panel.left > c.left + c.width / 2 ? c.right - panel.left : 0
  const top = c && header ? header.bottom - c.top : headerBottom()
  return { left: Math.max(RULER_SIZE, left) + 24, top: Math.max(0, top) + 24, right: Math.max(0, right) + 24, bottom: 24 }
}
const DEFAULT_CAM: Camera = { x: 0, y: 0, scale: 0.05 }
const DRAG_THRESHOLD_PX = 3

type DragKind = HandleKind | 'op-move' | 'op-start' | 'op-end' | 'fur-move' | 'fur-rot' | 'room-move' | 'group-move' | 'group-rot' | 'zone-vertex'

type Ghost = { wallId: string; opening: Opening }

type Drag = {
  kind: DragKind
  wallId: string
  openingId?: string
  furnitureId?: string
  roomId?: string
  zoneId?: string
  vertex?: number
  origin: Point
  originScreen: Point
  base: Plan
  moved: boolean
  pick?: [SelKind, string]
  pivot?: Point
  altPivot?: Point
}

type LengthEdit = { wallId: string; value: string }

type ViewBox = { x: number; y: number; scale: number; width: number; height: number; rotationDeg?: number }

type UnderlayModules = {
  Underlay: ComponentType<{ plan: Plan; view: ViewBox; opacity?: number; geo?: UnderlayAlign['shown']; imagery?: UnderlayAlign['imagery'] }>
  Overlay: ComponentType<{ align: UnderlayAlign; view: ViewBox }>
  Controls: ComponentType<{ align: UnderlayAlign }>
}

function useUnderlay(enabled: boolean) {
  const [mods, setMods] = useState<UnderlayModules | null>(null)
  useEffect(() => {
    if (!enabled || mods) return
    let alive = true
    Promise.all([import('../map/SatelliteUnderlay'), import('../map/UnderlayAlign')])
      .then(([u, a]) => {
        if (alive) setMods({ Underlay: u.default as UnderlayModules['Underlay'], Overlay: a.default, Controls: a.UnderlayAlignControls })
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [enabled, mods])
  return enabled ? mods : null
}

const NO_PLAN = { site: {} } as Plan

type Props = { onCursor?: (p: Point | null, scale: number) => void }

const isTyping = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

export function PlanCanvas({ onCursor }: Props) {
  const { t } = useTranslation('common')
  const [containerRef, size] = useElementSize<HTMLDivElement>()
  const plan = usePlanStore((s) => s.plan)
  const tool = usePlanStore((s) => s.tool)
  const selectedWallId = usePlanStore((s) => s.selectedWallId)
  const selectedOpeningId = usePlanStore((s) => s.selectedOpeningId)
  const selectOpening = usePlanStore((s) => s.selectOpening)
  const doorPreset = usePlanStore((s) => s.doorPreset)
  const selectedFurnitureId = usePlanStore((s) => s.selectedFurnitureId)
  const selectFurniture = usePlanStore((s) => s.selectFurniture)
  const activeMaterialId = usePlanStore((s) => s.activeMaterialId)
  const fitNonce = usePlanStore((s) => s.fitNonce)
  const storedCam = usePlanStore((s) => s.cam)
  const setStoredCam = usePlanStore((s) => s.setCam)
  const selectWall = usePlanStore((s) => s.selectWall)
  const addWall = usePlanStore((s) => s.addWall)
  const deleteWall = usePlanStore((s) => s.deleteWall)
  const setTool = usePlanStore((s) => s.setTool)
  const commit = usePlanStore((s) => s.commit)
  const underlay = usePlanStore((s) => s.underlay)
  const underlayMods = useUnderlay(underlay.on)
  const Underlay = underlayMods?.Underlay ?? null
  const aligning = usePlanStore((s) => s.aligning) && underlay.on && !isViewOnly()
  const setAligning = usePlanStore((s) => s.setAligning)
  const align = useUnderlayAlign(
    plan ?? NO_PLAN,
    (geo) => {
      const current = usePlanStore.getState().plan
      if (current) commit({ ...current, site: { ...current.site, geo } })
    },
    (imagery) => {
      const current = usePlanStore.getState().plan
      if (current) commit({ ...current, site: { ...current.site, imagery } })
    },
  )

  const cam = storedCam ?? DEFAULT_CAM
  const layers = useLayers()
  const locks = useLayerLocks()
  const baseOpacity = useBaseOpacity()
  const viewOnly = useViewOnly()
  const rot = cam.rotation ?? 0
  const [cursor, setCursor] = useState<Snap | null>(null)
  const [draftStart, setDraftStart] = useState<Point | null>(null)
  const [shiftDown, setShiftDown] = useState(false)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [preview, setPreview] = useState<Plan | null>(null)
  const [lengthEdit, setLengthEdit] = useState<LengthEdit | null>(null)
  const [ghost, setGhost] = useState<Ghost | null>(null)
  const [measures, setMeasures] = useState<Measure[]>([])
  const [activeMeasure, setActiveMeasure] = useState<Measure | null>(null)
  const [measureCursor, setMeasureCursor] = useState<Point | null>(null)
  const [roomEdit, setRoomEdit] = useState<{ id: string; value: string } | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ left: number; top: number; at: Point } | null>(null)
  const [hoverRoom, setHoverRoom] = useState<RoomFace | null>(null)
  const group = usePlanStore((s) => s.group)
  const [marquee, setMarquee] = useState<(ScreenRect & { add: boolean }) | null>(null)
  const [groupInfo, setGroupInfo] = useState<{ text: string; at: Point } | null>(null)
  const [hoverCorner, setHoverCorner] = useState<Point | null>(null)
  const [hoverWall, setHoverWall] = useState<string | null>(null)
  const [hoverZone, setHoverZone] = useState<string | null>(null)
  const [zoneDraft, setZoneDraft] = useState<Point[]>([])
  const [zoneCursor, setZoneCursor] = useState<Point | null>(null)
  const selectedZoneId = usePlanStore((s) => s.selectedZoneId)
  const selectZone = usePlanStore((s) => s.selectZone)
  const finishZone = (pts: Point[]) => {
    const current = usePlanStore.getState().plan
    setZoneDraft([])
    if (!current || pts.length < 3) return
    const res = addZone(current, pts)
    commit(res.plan)
    setTool('select')
    selectZone(res.id)
  }
  const showDims = usePlanStore((s) => s.showDims)
  const panRef = useRef(false)
  const suppressClickUntil = useRef(0)

  useEffect(() => {
    setBusy(!!drag || !!lengthEdit)
  }, [drag, lengthEdit])
  const stageRef = useRef<Konva.Stage>(null)
  const fittedRef = useRef(-1)
  const siteKeyRef = useRef<string | null>(null)

  const shown = preview ?? plan
  const hasPlan = !!plan
  const ready = size.width > 0 && size.height > 0

  useEffect(() => {
    if (!hasPlan || !ready || fittedRef.current === fitNonce) return
    const ps = usePlanStore.getState().plan?.site
    siteKeyRef.current = ps ? JSON.stringify([ps.boundary, ps.width, ps.depth]) : null
    const current = usePlanStore.getState().plan
    if (!current) return
    fittedRef.current = fitNonce
    setStoredCam(
      fitCamera(sitePolygon(current.site), size.width, size.height, fitPadding(containerRef.current), usePlanStore.getState().cam?.rotation ?? 0),
    )
  }, [hasPlan, ready, fitNonce, size.width, size.height, setStoredCam])

  const narrowNow = size.width > 0 && size.width <= 760
  const narrowRef = useRef<boolean | null>(null)
  useEffect(() => {
    if (size.width === 0) return
    if (narrowRef.current !== null && narrowRef.current !== narrowNow) usePlanStore.getState().requestFit()
    narrowRef.current = narrowNow
  }, [narrowNow, size.width])

  const siteKey = plan ? JSON.stringify([plan.site.boundary, plan.site.width, plan.site.depth]) : null
  useEffect(() => {
    if (!siteKey || siteKeyRef.current === null || siteKeyRef.current === siteKey) return
    siteKeyRef.current = siteKey
    usePlanStore.getState().requestFit()
  }, [siteKey])

  useEffect(() => {
    if (!viewOnly) return
    const st = usePlanStore.getState()
    if (st.tool !== 'select' && st.tool !== 'measure') st.setTool('select')
    if (st.aligning) st.setAligning(false)
    st.selectWall(null)
  }, [viewOnly])

  useEffect(() => {
    const st = usePlanStore.getState()
    if (locks.walls && (st.tool === 'wall' || st.tool === 'door' || st.tool === 'window')) st.setTool('select')
    if (locks.zones && st.tool === 'zone') st.setTool('select')
    if ((locks.walls && (st.selectedWallId || st.selectedOpeningId)) || (locks.furniture && st.selectedFurnitureId) || (locks.zones && st.selectedZoneId)) st.selectWall(null)
    if (st.group && st.tool !== 'building') st.setGroup(withoutLocked(st.group, locks))
  }, [locks.walls, locks.furniture, locks.zones, tool])

  useEffect(() => {
    if (tool !== 'wall') setDraftStart(null)
    if (tool !== 'door' && tool !== 'window') setGhost(null)
  }, [tool])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftDown(true)
      if (isTyping(e)) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && (e.key === 'z' || e.key === 'Z' || e.key === 'я' || e.key === 'Я')) {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && (e.key === 'y' || e.key === 'н')) {
        e.preventDefault()
        redo()
        return
      }
      if (mod && (e.key === 'a' || e.key === 'ф' || e.key === 'A' || e.key === 'Ф') && !isViewOnly()) {
        const st = usePlanStore.getState()
        if (!st.plan) return
        e.preventDefault()
        st.setTool('select')
        st.setGroup(withoutLocked(selectAll(st.plan), layerLocks()))
        return
      }
      if (mod) return
      const state = usePlanStore.getState()
      if (isViewOnly()) {
        if (e.key === 'm' || e.key === 'ь') setTool(state.tool === 'measure' ? 'select' : 'measure')
        if (e.key === 'Escape') {
          setMeasures([])
          setActiveMeasure(null)
        }
        return
      }
      if (e.key === 'Escape' && state.aligning) {
        setAligning(false)
        return
      }
      if (e.key === 'b' || e.key === 'и' || e.key === 'B' || e.key === 'И') {
        if (useNetworkEdit.getState().editing) stopEdit()
        setTool('building')
        return
      }
      if (e.key === 'Escape' && state.tool === 'building') {
        state.setGroup(null)
        setTool('select')
        return
      }
      if (state.group && (state.tool === 'select' || state.tool === 'building')) {
        const arrows: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } }
        const dir = arrows[e.key]
        if (dir) {
          e.preventDefault()
          const r = (-(state.cam?.rotation ?? 0) * Math.PI) / 180
          const wx = dir.x * Math.cos(r) - dir.y * Math.sin(r)
          const wy = dir.x * Math.sin(r) + dir.y * Math.cos(r)
          const step = e.shiftKey ? 1000 : 100
          if (Math.abs(wx) >= Math.abs(wy)) state.moveGroup(Math.sign(wx) * step, 0)
          else state.moveGroup(0, Math.sign(wy) * step)
          return
        }
        if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
          e.preventDefault()
          state.rotateGroup((e.code === 'BracketLeft' ? -1 : 1) * (e.shiftKey ? 15 : 1))
          return
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          state.deleteGroup()
          return
        }
        if (e.key === 'Escape') {
          state.setGroup(null)
          return
        }
      }
      const op = state.plan?.openings.find((o) => o.id === state.selectedOpeningId)
      const fur = state.plan?.furniture.find((f) => f.id === state.selectedFurnitureId)
      const lk = layerLocks()
      if (fur && state.plan && lk.furniture) return
      if (fur && state.plan && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault()
        state.commit(deleteFurniture(state.plan, fur.id))
        return
      }
      if (fur && state.plan && (e.key === 'r' || e.key === 'к' || e.key === 'R' || e.key === 'К')) {
        state.commit(updateFurniture(state.plan, fur.id, { rotationDeg: normalizeDeg(fur.rotationDeg + (e.shiftKey ? -90 : 90)) }))
        return
      }
      if (e.key === 'm' || e.key === 'ь' || e.key === 'M' || e.key === 'Ь') {
        if (state.tool === 'measure') {
          setMeasures([])
          setActiveMeasure(null)
        } else setTool('measure')
        return
      }
      if (state.tool === 'zone' && (e.key === 'Enter' || e.key === 'Escape')) {
        if (e.key === 'Enter') finishZone(zoneDraft)
        else if (zoneDraft.length) setZoneDraft([])
        else setTool('select')
        return
      }
      if (state.selectedZoneId && state.plan && (e.key === 'Delete' || e.key === 'Backspace') && !lk.zones) {
        e.preventDefault()
        if (!state.plan.site.zones?.find((z) => z.id === state.selectedZoneId)?.locked)
          state.commit(deleteZone(state.plan, state.selectedZoneId))
        return
      }
      if (e.key === 'Escape' && state.tool === 'measure') {
        setMeasures([])
        setActiveMeasure(null)
        return
      }
      if (e.key === 'Escape') {
        setCtxMenu(null)
        if (draftStart) setDraftStart(null)
        else if (state.tool !== 'select') setTool('select')
        else selectWall(null)
      } else if (lk.walls && (e.key === 'd' || e.key === 'в' || e.key === 'o' || e.key === 'щ' || e.key === 'w' || e.key === 'ц')) {
        lockedToast('walls')
      } else if (lk.walls && (op || state.selectedWallId)) {
        return
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && op && state.plan) {
        e.preventDefault()
        state.commit(deleteOpening(state.plan, op.id))
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedWallId) {
        e.preventDefault()
        deleteWall(state.selectedWallId)
      } else if ((e.key === 'f' || e.key === 'а') && (op?.type === 'door' || op?.type === 'gate') && state.plan) {
        state.commit(updateOpening(state.plan, op.id, { side: op.side === 'left' ? 'right' : 'left' }))
      } else if ((e.key === 'h' || e.key === 'р') && op?.type === 'door' && state.plan) {
        state.commit(updateOpening(state.plan, op.id, { hinge: op.hinge === 'end' ? 'start' : 'end' }))
      } else if (e.key === 'v' || e.key === 'м') {
        setTool('select')
      } else if (e.key === 'd' || e.key === 'в') {
        setTool('door')
      } else if (e.key === 'o' || e.key === 'щ') {
        setTool('window')
      } else if (e.key === 'w' || e.key === 'ц') {
        setTool('wall')
      } else if (e.key === 'Enter') {
        setDraftStart(null)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftDown(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [draftStart, deleteWall, selectWall, setTool, setAligning, zoneDraft])

  const worldPointer = useCallback((): Point | null => {
    const p = stageRef.current?.getRelativePointerPosition()
    return p ? { x: p.x, y: p.y } : null
  }, [])

  const screenPointer = useCallback((): Point | null => {
    const p = stageRef.current?.getPointerPosition()
    return p ? { x: p.x, y: p.y } : null
  }, [])

  const startDrag = useCallback(
    (kind: DragKind, wallId: string, openingId?: string, furnitureId?: string, roomId?: string, zoneId?: string, vertex?: number) => {
      const origin = worldPointer()
      const originScreen = screenPointer()
      const base = usePlanStore.getState().plan
      if (!origin || !originScreen || !base) return
      stageRef.current?.stopDrag()
      setDrag({ kind, wallId, openingId, furnitureId, roomId, zoneId, vertex, origin, originScreen, base, moved: false })
    },
    [screenPointer, worldPointer],
  )

  const dragPlan = (d: Drag, raw: Point, shift: boolean, alt: boolean): Plan => {
    if (d.kind === 'group-move' || d.kind === 'group-rot') {
      const g = usePlanStore.getState().group
      if (!g) return d.base
      const sp = screenPointer()
      if (d.kind === 'group-move') {
        const delta = { x: raw.x - d.origin.x, y: raw.y - d.origin.y }
        const snapped = shift
          ? snapAngle({ x: 0, y: 0 }, delta)
          : { x: Math.round(delta.x / GRID_SNAP) * GRID_SNAP, y: Math.round(delta.y / GRID_SNAP) * GRID_SNAP }
        if (sp) setGroupInfo({ text: t('canvas.groupMove', { x: formatMeters(snapped.x), y: formatMeters(snapped.y) }), at: sp })
        return movePlan(d.base, g, snapped)
      }
      const c = (alt && d.altPivot) || d.pivot || selCenter(d.base, g)
      if (!c) return d.base
      const deg = ((Math.atan2(raw.y - c.y, raw.x - c.x) - Math.atan2(d.origin.y - c.y, d.origin.x - c.x)) * 180) / Math.PI
      const snappedDeg = groupRotateDeg(d.base, g, wrapDeg(deg), shift)
      if (sp) setGroupInfo({ text: formatDeg(snappedDeg), at: sp })
      return rotatePlan(d.base, g, snappedDeg, c)
    }
    if (d.kind === 'zone-vertex') {
      const z = d.base.site.zones?.find((x) => x.id === d.zoneId)
      if (!z || z.locked || d.vertex === undefined) return d.base
      const prev = z.polygon[(d.vertex - 1 + z.polygon.length) % z.polygon.length]
      const p = snapZonePoint(raw, d.base, cam.scale, prev, shift, z.polygon[d.vertex])
      return updateZone(d.base, z.id, { polygon: z.polygon.map((q, i) => (i === d.vertex ? p : q)) })
    }
    if (d.kind === 'room-move') {
      const rooms = d.base.rooms ?? []
      const r = rooms.find((x) => x.id === d.roomId)
      if (!r) return d.base
      const nx = snapOffset(r.x + raw.x - d.origin.x)
      const ny = snapOffset(r.y + raw.y - d.origin.y)
      return { ...d.base, rooms: rooms.map((x) => (x.id === r.id ? { ...x, x: nx, y: ny } : x)) }
    }
    if (d.kind === 'fur-move' || d.kind === 'fur-rot') {
      const f = d.base.furniture.find((x) => x.id === d.furnitureId)
      if (!f) return d.base
      if (d.kind === 'fur-move') {
        return updateFurniture(d.base, f.id, {
          x: snapOffset(f.x + raw.x - d.origin.x),
          y: snapOffset(f.y + raw.y - d.origin.y),
        })
      }
      const deg = (Math.atan2(raw.y - f.y, raw.x - f.x) * 180) / Math.PI + 90
      const step = shift ? 5 : 15
      return updateFurniture(d.base, f.id, { rotationDeg: normalizeDeg(Math.round(deg / step) * step) })
    }
    const wall = d.base.walls.find((w) => w.id === d.wallId)
    if (!wall) return d.base
    if (d.kind === 'op-move' || d.kind === 'op-start' || d.kind === 'op-end') {
      const o = d.base.openings.find((x) => x.id === d.openingId)
      if (!o) return d.base
      const dir = wallDirection(wall)
      const along = (raw.x - wall.a.x) * dir.x + (raw.y - wall.a.y) * dir.y
      if (d.kind === 'op-move') {
        const start = (d.origin.x - wall.a.x) * dir.x + (d.origin.y - wall.a.y) * dir.y
        return moveOpening(d.base, o.id, snapOffset(o.offset + along - start))
      }
      return resizeOpening(d.base, o.id, d.kind === 'op-start' ? 'start' : 'end', snapOffset(along))
    }
    if (d.kind === 'move') {
      const delta = { x: raw.x - d.origin.x, y: raw.y - d.origin.y }
      const snapped = shift
        ? snapAngle({ x: 0, y: 0 }, delta)
        : { x: Math.round(delta.x / GRID_SNAP) * GRID_SNAP, y: Math.round(delta.y / GRID_SNAP) * GRID_SNAP }
      return moveWall(d.base, d.wallId, snapped, alt)
    }
    const ref: EndRef = { wallId: d.wallId, end: d.kind }
    const moving = endpointGroup(d.base, ref, alt)
    const fixed = wall[d.kind === 'a' ? 'b' : 'a']
    const skip = (wallId: string, end: 'a' | 'b') =>
      moving.some((r) => r.wallId === wallId && r.end === end) || (wallId === d.wallId && end !== d.kind)
    const snap = snapPoint(raw, d.base.walls, cam.scale, fixed, shift, skip)
    setCursor(snap)
    return moveEndpoint(d.base, ref, snap.point, alt)
  }

  const pinchRef = useRef<{ dist: number; center: Point } | null>(null)

  const onTouchMove = (e: KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches
    if (touches.length < 2) {
      if (!pinchRef.current) onMouseMove(e)
      return
    }
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    if (stage.isDragging()) stage.stopDrag()
    if (drag) {
      setDrag(null)
      setPreview(null)
    }
    const rect = stage.container().getBoundingClientRect()
    const p1 = { x: touches[0].clientX - rect.left, y: touches[0].clientY - rect.top }
    const p2 = { x: touches[1].clientX - rect.left, y: touches[1].clientY - rect.top }
    const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
    const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y)
    suppressClickUntil.current = Date.now() + 500
    const prev = pinchRef.current
    pinchRef.current = { dist, center }
    if (!prev) return
    const current = usePlanStore.getState().cam ?? cam
    const world = toWorld(current, prev.center)
    const scale = clampScale(current.scale * (dist / prev.dist))
    setCam(anchorAt({ ...current, scale }, world, center))
  }

  const onTouchEnd = (e: KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length < 2 && pinchRef.current) {
      pinchRef.current = null
      suppressClickUntil.current = Date.now() + 500
      panRef.current = true
    }
  }

  const onMouseMove = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const shift = e.evt.shiftKey || shiftDown
    const raw = worldPointer()
    if (!raw) return
    if (marquee) {
      const sp = screenPointer()
      if (sp) setMarquee({ ...marquee, x1: sp.x, y1: sp.y })
      return
    }
    if (drag) {
      const sp = screenPointer()
      const far =
        drag.moved ||
        (sp && Math.hypot(sp.x - drag.originScreen.x, sp.y - drag.originScreen.y) > DRAG_THRESHOLD_PX)
      if (!far) return
      if (!drag.moved) setDrag({ ...drag, moved: true })
      setPreview(dragPlan(drag, raw, shift, e.evt.altKey))
      onCursor?.(raw, cam.scale)
      return
    }
    const walls = usePlanStore.getState().plan?.walls ?? []
    if (tool === 'zone') {
      const current = usePlanStore.getState().plan
      if (current) setZoneCursor(snapZonePoint(raw, current, cam.scale, zoneDraft.at(-1) ?? null, shift))
      onCursor?.(raw, cam.scale)
      return
    }
    if (tool === 'measure') {
      const from = activeMeasure?.points.at(-1) ?? null
      const snap = e.evt.altKey ? { point: raw } : snapMeasure(raw, targets, cam.scale, from, shift)
      setMeasureCursor(snap.point)
      onCursor?.(snap.point, cam.scale)
      return
    }
    if (tool === 'door' || tool === 'window') {
      setGhost(ghostAt(raw))
      setCursor(null)
      onCursor?.(raw, cam.scale)
      return
    }
    const snap = snapPoint(raw, walls, cam.scale, draftStart, shift)
    setCursor(snap)
    onCursor?.(snap.point, cam.scale)
    if (tool === 'select' && !viewOnly) {
      const face = findRoomAt(raw)
      if ((face?.id ?? null) !== (hoverRoom?.id ?? null)) setHoverRoom(face)
    } else if (hoverRoom) setHoverRoom(null)
    const sp = screenPointer()
    const corner =
      (tool === 'select' || tool === 'building') && !viewOnly && group && sp && e.target === stageRef.current && !groupPolygons.some((poly) => pointInPolygon(raw, poly))
        ? (groupCorners.find((c) => {
            const q = toScreen(cam, c)
            const dd = Math.hypot(q.x - sp.x, q.y - sp.y)
            return dd >= 6 && dd <= 24
          }) ?? null)
        : null
    if (corner !== hoverCorner) {
      setHoverCorner(corner)
      const st = stageRef.current
      if (st && (corner || hoverCorner)) st.container().style.cursor = corner ? ROTATE_CURSOR : ''
    }
  }

  function ghostAt(raw: Point): Ghost | null {
    const current = usePlanStore.getState().plan
    if (!current) return null
    let best: Wall | null = null
    let bestD = Infinity
    for (const w of current.walls) {
      const d = distanceToSegment(raw, w.a, w.b)
      if (d <= Math.max(w.thickness / 2, 14 / cam.scale) && d < bestD) {
        best = w
        bestD = d
      }
    }
    if (!best) return null
    const spec = OPENING_PRESETS[tool === 'window' ? 'window' : doorPreset]
    const dir = wallDirection(best)
    const along = (raw.x - best.a.x) * dir.x + (raw.y - best.a.y) * dir.y
    const offset = fitOffset(current, best.id, spec.width, snapOffset(along - spec.width / 2))
    if (offset === null) return null
    const { label: _label, ...rest } = spec
    void _label
    return { wallId: best.id, opening: { ...rest, id: '__ghost', wallId: best.id, offset } }
  }

  const groupPick = (kind: SelKind, id: string, shift: boolean) => {
    const st = usePlanStore.getState()
    if (shift) {
      const cur: Selection = st.group ?? {
        ...emptySel(),
        walls: st.selectedWallId ? [st.selectedWallId] : [],
        openings: st.selectedOpeningId ? [st.selectedOpeningId] : [],
        furniture: st.selectedFurnitureId ? [st.selectedFurnitureId] : [],
      }
      st.setGroup(toggleSel(cur, kind, id))
      stageRef.current?.stopDrag()
      suppressClickUntil.current = Date.now() + 350
      return true
    }
    if (!selHas(st.group, kind, id)) return false
    startDrag('group-move', '')
    setDrag((d) => (d ? { ...d, pick: [kind, id] } : d))
    return true
  }

  const finishMarquee = () => {
    if (!marquee) return
    setMarquee(null)
    suppressClickUntil.current = Date.now() + 350
    const current = usePlanStore.getState().plan
    if (!current || Math.hypot(marquee.x1 - marquee.x0, marquee.y1 - marquee.y0) < DRAG_THRESHOLD_PX) return
    const st = usePlanStore.getState()
    const hit = withoutLocked(rectSel(current, cam, marquee), layerLocks())
    st.setGroup(marquee.add && st.group ? mergeSel(st.group, hit) : hit)
  }

  useEffect(() => {
    if (!marquee) return
    const up = () => finishMarquee()
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  })

  const finishDrag = useCallback(() => {
    if (!drag) return
    if (drag.moved && preview) commit(preview)
    if (!drag.moved && drag.pick) {
      const st = usePlanStore.getState()
      const [kind, id] = drag.pick
      if (kind === 'walls') st.selectWall(id)
      else if (kind === 'openings') st.selectOpening(id)
      else if (kind === 'furniture') st.selectFurniture(id)
    }
    setGroupInfo(null)
    suppressClickUntil.current = Date.now() + 350
    setDrag(null)
    setPreview(null)
    setCursor(null)
  }, [commit, drag, preview])

  useEffect(() => {
    if (!drag) return
    const up = () => finishDrag()
    window.addEventListener('mouseup', up)
    window.addEventListener('touchend', up)
    return () => {
      window.removeEventListener('mouseup', up)
      window.removeEventListener('touchend', up)
    }
  }, [drag, finishDrag])

  const setCam = (next: Camera) => setStoredCam(next)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let start = 0
    const onStart = (e: Event) => {
      e.preventDefault()
      start = usePlanStore.getState().cam?.rotation ?? 0
    }
    const onChange = (e: Event) => {
      e.preventDefault()
      const g = e as Event & { rotation?: number; clientX?: number; clientY?: number }
      const current = usePlanStore.getState().cam
      if (!current || g.rotation === undefined) return
      const rect = el.getBoundingClientRect()
      const at = { x: (g.clientX ?? rect.width / 2 + rect.left) - rect.left, y: (g.clientY ?? rect.height / 2 + rect.top) - rect.top }
      setStoredCam(anchorAt({ ...current, rotation: normRot(start + g.rotation) }, toWorld(current, at), at))
    }
    el.addEventListener('gesturestart', onStart)
    el.addEventListener('gesturechange', onChange)
    return () => {
      el.removeEventListener('gesturestart', onStart)
      el.removeEventListener('gesturechange', onChange)
    }
  }, [containerRef, setStoredCam])

  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const pointer = stageRef.current?.getPointerPosition()
    if (!pointer) return
    const world = toWorld(cam, pointer)
    if (e.evt.altKey) {
      const d = Math.abs(e.evt.deltaY) > Math.abs(e.evt.deltaX) ? e.evt.deltaY : e.evt.deltaX
      const rotation = normRot(rot + d * 0.15)
      setCam(anchorAt({ ...cam, rotation }, world, pointer))
      return
    }
    const intensity = e.evt.ctrlKey ? 0.01 : 0.0015
    const scale = clampScale(cam.scale * Math.exp(-e.evt.deltaY * intensity))
    setCam(anchorAt({ ...cam, scale }, world, pointer))
  }

  const onStageClick = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (panRef.current) {
      panRef.current = false
      return
    }
    if (Date.now() < suppressClickUntil.current) return
    if ('button' in e.evt && e.evt.button !== 0) return
    setCtxMenu(null)
    if (tool === 'zone') {
      const raw = worldPointer()
      const current = usePlanStore.getState().plan
      if (!raw || !current) return
      const pt = snapZonePoint(raw, current, cam.scale, zoneDraft.at(-1) ?? null, e.evt.shiftKey || shiftDown)
      const first = zoneDraft[0]
      if (first && zoneDraft.length >= 3 && Math.hypot(first.x - pt.x, first.y - pt.y) * cam.scale < 12) {
        finishZone(zoneDraft)
        return
      }
      setZoneDraft([...zoneDraft, pt])
      return
    }
    if (tool === 'measure') {
      const raw = worldPointer()
      if (!raw) return
      const from = activeMeasure?.points.at(-1) ?? null
      const pt = e.evt.altKey ? raw : snapMeasure(raw, targets, cam.scale, from, e.evt.shiftKey || shiftDown).point
      const chain = e.evt.metaKey || e.evt.ctrlKey
      if (!activeMeasure) setActiveMeasure({ points: [pt] })
      else if (chain) setActiveMeasure({ points: [...activeMeasure.points, pt] })
      else {
        setMeasures((m) => [...m, { points: [...activeMeasure.points, pt] }])
        setActiveMeasure(null)
      }
      return
    }
    if (tool === 'select') {
      if (e.target === stageRef.current) selectWall(null)
      return
    }
    if (tool === 'building') {
      const at = worldPointer()
      if (!at || !buildingWallAt(at)) {
        usePlanStore.getState().setGroup(null)
        setTool('select')
      }
      return
    }
    if (tool === 'door' || tool === 'window') {
      const raw = worldPointer()
      const g = raw ? ghostAt(raw) : null
      if (!g || !plan) return
      const { id: _id, wallId: _w, offset, ...spec } = g.opening
      void _id
      void _w
      const res = addOpening(plan, g.wallId, spec, offset)
      if (res) {
        commit(res.plan)
        selectOpening(res.id)
      }
      return
    }
    const raw = worldPointer()
    if (!raw || !plan) return
    const snap = snapPoint(raw, plan.walls, cam.scale, draftStart, e.evt.shiftKey || shiftDown)
    if (!draftStart) {
      setDraftStart(snap.point)
      return
    }
    if (snap.point.x === draftStart.x && snap.point.y === draftStart.y) {
      setDraftStart(null)
      return
    }
    addWall(draftStart, snap.point)
    setDraftStart(snap.kind === 'endpoint' ? null : snap.point)
  }

  const applyLength = () => {
    if (!lengthEdit || !plan) return
    const meters = Number(lengthEdit.value.replace(',', '.').replace(/[^\d.]/g, ''))
    setLengthEdit(null)
    if (!(meters > 0)) return
    commit(setWallLength(plan, lengthEdit.wallId, Math.round(meters * 1000)))
  }

  const activeMaterial = plan ? findMaterial(plan, activeMaterialId ?? undefined) : undefined
  const draftThickness = activeMaterial?.thickness ?? 200
  const site = plan ? sitePolygon(plan.site) : []
  const cursorPoint = cursor?.point ?? null
  const wallsCenter = useMemo(() => {
    const walls = plan?.walls ?? []
    if (walls.length === 0) return undefined
    const sum = walls.reduce((acc, w) => ({ x: acc.x + w.a.x + w.b.x, y: acc.y + w.a.y + w.b.y }), { x: 0, y: 0 })
    return { x: sum.x / (walls.length * 2), y: sum.y / (walls.length * 2) }
  }, [plan?.walls])

  const selectedWall = shown?.walls.find((w) => w.id === selectedWallId)
  const movingIds = useMemo(() => {
    if (!drag || !plan) return new Set<string>()
    if (drag.kind !== 'move' && drag.kind !== 'a' && drag.kind !== 'b') return new Set<string>()
    const refs = drag.kind === 'move' ? wallMoveGroup(plan, drag.wallId, false) : endpointGroup(plan, { wallId: drag.wallId, end: drag.kind }, false)
    return new Set(refs.map((r) => r.wallId))
  }, [drag, plan])

  const buttonsAlong = (w: Wall) => {
    const len = wallLength(w)
    const half = 70 / cam.scale
    const spans = (shown?.openings ?? []).filter((o) => o.wallId === w.id).map((o) => [o.offset - half, o.offset + o.width + half])
    const free = (p: number) => spans.every(([s0, e0]) => p < s0 || p > e0)
    const step = 10 / cam.scale
    for (let d = 0; d <= len / 2; d += step) {
      if (free(len / 2 + d)) return len / 2 + d
      if (free(len / 2 - d)) return len / 2 - d
    }
    return len / 2
  }
  const targets = useMemo(() => (plan ? measureTargets(plan) : { points: [], segments: [] }), [plan])
  const detection = useMemo(() => detectRooms(shown ?? NO_PLAN), [shown])
  const findRoomAt = (p: Point): RoomFace | null => {
    for (const b of detection.buildings) for (const r of b.rooms) if (pointInPolygon(p, r.clearPolygon)) return r
    return null
  }
  const chainSum = activeMeasure && activeMeasure.points.length > 1 ? polylineLength(activeMeasure.points) : null
  const roomEditItem = roomEdit && shown?.rooms?.find((r) => r.id === roomEdit.id)
  const roomEditPos = roomEditItem ? toScreen(cam, roomEditItem) : null
  const commitRoomName = () => {
    if (!roomEdit || !plan) return
    const name = roomEdit.value.trim()
    const rooms = plan.rooms ?? []
    setRoomEdit(null)
    commit({
      ...plan,
      rooms: name ? rooms.map((r) => (r.id === roomEdit.id ? { ...r, name } : r)) : rooms.filter((r) => r.id !== roomEdit.id),
    })
  }
  const addRoomLabel = (at: Point) => {
    if (!plan) return
    const rooms = plan.rooms ?? []
    const used = new Set(rooms.map((r) => r.id))
    let n = rooms.length + 1
    while (used.has(`r${n}`)) n += 1
    const id = `r${n}`
    const name = t('canvas.defaultRoomName')
    commit({ ...plan, rooms: [...rooms, { id, name, x: snapOffset(at.x), y: snapOffset(at.y) }] })
    setRoomEdit({ id, value: name })
    setCtxMenu(null)
  }

  const groupBounds = group && shown ? selBounds(shown, group) : null
  const buildingWallAt = (at: Point): string | null => {
    const b = detection.buildings.find((x) => pointInPolygon(at, x.footprint))
    if (b?.walls[0]) return b.walls[0].id
    return plan?.walls.find((w) => distanceToSegment(at, w.a, w.b) <= Math.max(w.thickness / 2, 6 / cam.scale))?.id ?? null
  }
  const groupPolygons = group && shown ? groupPolys(shown, detection.buildings, group) : []
  const groupCorners = groupPolygons.flat()
  const groupCenter = polysCenter(groupPolygons)
  const guides = group && shown && drag?.moved && drag.kind === 'group-move' ? groupGuides(shown, detection.buildings, group) : []
  const moveHandleAt = (() => {
    if (!groupCorners.length) return null
    const pts = groupCorners.map((c) => toScreen(cam, c))
    const xs = pts.map((p) => p.x)
    const maxY = Math.max(...pts.map((p) => p.y))
    return toWorld(cam, { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: maxY + 30 })
  })()
  const selFurniture = shown?.furniture.find((f) => f.id === selectedFurnitureId)
  const selOpening = shown?.openings.find((o) => o.id === selectedOpeningId)
  const selOpeningWall = selOpening && shown?.walls.find((w) => w.id === selOpening.wallId)
  const ghostWall = ghost && shown?.walls.find((w) => w.id === ghost.wallId)
  const dimOpening = ghost?.opening ?? selOpening
  const dimWall = ghost ? ghostWall : selOpeningWall

  const editWall = lengthEdit && shown?.walls.find((w) => w.id === lengthEdit.wallId)
  const editPos = editWall
    ? (() => {
        const p = labelAnchor(editWall.a, editWall.b, cam.scale, editWall.thickness / 2, wallsCenter)
        const sp = toScreen(cam, p)
        return { left: sp.x, top: sp.y }
      })()
    : null

  return (
    <div
      ref={containerRef}
      onDoubleClick={(e) => {
        const stage = stageRef.current
        if (tool !== 'select' || viewOnly || !locks.walls || !stage || !plan) return
        stage.setPointersPositions(e.nativeEvent)
        const at = stage.getRelativePointerPosition()
        if (at && plan.walls.some((w) => distanceToSegment(at, w.a, w.b) <= Math.max(w.thickness / 2, 6 / cam.scale)))
          showToast(t('canvas.moveHouseHint'))
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('text/x-furniture')) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDrop={(e) => {
        const type = e.dataTransfer.getData('text/x-furniture')
        const stage = stageRef.current
        const current = usePlanStore.getState().plan
        if (!type || !stage || !current) return
        e.preventDefault()
        if (layerLocks().furniture) {
          lockedToast('furniture')
          return
        }
        stage.setPointersPositions(e.nativeEvent)
        const p = stage.getRelativePointerPosition()
        if (!p) return
        const res = addFurniture(current, { type, x: snapOffset(p.x), y: snapOffset(p.y), rotationDeg: 0 })
        commit(res.plan)
        setTool('select')
        selectFurniture(res.id)
      }}
      className={`plan-canvas plan-canvas--${tool} ${drag?.moved ? 'plan-canvas--dragging' : ''}`}>
      {ready && (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          x={cam.x}
          y={cam.y}
          scaleX={cam.scale}
          scaleY={cam.scale}
          rotation={rot}
          draggable={!drag && !pinchRef.current && !marquee}
          dragDistance={4}
          onDragStart={(e) => {
            if (e.target === stageRef.current) panRef.current = true
          }}
          onDragMove={(e) => {
            if (e.target === stageRef.current) setCam({ ...cam, x: e.target.x(), y: e.target.y() })
          }}
          onDragEnd={(e) => {
            if (e.target === stageRef.current) setCam({ ...cam, x: e.target.x(), y: e.target.y() })
          }}
          onWheel={onWheel}
          onMouseMove={onMouseMove}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onMouseDown={(e) => {
            if (hoverCorner && (tool === 'select' || tool === 'building') && !viewOnly && e.target === stageRef.current && e.evt.button === 0) {
              const corner = hoverCorner
              const altPivot = groupCorners.reduce((m, c) =>
                Math.hypot(c.x - corner.x, c.y - corner.y) > Math.hypot(m.x - corner.x, m.y - corner.y) ? c : m,
              )
              stageRef.current?.stopDrag()
              startDrag('group-rot', '')
              setDrag((d) => (d ? { ...d, pivot: groupCenter ?? undefined, altPivot } : d))
              setHoverCorner(null)
              return
            }
            if (tool === 'building' && !viewOnly && !aligning && e.evt.button === 0 && plan) {
              const at = worldPointer()
              const wallId = at ? buildingWallAt(at) : null
              if (!wallId) return
              const st = usePlanStore.getState()
              if (!selHas(st.group, 'walls', wallId)) st.setGroup(buildingSel(plan, wallId))
              stageRef.current?.stopDrag()
              startDrag('group-move', '')
              return
            }
            if (tool === 'select' && !viewOnly && !aligning && e.target === stageRef.current && e.evt.button === 0 && layers.walls && locks.walls) {
              const at = worldPointer()
              if (at && plan?.walls.some((w) => distanceToSegment(at, w.a, w.b) <= Math.max(w.thickness / 2, 6 / cam.scale))) lockedToast('walls')
            }
            if (tool !== 'select' || viewOnly || aligning || e.target !== stageRef.current || e.evt.button !== 0 || !e.evt.shiftKey) return
            const sp = screenPointer()
            if (!sp) return
            stageRef.current?.stopDrag()
            setMarquee({ x0: sp.x, y0: sp.y, x1: sp.x, y1: sp.y, add: true })
          }}
          onMouseUp={() => {
            finishMarquee()
            finishDrag()
          }}
          onMouseLeave={() => {
            setHoverRoom(null)
            if (!drag) setCursor(null)
            onCursor?.(null, cam.scale)
          }}
          onClick={onStageClick}
          onTap={onStageClick}
          onDblClick={() => {
            setDraftStart(null)
            if (tool !== 'select' || viewOnly) return
            const at = worldPointer()
            const hitWall = at && plan?.walls.find((w) => distanceToSegment(at, w.a, w.b) <= Math.max(w.thickness / 2, 6 / cam.scale))
            if (hitWall && plan && locks.walls) return
            if (hitWall && plan) {
              usePlanStore.getState().setGroup(buildingSel(plan, hitWall.id))
              return
            }
            const face = at ? findRoomAt(at) : null
            const id = face?.labelIds[0]
            const r = id ? plan?.rooms?.find((x) => x.id === id) : null
            if (r) setRoomEdit({ id: r.id, value: r.name })
            else if (face && at) addRoomLabel(at)
          }}
          onContextMenu={(e) => {
            e.evt.preventDefault()
            setDraftStart(null)
            if (tool !== 'select' || viewOnly) return
            const at = worldPointer()
            const sp = screenPointer()
            if (!at || !sp) return
            const inside = detection.buildings.some((b) => b.rooms.some((r) => pointInPolygon(at, r.clearPolygon)))
            setCtxMenu(inside ? { left: sp.x, top: sp.y, at } : null)
          }}
        >
          <Layer listening={false}>
            {!underlay.on && (
              <Line
                points={site.flatMap((p) => [p.x, p.y])}
                closed
                fill={canvasTheme.site}
                shadowColor="rgba(40,30,20,0.12)"
                shadowBlur={24}
                shadowOffsetY={4}
                shadowForStrokeEnabled={false}
              />
            )}
            {Underlay && plan && (
              <Underlay
                plan={plan}
                view={{ x: cam.x, y: cam.y, scale: cam.scale, width: size.width, height: size.height, rotationDeg: rot }}
                opacity={underlay.opacity}
                geo={align.shown}
                imagery={align.imagery}
              />
            )}
            <Grid cam={cam} width={size.width} height={size.height} opacity={underlay.on ? 0.45 : 1} />
            <Line
              points={site.flatMap((p) => [p.x, p.y])}
              closed
              stroke={underlay.on ? '#ffffff' : canvasTheme.siteStroke}
              strokeWidth={(underlay.on ? 2.5 : 1.5) / cam.scale}
              dash={[10 / cam.scale, 6 / cam.scale]}
            />
          </Layer>
          {shown && (
            <Layer opacity={baseOpacity}>
              {layers.zones && (shown.site.zones ?? []).map((z) => (
                <ZoneShape
                  key={z.id}
                  zone={z}
                  scale={cam.scale}
                  viewRot={rot}
                  listening={tool === 'select' && !drag && !aligning && !viewOnly && !locks.zones}
                  showDims={z.id === hoverZone || z.id === selectedZoneId}
                  selected={z.id === selectedZoneId && !viewOnly}
                  onSelect={selectZone}
                  onHover={setHoverZone}
                  onVertexDown={(i) => startDrag('zone-vertex', '', undefined, undefined, undefined, z.id, i)}
                  onSideDblClick={(i, at) => {
                    const current = usePlanStore.getState().plan
                    const zz = current?.site.zones?.find((x) => x.id === z.id)
                    if (!current || !zz) return
                    const p = snapZonePoint(at, current, cam.scale, null, false)
                    const polygon = [...zz.polygon.slice(0, i + 1), p, ...zz.polygon.slice(i + 1)]
                    commit(updateZone(current, z.id, { polygon }))
                  }}
                  worldPointer={worldPointer}
                />
              ))}
              {layers.furniture && shown.furniture.map((f) => (
                <FurnitureSymbol2D
                  key={f.id}
                  item={f}
                  selected={f.id === selectedFurnitureId || selHas(group, 'furniture', f.id)}
                  listening={tool === 'select' && !drag && !aligning && !viewOnly && !locks.furniture}
                  onMouseDown={(e: KonvaEventObject<MouseEvent>) => {
                    if (e.evt.button !== 0) return
                    e.cancelBubble = true
                    if (groupPick('furniture', f.id, e.evt.shiftKey)) return
                    selectFurniture(f.id)
                    startDrag('fur-move', '', undefined, f.id)
                  }}
                  onClick={(e: KonvaEventObject<MouseEvent>) => {
                    e.cancelBubble = true
                  }}
                  onMouseEnter={(e: KonvaEventObject<MouseEvent>) => {
                    const st = e.target.getStage()
                    if (st) st.container().style.cursor = 'move'
                  }}
                  onMouseLeave={(e: KonvaEventObject<MouseEvent>) => {
                    const st = e.target.getStage()
                    if (st) st.container().style.cursor = ''
                  }}
                />
              ))}
              {layers.walls && shown.walls.map((w) => (
                <WallOutline key={`o-${w.id}`} wall={w} scale={cam.scale} selected={w.id === selectedWallId || selHas(group, 'walls', w.id)} />
              ))}
              {layers.walls && shown.walls.map((w) => (
                <WallFill
                  key={`f-${w.id}`}
                  wall={w}
                  color={wallColor(shown, w)}
                  scale={cam.scale}
                  listening={tool === 'select' && !drag && !aligning && !viewOnly && !locks.walls}
                  selected={w.id === selectedWallId || selHas(group, 'walls', w.id)}
                  onSelect={() => undefined}
                  onDragStart={(id, e) => {
                    if (groupPick('walls', id, e.evt.shiftKey)) return
                    selectWall(id)
                    startDrag('move', id)
                  }}
                  onHover={setHoverWall}
                />
              ))}
              {layers.walls && shown.openings.map((o) => {
                const wall = shown.walls.find((w) => w.id === o.wallId)
                return wall ? (
                  <OpeningShape
                    key={o.id}
                    wall={wall}
                    opening={o}
                    scale={cam.scale}
                    selected={o.id === selectedOpeningId || selHas(group, 'openings', o.id)}
                    listening={tool === 'select' && !drag && !aligning && !viewOnly && !locks.walls}
                    onPointerDown={(id, e) => {
                      if (groupPick('openings', id, e.evt.shiftKey)) return
                      selectOpening(id)
                      startDrag('op-move', wall.id, id)
                    }}
                  />
                ) : null
              })}
              {ghostWall && ghost && (
                <OpeningShape wall={ghostWall} opening={ghost.opening} scale={cam.scale} ghost selected />
              )}
              {shown.walls.map((w) =>
                lengthEdit?.wallId === w.id ||
                !(showDims || w.id === selectedWallId || w.id === hoverWall || (!!drag && movingIds.has(w.id))) ? null : (
                  <LengthLabel
                    key={`l-${w.id}`}
                    a={w.a}
                    b={w.b}
                    scale={cam.scale}
                    gap={w.thickness / 2}
                    accent={w.id === selectedWallId || (!!drag && movingIds.has(w.id))}
                    away={wallsCenter}
                    viewRot={rot}
                    onClick={tool === 'select' && !drag && !viewOnly && !locks.walls ? () => selectWall(w.id) : undefined}
                    onDblClick={
                      tool === 'select' && !drag && !viewOnly && !locks.walls
                        ? () => {
                            selectWall(w.id)
                            setLengthEdit({ wallId: w.id, value: formatMeters(wallLength(w), 3) })
                          }
                        : undefined
                    }
                  />
                ),
              )}
              {hoverRoom && !drag && !viewOnly && tool === 'select' && (
                <RoomHover room={hoverRoom} scale={cam.scale} viewRot={rot} />
              )}
              {tool === 'select' && !viewOnly && !locks.walls && selectedWall && (
                <Handles
                  wall={selectedWall}
                  scale={cam.scale}
                  viewRot={rot}
                  buttonsAt={buttonsAlong(selectedWall)}
                  onStart={(kind) => startDrag(kind, selectedWall.id)}
                  onAdd={(type) => {
                    if (!plan || drag) return
                    const spec = OPENING_PRESETS[type === 'window' ? 'window' : doorPreset]
                    const { label: _l, ...rest } = spec
                    void _l
                    const at = fitOffsetClear(plan, selectedWall.id, spec.width, Math.round((wallLength(selectedWall) - spec.width) / 2))
                    const res = at === null ? null : addOpening(plan, selectedWall.id, rest, at)
                    if (res) {
                      commit(res.plan)
                      selectOpening(res.id)
                    } else showToast(t('canvas.noRoomOnWall'))
                  }}
                />
              )}
              {dimWall && dimOpening && shown && (
                <Dimensions
                  wall={dimWall}
                  scale={cam.scale}
                  toward={wallsCenter}
                  viewRot={rot}
                  spans={(() => {
                    const g = openingGaps(shown, dimWall.id, dimOpening.offset, dimOpening.width, dimOpening.id)
                    return g ? [g.before, [dimOpening.offset, dimOpening.offset + dimOpening.width], g.after] : []
                  })()}
                />
              )}
              {tool === 'select' && !viewOnly && !locks.furniture && selFurniture && (
                <FurnitureRotateHandle
                  x={selFurniture.x}
                  y={selFurniture.y}
                  rotationDeg={selFurniture.rotationDeg}
                  depth={resolveFurniture(selFurniture).d}
                  scale={cam.scale}
                  onStart={() => startDrag('fur-rot', '', undefined, selFurniture.id)}
                />
              )}
              {tool === 'select' && !viewOnly && !locks.walls && selOpening && selOpeningWall && (
                <OpeningHandles
                  wall={selOpeningWall}
                  opening={selOpening}
                  scale={cam.scale}
                  onStart={(edge) => startDrag(edge, selOpeningWall.id, selOpening.id)}
                />
              )}
              {(tool === 'select' || tool === 'building') && !viewOnly && groupBounds && (
                <GroupOverlay
                  bounds={groupBounds}
                  scale={cam.scale}
                  onRotateStart={drag ? undefined : () => startDrag('group-rot', '')}
                />
              )}
              {(tool === 'select' || tool === 'building') && !viewOnly && group && hoverCorner && groupCenter && !drag && (
                <CornerHint corner={hoverCorner} center={groupCenter} scale={cam.scale} />
              )}
              {(tool === 'select' || tool === 'building') && !viewOnly && group && moveHandleAt && (!drag || drag.kind === 'group-move') && (
                <MoveHandle at={moveHandleAt} scale={cam.scale} viewRot={rot} onStart={() => startDrag('group-move', '')} />
              )}
              {guides.length > 0 && <GuideLines guides={guides} scale={cam.scale} />}
            </Layer>
          )}
          {shown && (
            <HeatingLayer plan={shown} scale={cam.scale} viewRot={rot} worldPointer={worldPointer} interactive={!viewOnly && !aligning && !drag && !locks.heating} />
          )}
          {shown && (
            <SewerLayer plan={shown} scale={cam.scale} viewRot={rot} worldPointer={worldPointer} interactive={!viewOnly && !aligning && !drag && !locks.sewer} />
          )}
          {shown && (
            <WaterLayer plan={shown} scale={cam.scale} viewRot={rot} worldPointer={worldPointer} interactive={!viewOnly && !aligning && !drag && !locks.water} />
          )}
          {shown && (
            <ElectricLayer plan={shown} scale={cam.scale} viewRot={rot} worldPointer={worldPointer} interactive={!viewOnly && !aligning && !drag && !locks.electric} />
          )}
          <Layer listening={false}>
            {tool === 'zone' && zoneDraft.length > 0 && (
              <>
                <Line
                  points={[...zoneDraft, ...(zoneCursor ? [zoneCursor] : [])].flatMap((p) => [p.x, p.y])}
                  stroke={canvasTheme.accent}
                  strokeWidth={1.8 / cam.scale}
                  fill="rgba(242, 107, 29, 0.06)"
                  closed={zoneDraft.length >= 2}
                  dash={[6 / cam.scale, 4 / cam.scale]}
                />
                {zoneDraft.map((p, i) => (
                  <Circle key={i} x={p.x} y={p.y} radius={(i === 0 ? 6 : 3.5) / cam.scale} fill={i === 0 ? '#ffffff' : canvasTheme.accent} stroke={canvasTheme.accent} strokeWidth={1.5 / cam.scale} />
                ))}
                {zoneCursor && (
                  <LengthLabel a={zoneDraft[zoneDraft.length - 1]} b={zoneCursor} scale={cam.scale} gap={0} accent viewRot={rot} />
                )}
              </>
            )}
            {tool === 'zone' && zoneCursor && (
              <Circle x={zoneCursor.x} y={zoneCursor.y} radius={4 / cam.scale} fill={canvasTheme.accent} />
            )}
            {tool === 'measure' && (
              <MeasureLayer measures={measures} active={activeMeasure} cursor={measureCursor} scale={cam.scale} viewRot={rot} />
            )}
            {tool !== 'measure' && measures.length > 0 && (
              <MeasureLayer measures={measures} active={null} cursor={null} scale={cam.scale} viewRot={rot} />
            )}
            {tool === 'wall' && draftStart && cursorPoint && (
              <>
                <Line
                  points={[draftStart.x, draftStart.y, cursorPoint.x, cursorPoint.y]}
                  stroke={materialColor(activeMaterial)}
                  opacity={0.6}
                  strokeWidth={draftThickness}
                  lineCap="square"
                />
                <Line
                  points={[draftStart.x, draftStart.y, cursorPoint.x, cursorPoint.y]}
                  stroke={canvasTheme.accent}
                  strokeWidth={1.5 / cam.scale}
                  dash={[6 / cam.scale, 4 / cam.scale]}
                />
                <LengthLabel a={draftStart} b={cursorPoint} scale={cam.scale} gap={draftThickness / 2} accent viewRot={rot} />
              </>
            )}
            {(tool === 'wall' || (drag?.moved && drag.kind !== 'move' && drag.kind !== 'group-move' && drag.kind !== 'group-rot')) && cursorPoint && (
              <Circle
                x={cursorPoint.x}
                y={cursorPoint.y}
                radius={(cursor?.kind === 'endpoint' ? 9 : 4) / cam.scale}
                fill={cursor?.kind === 'endpoint' ? canvasTheme.accentSoft : canvasTheme.accent}
                stroke={canvasTheme.accent}
                strokeWidth={1.5 / cam.scale}
              />
            )}
          </Layer>
          {aligning && underlayMods && (
            <Layer>
              <underlayMods.Overlay
                align={align}
                view={{ x: cam.x, y: cam.y, scale: cam.scale, width: size.width, height: size.height, rotationDeg: rot }}
              />
            </Layer>
          )}
          {rot === 0 && (
            <Layer
              listening={false}
              x={-cam.x / cam.scale}
              y={-cam.y / cam.scale}
              scaleX={1 / cam.scale}
              scaleY={1 / cam.scale}
            >
              <Rulers cam={cam} width={size.width} height={size.height} cursor={cursorPoint} top={rulerTop()} />
            </Layer>
          )}
        </Stage>
      )}
      {aligning && underlayMods && (
        <div className="align-controls card">
          <div className="align-controls__head">
            <strong>{t('canvas.alignTitle')}</strong>
            <span className="muted">{t('canvas.alignHint')}</span>
          </div>
          <underlayMods.Controls align={align} />
        </div>
      )}
      {ready && plan && (
        <ViewControls
          rotation={rot}
          northUp={plan.site.geo ? normRot(-90 - northAngle(plan.site.geo.rotationDeg)) : null}
          onRotate={(rotation, fit) => {
            if (fit) {
              setCam(fitCamera(sitePolygon(plan.site), size.width, size.height, fitPadding(containerRef.current), normRot(rotation)))
              return
            }
            const center = { x: size.width / 2, y: size.height / 2 }
            setCam(anchorAt({ ...cam, rotation: normRot(rotation) }, toWorld(cam, center), center))
          }}
        />
      )}
      {marquee && (
        <div
          className="marquee"
          style={{
            left: Math.min(marquee.x0, marquee.x1),
            top: Math.min(marquee.y0, marquee.y1),
            width: Math.abs(marquee.x1 - marquee.x0),
            height: Math.abs(marquee.y1 - marquee.y0),
          }}
        />
      )}
      {guides.map((g, i) => {
        const at = toScreen(cam, { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 })
        return (
          <div key={i} className="group-delta group-delta--guide" style={{ left: at.x, top: at.y }}>
            {formatMeters(g.d)} {t('units.m')}
          </div>
        )
      })}
      {groupInfo && drag?.moved && (
        <div className="group-delta" style={{ left: groupInfo.at.x, top: groupInfo.at.y - 14 }}>
          {groupInfo.text}
        </div>
      )}
      {ctxMenu && (
        <div className="ctx-menu card" style={{ left: ctxMenu.left, top: ctxMenu.top }}>
          <button className="menu__item" onClick={() => addRoomLabel(ctxMenu.at)}>
            {t('canvas.labelRoom')}
          </button>
        </div>
      )}
      {roomEdit && roomEditPos && (
        <form
          className="length-edit"
          style={{ left: roomEditPos.x, top: roomEditPos.y }}
          onSubmit={(e) => {
            e.preventDefault()
            commitRoomName()
          }}
        >
          <input
            autoFocus
            className="length-edit__input room-edit__input"
            value={roomEdit.value}
            onChange={(e) => setRoomEdit({ ...roomEdit, value: e.target.value })}
            onFocus={(e) => e.target.select()}
            onBlur={commitRoomName}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                setRoomEdit(null)
              }
            }}
          />
        </form>
      )}
      {tool === 'measure' && (
        <div className="measure-hint card">
          {chainSum !== null
            ? t('canvas.measureSum', { sum: formatMeters(chainSum) })
            : t('canvas.measureHint')}
        </div>
      )}
      {lengthEdit && editPos && (
        <form
          className="length-edit"
          style={{ left: editPos.left, top: editPos.top }}
          onSubmit={(e) => {
            e.preventDefault()
            applyLength()
          }}
        >
          <input
            autoFocus
            className="length-edit__input"
            value={lengthEdit.value}
            onChange={(e) => setLengthEdit({ ...lengthEdit, value: e.target.value })}
            onFocus={(e) => e.target.select()}
            onBlur={applyLength}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                setLengthEdit(null)
              }
            }}
          />
          <span className="length-edit__unit">{t('units.m')}</span>
        </form>
      )}
    </div>
  )
}
