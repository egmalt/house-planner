import { create } from 'zustand'
import type { WaterLine, WaterNode } from '../model'
import type { SewerRef } from './sewerCalc'

export type WaterMode = 'select' | WaterLine
export type WaterNextKind = Exclude<WaterNode['kind'], 'fixture'>

type WaterUiState = {
  mode: WaterMode
  nextKind: WaterNextKind
  draft: string | null
  selected: SewerRef | null
  hover: SewerRef | null
  panel: boolean
  setMode: (m: WaterMode) => void
  setNextKind: (k: WaterNextKind) => void
  setDraft: (id: string | null) => void
  select: (r: SewerRef | null) => void
  setHover: (r: SewerRef | null) => void
  setPanel: (on: boolean) => void
}

export const useWaterUi = create<WaterUiState>()((set) => ({
  mode: 'select',
  nextKind: 'junction',
  draft: null,
  selected: null,
  hover: null,
  panel: false,
  setMode: (mode) => set({ mode, draft: null }),
  setNextKind: (nextKind) => set({ nextKind }),
  setDraft: (draft) => set({ draft }),
  select: (selected) => set({ selected }),
  setHover: (hover) => set({ hover }),
  setPanel: (panel) => set({ panel }),
}))
