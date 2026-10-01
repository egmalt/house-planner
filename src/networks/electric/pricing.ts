import type { NetworkMaterial } from '../../model'
import type { CatalogItem } from '../../estimate/catalog'
import type { ElectricItem } from './calc'
import { t } from '../../i18n'

export type PricedElectricItem = ElectricItem & { buyQty: number; buyUnit: string; price?: number; url?: string; priceFrom?: string }

type Loose = Record<string, unknown> & {
  id: string
  name: string
  kind?: string
  subtype?: string
  price?: number
  unit?: string
  pricePer?: string
  length?: number
  url?: string
  vendor?: string
  source?: string
  preferred?: boolean
}

const num = (v: unknown) => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}
const field = (x: Loose, ...keys: string[]) => {
  for (const k of keys) {
    const v = num(x[k])
    if (v !== undefined) return v
  }
  return undefined
}
const text = (x: Loose) => `${x.name} ${typeof x.subtype === 'string' ? x.subtype : ''} ${typeof x.note === 'string' ? x.note : ''}`.toLowerCase()

function cableOf(x: Loose) {
  const cores = field(x, 'cores')
  const section = field(x, 'section', 'crossSection')
  if (cores && section) return { cores, section }
  const s = typeof x.cable === 'string' ? x.cable : x.name
  const m = /(\d)\s*[xх×*]\s*(\d+(?:[.,]\d+)?)/i.exec(s)
  return m ? { cores: Number(m[1]), section: Number(m[2].replace(',', '.')) } : null
}

function breakerOf(x: Loose) {
  const t = x.name
  const cm = /(?:^|[\s(])([BCD])-?(\d{1,2})(?![\d,.])/.exec(t)
  const rating = field(x, 'rating', 'current', 'amps') ?? num(/(\d{1,3})\s?[АA](?![а-яА-Яa-zA-Z])/.exec(t)?.[1]) ?? (cm ? Number(cm[2]) : undefined)
  const curve = (typeof x.curve === 'string' ? x.curve : undefined) ?? cm?.[1]
  const pm = /(\d)\s*[PР]\b|(\d)[- ]?полюс|(\d)п\b/i.exec(t)
  const poles = field(x, 'poles') ?? (pm ? Number(pm[1] ?? pm[2] ?? pm[3]) : /1P\+N|1\+N/i.test(t) ? 2 : undefined)
  const leakage = field(x, 'leakage', 'leakageMa', 'ma') ?? num(/(\d{2,3})\s*мА/i.exec(t)?.[1])
  return { rating, curve, poles, leakage }
}

const lengthMm = (x: Loose) => {
  const l = field(x, 'length', 'lengthM', 'coil')
  if (l === undefined) return undefined
  return l <= 1000 ? l * 1000 : l
}
const perMeter = (x: Loose) => /^(м|пог\.? ?м|м\.п\.|m)$/i.test((x.unit ?? '').trim()) || x.pricePer === 'm'

function unitPrice(item: ElectricItem, x: Loose) {
  if (x.price === undefined) return Infinity
  if (item.unit !== 'm') return x.price
  if (perMeter(x)) return x.price * item.qty
  const l = lengthMm(x)
  return l ? Math.ceil((item.qty * 1000) / l) * x.price : Infinity
}

const has = (t: string, ...words: string[]) => words.some((w) => t.includes(w))

function fits(item: ElectricItem, x: Loose): boolean {
  const sub = String(x.subtype ?? '').toLowerCase()
  const t = text(x)
  const sp = item.spec ?? {}
  switch (item.kind) {
    case 'cable': {
      if (sub && sub !== 'cable') return false
      const c = cableOf(x)
      return !!c && c.cores === sp.cores && c.section === sp.section && !has(t, 'ппгнг-hf')
    }
    case 'conduit': {
      if (sub && sub !== 'conduit') return false
      const d = field(x, 'diameter') ?? num(/(?:d|ø|ф|диаметр)\s?(\d{2})|(\d{2})\s*мм/i.exec(x.name)?.slice(1).find(Boolean))
      return d === sp.diameter
    }
    case 'box':
      return (sub === 'box' || (!sub && has(t, 'подрозетник'))) && has(t, 'подрозетник', 'установочн', 'полых') && !has(t, 'распаеч', 'распред', 'соединител', 'клемм')
    case 'frame': {
      if (sub !== 'frame') return false
      const posts = field(x, 'posts') ?? (has(t, 'одномест') ? 1 : undefined)
      const aqua = (field(x, 'ip') ?? 0) >= 44 || has(t, 'aqua', 'ip44')
      return posts === 1 && aqua === (sp.device === 'socket_ip44')
    }
    case 'panel': {
      if (sub && sub !== 'panel') return false
      const mods = field(x, 'modules') ?? num(/(\d{1,3})\s*мод/i.exec(x.name)?.[1]) ?? 0
      return mods > 0 && mods >= (sp.modules ?? 0)
    }
    case 'breaker':
    case 'main': {
      if (sp.device === 'relay') return sub === 'relay' || has(t, 'реле напряж')
      if (sub && sub !== 'breaker') return false
      const b = breakerOf(x)
      return b.rating === sp.rating && (!b.curve || !sp.curve || b.curve === sp.curve) && (!b.poles || b.poles === sp.poles)
    }
    case 'rcbo': {
      if (sub && sub !== 'rcbo') return false
      const b = breakerOf(x)
      return b.rating === sp.rating && (!b.curve || b.curve === sp.curve) && (b.leakage ?? 30) === (sp.leakage ?? 30) && (!b.poles || b.poles === sp.poles || (sp.poles === 2 && b.poles === 1))
    }
    case 'rcd': {
      if (sub && sub !== 'rcd') return false
      const b = breakerOf(x)
      return b.rating === sp.rating && (b.leakage ?? 30) === (sp.leakage ?? 30) && (!b.poles || b.poles === sp.poles)
    }
    case 'device': {
      const d = sp.device
      const double = has(t, 'двойн', 'двухмест', '2-мест', '2 мест', 'x2', '×2')
      const wet = (field(x, 'ip') ?? 0) >= 44 || has(t, 'ip44', 'ip54', 'ip55', 'влагозащ')
      if (d === 'light' || d === 'light_wall') {
        if (sub ? sub !== 'light' : !has(t, 'светильник')) return false
        const facade = has(t, 'фасадн', 'настен', 'бра', 'wall')
        return d === 'light_wall' ? facade : !facade && !has(t, 'саун', 'бан')
      }
      if (d === 'switch' || d === 'switch2') {
        if (sub ? sub !== 'switch' : !has(t, 'выключател') || has(t, 'автомат', 'дифф')) return false
        const two = field(x, 'gangs') === 2 || has(t, 'двухклав', '2-клав', '2 клав', 'двухкноп')
        if (wet || has(t, 'переключ', 'проходн', 'подсветк', 'трехклав', 'трёхклав')) return false
        return d === 'switch2' ? two : !two
      }
      if (d === 'junction') return (sub === 'box' || sub === 'junction') && has(t, 'распаеч', 'распред', 'ответвит')
      if (!d || !['socket', 'socket2', 'socket_ip44', 'outdoor', 'power'].includes(d)) return false
      if (sub ? sub !== 'socket' : !has(t, 'розетк')) return false
      if (d === 'power') return has(t, 'силов', '32 а', '32а', 'для плит', 'электроплит')
      if (has(t, 'силов', 'для плит', 'компьютер', 'rj45', 'вывод кабел', 'телефон', 'tv', 'антенн')) return false
      if (d === 'socket2') return double && !wet
      if (d === 'socket_ip44') return wet && !double
      if (d === 'outdoor') return wet && !double && has(t, 'накладн', 'наружн', 'уличн', 'ip54', 'ip55')
      return !double && !wet
    }
  }
  return false
}

const matches = (item: ElectricItem, x: Loose) => x.id === item.key || x.subtype === item.key || fits(item, x)

function pick(item: ElectricItem, list: Loose[]) {
  const all = list.filter((x) => matches(item, x) && x.price !== undefined)
  if (!all.length) return undefined
  const exact = all.filter((x) => x.id === item.key || x.subtype === item.key)
  const pool0 = exact.length ? exact : all
  const pref = pool0.filter((x) => x.preferred || (x.vendor ?? '').startsWith('Петрович'))
  const pool = pref.length ? pref : pool0
  const mods = (x: Loose) => (item.kind === 'panel' ? (field(x, 'modules') ?? 0) : 0)
  return [...pool].sort((a, b) => mods(a) - mods(b) || Number(!!b.preferred) - Number(!!a.preferred) || unitPrice(item, a) - unitPrice(item, b))[0]
}

const unitLabel = (u: ElectricItem['unit']) => t(`common:units.${u}`)

function priceFrom(item: ElectricItem, src: Loose, from: string): PricedElectricItem {
  const base: PricedElectricItem = { ...item, buyQty: item.qty, buyUnit: unitLabel(item.unit), url: src.url, priceFrom: from }
  if (src.price === undefined) return base
  if (item.unit === 'm' && !perMeter(src)) {
    const l = lengthMm(src)
    if (l) return { ...base, buyQty: Math.ceil((item.qty * 1000) / l), buyUnit: unitLabel('pcs'), price: src.price }
  }
  return { ...base, price: src.price }
}

export function priceElectric(items: ElectricItem[], materials: NetworkMaterial[] | undefined, catalog: CatalogItem[]): PricedElectricItem[] {
  const own = (materials ?? []) as unknown as Loose[]
  const shop = catalog.filter((c) => c.kind === 'electric' || c.kind.startsWith('electric')) as unknown as Loose[]
  return items.map((item) => {
    const m = own.find((x) => matches(item, x))
    if (m) return priceFrom(item, m, t('networks:electric.priceFromOwn', { name: `${m.name}${m.source ? `, ${m.source}` : ''}` }))
    const c = pick(item, shop) ?? (item.spec?.device === 'light_wall' ? pick({ ...item, spec: { device: 'light' } }, shop) : undefined)
    if (c) return priceFrom(item, c, `${c.name}${c.vendor ? `, ${c.vendor}` : ''}`)
    return { ...item, buyQty: item.qty, buyUnit: unitLabel(item.unit) }
  })
}

export const electricSum = (i: PricedElectricItem) => (i.price ?? 0) * i.buyQty
