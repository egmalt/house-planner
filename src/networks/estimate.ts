import type { Plan } from '../model'
import type { CatalogItem } from '../estimate/catalog'
import { computeSewer } from './sewerCalc'
import { priceAll } from './pricing'
import { sewerOf } from './sewerModel'
import { computeWater } from './waterCalc'
import { priceWater } from './waterPricing'
import { waterOf } from './waterModel'
import { t } from '../i18n'

export const sewerGroup = () => t('networks:shared.layers.sewer')

export type SewerEstimateRow = {
  id: string
  name: string
  url?: string
  qty: number
  unit: string
  price?: number
  priceFrom?: string
  group: string
}

export function sewerEstimateRows(plan: Plan, catalog: CatalogItem[]): SewerEstimateRow[] {
  const s = sewerOf(plan)
  if (!s.pipes.length && !s.nodes.length) return []
  return priceAll(computeSewer(plan).items, s.materials, catalog).map((i) => ({
    id: `auto:sewer:${i.key}`,
    name: i.name,
    url: i.url,
    qty: i.buyQty,
    unit: i.buyUnit,
    price: i.price,
    priceFrom: i.priceFrom,
    group: sewerGroup(),
  }))
}

export const waterGroup = () => t('networks:shared.layers.water')

export function waterEstimateRows(plan: Plan, catalog: CatalogItem[]): SewerEstimateRow[] {
  const w = waterOf(plan)
  if (!w.pipes.length && !w.nodes.length) return []
  return priceWater(computeWater(plan).items, w.materials, catalog).map((i) => ({
    id: `auto:water:${i.key}`,
    name: i.name,
    url: i.url,
    qty: i.buyQty,
    unit: i.buyUnit,
    price: i.price,
    priceFrom: i.priceFrom,
    group: waterGroup(),
  }))
}
