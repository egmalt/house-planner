import { fmtDateTime, fmtNum as fmtNumber, fmtRub as fmtRubles, lang } from '../i18n'

export const fmtRub = (v: number) => fmtRubles(v)
export const fmtNum = (v: number) => fmtNumber(v, 2)

export const today = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return fmtDateTime(new Date(y, m - 1, d), { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export const parseNum = (s: string): number | undefined => {
  const t = s.replace(/\s/g, '').replace(',', '.')
  if (t === '') return undefined
  const v = Number(t)
  return Number.isFinite(v) && v >= 0 ? v : undefined
}

export const decimalSep = () => (lang() === 'ru' ? ',' : '.')

export const numText = (v: number | undefined) => (v === undefined ? '' : String(v).replace('.', decimalSep()))
