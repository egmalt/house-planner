import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { HeatingLoop, HeatingStep, Plan } from '../../model'
import { formatMoney } from '../../model'
import { fmtNum } from '../../i18n'
import { unitLabel } from '../../i18n/units'
import { usePlanStore } from '../../store/planStore'
import { useViewOnly } from '../../store/viewOnly'
import { useCatalog } from '../../estimate/catalog'
import { Button, IconButton, Input, Segmented, Table, Td, Th, Tr } from '../../ui'
import { computeHeating, coverLabel, type HeatingWarning } from './calc'
import { rerouteAll } from './layout'
import { PIPES, STEPS, deleteLoop, heatingOf, paramsOf, setCollector, setParams, updateLoop, withHeating } from './model'
import { heatingSum, noPrice, priceHeating } from './pricing'
import { useHeatingUi } from './store'
import { useLayerLocks } from '../locks'
import { useNetworkEdit } from '../registry'
import { runAutoLayout } from './actions'
import './heating.css'

const fmt = (v: number, d = 1) => fmtNum(v, d)

const CLOSE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

const STEP_OPTIONS = STEPS.map((s) => ({ value: String(s), label: `${s}` }))
const PATTERNS = ['spiral', 'snake'] as const

export type HeatingSelection = { loop: HeatingLoop | null; collector: boolean }

export function useHeatingSelection(plan: Plan | null): HeatingSelection | null {
  const selected = useHeatingUi((s) => s.selected)
  const collectorSelected = useHeatingUi((s) => s.collectorSelected)
  if (!plan) return null
  const h = heatingOf(plan)
  if (collectorSelected && h.collector) return { loop: null, collector: true }
  const loop = selected ? h.loops.find((l) => l.id === selected) : undefined
  return loop ? { loop, collector: false } : null
}

export function HeatingInspector({ plan, sel }: { plan: Plan; sel: HeatingSelection }) {
  const { t } = useTranslation('networks')
  const commit = usePlanStore((s) => s.commit)
  const select = useHeatingUi((s) => s.select)
  const calc = useMemo(() => computeHeating(plan), [plan])
  const h = heatingOf(plan)

  if (sel.collector && h.collector) {
    const col = h.collector
    return (
      <aside className="inspector card">
        <div className="inspector__head">
          <IconButton label={t('heating.panel.clearSelection')} size="sm" className="inspector__close" onClick={() => select(null)}>
            {CLOSE_ICON}
          </IconButton>
          <div className="eyebrow">{t('heating.layer')}</div>
          <div className="inspector__title">{t('heating.panel.collector')}</div>
        </div>
        <dl className="props">
          <dt>{t('heating.panel.loops')}</dt>
          <dd>{calc.loops.length}</dd>
          <dt>{t('heating.panel.flow')}</dt>
          <dd>{t('heating.panel.flowM3h', { v: fmt(calc.totals.flowLh / 1000, 2) })}</dd>
          <dt>{t('heating.panel.pump')}</dt>
          <dd>{t('heating.panel.head', { v: fmt(calc.totals.pumpKPa / 9.81) })}</dd>
        </dl>
        <label className="row row--center hp-field">
          <span>{t('heating.panel.outputs')}</span>
          <Input
            size="sm"
            type="number"
            min={1}
            max={24}
            step={1}
            className="hp-num"
            value={col.outputs}
            onChange={(ev) => {
              const v = Math.round(Number(ev.target.value))
              if (v > 0) commit(setCollector(plan, { ...col, outputs: v }))
            }}
          />
        </label>
        <label className="row row--center hp-field">
          <span>{t('heating.panel.label')}</span>
          <Input
            size="sm"
            className="hp-text"
            value={col.label ?? ''}
            onChange={(ev) => {
              const next = { ...col }
              if (ev.target.value) next.label = ev.target.value
              else delete next.label
              commit(setCollector(plan, next))
            }}
          />
        </label>
        <div className="inspector__actions">
          <Button size="sm" variant="ghost" onClick={() => commit(withHeating(plan, () => rerouteAll(plan)))}>
            {t('heating.panel.reroute')}
          </Button>
        </div>
      </aside>
    )
  }

  const loop = sel.loop
  if (!loop) return null
  const c = calc.loops.find((x) => x.loop.id === loop.id)
  const patch = (p: Partial<HeatingLoop>) => commit(updateLoop(plan, loop.id, p))
  return (
    <aside className="inspector card">
      <div className="inspector__head">
        <IconButton label={t('heating.panel.clearSelection')} size="sm" className="inspector__close" onClick={() => select(null)}>
          {CLOSE_ICON}
        </IconButton>
        <div className="eyebrow">{t('heating.panel.loopEyebrow', { id: loop.id })}</div>
        <div className="inspector__title">{loop.roomName ?? loop.id}</div>
      </div>
      {c ? (
        <dl className="props">
          <dt>{t('heating.panel.area')}</dt>
          <dd>{fmt(c.areaM2)} {t('common:units.m2')}</dd>
          <dt>{t('heating.panel.pipe')}</dt>
          <dd>
            {Math.round(c.lengthM)} {t('common:units.m')} <span className="muted">{t('heating.panel.feed', { v: fmt(c.feedM) })}</span>
          </dd>
          <dt>{t('heating.panel.power')}</dt>
          <dd>
            {Math.round(c.powerW)} {t('common:units.w')} · {Math.round(c.qWm2)} {t('heating.panel.wm2')}
          </dd>
          <dt>{t('heating.panel.floor')}</dt>
          <dd>
            {coverLabel(c.cover)}, ≈{fmt(c.floorT)} °C
          </dd>
          <dt>{t('heating.panel.flow')}</dt>
          <dd>
            {fmt(c.flowLmin, 2)} {t('heating.panel.lmin')} · {fmt(c.dpKPa)} {t('heating.panel.kpa')}
          </dd>
        </dl>
      ) : (
        <p className="muted">{t('heating.panel.excludedFromCalc')}</p>
      )}
      <div className="hp-form">
        <label className="row row--center hp-field">
          <span>{t('heating.panel.step')}</span>
          <Segmented size="sm" value={String(loop.stepMm)} options={STEP_OPTIONS} onChange={(v) => patch({ stepMm: Number(v) as HeatingStep })} />
        </label>
        <label className="row row--center hp-field">
          <span>{t('heating.panel.pattern')}</span>
          <Segmented size="sm" value={loop.pattern} options={PATTERNS.map((v) => ({ value: v, label: t(`heating.panel.${v}`) }))} onChange={(v) => patch({ pattern: v as HeatingLoop['pattern'] })} />
        </label>
        <label className="row row--center hp-field">
          <span>{t('heating.panel.pipe')}</span>
          <select className="select" value={loop.pipe} onChange={(ev) => patch({ pipe: ev.target.value })}>
            {[...new Set([...PIPES, loop.pipe])].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="inspector__actions">
        <Button size="sm" variant="ghost" onClick={() => patch({ off: loop.off ? undefined : true })}>
          {loop.off ? t('heating.panel.include') : t('heating.panel.exclude')}
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={() => {
            commit(deleteLoop(plan, loop.id))
            select(null)
          }}
        >
          {t('heating.panel.deleteLoop')}
        </Button>
      </div>
    </aside>
  )
}

function Warnings({ list }: { list: HeatingWarning[] }) {
  const { t } = useTranslation('networks')
  const select = useHeatingUi((s) => s.select)
  if (!list.length) return <p className="muted">{t('heating.panel.noWarnings')}</p>
  return (
    <div className="hp-warnings">
      {list.map((w, i) => (
        <button key={i} type="button" className={`hp-warning hp-warning--${w.level}`} onClick={() => w.loopId && select(w.loopId)}>
          {w.text}
        </button>
      ))}
    </div>
  )
}

export function HeatingSummary({ plan }: { plan: Plan }) {
  const { t } = useTranslation('networks')
  const commit = usePlanStore((s) => s.commit)
  const locked = useLayerLocks().heating
  const viewOnly = useViewOnly() || locked
  const editing = useNetworkEdit((s) => s.editing === 'heating')
  const catalog = useCatalog()
  const selected = useHeatingUi((s) => s.selected)
  const select = useHeatingUi((s) => s.select)
  const h = heatingOf(plan)
  const p = paramsOf(h)
  const calc = useMemo(() => computeHeating(plan), [plan])
  const priced = useMemo(() => priceHeating(calc.items, h.materials, catalog), [calc, h.materials, catalog])
  const total = priced.reduce((s, i) => s + heatingSum(i), 0)
  const missing = priced.filter((i) => i.price === undefined).length
  const tot = calc.totals
  const num = (key: 'supplyT' | 'returnT' | 'screedMm' | 'floorT', label: string, unit: string, placeholder?: string) => (
    <label className="row row--center hp-field">
      <span>{label}</span>
      <span className="hp-pair">
        <Input
          size="sm"
          type="number"
          className="hp-num"
          disabled={viewOnly}
          value={h.params?.[key] ?? (placeholder ? '' : p[key] ?? '')}
          placeholder={placeholder}
          onChange={(ev) => {
            const v = ev.target.value === '' ? undefined : Number(ev.target.value)
            if (v === undefined || Number.isFinite(v)) commit(setParams(plan, { [key]: v }))
          }}
        />
        <span className="muted">{unit}</span>
      </span>
    </label>
  )

  return (
    <div className="hp-summary">
      <div className="inspector__head">
        <div className="eyebrow">{t('heating.panel.layerEyebrow')}</div>
        <div className="inspector__title">{t('heating.layer')}</div>
      </div>
      {!viewOnly && (
        <div className="hp-actions">
          <Button size="sm" onClick={runAutoLayout}>
            {t('heating.tools.autoLayout')}
          </Button>
          {h.collector && h.loops.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => commit(withHeating(plan, () => rerouteAll(plan)))}>
              {t('heating.panel.reroute')}
            </Button>
          )}
        </div>
      )}
      <dl className="props">
        <dt>{t('heating.panel.loops')}</dt>
        <dd>
          {calc.loops.length}
          {h.loops.length > calc.loops.length ? t('heating.panel.excludedCount', { n: h.loops.length - calc.loops.length }) : ''}
        </dd>
        <dt>{t('heating.panel.area')}</dt>
        <dd>{fmt(tot.areaM2)} {t('common:units.m2')}</dd>
        <dt>{t('heating.panel.pipe')}</dt>
        <dd>{Math.round(tot.pipeM)} {t('common:units.m')}</dd>
        <dt>{t('heating.panel.floorGives')}</dt>
        <dd>{fmt(tot.powerW / 1000, 2)} {t('common:units.kw')}</dd>
        <dt>{t('heating.panel.heatLoss')}</dt>
        <dd>≈{fmt(tot.lossW / 1000, 2)} {t('common:units.kw')}</dd>
        <dt>{t('heating.panel.boiler')}</dt>
        <dd>{t('heating.panel.boilerFrom', { v: tot.boilerKW })}</dd>
        <dt>{t('heating.panel.unit')}</dt>
        <dd>
          {t('heating.panel.unitValue', { flow: fmt(tot.flowLh / 1000, 2), head: fmt(tot.pumpKPa / 9.81) })}
        </dd>
        <dt>{t('heating.panel.collector')}</dt>
        <dd>{h.collector ? t('heating.panel.collectorOutputs', { n: h.collector.outputs }) : t('heating.panel.notPlaced')}</dd>
      </dl>

      <div className="inspector__section">
        <strong>{t('heating.panel.loopsTitle')}</strong>
        {h.loops.length === 0 ? (
          <p className="muted">{t('heating.panel.noLoops')}</p>
        ) : (
          <Table dense className="hp-table">
            <thead>
              <tr>
                <Th>{t('heating.panel.room')}</Th>
                <Th num>{t('common:units.m2')}</Th>
                <Th num>{t('heating.panel.colStep')}</Th>
                <Th num>{t('common:units.m')}</Th>
                <Th num>{t('common:units.w')}</Th>
              </tr>
            </thead>
            <tbody>
              {h.loops.map((l) => {
                const c = calc.loops.find((x) => x.loop.id === l.id)
                return (
                  <Tr key={l.id} className={`hp-row ${selected === l.id ? 'hp-row--active' : ''} ${l.off ? 'hp-row--off' : ''}`} onClick={() => editing && select(selected === l.id ? null : l.id)}>
                    <Td>
                      {l.roomName ?? l.id}
                      {c && (
                        <div className="muted hp-sub">
                          {coverLabel(c.cover)} · {fmt(c.flowLmin, 2)} {t('heating.panel.lmin')} · {fmt(c.dpKPa)} {t('heating.panel.kpa')}
                        </div>
                      )}
                    </Td>
                    <Td num>{c ? fmt(c.areaM2) : '—'}</Td>
                    <Td num>{l.stepMm}</Td>
                    <Td num className={c && c.lengthM > 80 ? 'hp-bad' : undefined}>
                      {c ? Math.round(c.lengthM) : '—'}
                    </Td>
                    <Td num>{c ? Math.round(c.powerW) : '—'}</Td>
                  </Tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="hp-total">
                <Td>{t('heating.panel.total')}</Td>
                <Td num>{fmt(tot.areaM2)}</Td>
                <Td num />
                <Td num>{Math.round(tot.pipeM)}</Td>
                <Td num>{Math.round(tot.powerW)}</Td>
              </tr>
            </tfoot>
          </Table>
        )}
      </div>

      {calc.rooms.length > 0 && (
        <div className="inspector__section">
          <strong>{t('heating.panel.roomsTitle')}</strong>
          <Table dense className="hp-table">
            <thead>
              <tr>
                <Th>{t('heating.panel.room')}</Th>
                <Th num>{t('heating.panel.colLoss')}</Th>
                <Th num>{t('heating.panel.colFloor')}</Th>
              </tr>
            </thead>
            <tbody>
              {calc.rooms.map((b) => (
                <tr key={b.key}>
                  <Td>
                    {b.name}
                    <div className="muted hp-sub">
                      {fmt(b.areaM2)} {t('common:units.m2')} × {b.lossWm2} {t('heating.panel.wm2')}
                    </div>
                  </Td>
                  <Td num>{Math.round(b.lossW)}</Td>
                  <Td num className={b.ok ? 'hp-ok' : 'hp-bad'}>
                    {Math.round(b.powerW)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <div className="inspector__section">
        <strong>{t('heating.panel.params')}</strong>
        <div className="hp-form">
          {num('supplyT', t('heating.panel.supply'), '°C')}
          {num('returnT', t('heating.panel.return'), '°C')}
          {num('floorT', t('heating.panel.floorLimit'), '°C', t('heating.panel.norm'))}
          {num('screedMm', t('heating.panel.screed'), t('common:units.mm'))}
          <label className="row row--center hp-field">
            <span>{t('heating.panel.insulation')}</span>
            <Input size="sm" className="hp-text" disabled={viewOnly} value={p.insulation} onChange={(ev) => commit(setParams(plan, { insulation: ev.target.value || undefined }))} />
          </label>
          <label className="row row--center hp-field">
            <span>{t('heating.panel.screedMix')}</span>
            <select className="select" disabled={viewOnly} value={p.screedMix} onChange={(ev) => commit(setParams(plan, { screedMix: ev.target.value as 'cps' | 'cement-sand' }))}>
              <option value="cement-sand">{t('heating.panel.cementSand')}</option>
              <option value="cps">{t('heating.panel.cps')}</option>
            </select>
          </label>
          <label className="row row--center hp-field">
            <span>{t('heating.panel.fixing')}</span>
            <select className="select" disabled={viewOnly} value={p.fixing} onChange={(ev) => commit(setParams(plan, { fixing: ev.target.value as 'mesh' | 'staples' }))}>
              <option value="mesh">{t('heating.panel.mesh')}</option>
              <option value="staples">{t('heating.panel.staples')}</option>
            </select>
          </label>
        </div>
      </div>

      <div className="inspector__section">
        <strong>{t('heating.panel.materials')}</strong>
        <div className="hp-items">
          {priced.map((i) => (
            <div key={i.key} className="hp-item">
              <div className="hp-item__name">
                {i.url ? (
                  <a href={i.url} target="_blank" rel="noreferrer">
                    {i.name}
                  </a>
                ) : (
                  i.name
                )}
                <div className="muted hp-sub">{i.priceFrom}</div>
              </div>
              <div className="hp-item__qty">
                {fmt(i.buyQty)} {unitLabel(i.buyUnit)}
              </div>
              <div className="hp-item__sum">{i.price !== undefined ? formatMoney(heatingSum(i)) : '—'}</div>
            </div>
          ))}
          {!priced.length && <p className="muted">{t('heating.panel.noMaterials')}</p>}
        </div>
        <div className="row total">
          <span>{t('heating.panel.materialsTotal')}</span>
          <strong>{formatMoney(total)}</strong>
        </div>
        {missing > 0 && (
          <div className="muted">
            {t('heating.panel.noPriceCount', { label: noPrice(), n: missing })}
          </div>
        )}
      </div>

      <div className="inspector__section">
        <strong>{t('heating.panel.warnings')}</strong>
        <Warnings list={calc.warnings} />
      </div>

      <details className="inspector__section hp-howto">
        <summary>{t('heating.panel.howto')}</summary>
        <ol>
          {(t('heating.steps', { returnObjects: true }) as string[]).map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        <p className="muted">
          {t('heating.panel.howtoNote')}
        </p>
      </details>
    </div>
  )
}
