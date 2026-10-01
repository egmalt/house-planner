import { useLayers, type LayerKey, type LayerLocks } from './layers'
import { stopEdit, useNetworkEdit } from './registry'
import { showToast } from '../ui/Toast'
import { t } from '../i18n'

const KEYS: LayerKey[] = ['walls', 'furniture', 'zones', 'sewer', 'water', 'electric', 'heating']

const effective = (locks: LayerLocks, editing: LayerKey | null): LayerLocks =>
  Object.fromEntries(KEYS.map((k) => [k, !!locks[k] || (!!editing && editing !== k)])) as LayerLocks

export function layerLocks(): LayerLocks {
  return effective(useLayers.getState().locks, useNetworkEdit.getState().editing)
}

export const isLayerLocked = (key: LayerKey) => layerLocks()[key]

export function useLayerLocks(): LayerLocks {
  const locks = useLayers((s) => s.locks)
  const editing = useNetworkEdit((s) => s.editing)
  return effective(locks, editing)
}

export const wallsLockedText = () => t('networks:shared.locks.walls')

let lastToast = 0
export function lockedToast(key: LayerKey) {
  const now = Date.now()
  if (now - lastToast < 1500) return
  lastToast = now
  const editing = useNetworkEdit.getState().editing
  if (editing && editing !== key) showToast(t('networks:shared.locks.editing'))
  else if (key === 'walls') showToast(wallsLockedText())
  else showToast(t('networks:shared.locks.layer'))
}

useLayers.subscribe((st) => {
  const { editing } = useNetworkEdit.getState()
  if (editing && st.locks[editing]) stopEdit()
})
