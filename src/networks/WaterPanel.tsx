import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fmtNum } from '../i18n'
import { fmtM, unitLabel } from './labels'
import { formatLength, formatMoney, type Plan, type SewerFixture, type WaterDiameter, type WaterNode, type WaterPipe } from '../model'
import { usePlanStore } from '../store/planStore'
import { useViewOnly } from '../store/viewOnly'
import { useCatalog } from '../estimate/catalog'
import { LengthField } from '../ui/LengthField'
import { Button, IconButton, Input, Segmented } from '../ui'
import type { SewerRef } from './sewerCalc'
import { fixtureLabels } from './sewerModel'
import { computeWater, type WaterCalc } from './waterCalc'
import { priceWater, waterSum } from './waterPricing'
import {
  DIAMETERS,
  LINE_LABELS,
  LINE_SHORT,
  deleteWaterNode,
  deleteWaterPipe,
  pipeMaterial,
  updateWaterNode,
  updateWaterPipe,
  waterKindLabels,
  waterOf,
  waterPipeLength,
  wNode,
} from './waterModel'
import { useWaterUi } from './waterStore'
import './networks.css'

const fmt = (v: number, d = 2) => fmtNum(v, d)

export function useWaterSelection(plan: Plan | null): SewerRef | null {
  const selected = useWaterUi((s) => s.selected)
  if (!plan || !selected) return null
  const w = waterOf(plan)
  const ok = selected.kind === 'node' ? w.nodes.some((n) => n.id === selected.id) : w.pipes.some((p) => p.id === selected.id)
  return ok ? selected : null
}

function Close() {
  const { t } = useTranslation('networks')
  const select = useWaterUi((s) => s.select)
  return (
    <IconButton label={t('shared.ui.close')} size="sm" className="inspector__close" onClick={() => select(null)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </IconButton>
  )
}

function Warnings({ calc, refId }: { calc: WaterCalc; refId?: string }) {
  const list = refId ? calc.warnings.filter((w) => w.ref?.id === refId) : calc.warnings
  if (!list.length) return null
  return (
    <div className="net-warnings">
      {list.map((w, i) => (
        <div key={i} className="layout-hint layout-hint--warn">
          {w.text}
        </div>
      ))}
    </div>
  )
}

export function WaterInspector({ plan, sel }: { plan: Plan; sel: SewerRef }) {
  const calc = useMemo(() => computeWater(plan), [plan])
  const w = waterOf(plan)
  if (sel.kind === 'pipe') {
    const p = w.pipes.find((x) => x.id === sel.id)
    return p ? <PipeInspector plan={plan} pipe={p} calc={calc} /> : null
  }
  const n = w.nodes.find((x) => x.id === sel.id)
  return n ? <NodeInspector plan={plan} node={n} calc={calc} /> : null
}

function PipeInspector({ plan, pipe, calc }: { plan: Plan; pipe: WaterPipe; calc: WaterCalc }) {
  const { t } = useTranslation('networks')
  const commit = usePlanStore((s) => s.commit)
  const w = waterOf(plan)
  const set = (patch: Partial<WaterPipe>) => commit(updateWaterPipe(plan, pipe.id, patch))
  const name = (n?: WaterNode) => (n ? `${n.kind === 'fixture' && n.fixture ? fixtureLabels[n.fixture] : waterKindLabels[n.kind]} ${n.id}` : '—')
  return (
    <aside className="inspector card">
      <div className="inspector__head">
        <Close />
        <div className="eyebrow">{t('water.panel.eyebrowPipe')}</div>
        <div className="inspector__title">
          {LINE_SHORT[pipe.line]} Ø{pipe.diameter} {pipeMaterial(pipe)}
        </div>
      </div>
      <div className="form">
        <div className="form__row">
          <span>{t('water.panel.line')}</span>
          <Segmented
            size="sm"
            value={pipe.line}
            options={(['cold', 'hot', 'recirc'] as const).map((l) => ({ value: l, label: LINE_LABELS[l] }))}
            onChange={(line) => set({ line })}
          />
        </div>
        <div className="form__row">
          <span>{t('shared.ui.diameter')}</span>
          <Segmented size="sm" value={String(pipe.diameter)} options={DIAMETERS.map((d) => ({ value: String(d), label: `Ø${d}` }))} onChange={(v) => set({ diameter: Number(v) as WaterDiameter })} />
        </div>
        <div className="form__row">
          <span>{t('water.panel.material')}</span>
          <Segmented size="sm" value={pipeMaterial(pipe)} options={(['PEX', 'PPR', 'PE'] as const).map((m) => ({ value: m, label: m }))} onChange={(material) => set({ material })} />
        </div>
        <div className="form__row">
          <span>{t('shared.ui.where')}</span>
          <Segmented
            size="sm"
            value={pipe.location}
            options={[
              { value: 'inside', label: t('shared.ui.inside') },
              { value: 'outside', label: t('shared.ui.outside') },
            ]}
            onChange={(location) => set({ location })}
          />
        </div>
        {pipe.location === 'outside' && (
          <>
            <label className="form__row">
              <span>{t('water.panel.depth')}</span>
              <LengthField value={pipe.depth ?? 0} min={0} onCommit={(depth) => set({ depth })} />
            </label>
            <div className="form__row">
              <span>{t('water.panel.heatCable')}</span>
              <Segmented
                size="sm"
                value={pipe.heated ? 'yes' : 'no'}
                options={[
                  { value: 'no', label: t('water.panel.no') },
                  { value: 'yes', label: t('water.panel.yes') },
                ]}
                onChange={(v) => set({ heated: v === 'yes' })}
              />
            </div>
          </>
        )}
      </div>
      <dl className="props props--compact">
        <dt>{t('shared.ui.length')}</dt>
        <dd>{formatLength(waterPipeLength(w, pipe))}</dd>
        <dt>{t('water.panel.feed')}</dt>
        <dd>
          {name(wNode(w, pipe.from))} → {name(wNode(w, pipe.to))}
        </dd>
      </dl>
      <Warnings calc={calc} refId={pipe.id} />
      <div className="inspector__actions">
        <Button size="sm" onClick={() => set({ from: pipe.to, to: pipe.from })}>
          {t('water.panel.reverse')}
        </Button>
        <Button size="sm" variant="danger" onClick={() => commit(deleteWaterPipe(plan, pipe.id))}>
          {t('shared.ui.delete')}
        </Button>
      </div>
      <p className="hint">{t('water.panel.pipeHint')}</p>
    </aside>
  )
}

const KINDS: WaterNode['kind'][] = ['source', 'entry', 'pump', 'filter', 'boiler', 'collector', 'fixture', 'junction', 'tap_outdoor']

function NodeInspector({ plan, node, calc }: { plan: Plan; node: WaterNode; calc: WaterCalc }) {
  const { t } = useTranslation('networks')
  const commit = usePlanStore((s) => s.commit)
  const set = (patch: Partial<WaterNode>) => commit(updateWaterNode(plan, node.id, patch))
  const [model, setModel] = useState<string | null>(null)
  const used = waterOf(plan).pipes.filter((p) => p.from === node.id).length
  return (
    <aside className="inspector card">
      <div className="inspector__head">
        <Close />
        <div className="eyebrow">{t('water.panel.eyebrowNode', { kind: waterKindLabels[node.kind].toLowerCase() })}</div>
        <div className="inspector__title">{node.kind === 'fixture' && node.fixture ? fixtureLabels[node.fixture] : node.model || waterKindLabels[node.kind]}</div>
      </div>
      <div className="form">
        <label className="form__row">
          <span>{t('shared.ui.type')}</span>
          <select className="select form__select" value={node.kind} onChange={(e) => set({ kind: e.target.value as WaterNode['kind'] })}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {waterKindLabels[k]}
              </option>
            ))}
          </select>
        </label>
        {node.kind === 'fixture' && (
          <label className="form__row">
            <span>{t('shared.ui.fixture')}</span>
            <select className="select form__select" value={node.fixture ?? ''} onChange={(e) => set({ fixture: e.target.value as SewerFixture })}>
              {(Object.keys(fixtureLabels) as SewerFixture[]).map((f) => (
                <option key={f} value={f}>
                  {fixtureLabels[f]}
                </option>
              ))}
            </select>
          </label>
        )}
        {node.kind === 'source' && (
          <div className="form__row">
            <span>{t('water.panel.source')}</span>
            <Segmented
              size="sm"
              value={node.source ?? 'borehole'}
              options={[
                { value: 'borehole', label: t('water.source.borehole') },
                { value: 'well', label: t('water.source.well') },
              ]}
              onChange={(source) => set({ source })}
            />
          </div>
        )}
        {node.kind === 'collector' && (
          <>
            <div className="form__row">
              <span>{t('water.panel.water')}</span>
              <Segmented
                size="sm"
                value={node.line ?? 'cold'}
                options={[
                  { value: 'cold', label: LINE_LABELS.cold },
                  { value: 'hot', label: LINE_LABELS.hot },
                ]}
                onChange={(line) => set({ line })}
              />
            </div>
            <label className="form__row">
              <span>{t('water.panel.outputs')}</span>
              <Input
                size="sm"
                type="number"
                min={2}
                max={12}
                value={node.outputs ?? Math.max(used, 2)}
                onChange={(e) => {
                  const v = Math.round(Number(e.target.value))
                  if (v >= 2 && v <= 12) set({ outputs: v })
                }}
              />
            </label>
          </>
        )}
        {(node.kind === 'pump' || node.kind === 'filter' || node.kind === 'boiler' || node.kind === 'source' || node.kind === 'collector') && (
          <label className="form__row">
            <span>{t('shared.ui.model')}</span>
            <Input
              size="sm"
              value={model ?? node.model ?? ''}
              onChange={(e) => setModel(e.target.value)}
              onBlur={() => {
                if (model === null) return
                const v = model.trim()
                setModel(null)
                if (v !== (node.model ?? '')) set({ model: v || undefined })
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </label>
        )}
      </div>
      <dl className="props props--compact">
        {node.kind === 'collector' && (
          <>
            <dt>{t('water.panel.usedOutputs')}</dt>
            <dd>{used}</dd>
          </>
        )}
        <dt>{t('shared.ui.center')}</dt>
        <dd>
          {Math.round(node.x)}, {Math.round(node.y)}
        </dd>
      </dl>
      <Warnings calc={calc} refId={node.id} />
      <div className="inspector__actions">
        <span />
        <Button size="sm" variant="danger" onClick={() => commit(deleteWaterNode(plan, node.id))}>
          {t('shared.ui.delete')}
        </Button>
      </div>
    </aside>
  )
}

export function WaterSummary({ plan }: { plan: Plan }) {
  const { t } = useTranslation('networks')
  const catalog = useCatalog()
  const viewOnly = useViewOnly()
  const select = useWaterUi((s) => s.select)
  const calc = useMemo(() => computeWater(plan), [plan])
  const w = waterOf(plan)
  const items = useMemo(() => priceWater(calc.items, w.materials, catalog), [calc, w.materials, catalog])
  const total = items.reduce((a, i) => a + waterSum(i), 0)
  const missing = items.filter((i) => i.price === undefined).length
  return (
    <div className="inspector__materials net-summary">
      <div className="inspector__head">
        <div className="eyebrow">{t('shared.ui.networks')}</div>
        <div className="inspector__title">{t('shared.layers.water')}</div>
      </div>
      {w.pipes.length === 0 && (
        <p className="muted">{t('water.summary.empty')}</p>
      )}
      {calc.lengths.length > 0 && (
        <dl className="props props--compact">
          {calc.lengths.map((l) => (
            <div key={`${l.line}-${l.diameter}-${l.material}-${l.location}`} className="net-props__pair">
              <dt>
                {LINE_SHORT[l.line]} Ø{l.diameter} {l.material} {l.location === 'outside' ? t('shared.ui.outsideLower') : t('shared.ui.insideLower')}
              </dt>
              <dd>{fmtM(l.lengthMm)}</dd>
            </div>
          ))}
        </dl>
      )}
      {items.length > 0 && (
        <div className="inspector__section net-items">
          <div className="eyebrow">{t('shared.ui.materials')}</div>
          {items.map((i) => (
            <div key={i.key} className="net-item">
              <div className="net-item__name">
                {i.url ? (
                  <a href={i.url} target="_blank" rel="noreferrer">
                    {i.name}
                  </a>
                ) : (
                  i.name
                )}
                {i.priceFrom && <div className="muted net-item__from">{i.priceFrom}</div>}
              </div>
              <div className="net-item__qty">
                {fmt(i.buyQty)} {unitLabel(i.buyUnit)}
                {unitLabel(i.buyUnit) !== unitLabel(i.unit) && (
                  <div className="muted">
                    {fmt(i.qty)} {unitLabel(i.unit)}
                  </div>
                )}
              </div>
              <div className="net-item__sum">{i.price !== undefined ? formatMoney(waterSum(i)) : <span className="muted">{t('shared.ui.noPrice')}</span>}</div>
            </div>
          ))}
          <div className="row total">
            <span>{t('water.summary.total')}</span>
            <strong>{formatMoney(total)}</strong>
          </div>
          {missing > 0 && <div className="muted">{t('shared.ui.missing', { count: missing })}</div>}
        </div>
      )}
      {calc.warnings.length > 0 && (
        <div className="inspector__section">
          <div className="eyebrow">{t('shared.ui.warnings', { count: calc.warnings.length })}</div>
          <div className="net-warnings">
            {calc.warnings.map((wr, i) =>
              wr.ref && !viewOnly ? (
                <button key={i} className="layout-hint layout-hint--warn net-warning" onClick={() => select(wr.ref!)}>
                  {wr.text}
                </button>
              ) : (
                <div key={i} className="layout-hint layout-hint--warn">
                  {wr.text}
                </div>
              ),
            )}
          </div>
        </div>
      )}
      <p className="hint">{t('water.summary.hint')}</p>
    </div>
  )
}
