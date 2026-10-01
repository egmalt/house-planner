import { create } from 'zustand'
import type { ElectricPointKind } from '../../model'

export type ElectricTool = null | 'socket' | 'switch' | 'light' | 'panel'

type ElectricUiState = {
  tool: ElectricTool
  socketKind: ElectricPointKind
  switchKind: ElectricPointKind
  lightKind: ElectricPointKind
  activeCircuit: string | null
  selected: string[]
  panelSelected: boolean
  tab: boolean
  setTool: (tool: ElectricTool) => void
  setKind: (tool: 'socket' | 'switch' | 'light', kind: ElectricPointKind) => void
  setActiveCircuit: (id: string | null) => void
  select: (ids: string[]) => void
  selectPanel: (on: boolean) => void
  setTab: (on: boolean) => void
}

export const useElectricUi = create<ElectricUiState>()((set) => ({
  tool: null,
  socketKind: 'socket',
  switchKind: 'switch',
  lightKind: 'light',
  activeCircuit: null,
  selected: [],
  panelSelected: false,
  tab: false,
  setTool: (tool) => set({ tool }),
  setKind: (tool, kind) => set(tool === 'socket' ? { socketKind: kind } : tool === 'switch' ? { switchKind: kind } : { lightKind: kind }),
  setActiveCircuit: (activeCircuit) => set({ activeCircuit }),
  select: (selected) => set({ selected, panelSelected: false }),
  selectPanel: (panelSelected) => set({ panelSelected, selected: [] }),
  setTab: (tab) => set({ tab }),
}))
