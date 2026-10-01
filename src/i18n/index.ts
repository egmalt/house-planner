import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import { sections } from '../ui/useSection'

export const LANGUAGES = ['en', 'ru'] as const
export type Lang = (typeof LANGUAGES)[number]

type Tree = { [k: string]: string | Tree }

const isTree = (v: unknown): v is Tree => typeof v === 'object' && v !== null && !Array.isArray(v)

const merge = (into: Tree, from: Tree) => {
  for (const [k, v] of Object.entries(from)) {
    const cur = into[k]
    if (isTree(v) && isTree(cur)) merge(cur, v)
    else into[k] = v
  }
  return into
}

// Files are locales/<lng>/<ns>.json; extra parts like <ns>.<part>.json are deep-merged into <ns>.
const files = import.meta.glob<Tree>('./locales/*/*.json', { eager: true, import: 'default' })
const resources: Record<string, Record<string, Tree>> = {}
for (const [path, data] of Object.entries(files)) {
  const m = /\.\/locales\/([^/]+)\/([^/.]+)(?:\.[^/]+)?\.json$/.exec(path)
  if (!m) continue
  const [, lng, ns] = m
  const byNs = (resources[lng] ??= {})
  byNs[ns] = merge(byNs[ns] ?? {}, data)
}

const STORE_KEY = 'house-lang'
const CACHES = ['localStorage', 'cookie']

try {
  localStorage.removeItem('lang')
  localStorage.removeItem('i18nextLng')
} catch {}
for (const name of ['lang', 'i18nextLng']) document.cookie = `${name}=; max-age=0; path=/`

const detector = new LanguageDetector()

void i18n
  .use(detector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: [...LANGUAGES],
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    ns: ['common', 'plan', 'networks', 'estimate', 'info', 'map', 'view3d'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    returnNull: false,
    initAsync: false,
    saveMissing: import.meta.env.DEV,
    missingKeyHandler: (_lngs, ns, key) => console.warn(`[i18n] missing key ${ns}:${key}`),
    detection: {
      order: ['querystring', 'localStorage', 'cookie'],
      lookupQuerystring: 'lang',
      lookupLocalStorage: STORE_KEY,
      lookupCookie: STORE_KEY,
      caches: [],
      cookieMinutes: 60 * 24 * 365,
    },
  })

const remember = (lng: string) => detector.cacheUserLanguage(lng, CACHES)

const fromQuery = new URLSearchParams(window.location.search).get('lang')
if (fromQuery && (LANGUAGES as readonly string[]).includes(fromQuery)) remember(fromQuery)

const setMeta = (selector: string, content: string) => document.querySelector(selector)?.setAttribute('content', content)

const syncDocument = () => {
  const lng = i18n.resolvedLanguage === 'ru' ? 'ru' : 'en'
  const app = i18n.t('common:app.title')
  const id = window.location.hash.replace(/^#\/?/, '')
  const section = sections.find((s) => s.id === id) ?? sections[0]
  const title = `${app} — ${i18n.t(`common:${section.label}`)}`
  const description = i18n.t('common:app.description')
  document.documentElement.lang = lng
  document.title = title
  setMeta('meta[name="description"]', description)
  setMeta('meta[property="og:title"]', title)
  setMeta('meta[property="og:description"]', description)
  setMeta('meta[property="og:locale"]', lng === 'ru' ? 'ru_RU' : 'en_US')
  setMeta('meta[name="twitter:title"]', title)
  setMeta('meta[name="twitter:description"]', description)
}
syncDocument()
i18n.on('languageChanged', syncDocument)
window.addEventListener('hashchange', syncDocument)

export const lang = (): Lang => (i18n.resolvedLanguage === 'ru' ? 'ru' : 'en')
export const locale = () => (lang() === 'ru' ? 'ru-RU' : 'en-US')
export const setLang = (lng: Lang) => {
  remember(lng)
  return i18n.changeLanguage(lng)
}

const formats = new Map<string, Intl.NumberFormat>()
export const numberFormat = (opts: Intl.NumberFormatOptions = {}) => {
  const key = locale() + JSON.stringify(opts)
  let f = formats.get(key)
  if (!f) {
    f = new Intl.NumberFormat(locale(), opts)
    formats.set(key, f)
  }
  return f
}

// Locale-aware number: fmtNum(1234.5, 1) → "1,234.5" (en) / "1 234,5" (ru).
export const fmtNum = (v: number, maxDigits = 2, minDigits = 0) =>
  numberFormat({ maximumFractionDigits: maxDigits, minimumFractionDigits: minDigits }).format(v)

export const fmtRub = (v: number) => `${fmtNum(Math.round(v), 0)} ₽`

export const fmtDateTime = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleString(locale(), opts)

export const t = i18n.t.bind(i18n)
export default i18n
