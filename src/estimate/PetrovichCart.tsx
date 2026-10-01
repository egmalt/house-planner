import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSyncStore } from '../storage'
import { Button, Checkbox, Segmented } from '../ui'
import { fmtDate } from './format'
import {
  buildCart,
  CART_SECTIONS,
  cartItems,
  cartSection,
  cartSectionLabel,
  type CartResult,
  type CartSection,
  type City,
  type PetrovichLink,
} from './petrovich'
import type { Row } from './rows'

type Props = {
  rows: Row[]
  saved: PetrovichLink[]
  onSave: (links: PetrovichLink[]) => void
}

const CITY_IDS = ['spb', 'vbg'] as const

export function PetrovichCart({ rows, saved, onSave }: Props) {
  const { t } = useTranslation('estimate')
  const cities = CITY_IDS.map((value) => ({ value, label: t(`cart.cities.${value}`) }))
  const ref = useRef<HTMLDialogElement>(null)
  const [city, setCity] = useState<City>('spb')
  const [sections, setSections] = useState<Set<CartSection>>(() => new Set(CART_SECTIONS))
  const [onlyLeft, setOnlyLeft] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [results, setResults] = useState<CartResult[] | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const demo = useSyncStore((s) => s.demo)

  const picked = rows.filter((r) => sections.has(cartSection(r)) && (!onlyLeft || !r.bought))
  const total = cartItems(picked).length

  const run = async (split: boolean) => {
    const groups = split
      ? CART_SECTIONS.filter((s) => sections.has(s)).map((s) => ({ section: cartSectionLabel(s), items: cartItems(picked.filter((r) => cartSection(r) === s)) }))
      : [{ section: t('cart.all'), items: cartItems(picked) }]
    const jobs = groups.filter((g) => g.items.length)
    setBusy(jobs.reduce((s, g) => s + g.items.length, 0))
    setResults(null)
    const out = await Promise.all(jobs.map((g) => buildCart(g.section, city, g.items)))
    setBusy(null)
    setResults(out)
    const createdAt = new Date().toISOString()
    const links = out.filter((r) => r.url).map((r) => ({ section: r.section, url: r.url!, createdAt, count: r.added ?? r.count }))
    if (links.length) onSave(links)
  }

  const copy = (url: string) => void navigator.clipboard.writeText(url).then(() => setCopied(url))

  const links: { section: string; url: string; count: number; note?: string }[] = results
    ? results.filter((r) => r.url).map((r) => ({ section: r.section, url: r.url!, count: r.added ?? r.count }))
    : saved.map((l) => ({ ...l, note: fmtDate(l.createdAt.slice(0, 10)) }))

  return (
    <>
      <button
        type="button"
        className="est-tool"
        disabled={demo}
        title={demo ? t('cart.demoDisabled') : undefined}
        onClick={() => ref.current?.showModal()}
      >
        {t('cart.open')}
      </button>
      <dialog ref={ref} className="est-dialog card card--padded" onClose={() => setCopied(null)}>
        <div className="est-dialog__head">
          <h2 className="est-dialog__title">{t('cart.title')}</h2>
          <button type="button" className="est-tool" onClick={() => ref.current?.close()}>
            {t('cart.close')}
          </button>
        </div>

        <Segmented options={cities} value={city} onChange={setCity} size="sm" />

        <div className="est-dialog__sections">
          {CART_SECTIONS.map((s) => (
            <Checkbox
              key={s}
              label={cartSectionLabel(s)}
              checked={sections.has(s)}
              onChange={(on) => {
                const next = new Set(sections)
                if (on) next.add(s)
                else next.delete(s)
                setSections(next)
              }}
            />
          ))}
        </div>
        <Checkbox label={t('cart.onlyLeft')} checked={onlyLeft} onChange={setOnlyLeft} />

        <div className="est-dialog__actions">
          <Button variant="primary" size="sm" disabled={!total || busy !== null} onClick={() => void run(false)}>
            {t('cart.oneLink')}
          </Button>
          <Button size="sm" disabled={!total || busy !== null} onClick={() => void run(true)}>
            {t('cart.perSection')}
          </Button>
          <span className="est-dialog__hint">
            {busy !== null ? t('cart.building', { count: busy }) : t('cart.withCode', { count: total })}
          </span>
        </div>

        {links.length > 0 && (
          <ul className="est-dialog__links">
            {links.map((l) => (
              <li key={l.section + l.url}>
                <span className="est-dialog__section">
                  {l.section} · {t('cart.linkCount', { count: l.count })}{l.note ? ` · ${l.note}` : ''}
                </span>
                <a className="est-link" href={l.url} target="_blank" rel="noreferrer">
                  {t('cart.openLink')}
                </a>
                <button type="button" className="est-tool" onClick={() => copy(l.url)}>
                  {copied === l.url ? t('cart.copied') : t('cart.copy')}
                </button>
              </li>
            ))}
          </ul>
        )}

        {results?.map(
          (r) =>
            (r.error || r.missing.length > 0) && (
              <div key={r.section} className="est-dialog__missing">
                <b>{r.section}:</b> {r.error ? t('cart.error', { error: r.error }) : ''}
                {r.missing.length > 0 && <>{t('cart.missing', { list: r.missing.join(', ') })}</>}
              </div>
            ),
        )}
      </dialog>
    </>
  )
}
