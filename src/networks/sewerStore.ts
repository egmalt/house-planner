import { create } from 'zustand'
import type { SewerNode } from '../model'
import type { SewerRef } from './sewerCalc'

export type NextKind = Exclude<SewerNode['kind'], 'fixture'>

type SewerUiState = {
  tool: boolean
  selected: SewerRef | null
  hover: SewerRef | null
  panel: boolean
  draft: string | null
  setDraft: (id: string | null) => void
  nextKind: NextKind
  setNextKind: (k: NextKind) => void
  setTool: (on: boolean) => void
  select: (ref: SewerRef | null) => void
  setHover: (ref: SewerRef | null) => void
  setPanel: (on: boolean) => void
}

export const useSewerUi = create<SewerUiState>()((set) => ({
  tool: false,
  selected: null,
  hover: null,
  panel: false,
  draft: null,
  setDraft: (draft) => set({ draft }),
  nextKind: 'junction',
  setNextKind: (nextKind) => set({ nextKind }),
  setTool: (tool) => set({ tool }),
  select: (selected) => set({ selected }),
  setHover: (hover) => set({ hover }),
  setPanel: (panel) => set({ panel }),
}))
