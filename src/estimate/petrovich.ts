import { t } from '../i18n'
import { CLIENT_VERSION } from '../model'
import { showToast } from '../ui/Toast'
import { rowSku, isPetrovich } from './csv'
import type { Row } from './rows'

export const CART_SECTIONS = ['house', 'garage', 'electric', 'sewer', 'water', 'heating', 'other'] as const
export type CartSection = (typeof CART_SECTIONS)[number]

export const cartSectionLabel = (s: CartSection) => t(`estimate:cart.sections.${s}`)

const NETWORK_SECTIONS = ['electric', 'sewer', 'water', 'heating'] as const

export type City = 'vbg' | 'spb'

export type CartItem = { code: string; qty: number; name: string }

export type CartResult = {
  section: string
  url?: string
  count: number
  added?: number
  missing: string[]
  error?: string
}

export type PetrovichLink = { section: string; url: string; createdAt: string; count: number }

export function cartSection(r: Row): CartSection {
  const net = NETWORK_SECTIONS.find((s) => r.id.startsWith(`auto:${s}:`))
  if (net) return net
  const g = CART_SECTIONS.find((s) => r.group === cartSectionLabel(s))
  if (g) return g
  if (r.id.startsWith('auto:gate')) return 'garage'
  if (r.id.startsWith('auto:')) return 'house'
  return 'other'
}

export function cartItems(rows: Row[]): CartItem[] {
  const byCode = new Map<string, CartItem>()
  for (const r of rows) {
    const code = rowSku(r)
    if (!code || !isPetrovich(r) || r.qty <= 0) continue
    const it = byCode.get(code)
    if (it) it.qty += r.qty
    else byCode.set(code, { code, qty: r.qty, name: r.name })
  }
  return [...byCode.values()].map((i) => ({ ...i, qty: Math.ceil(i.qty - 1e-9) }))
}

const missingNames = (v: unknown, items: CartItem[]) => {
  if (!Array.isArray(v)) return []
  return v.map((m) => {
    if (typeof m === 'string') return items.find((i) => i.code === m)?.name ?? m
    const o = (m ?? {}) as { code?: string; name?: string; reason?: string }
    const name = o.name ?? items.find((i) => i.code === o.code)?.name ?? o.code ?? '?'
    return o.reason ? `${name} — ${o.reason}` : name
  })
}

let reloading = false
function reloadOutdated() {
  if (reloading) return
  reloading = true
  showToast(t('estimate:cart.outdated'))
  setTimeout(() => location.reload(), 1000)
}

export async function buildCart(section: string, city: City, items: CartItem[]): Promise<CartResult> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}api/petrovich-cart.php`, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'X-Requested-With': 'fetch',
        'X-Client-Version': String(CLIENT_VERSION),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ city, items }),
    })
    if (res.status === 426) {
      reloadOutdated()
      return { section, count: items.length, missing: [], error: t('estimate:cart.outdated') }
    }
    const data = (await res.json().catch(() => ({}))) as { url?: string; added?: unknown; missing?: unknown; error?: string }
    if (!res.ok || !data.url) {
      return { section, count: items.length, missing: missingNames(data.missing, items), error: data.error ?? `HTTP ${res.status}` }
    }
    const added = typeof data.added === 'number' ? data.added : Array.isArray(data.added) ? data.added.length : undefined
    return { section, url: data.url, count: items.length, added, missing: missingNames(data.missing, items) }
  } catch (e) {
    return { section, count: items.length, missing: [], error: (e as Error).message }
  }
}
