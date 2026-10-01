import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { temporal } from 'zundo'
import {
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
  clampOpenings,
  findMaterial,
  nextId,
  type Plan,
  type Point,
} from '../model'
import type { Camera } from '../canvas/camera'
import { isViewOnly } from './viewOnly'
import { deletePlan, movePlan, pruneSel, rotatePlan, selCenter, selSize, type Selection } from '../canvas/selection/model'

export type Tool = 'select' | 'wall' | 'door' | 'window' | 'measure' | 'zone' | 'building'
export type DoorPreset = 'entry' | 'interior' | 'gate'

export type PlanState = {
  plan: Plan | null
  tool: Tool
  selectedWallId: string | null
  selectedOpeningId: string | null
  selectedFurnitureId: string | null
  selectedZoneId: string | null
  selectZone: (id: string | null) => void
  selectFurniture: (id: string | null) => void
  furniturePanel: boolean
  aligning: boolean
  versionPreview: { label: string; real: Plan } | null
  enterPreview: (plan: Plan, label: string) => void
  exitPreview: () => Plan | null
  showDims: boolean
  setShowDims: (on: boolean) => void
  summaryTab: 'general' | 'materials'
  setSummaryTab: (t: 'general' | 'materials') => void
  summaryOpen: boolean
  setSummaryOpen: (open: boolean) => void
  setAligning: (on: boolean) => void
  setFurniturePanel: (open: boolean) => void
  doorPreset: DoorPreset
  setDoorPreset: (p: DoorPreset) => void
  selectOpening: (id: string | null) => void
  activeMaterialId: string | null
  cam: Camera | null
  underlay: { on: boolean; opacity: number }
  setUnderlay: (u: Partial<{ on: boolean; opacity: number }>) => void
  fitNonce: number
  requestFit: () => void
  setCam: (cam: Camera) => void
  setTool: (tool: Tool) => void
  setActiveMaterial: (id: string | null) => void
  selectWall: (id: string | null) => void
  loadPlan: (plan: Plan, opts?: { fit?: boolean }) => void
  commit: (plan: Plan) => void
  addWall: (a: Point, b: Point) => string | null
  deleteWall: (id: string) => void
  group: Selection | null
  setGroup: (s: Selection | null) => void
  moveGroup: (dx: number, dy: number) => void
  rotateGroup: (deg: number, center?: Point) => void
  deleteGroup: () => void
}

export const usePlanStore = create<PlanState>()(
  temporal(
    persist(
      (set, get) => ({
        plan: null,
        tool: 'select',
        selectedWallId: null,
        selectedOpeningId: null,
        selectedFurnitureId: null,
        selectedZoneId: null,
        furniturePanel: false,
        aligning: false,
        versionPreview: null,
        showDims: false,
        summaryTab: 'general',
        summaryOpen: false,
        doorPreset: 'entry',
        activeMaterialId: null,
        cam: null,
        underlay: { on: false, opacity: 0.8 },
        fitNonce: 0,
        group: null,

        requestFit: () => set({ fitNonce: get().fitNonce + 1 }),
        setCam: (cam) => set({ cam }),
        setUnderlay: (u) => set({ underlay: { ...get().underlay, ...u } }),
        setTool: (tool) => set({ tool }),
        setActiveMaterial: (activeMaterialId) => set({ activeMaterialId }),
        selectWall: (selectedWallId) => set({ selectedWallId, selectedOpeningId: null, selectedFurnitureId: null, selectedZoneId: null, group: null }),
        selectOpening: (selectedOpeningId) => set({ selectedOpeningId, selectedWallId: null, selectedFurnitureId: null, selectedZoneId: null, group: null }),
        selectFurniture: (selectedFurnitureId) => set({ selectedFurnitureId, selectedWallId: null, selectedOpeningId: null, selectedZoneId: null, group: null }),
        selectZone: (selectedZoneId) => set({ selectedZoneId, selectedWallId: null, selectedOpeningId: null, selectedFurnitureId: null, group: null }),
        setFurniturePanel: (furniturePanel) => set({ furniturePanel }),
        setAligning: (aligning) => set({ aligning }),
        enterPreview: (preview, label) => {
          const { plan, versionPreview } = get()
          const real = versionPreview?.real ?? plan
          if (!real) return
          usePlanStore.temporal.getState().pause()
          set({ versionPreview: { label, real }, plan: preview, selectedWallId: null, selectedOpeningId: null, selectedFurnitureId: null })
          usePlanStore.temporal.getState().resume()
        },
        exitPreview: () => {
          const vp = get().versionPreview
          if (!vp) return null
          usePlanStore.temporal.getState().pause()
          set({ versionPreview: null, plan: vp.real })
          usePlanStore.temporal.getState().resume()
          return vp.real
        },
        setShowDims: (showDims) => set({ showDims }),
        setSummaryTab: (summaryTab) => set({ summaryTab }),
        setSummaryOpen: (summaryOpen) => set({ summaryOpen }),
        setDoorPreset: (doorPreset) => set({ doorPreset }),

        loadPlan: (plan, opts) => {
          const { activeMaterialId, selectedWallId, fitNonce } = get()
          usePlanStore.temporal.getState().pause()
          set({
            plan,
            selectedWallId: plan.walls.some((w) => w.id === selectedWallId) ? selectedWallId : null,
            activeMaterialId: plan.materials.some((m) => m.id === activeMaterialId)
              ? activeMaterialId
              : (plan.materials[0]?.id ?? null),
            fitNonce: opts?.fit ? fitNonce + 1 : fitNonce,
          })
          usePlanStore.temporal.getState().resume()
          usePlanStore.temporal.getState().clear()
        },

        commit: (plan) => {
          if (isViewOnly() || get().versionPreview) return
          const next = clampOpenings(plan)
          const selected = get().selectedWallId
          const op = get().selectedOpeningId
          set({
            plan: next,
            selectedWallId: selected && next.walls.some((w) => w.id === selected) ? selected : null,
            selectedOpeningId: op && next.openings.some((o) => o.id === op) ? op : null,
            selectedFurnitureId:
              get().selectedFurnitureId && next.furniture.some((f) => f.id === get().selectedFurnitureId)
                ? get().selectedFurnitureId
                : null,
            group: get().group ? pruneSel(next, get().group as Selection) : null,
          })
        },

        setGroup: (s) => {
          const one = s && selSize(s) === 1 && s.rooms.length === 0
          if (one) {
            if (s.walls[0]) get().selectWall(s.walls[0])
            else if (s.openings[0]) get().selectOpening(s.openings[0])
            else get().selectFurniture(s.furniture[0])
            return
          }
          set({ group: s && selSize(s) > 0 ? s : null, selectedWallId: null, selectedOpeningId: null, selectedFurnitureId: null })
        },

        moveGroup: (dx, dy) => {
          const { plan, group } = get()
          if (!plan || !group || (!dx && !dy)) return
          get().commit(movePlan(plan, group, { x: dx, y: dy }))
        },

        rotateGroup: (deg, center) => {
          const { plan, group } = get()
          const c = plan && group ? (center ?? selCenter(plan, group)) : null
          if (!plan || !group || !c || !deg) return
          get().commit(rotatePlan(plan, group, deg, c))
        },

        deleteGroup: () => {
          const { plan, group } = get()
          if (!plan || !group) return
          get().commit(deletePlan(plan, group))
          set({ group: null })
        },

        addWall: (a, b) => {
          if (isViewOnly() || get().versionPreview) return null
          const plan = get().plan
          if (!plan || (a.x === b.x && a.y === b.y)) return null
          const material = findMaterial(plan, get().activeMaterialId ?? undefined)
          const id = nextId('w', plan.walls)
          const wall = {
            id,
            a,
            b,
            thickness: material?.thickness ?? DEFAULT_WALL_THICKNESS,
            height: plan.walls.at(-1)?.height ?? DEFAULT_WALL_HEIGHT,
            ...(material ? { materialId: material.id } : {}),
          }
          set({ plan: { ...plan, walls: [...plan.walls, wall] } })
          return id
        },

        deleteWall: (id) => {
          if (isViewOnly() || get().versionPreview) return
          const plan = get().plan
          if (!plan) return
          set({
            plan: {
              ...plan,
              walls: plan.walls.filter((w) => w.id !== id),
              openings: plan.openings.filter((o) => o.wallId !== id),
            },
            selectedWallId: get().selectedWallId === id ? null : get().selectedWallId,
          })
        },
      }),
      {
        name: 'house-planner:ui',
        version: 2,
        storage: createJSONStorage(() => localStorage),
        partialize: (s) => ({ tool: s.tool, activeMaterialId: s.activeMaterialId, cam: s.cam, underlay: s.underlay, doorPreset: s.doorPreset, furniturePanel: s.furniturePanel, summaryTab: s.summaryTab, showDims: s.showDims }),
      },
    ),
    {
      partialize: (s) => ({ plan: s.plan }),
      equality: (a, b) => a.plan === b.plan,
      limit: 200,
    },
  ),
)

export const undo = () => {
  if (!isViewOnly()) usePlanStore.temporal.getState().undo()
}
export const redo = () => {
  if (!isViewOnly()) usePlanStore.temporal.getState().redo()
}
