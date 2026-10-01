import type { NetworkMaterial } from '../model'
import type { CatalogItem } from '../estimate/catalog'
import type { WaterItem } from './waterCalc'
import { t } from '../i18n'
import { unitLabel } from './labels'

export type PricedWaterItem = WaterItem & { buyQty: number; buyUnit: string; price?: number; url?: string; priceFrom?: string }

type Loose = CatalogItem & { diameter?: number; material?: string }

const perMeter = (c: CatalogItem) => (c.length ? c.price / (c.length / 1000) : c.price)

const outputsOf = (c: CatalogItem) => Number(c.id.match(/^water-collector-(\d+)(?:-|$)/)?.[1] ?? 0)

function findCatalog(item: WaterItem, catalog: CatalogItem[]): CatalogItem | undefined {
  const water = catalog.filter((c) => c.kind === 'water') as Loose[]
  const sameKind = (c: Loose) => (c.subtype ? c.subtype === item.kind : c.id.startsWith(`water-${item.kind}-`))
  if (item.kind === 'collector') {
    const need = Number(item.key.match(/^collector-(\d+)/)?.[1] ?? 0)
    const list = water.filter((c) => c.subtype === 'collector' && outputsOf(c) >= need)
    const plain = (c: CatalogItem) => Number(c.id !== `water-collector-${outputsOf(c)}`)
    return list.sort((a, b) => outputsOf(a) - outputsOf(b) || plain(a) - plain(b) || a.price - b.price)[0]
  }
  if (item.kind === 'pump' && item.model) {
    const words = item.model.toLowerCase().split(/[\s/,]+/).filter((w) => w.length > 2)
    const byModel = water.find((c) => c.subtype === 'pump' && words.length > 0 && words.every((w) => c.name.toLowerCase().includes(w)))
    if (byModel) return byModel
  }
  const exact = water.find((c) => (c.id === `water-${item.key}` || c.id === item.key) && (item.kind === 'head' || sameKind(c)))
  if (exact) return exact
  const fit = (c: Loose) =>
    sameKind(c) &&
    (item.diameter === undefined || c.diameter === undefined || c.diameter === null || c.diameter === item.diameter) &&
    (!item.material || !c.material || c.material.toUpperCase() === item.material.toUpperCase()) &&
    (item.kind !== 'pipe' || !item.location || !c.id.includes(item.location === 'outside' ? '-in-' : '-out-'))
  const list = water.filter(fit)
  if (!list.length) return water.find((c) => c.name === item.name)
  return item.kind === 'pipe' ? [...list].sort((a, b) => perMeter(a) - perMeter(b))[0] : [...list].sort((a, b) => a.price - b.price)[0]
}

export function priceWaterItem(item: WaterItem, materials: NetworkMaterial[], catalog: CatalogItem[]): PricedWaterItem {
  const base: PricedWaterItem = { ...item, buyQty: item.qty, buyUnit: unitLabel(item.unit) }
  const m = materials.find((x) => x.id === item.key) ?? materials.find((x) => x.kind === item.kind && (item.diameter === undefined || x.diameter === item.diameter))
  if (m) {
    const res = { ...base, url: m.url, priceFrom: t('networks:shared.pricing.fromMaterials', { name: m.name }) }
    if (m.price === undefined) return res
    if (item.lengthMm !== undefined && m.pricePer !== 'm' && m.length) return { ...res, buyQty: Math.ceil(item.lengthMm / m.length), buyUnit: unitLabel('pcs'), price: m.price }
    return { ...res, price: m.price }
  }
  const c = findCatalog(item, catalog)
  if (!c) return base
  const res = { ...base, url: c.url, priceFrom: t('networks:shared.pricing.fromCatalog', { name: `${c.name}${c.vendor ? `, ${c.vendor}` : ''}` }), price: c.price }
  const perM = /^(м|пог\. ?м|м\.п\.)$/.test(c.unit.trim())
  if (item.lengthMm !== undefined && !perM && c.length) return { ...res, buyQty: Math.ceil(item.lengthMm / c.length), buyUnit: c.unit }
  if (item.lengthMm !== undefined && !perM && /бухт|рулон/i.test(c.unit)) return { ...res, buyQty: 1, buyUnit: c.unit }
  return res
}

export function priceWater(items: WaterItem[], materials: NetworkMaterial[] | undefined, catalog: CatalogItem[]): PricedWaterItem[] {
  const priced = items.map((i) => priceWaterItem(i, materials ?? [], catalog))
  const head = priced.find((i) => i.kind === 'head' && i.price !== undefined)
  const packaged = head && /насос/i.test(head.priceFrom ?? '')
  if (!packaged) return priced
  return priced.map((i) =>
    i.kind === 'pump' ? { ...i, price: 0, url: undefined, priceFrom: t('networks:shared.pricing.includedInBorehole') } : i,
  )
}

export const waterSum = (i: PricedWaterItem) => (i.price ?? 0) * i.buyQty
