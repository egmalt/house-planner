import type { Plan } from '../../model'
import type { CatalogItem } from '../../estimate/catalog'
import { computeHeating } from './calc'
import { heatingOf } from './model'
import { t } from '../../i18n'
import { priceHeating } from './pricing'

export const heatingGroup = () => t('networks:shared.layers.heating')

export function heatingEstimateRows(plan: Plan, catalog: CatalogItem[]) {
  const h = heatingOf(plan)
  if (!h.loops.some((l) => !l.off)) return []
  return priceHeating(computeHeating(plan).items, h.materials, catalog).map((i) => ({
    id: `auto:heating:${i.key}`,
    name: i.name,
    url: i.url,
    qty: i.buyQty,
    unit: i.buyUnit,
    price: i.price,
    priceFrom: i.priceFrom,
    group: heatingGroup(),
  }))
}
