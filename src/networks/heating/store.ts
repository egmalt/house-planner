import { create } from 'zustand'

type HeatingUiState = {
  selected: string | null
  collectorSelected: boolean
  tab: boolean
  select: (id: string | null) => void
  selectCollector: (on: boolean) => void
  setTab: (on: boolean) => void
}

export const useHeatingUi = create<HeatingUiState>()((set) => ({
  selected: null,
  collectorSelected: false,
  tab: false,
  select: (selected) => set({ selected, collectorSelected: false }),
  selectCollector: (collectorSelected) => set({ collectorSelected, selected: null }),
  setTab: (tab) => set({ tab }),
}))
