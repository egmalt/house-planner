import type { ComponentType } from 'react'
import { create } from 'zustand'
import { usePlanStore } from '../store/planStore'
import { useLayers, type LayerKey } from './layers'

export type NetworkLayerDef = {
  key: LayerKey
  label?: string
  Tools: ComponentType
  enter?: () => void
  exit?: () => void
  onEscape?: () => boolean
}

type EditState = { editing: LayerKey | null; defs: Partial<Record<LayerKey, NetworkLayerDef>> }

export const useNetworkEdit = create<EditState>()(() => ({ editing: null, defs: {} }))

export function registerNetworkLayer(def: NetworkLayerDef) {
  useNetworkEdit.setState((s) => ({ defs: { ...s.defs, [def.key]: def } }))
}

export function stopEdit() {
  const { editing, defs } = useNetworkEdit.getState()
  if (!editing) return
  useNetworkEdit.setState({ editing: null })
  defs[editing]?.exit?.()
}

export function startEdit(key: LayerKey) {
  const { editing, defs } = useNetworkEdit.getState()
  if (editing === key) return
  stopEdit()
  useLayers.getState().setLayer(key, true)
  const st = usePlanStore.getState()
  st.setTool('select')
  st.selectWall(null)
  useNetworkEdit.setState({ editing: key })
  defs[key]?.enter?.()
}

export const isEditing = (key: LayerKey) => useNetworkEdit.getState().editing === key

usePlanStore.subscribe((st, prev) => {
  if (st.tool !== prev.tool && st.tool !== 'select') stopEdit()
})

useLayers.subscribe((st) => {
  const { editing } = useNetworkEdit.getState()
  if (editing && !st[editing]) stopEdit()
})
