import type { NetworkMaterial } from '../model'
import type { CatalogItem } from '../estimate/catalog'
import type { SewerItem } from './sewerCalc'
import { t } from '../i18n'
import { unitLabel } from './labels'

export type PricedItem = SewerItem & {
  buyQty: number
  buyUnit: string
  price?: number
  url?: string
  priceFrom?: string
}

type Source = { name: string; price?: number; per?: 'pcs' | 'm'; length?: number; pack?: number; unit?: string; url?: string; from: string }

const fits = (item: SewerItem, kind?: string, diameter?: number, angle?: number) =>
  kind === item.kind && (item.diameter === undefined || diameter === item.diameter) && (item.angle === undefined || angle === undefined || angle === item.angle)

function fromMaterials(item: SewerItem, list: NetworkMaterial[]): Source | undefined {
  const m = list.find((x) => x.id === item.key) ?? list.find((x) => fits(item, x.kind, x.diameter, x.angle))
  if (!m) return undefined
  return {
    name: m.name,
    price: m.price,
    per: m.pricePer === 'm' ? 'm' : 'pcs',
    length: m.length,
    url: m.url,
    from: t('networks:shared.pricing.fromMaterials', { name: `${m.name}${m.source ? `, ${m.source}` : ''}` }),
  }
}

function catalogIds(item: SewerItem): string[] {
  const loc = item.location === 'outside' ? 'out' : 'in'
  const d = item.diameter
  switch (item.kind) {
    case 'pipe':
      return [`sewer-pipe-${loc}-${d}-`]
    case 'elbow':
      return [`sewer-elbow-${loc}-${d}-${item.angle}`]
    case 'tee': {
      const m = item.key.match(/^tee-(\d+)(?:x(\d+))?-(\d+)/)
      if (!m) return []
      return [`sewer-tee-${loc}-${m[1]}${m[2] ? `x${m[2]}` : ''}-${m[3]}`]
    }
    case 'reducer': {
      const m = item.key.match(/^reducer-(\d+x\d+)/)
      return m ? [`sewer-reducer-${loc}-${m[1]}`, `sewer-reducer-in-${m[1]}`] : []
    }
    case 'cleanout':
      return [`sewer-cleanout-${loc}-${d}`]
    case 'clamp':
      return [`sewer-clamp-${d}-plastic`, `sewer-clamp-${d}-`]
    case 'corrugation':
      return [`sewer-wc-corrugated-${d}`]
    case 'vent':
      return [`sewer-vent-cap-${d}`]
    default:
      return []
  }
}

const perMeter = (c: CatalogItem) => (c.length ? c.price / (c.length / 1000) : c.price)

function fromCatalog(item: SewerItem, catalog: CatalogItem[]): Source | undefined {
  let c: CatalogItem | undefined = catalog.find((x) => x.id === item.key || x.id === `sewer-${item.key}`)
  if (!c && item.kind === 'septic') {
    const model = item.model?.toLowerCase().split(/[\s,]+/).filter((w) => w.length > 2) ?? []
    const septics = catalog.filter((x) => x.subtype === 'septic' || x.kind === 'septic')
    c = model.length ? septics.find((x) => model.every((w) => x.name.toLowerCase().includes(w))) ?? septics.find((x) => x.name.toLowerCase().includes(model[0])) : undefined
  }
  if (!c) {
    for (const id of catalogIds(item)) {
      const found = catalog.filter((x) => (id.endsWith('-') ? x.id.startsWith(id) : x.id === id || x.id.startsWith(`${id}-`)))
      if (found.length) {
        c = item.kind === 'pipe' ? found.sort((a, b) => perMeter(a) - perMeter(b))[0] : found.sort((a, b) => a.price - b.price)[0]
        break
      }
    }
  }
  if (!c) c = catalog.find((x) => x.name === item.name)
  if (!c) return undefined
  const perM = /^(м|пог\. ?м|м\.п\.)$/.test(c.unit.trim())
  const pack = Number(c.name.match(/\((\d+)\s*шт\.?\)/)?.[1] ?? 0) || undefined
  return {
    name: c.name,
    price: c.price,
    per: perM ? 'm' : 'pcs',
    length: c.length,
    pack: pack && pack > 1 ? pack : undefined,
    unit: c.unit,
    url: c.url,
    from: t('networks:shared.pricing.fromCatalog', { name: `${c.name}${c.vendor ? `, ${c.vendor}` : ''}` }),
  }
}

export function priceItem(item: SewerItem, materials: NetworkMaterial[], catalog: CatalogItem[]): PricedItem {
  const src = fromMaterials(item, materials) ?? fromCatalog(item, catalog)
  const base: PricedItem = { ...item, buyQty: item.qty, buyUnit: unitLabel(item.unit) }
  if (!src) return base
  const res: PricedItem = { ...base, url: src.url, priceFrom: src.from }
  if (src.price === undefined) return res
  if (item.kind === 'pipe' && src.per === 'pcs' && src.length && item.lengthMm !== undefined) {
    return { ...res, buyQty: Math.ceil(item.lengthMm / src.length), buyUnit: unitLabel('pcs'), price: src.price }
  }
  if (src.pack) return { ...res, buyQty: Math.ceil(item.qty / src.pack), buyUnit: src.unit ?? t('networks:shared.units.pack'), price: src.price }
  return { ...res, price: src.price }
}

export const priceAll = (items: SewerItem[], materials: NetworkMaterial[] | undefined, catalog: CatalogItem[]) =>
  items.map((i) => priceItem(i, materials ?? [], catalog))

export const itemSum = (i: PricedItem) => (i.price ?? 0) * i.buyQty
