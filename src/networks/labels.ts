import { fmtNum, t } from '../i18n'

export function labelMap<K extends string>(keys: readonly K[], prefix: string): Record<K, string> {
  const map = {} as Record<K, string>
  for (const k of keys) Object.defineProperty(map, k, { get: () => t(`${prefix}.${k}`), enumerable: true })
  return map
}

export type ItemUnit = 'm' | 'pcs'

export { unitLabel } from '../i18n/units'

export const fmtPct = (v: number, d = 2) => t('networks:shared.units.pct', { v: fmtNum(v, d) })

export const fmtM = (mm: number) => `${fmtNum(mm / 1000)} ${t('common:units.m')}`
