import { useEffect, useState } from 'react'

export type CatalogItem = {
  id: string
  name: string
  kind: string
  vendor?: string
  url?: string
  price: number
  unit: string
  thickness?: number
  length?: number
  height?: number
  opening?: { width: number; height: number }
  subtype?: string
  sku?: string
  preferred?: boolean
}

const CATALOG_URL = `${import.meta.env.BASE_URL}data/catalog.json`

const isItem = (v: unknown): v is CatalogItem => {
  const o = v as Partial<CatalogItem> | null
  return (
    !!o && typeof o.name === 'string' && typeof o.price === 'number' && typeof o.unit === 'string' && o.subtype !== 'house-kit'
  )
}

let cache: Promise<CatalogItem[]> | null = null

const loadCatalog = () =>
  (cache ??= fetch(CATALOG_URL, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : []))
    .then((d: unknown) => (Array.isArray(d) ? d.filter(isItem) : []))
    .catch(() => []))

export function useCatalog() {
  const [items, setItems] = useState<CatalogItem[]>([])
  useEffect(() => {
    let alive = true
    void loadCatalog().then((list) => alive && setItems(list))
    return () => {
      alive = false
    }
  }, [])
  return items
}

const isPcs = (u: string) => u === 'шт' || u === 'pcs'
const isM2 = (u: string) => u === 'м²' || u === 'm²'

const VENDOR_RANK = ['Петрович', 'ПроСИП']
const vendorRank = (v?: string) => {
  const i = VENDOR_RANK.findIndex((x) => v?.startsWith(x))
  return i === -1 ? VENDOR_RANK.length : i
}
const byVendor = (a: CatalogItem, b: CatalogItem) => vendorRank(a.vendor) - vendorRank(b.vendor) || a.price - b.price

export function findPanel(catalog: CatalogItem[], kind: string, thickness: number, w?: number, h?: number) {
  const sameSize = (c: CatalogItem) => !w || !h || (c.length === Math.max(w, h) && c.height === Math.min(w, h))
  const usable = (c: CatalogItem) =>
    c.kind === kind && c.thickness === thickness && (isM2(c.unit) || (isPcs(c.unit) && !!c.length && !!c.height))
  const roof = (c: CatalogItem) => Number(!!c.subtype?.includes('roof'))
  const rank = (a: CatalogItem, b: CatalogItem) =>
    roof(a) - roof(b) ||
    Number(!!b.preferred) - Number(!!a.preferred) || Number(sameSize(b)) - Number(sameSize(a)) || byVendor(a, b)
  const c = catalog.filter(usable).sort(rank)[0]
  if (!c) return undefined
  const itemM2 = isPcs(c.unit) ? (c.length! * c.height!) / 1e6 : 1
  const perM2 = c.price / itemM2
  const panelM2 = w && h ? (w * h) / 1e6 : undefined
  const perPiece = isPcs(c.unit) && sameSize(c) ? c.price : panelM2 ? perM2 * panelM2 : undefined
  return { item: c, perM2, perPiece }
}

export function findOpening(catalog: CatalogItem[], type: 'door' | 'window' | 'gate', width: number, height: number) {
  const all = catalog.filter((c) => c.kind === type && isPcs(c.unit) && c.length && c.height)
  const preferred = all.filter((c) => !c.vendor?.includes('DoorHan'))
  const list = preferred.length ? preferred : all
  const near = (a: number, b: number) => Math.abs(a - b) <= 10
  const exact = list
    .filter(
      (c) =>
        (c.opening && c.opening.width === width && c.opening.height === height) ||
        (near(c.length!, width) && near(c.height!, height)),
    )
    .sort(byVendor)[0]
  if (exact) return { item: exact, price: exact.price, exact: true }
  const area = width * height
  const diff = (c: CatalogItem) => Math.abs(c.length! * c.height! - area)
  const item = [...list].sort((a, b) => diff(a) - diff(b) || byVendor(a, b))[0]
  if (!item) return undefined
  const price = Math.round((item.price * area) / (item.length! * item.height!) / 10) * 10
  return { item, price, exact: false }
}
