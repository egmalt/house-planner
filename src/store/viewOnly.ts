import { useSyncExternalStore } from 'react'

const QUERY = '(max-width: 699px), (pointer: coarse) and (not (any-pointer: fine))'

const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY) : null)

export const isViewOnly = () => !!media()?.matches

export const useViewOnly = () =>
  useSyncExternalStore(
    (cb) => {
      const q = media()
      q?.addEventListener('change', cb)
      return () => q?.removeEventListener('change', cb)
    },
    isViewOnly,
    () => false,
  )
