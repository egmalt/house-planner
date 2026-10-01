import type { NetworkMaterial } from '../../model'
import type { CatalogItem } from '../../estimate/catalog'
import type { HeatingItem, HeatingUnit } from './calc'
import { fmtNum, t } from '../../i18n'
import { unitLabel as rawUnitLabel } from '../../i18n/units'

export const noPrice = () => t('networks:heating.price.none')

export const unitLabel = (u: HeatingUnit | 'pack') => t(`networks:heating.units.${u}`)

const SHOP_UNIT: Record<HeatingUnit, string> = { pcs: 'шт', m: 'м', m2: 'м²', m3: 'м³', kg: 'кг' }

export type PricedHeatingItem = HeatingItem & { buyQty: number; buyUnit: string; price?: number; url?: string; priceFrom: string }

type Loose = Record<string, unknown> & {
  id: string
  name: string
  kind?: string
  subtype?: string
  price?: number
  unit?: string
  pricePer?: string
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
const text = (x: Loose) => `${x.name} ${x.subtype ?? ''} ${typeof x.note === 'string' ? x.note : ''}`.toLowerCase()
const has = (t: string, ...w: string[]) => w.some((s) => t.includes(s))

const SUBS: Record<string, { subs: string[]; words: string[]; not?: string[] }> = {
  pipe: { subs: ['pipe'], words: ['труба'] },
  collector: { subs: ['collector'], words: ['коллектор'], not: ['шкаф'] },
  mixing: { subs: ['mixing'], words: ['смесительн'] },
  pump: { subs: ['pump', 'mixing'], words: ['циркуляц'], not: ['смесительн'] },
  cabinet: { subs: ['cabinet'], words: ['шкаф'] },
  eurocone: { subs: ['eurocone', 'fitting'], words: ['евроконус'] },
  damper: { subs: ['damper'], words: ['демпфер'] },
  insulation: { subs: ['insulation'], words: ['xps', 'эппс', 'экструд', 'пенополистирол'] },
  film: { subs: ['film'], words: ['плёнк', 'пленк'] },
  mesh: { subs: ['mesh'], words: ['сетка'] },
  staples: { subs: ['staples', 'mesh'], words: ['скоба', 'гарпун'] },
  ties: { subs: ['ties', 'mesh'], words: ['хомут', 'стяжк'] },
  cement: { subs: ['cement', 'screed'], words: ['цемент'], not: ['цементно-песчан', 'смесь'] },
  sand: { subs: ['sand', 'screed'], words: ['песок'] },
  cps: { subs: ['cps', 'screed'], words: ['цпс', 'цементно-песчан'] },
  fiber: { subs: ['fiber', 'screed'], words: ['фибр'] },
}

const maxNum = (v: unknown) => {
  if (typeof v === 'number') return v
  if (typeof v !== 'string') return undefined
  const ns = v.match(/\d+/g)?.map(Number)
  return ns?.length ? Math.max(...ns) : undefined
}
const outputsOf = (x: Loose) => maxNum(x.outputs ?? x.outlets ?? x.ways) ?? num(/(\d{1,2})\s*(?:вых|конт|отвод|петл)/i.exec(x.name)?.[1])
const coilOf = (x: Loose) => {
  const l = field(x, 'coil', 'lengthM')
  if (l !== undefined) return l > 1000 ? l / 1000 : l
  return num(/\((\d{3})\s*м\)/i.exec(x.name)?.[1])
}
const flat = (t: string) => t.replace(/[-\s]/g, '')

function fits(item: HeatingItem, x: Loose) {
  const rule = SUBS[item.sub]
  if (!rule) return false
  const sub = String(x.subtype ?? '').toLowerCase()
  const t = text(x)
  if (sub && !rule.subs.includes(sub)) return false
  if (!has(t, ...rule.words) || (rule.not && has(t, ...rule.not))) return false
  const sp = item.spec ?? {}
  switch (item.sub) {
    case 'pipe': {
      const want = flat(String(sp.pipe ?? '').toLowerCase())
      const kind = want.includes('pert') ? 'pert' : want.includes('pexa') ? 'pexa' : want.includes('pex') ? 'pex' : ''
      const got = flat(`${x.material ?? ''} ${x.name}`.toLowerCase())
      if (kind && !got.includes(kind)) return false
      const d = field(x, 'diameter') ?? num(/(\d{2})\s*[xх×]/i.exec(x.name)?.[1])
      return d === 16 && coilOf(x) === sp.coil
    }
    case 'collector':
    case 'cabinet':
      return (outputsOf(x) ?? 0) >= Number(sp.outputs ?? 0)
    case 'insulation': {
      const want = String(sp.insulation ?? '').toLowerCase()
      const th = num(/(\d{2,3})/.exec(want)?.[1])
      const got = field(x, 'thickness') ?? num(/(\d{2,3})\s*[xх×]/i.exec(x.name)?.[1])
      return !th || !got || got === th
    }
    case 'film': {
      const th = field(x, 'thickness')
      return th === undefined || sp.thickness === undefined || th === sp.thickness
    }
    default:
      return true
  }
}

const matches = (item: HeatingItem, x: Loose) => x.id === item.key || fits(item, x)

const perUnit = (item: HeatingItem, x: Loose): number | undefined => {
  const u = (x.unit ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  const lenMm = field(x, 'length')
  const hMm = field(x, 'height')
  const sheet = lenMm && hMm && lenMm > 100 && hMm > 100 ? (lenMm * hMm) / 1e6 : undefined
  switch (item.unit) {
    case 'm2':
      if (u === 'м²' || u === 'м2' || x.pricePer === 'm2') return 1
      if (field(x, 'area', 'areaM2')) return field(x, 'area', 'areaM2')
      if (sheet) return sheet
      if (field(x, 'width')) return (field(x, 'width')! / 1000) * (u.startsWith('пог') ? 1 : (field(x, 'roll') ?? 1))
      return undefined
    case 'm': {
      if (u === 'м' || u.startsWith('пог') || x.pricePer === 'm') return 1
      const l = field(x, 'roll', 'lengthM')
      return l === undefined ? undefined : l > 1000 ? l / 1000 : l
    }
    case 'kg':
      if (u === 'кг' || x.pricePer === 'kg') return 1
      return field(x, 'weight', 'weightKg')
    case 'm3':
      if (u === 'м³' || u === 'м3' || x.pricePer === 'm3') return 1
      return field(x, 'volume', 'volumeM3')
    case 'pcs':
      return field(x, 'pack') ?? 1
    default:
      return undefined
  }
}

function pick(item: HeatingItem, list: Loose[]) {
  const all = list.filter((x) => x.price !== undefined && matches(item, x) && perUnit(item, x))
  if (!all.length) return undefined
  const exact = all.filter((x) => x.id === item.key)
  const pool0 = exact.length ? exact : all
  const pref = pool0.filter((x) => x.preferred)
  const pool = pref.length ? pref : pool0
  const cost = (x: Loose) => (x.price ?? 0) / (perUnit(item, x) ?? 1) + (item.sub === 'collector' || item.sub === 'cabinet' ? (outputsOf(x) ?? 0) : 0)
  return [...pool].sort((a, b) => cost(a) - cost(b))[0]
}

function priceFrom(item: HeatingItem, src: Loose, from: string): PricedHeatingItem {
  const pack = perUnit(item, src) ?? 1
  const own = SHOP_UNIT[item.unit]
  if (src.price === undefined) return { ...item, buyQty: item.qty, buyUnit: unitLabel(item.unit), url: src.url, priceFrom: noPrice() }
  if (pack === 1 && src.unit && src.unit !== own && item.unit !== 'pcs') return { ...item, buyQty: Math.ceil(item.qty), buyUnit: src.unit, price: src.price, url: src.url, priceFrom: from }
  if (pack === 1) return { ...item, buyQty: item.qty, buyUnit: unitLabel(item.unit), price: src.price, url: src.url, priceFrom: from }
  const packUnit = src.unit && src.unit !== own ? src.unit : unitLabel('pack')
  return { ...item, buyQty: Math.ceil(item.qty / pack), buyUnit: packUnit, price: src.price, url: src.url, priceFrom: t('networks:heating.price.pack', { from, qty: fmtNum(Math.round(pack * 100) / 100), unit: unitLabel(item.unit), pack: rawUnitLabel(packUnit) }) }
}

export function priceHeating(items: HeatingItem[], materials: NetworkMaterial[] | undefined, catalog: CatalogItem[]): PricedHeatingItem[] {
  const own = (materials ?? []) as unknown as Loose[]
  const shop = catalog.filter((c) => c.kind === 'heating' || c.kind.startsWith('heating')) as unknown as Loose[]
  return items.map((item) => {
    const m = own.find((x) => matches(item, x))
    if (m) return priceFrom(item, m, t('networks:heating.price.own', { name: `${m.name}${m.source ? `, ${m.source}` : ''}` }))
    const c = pick(item, shop)
    if (c) return priceFrom(item, c, `${c.name}${c.vendor ? `, ${c.vendor}` : ''}`)
    const n = Number(item.spec?.outputs ?? 0)
    if ((item.sub === 'collector' || item.sub === 'cabinet') && n > 2) {
      const half = { ...item, spec: { ...item.spec, outputs: Math.ceil(n / 2) } }
      const c2 = pick(half, shop)
      if (c2) {
        const r = priceFrom(half, c2, t('networks:heating.price.twoHalves', { n: Math.ceil(n / 2), name: `${c2.name}${c2.vendor ? `, ${c2.vendor}` : ''}` }))
        return { ...r, spec: item.spec, name: t('networks:heating.price.twoOf', { name: item.name, n: Math.ceil(n / 2) }), buyQty: r.buyQty * 2 }
      }
    }
    return { ...item, buyQty: item.qty, buyUnit: unitLabel(item.unit), priceFrom: noPrice() }
  })
}

export const heatingSum = (i: PricedHeatingItem) => (i.price ?? 0) * i.buyQty
