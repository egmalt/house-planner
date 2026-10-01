import { useSyncExternalStore } from 'react'

export const sections = [
  { id: 'plan', label: 'sections.plan' },
  { id: '3d', label: 'sections.3d' },
  { id: 'map', label: 'sections.map' },
  { id: 'estimate', label: 'sections.estimate' },
  { id: 'info', label: 'sections.info', short: 'sections.infoShort' },
] as const

export type SectionId = (typeof sections)[number]['id']

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

const read = (): SectionId => {
  const id = window.location.hash.replace(/^#\/?/, '')
  return sections.some((s) => s.id === id) ? (id as SectionId) : 'plan'
}

export const useSection = () => useSyncExternalStore(subscribe, read, () => 'plan' as SectionId)

export const sectionHref = (id: SectionId) => `#/${id}`

const narrowQuery = () => window.matchMedia('(max-width: 760px)')

export const useNarrow = () =>
  useSyncExternalStore(
    (cb) => {
      const q = narrowQuery()
      q.addEventListener('change', cb)
      return () => q.removeEventListener('change', cb)
    },
    () => narrowQuery().matches,
    () => false,
  )
