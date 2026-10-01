import { t } from '../i18n'
import { unitLabel } from '../i18n/units'
import { decimalSep } from './format'
import { rowSum, type Row } from './rows'

type Value = string | number | undefined

export type CsvColumn = { title: string; value: (r: Row, n: number) => Value; total?: boolean }

export type CsvFilter = (r: Row) => boolean

const petrovichSku = (url?: string) => url?.match(/petrovich\.ru\/(?:product|catalog\/\d+)\/(\d+)/)?.[1]

export const rowSku = (r: Row) => r.sku ?? petrovichSku(r.url)

export const isPetrovich = (r: Row) => !!r.vendor?.includes('Петрович') || !!r.url?.includes('petrovich.ru')

export const sectionOf = (r: Row) => r.group ?? (r.line ? t('estimate:sections.manual') : t('estimate:sections.auto'))

export const COLUMNS = {
  section: { get title() { return t('estimate:csv.columns.section') }, value: (r) => sectionOf(r) },
  n: { get title() { return t('estimate:csv.columns.n') }, value: (_, n) => n },
  name: { get title() { return t('estimate:csv.columns.name') }, value: (r) => r.name },
  sku: { get title() { return t('estimate:csv.columns.sku') }, value: rowSku },
  qty: { get title() { return t('estimate:csv.columns.qty') }, value: (r) => r.qty },
  unit: { get title() { return t('estimate:csv.columns.unit') }, value: (r) => unitLabel(r.unit) },
  price: { get title() { return t('estimate:csv.columns.price') }, value: (r) => r.price },
  sum: { get title() { return t('estimate:csv.columns.sum') }, value: (r) => (r.price !== undefined ? rowSum(r) : undefined), total: true },
  bought: { get title() { return t('estimate:csv.columns.bought') }, value: (r) => (r.bought ? t('estimate:csv.yes') : t('estimate:csv.no')) },
  url: { get title() { return t('estimate:csv.columns.url') }, value: (r) => r.url },
  note: { get title() { return t('estimate:csv.columns.note') }, value: (r) => [r.note, r.priceFrom].filter(Boolean).join(' · ') || undefined },
} satisfies Record<string, CsvColumn>

export const FULL_COLUMNS: CsvColumn[] = Object.values(COLUMNS)

export const FILTERS = {
  all: () => true,
  petrovichLeft: (r) => isPetrovich(r) && !r.bought,
} satisfies Record<string, CsvFilter>

const csvSep = () => (decimalSep() === ',' ? ';' : ',')

const cell = (v: Value) => {
  if (v === undefined) return ''
  const s = typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', decimalSep()) : v
  return /[;,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: Row[], columns: CsvColumn[] = FULL_COLUMNS, filter: CsvFilter = FILTERS.all, totals = true) {
  const lines: Value[][] = [columns.map((c) => c.title)]
  const picked = rows.filter(filter)
  const sections = [...new Set(picked.map(sectionOf))]
  const totalRow = (label: string, list: Row[]) =>
    columns.map((c, i) => (c.total ? list.reduce((s, r) => s + rowSum(r), 0) : i === 0 ? label : undefined))
  let n = 0
  for (const sec of sections) {
    const list = picked.filter((r) => sectionOf(r) === sec)
    for (const r of list) lines.push(columns.map((c) => c.value(r, ++n)))
    if (totals) lines.push(totalRow(t('estimate:csv.sectionTotal', { section: sec }), list))
  }
  if (totals) lines.push(totalRow(t('estimate:csv.total'), picked))
  return '﻿' + lines.map((l) => l.map(cell).join(csvSep())).join('\r\n')
}

export function downloadCsv(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
