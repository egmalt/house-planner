import { computeWallEstimate, unitLabels, type Estimate, type EstimateLine, type Plan, type Purchase } from '../model'
import { t } from '../i18n'
import { findOpening, findPanel, type CatalogItem } from './catalog'
import { sewerEstimateRows, waterEstimateRows } from '../networks/estimate'
import { electricEstimateRows } from '../networks/electric/estimate'
import { heatingEstimateRows } from '../networks/heating/estimate'

export type Row = {
  id: string
  name: string
  url?: string
  qty: number
  unit: string
  price?: number
  priceFrom?: string
  note?: string
  line?: EstimateLine
  group?: string
  sku?: string
  vendor?: string
  bought: boolean
}

export const estimateOf = (plan: Plan): Estimate => ({
  ...plan.estimate,
  lines: plan.estimate?.lines ?? [],
  purchases: plan.estimate?.purchases ?? {},
  ...(plan.estimate?.wasteSipPct !== undefined ? { wasteSipPct: plan.estimate.wasteSipPct } : {}),
})

const isAutoId = (id: string) => id.startsWith('auto:')

const fromCatalog = (c: CatalogItem) => `${c.name}${c.vendor ? `, ${c.vendor}` : ''}`

function wallRows(plan: Plan, catalog: CatalogItem[]): Omit<Row, 'bought'>[] {
  return computeWallEstimate(plan).lines.map((l) => {
    const m = l.material
    const usePanels = l.qty === null && l.panelsWithWaste !== undefined
    const qty = usePanels ? l.panelsWithWaste! : (l.qty ?? 0)
    const unit = usePanels ? 'pcs' : l.unit
    const row: Omit<Row, 'bought'> = {
      id: l.id,
      name: l.name,
      url: l.url,
      qty,
      unit: unit ? unitLabels[unit] : t('common:units.pcs'),
      price: l.price,
    }
    if (row.price !== undefined || !m || (m.kind !== 'sip' && m.kind !== 'pir')) return row
    const found = findPanel(catalog, m.kind, m.thickness, m.panelWidth ?? m.length, m.panelHeight ?? m.height)
    if (!found) return row
    const price = unit === 'pcs' ? found.perPiece : unit === 'm2' ? found.perM2 : undefined
    if (price === undefined) return row
    const c = found.item
    return { ...row, price: Math.round(price), url: row.url ?? c.url, sku: c.sku, vendor: c.vendor, priceFrom: t('estimate:rows.priceBy', { item: fromCatalog(c) }) }
  })
}

function openingRows(plan: Plan, catalog: CatalogItem[]): Omit<Row, 'bought'>[] {
  const groups = new Map<string, { type: 'door' | 'window' | 'gate'; width: number; height: number; count: number }>()
  for (const o of plan.openings) {
    const key = `${o.type}:${o.width}x${o.height}`
    const g = groups.get(key) ?? { type: o.type, width: o.width, height: o.height, count: 0 }
    g.count += 1
    groups.set(key, g)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, g]) => {
      const m = findOpening(catalog, g.type, g.width, g.height)
      const c = m?.item
      return {
        id: `auto:${key}`,
        name: t(`estimate:rows.${g.type}`, { w: g.width, h: g.height }),
        url: c?.url,
        qty: g.count,
        unit: t('common:units.pcs'),
        price: m?.price,
        sku: c?.sku,
        vendor: c?.vendor,
        priceFrom: m && (m.exact ? t('estimate:rows.priceBy', { item: fromCatalog(m.item) }) : t('estimate:rows.areaEstimate', { w: c!.length, h: c!.height, item: fromCatalog(m.item) })),
      }
    })
}

export function buildRows(plan: Plan, catalog: CatalogItem[]): Row[] {
  const est = estimateOf(plan)
  const manual = est.lines
    .filter((l) => !isAutoId(l.id))
    .map((l) => ({ id: l.id, name: l.name, url: l.url, qty: l.qty, unit: l.unit, price: l.price, note: l.note, line: l }))
  return [...wallRows(plan, catalog), ...openingRows(plan, catalog), ...manual, ...sewerEstimateRows(plan, catalog), ...waterEstimateRows(plan, catalog), ...electricEstimateRows(plan, catalog), ...heatingEstimateRows(plan, catalog)].map((r) => ({
    ...r,
    bought: !!est.purchases[r.id]?.done,
  }))
}

export const rowSum = (r: Row) => (r.price ?? 0) * r.qty

export const withEstimate = (plan: Plan, patch: (e: Estimate) => Estimate): Plan => ({
  ...plan,
  estimate: patch(estimateOf(plan)),
})

export const setPurchase = (e: Estimate, id: string, p: Purchase | undefined): Estimate => {
  const purchases = { ...e.purchases }
  if (p) purchases[id] = p
  else delete purchases[id]
  return { ...e, purchases }
}

export const upsertLine = (e: Estimate, line: EstimateLine): Estimate => ({
  ...e,
  lines: e.lines.some((l) => l.id === line.id) ? e.lines.map((l) => (l.id === line.id ? line : l)) : [...e.lines, line],
})

export const removeLine = (e: Estimate, id: string): Estimate =>
  setPurchase({ ...e, lines: e.lines.filter((l) => l.id !== id) }, id, undefined)

export function newLineId(e: Estimate) {
  const used = new Set(e.lines.map((l) => l.id))
  let n = e.lines.length + 1
  while (used.has(`l${n}`)) n += 1
  return `l${n}`
}
