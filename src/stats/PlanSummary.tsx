import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { t, numberFormat } from '../i18n'
import { formatMoney, formatNumber } from '../model'
import type { PlanWithRooms } from './rooms'
import { computePlanSummary, type BuildingSummary, type Clearance } from './summary'
import './stats.css'

const m2 = (v: number) => `${numberFormat({ minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)} ${t('common:units.m2')}`
const m = (v: number) => `${formatNumber(v, 1)} ${t('common:units.m')}`

function Row({ label, children, bad }: { label: ReactNode; children: ReactNode; bad?: ReactNode }) {
  return (
    <div className="plan-stats__row">
      <dt>{label}</dt>
      <dd>
        {children}
        {bad && <span className="plan-stats__bad">{bad}</span>}
      </dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="plan-stats__section">
      <h3 className="plan-stats__title">{title}</h3>
      <dl className="plan-stats__list">{children}</dl>
    </section>
  )
}

function ClearanceRow({ label, c }: { label: string; c: Clearance | undefined }) {
  if (!c) return null
  return (
    <Row label={label} bad={c.ok ? undefined : t('plan:summary.lessThan', { norm: m(c.normM) })}>
      {m(c.distanceM)}
    </Row>
  )
}

function neighbourSides(note: string | undefined, n: number) {
  const out: { side: number; name: string }[] = []
  for (const x of (note ?? '').matchAll(/сторона\s+(\d+)\s*[–-]\s*(\d+)\s*—\s*граница с\s+(:?\d+)/giu)) {
    const i = Number(x[1]) % n
    const j = Number(x[2]) % n
    const side = j === (i + 1) % n ? i : i === (j + 1) % n ? j : -1
    if (side >= 0) out.push({ side, name: x[3] })
  }
  return out
}

const minBy = (items: Clearance[]) =>
  items.reduce<Clearance | undefined>((best, c) => (!best || c.distanceM < best.distanceM ? c : best), undefined)

function lowerName(b: BuildingSummary) {
  return b.name.toLowerCase()
}

export function PlanSummary({ plan }: { plan: PlanWithRooms }) {
  const { t } = useTranslation('plan')
  const s = useMemo(() => computePlanSummary(plan), [plan])
  const { totals, site } = s
  const homes = s.buildings.filter((b) => b.kind === 'house')
  const others = s.buildings.filter((b) => b.kind !== 'house')
  const rooms = homes.flatMap((b) => b.rooms)
  const sideCount = s.buildings[0]?.clearances.filter((c) => c.side !== undefined).length ?? 0
  const neighbours = neighbourSides(plan.site.note, sideCount || 1)
  const many = s.buildings.length > 1
  const suffix = (b: BuildingSummary) => (many ? ` · ${lowerName(b)}` : '')
  const badGaps = site.gaps.filter((g) => !g.ok)

  if (s.buildings.length === 0) {
    return <p className="plan-stats__empty">{t('summary.empty')}</p>
  }

  return (
    <div className="plan-stats">
      {homes.map((b) => (
        <Section key={b.id} title={b.name}>
          <Row label={t('summary.totalArea')}>{m2(b.totalAreaM2)}</Row>
          <Row label={t('summary.livingArea')}>{m2(b.livingAreaM2)}</Row>
          <Row label={t('summary.rooms')}>{b.livingRooms}</Row>
          <Row label={t('summary.bedrooms')}>{b.bedrooms}</Row>
          <Row label={t('summary.baths')}>{b.baths}</Row>
          <Row label={t('summary.footprint')}>{m2(b.footprintM2)}</Row>
          <Row label={t('summary.height')}>{`${formatNumber(b.heightM, 2)} ${t('common:units.m')}`}</Row>
        </Section>
      ))}
      {homes.length > 1 && (
        <Section title={t('summary.allHouses')}>
          <Row label={t('summary.totalArea')}>{m2(totals.totalAreaM2)}</Row>
          <Row label={t('summary.livingArea')}>{m2(totals.livingAreaM2)}</Row>
        </Section>
      )}

      {rooms.length > 0 && (
        <Section title={t('summary.roomsSection')}>
          {rooms.map((r) => (
            <Row key={r.id} label={r.name} bad={r.lightOk === false ? t('summary.lowLight') : undefined}>
              {m2(r.areaM2)}
            </Row>
          ))}
        </Section>
      )}

      {others.map((b) => (
        <Section key={b.id} title={b.name}>
          <Row label={t('summary.area')}>{m2(b.totalAreaM2)}</Row>
        </Section>
      ))}

      <Section title={t('summary.site')}>
        <Row label={t('summary.area')}>{t('summary.siteArea', { area: m2(site.areaM2), ares: formatNumber(site.areaM2 / 100, 1) })}</Row>
        <Row label={t('summary.built')}>{`${m2(site.builtM2)} · ${formatNumber(site.builtPct, 1)} %`}</Row>
        {s.buildings.map((b) => (
          <ClearanceRow key={`st-${b.id}`} label={`${t('summary.toStreet')}${suffix(b)}`} c={minBy(b.clearances.filter((c) => c.target === 'street'))} />
        ))}
        {s.buildings.map((b) => (
          <ClearanceRow key={`bd-${b.id}`} label={`${t('summary.toBorders')}${suffix(b)}`} c={minBy(b.clearances.filter((c) => c.target === 'side'))} />
        ))}
        {neighbours.flatMap((nb) =>
          s.buildings.map((b) => (
            <ClearanceRow
              key={`nb-${nb.side}-${b.id}`}
              label={`${t('summary.toNeighbour', { name: nb.name })}${suffix(b)}`}
              c={b.clearances.find((c) => c.side === nb.side)}
            />
          )),
        )}
        {badGaps.map((g) => (
          <ClearanceRow key={g.label} label={g.label} c={g} />
        ))}
        {s.unmatchedLabels.length > 0 && (
          <Row label={t('summary.unmatchedLabels')} bad={s.unmatchedLabels.join(', ')}>
            {''}
          </Row>
        )}
      </Section>

      <Section title={t('summary.wallCost')}>
        <Row label={t('summary.withWaste', { pct: formatNumber(s.estimate.wastePct, 1) })} bad={s.estimate.missingPrices > 0 ? t('summary.noPrice', { count: s.estimate.missingPrices }) : undefined}>
          {formatMoney(s.estimate.total)}
        </Row>
      </Section>
    </div>
  )
}
