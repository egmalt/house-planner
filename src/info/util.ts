import { fmtDateTime } from '../i18n'

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

export const fmtDate = (s?: string) => {
  if (!s) return ''
  const m = s.match(ISO)
  return m ? fmtDateTime(new Date(+m[1], +m[2] - 1, +m[3]), { year: 'numeric', month: '2-digit', day: '2-digit' }) : s
}

export const isUrl = (s: string) => /^https?:\/\/\S+$/.test(s.trim())
