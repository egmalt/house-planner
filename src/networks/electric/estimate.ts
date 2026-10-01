import type { Plan } from '../../model'
import type { CatalogItem } from '../../estimate/catalog'
import { computeElectric } from './calc'
import { electricOf } from './model'
import { t } from '../../i18n'
import { priceElectric } from './pricing'

export const electricGroup = () => t('networks:shared.layers.electric')

export function electricEstimateRows(plan: Plan, catalog: CatalogItem[]) {
  const e = electricOf(plan)
  if (!e.points.length && !e.circuits.length) return []
  return priceElectric(computeElectric(plan).items, e.materials, catalog).map((i) => ({
    id: `auto:electric:${i.key}`,
    name: i.name,
    url: i.url,
    qty: i.buyQty,
    unit: i.buyUnit,
    price: i.price,
    priceFrom: i.priceFrom,
    group: electricGroup(),
  }))
}
