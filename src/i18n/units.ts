import { lang, t } from '.'

const SYNONYMS: Record<string, string> = {
  pcs: 'pcs', pc: 'pcs', шт: 'pcs', штука: 'pcs', штук: 'pcs',
  m: 'm', м: 'm', 'пог. м': 'm', 'пог.м': 'm', 'пог м': 'm', 'пог. м.': 'm', 'м.п.': 'm', 'мп': 'm', 'п.м.': 'm',
  m2: 'm2', 'm²': 'm2', м2: 'm2', 'м²': 'm2', 'кв. м': 'm2', 'кв.м': 'm2',
  m3: 'm3', 'm³': 'm3', м3: 'm3', 'м³': 'm3', 'куб. м': 'm3', 'куб.м': 'm3',
  mm: 'mm', мм: 'mm', cm: 'cm', см: 'cm',
  roll: 'roll', рул: 'roll', рулон: 'roll',
  coil: 'coil', бухта: 'coil', бухт: 'coil',
  pack: 'pack', упак: 'pack', уп: 'pack', упаковка: 'pack',
  kg: 'kg', кг: 'kg',
  l: 'l', л: 'l',
  set: 'set', компл: 'set', комплект: 'set',
  sheet: 'sheet', лист: 'sheet',
  kit: 'kit', домокомплект: 'kit',
}

const keyOf = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '')

const code = (raw: string) => SYNONYMS[keyOf(raw)] ?? SYNONYMS[raw.trim().toLowerCase().replace(/\s+/g, ' ')]

const TOKENS = Object.keys(SYNONYMS)
  .filter((k) => /[а-яё]/i.test(k))
  .sort((a, b) => b.length - a.length)
  .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

const TOKEN_RE = new RegExp(`(?<![а-яёa-z])(${TOKENS.join('|')})\\.?(?![а-яёa-z0-9²³])`, 'gi')

// Display label for a unit from plan or catalog data ("шт", "пог. м", "упак (5 шт, 3.51 м²)"); data stays untouched.
export function unitLabel(raw: string | undefined): string {
  if (!raw) return ''
  const c = code(raw)
  if (c) return lang() === 'ru' && /[а-яё]/i.test(raw) ? raw : t(`common:units.${c}`)
  if (lang() === 'ru') return raw
  return raw.replace(TOKEN_RE, (m) => {
    const k = code(m)
    return k ? t(`common:units.${k}`) : m
  })
}
