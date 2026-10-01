import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fmtNum, lang, t as tr } from '../i18n'
import { fmtPct, unitLabel } from './labels'
import { formatLength, formatMoney, type Plan, type SewerDiameter, type SewerFixture, type SewerNode, type SewerPipe } from '../model'
import { usePlanStore } from '../store/planStore'
import { useViewOnly } from '../store/viewOnly'
import { useCatalog } from '../estimate/catalog'
import { LengthField } from '../ui/LengthField'
import { Badge, Button, IconButton, Input, Segmented } from '../ui'
import { computeSewer, type SewerCalc, type SewerRef } from './sewerCalc'
import { itemSum, priceAll } from './pricing'
import {
  DEFAULT_FLOOR_LEVEL,
  DEFAULT_RISER_HEIGHT,
  DEFAULT_SEPTIC,
  SEPTIC_TO_BOUNDARY_MIN,
  SEPTIC_TO_HOUSE_MIN,
  defaultSlope,
  deleteNode,
  deletePipe,
  fixtureLabels,
  minSlope,
  nodeById,
  nodeKindLabels,
  pipeLength,
  pipeSlope,
  reversePipe,
  sewerOf,
  updateNode,
  updatePipe,
  withSewer,
} from './sewerModel'
import { useSewerUi } from './sewerStore'
import './networks.css'

const fmt = (v: number, d = 2) => fmtNum(v, d)
const fmtM = (mm: number) => `${fmt(mm / 1000)} ${tr('common:units.m')}`
const level = (mm: number) => `${mm > 0 ? '+' : mm < 0 ? '−' : ''}${fmt(Math.abs(mm) / 1000)} ${tr('common:units.m')}`

function NumField({ value, suffix, onCommit, min = 0 }: { value: number; suffix: string; onCommit: (v: number) => void; min?: number }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const v = Number(draft.replace(',', '.').replace(/[^\d.-]/g, ''))
    setDraft(null)
    if (Number.isFinite(v) && v > min && v !== value) onCommit(v)
  }
  return (
    <Input
      size="sm"
      suffix={suffix}
      value={draft ?? (lang() === 'ru' ? String(value).replace('.', ',') : String(value))}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') setDraft(null)
      }}
    />
  )
}

export function useSewerSelection(plan: Plan | null): SewerRef | null {
  const selected = useSewerUi((s) => s.selected)
  if (!plan || !selected) return null
  const s = sewerOf(plan)
  const exists = selected.kind === 'node' ? s.nodes.some((n) => n.id === selected.id) : s.pipes.some((p) => p.id === selected.id)
  return exists ? selected : null
}

function Close() {
  const { t } = useTranslation('networks')
  const select = useSewerUi((s) => s.select)
  return (
    <IconButton label={t('shared.ui.close')} size="sm" className="inspector__close" onClick={() => select(null)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </IconButton>
  )
}

export function SewerInspector({ plan, sel }: { plan: Plan; sel: SewerRef }) {
  const calc = useMemo(() => computeSewer(plan), [plan])
  const s = sewerOf(plan)
  if (sel.kind === 'pipe') {
    const p = s.pipes.find((x) => x.id === sel.id)
    return p ? <PipeInspector plan={plan} pipe={p} calc={calc} /> : null
  }
  const n = s.nodes.find((x) => x.id === sel.id)
  return n ? <NodeInspector plan={plan} node={n} calc={calc} /> : null
}

function Warnings({ calc, refId }: { calc: SewerCalc; refId?: string }) {
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

function PipeInspector({ plan, pipe, calc }: { plan: Plan; pipe: SewerPipe; calc: SewerCalc }) {
  const { t } = useTranslation('networks')
  const commit = usePlanStore((st) => st.commit)
  const s = sewerOf(plan)
  const len = pipeLength(s, pipe)
  const slope = pipeSlope(pipe)
  const min = minSlope(pipe.diameter, pipe.location)
  const lv = calc.pipeLevel[pipe.id]
  const set = (patch: Partial<SewerPipe>) => commit(updatePipe(plan, pipe.id, patch))
  const from = nodeById(s, pipe.from)
  const to = nodeById(s, pipe.to)
  const name = (n?: SewerNode) => (n ? `${n.kind === 'fixture' && n.fixture ? fixtureLabels[n.fixture] : nodeKindLabels[n.kind]} ${n.id}` : '—')
  return (
    <aside className="inspector card">
      <div className="inspector__head">
        <Close />
        <div className="eyebrow">{t('sewer.panel.eyebrowPipe')}</div>
        <div className="inspector__title">
          Ø{pipe.diameter} · {fmtPct(slope)}
        </div>
      </div>
      <div className="form">
        <div className="form__row">
          <span>{t('shared.ui.diameter')}</span>
          <Segmented
            size="sm"
            value={String(pipe.diameter)}
            options={[50, 110, 160].map((d) => ({ value: String(d), label: `Ø${d}` }))}
            onChange={(v) => {
              const d = Number(v) as SewerDiameter
              set({ diameter: d, slope: pipe.slope === undefined || pipe.slope === defaultSlope(pipe.diameter, pipe.location) ? defaultSlope(d, pipe.location) : pipe.slope })
            }}
          />
        </div>
        <label className="form__row">
          <span>{t('sewer.panel.slope')}</span>
          <NumField value={slope} suffix="%" onCommit={(v) => set({ slope: Math.min(100, v) })} />
        </label>
        <div className="form__row">
          <span>{t('shared.ui.where')}</span>
          <Segmented
            size="sm"
            value={pipe.location}
            options={[
              { value: 'inside', label: t('shared.ui.inside') },
              { value: 'outside', label: t('shared.ui.outside') },
            ]}
            onChange={(location) => set({ location, slope: pipe.slope === defaultSlope(pipe.diameter, pipe.location) ? defaultSlope(pipe.diameter, location) : pipe.slope })}
          />
        </div>
        {pipe.location === 'outside' && (
          <label className="form__row">
            <span>{t('sewer.panel.depthStart')}</span>
            <LengthField value={lv ? Math.round(-lv.start) : (pipe.depth ?? 0)} min={0} onCommit={(depth) => set({ depth })} />
          </label>
        )}
      </div>
      <dl className="props props--compact">
        <dt>{t('shared.ui.length')}</dt>
        <dd>{formatLength(len)}</dd>
        <dt>{t('sewer.panel.drop')}</dt>
        <dd>{lv ? `${Math.round(lv.drop)} ${t('common:units.mm')}` : '—'}</dd>
        {lv && (
          <>
            <dt>{t('sewer.panel.invert')}</dt>
            <dd>
              {level(lv.start)} → {level(lv.end)}
            </dd>
          </>
        )}
        <dt>{t('sewer.panel.slopeNorm')}</dt>
        <dd>
          {slope + 1e-9 < min ? <Badge tone="warn">{t('sewer.panel.min', { v: fmtPct(min) })}</Badge> : <Badge tone="ok">≥ {fmtPct(min)}</Badge>}
        </dd>
        <dt>{t('sewer.panel.flow')}</dt>
        <dd>
          {name(from)} → {name(to)}
        </dd>
      </dl>
      <Warnings calc={calc} refId={pipe.id} />
      <div className="inspector__actions">
        <Button size="sm" onClick={() => commit(reversePipe(plan, pipe.id))}>
          {t('sewer.panel.reverse')}
        </Button>
        <Button size="sm" variant="danger" onClick={() => commit(deletePipe(plan, pipe.id))}>
          {t('shared.ui.delete')}
        </Button>
      </div>
      <p className="hint">{t('sewer.panel.pipeHint', { floor: level(calc.floorLevel) })}</p>
    </aside>
  )
}

const KIND_OPTIONS: SewerNode['kind'][] = ['fixture', 'junction', 'cleanout', 'riser', 'outlet', 'septic']

function NodeInspector({ plan, node, calc }: { plan: Plan; node: SewerNode; calc: SewerCalc }) {
  const { t } = useTranslation('networks')
  const commit = usePlanStore((st) => st.commit)
  const set = (patch: Partial<SewerNode>) => commit(updateNode(plan, node.id, patch))
  const lvl = calc.nodeLevel[node.id]
  const septic = calc.septics.find((x) => x.nodeId === node.id)
  const outlet = calc.outlets.find((x) => x.nodeId === node.id)
  const [model, setModel] = useState<string | null>(null)
  return (
    <aside className="inspector card">
      <div className="inspector__head">
        <Close />
        <div className="eyebrow">{t('sewer.panel.eyebrowNode', { kind: nodeKindLabels[node.kind].toLowerCase() })}</div>
        <div className="inspector__title">
          {node.kind === 'septic' ? node.model || nodeKindLabels.septic : node.kind === 'fixture' && node.fixture ? fixtureLabels[node.fixture] : node.id}
        </div>
      </div>
      <div className="form">
        <label className="form__row">
          <span>{t('shared.ui.type')}</span>
          <select
            className="select form__select"
            value={node.kind}
            onChange={(e) => {
              const kind = e.target.value as SewerNode['kind']
              const extra: Partial<SewerNode> =
                kind === 'septic' ? { w: node.w ?? DEFAULT_SEPTIC.w, d: node.d ?? DEFAULT_SEPTIC.d, rotationDeg: node.rotationDeg ?? 0 } : {}
              set({ kind, ...extra, ...(kind === 'fixture' && !node.fixture ? { fixture: 'sink' as SewerFixture } : {}) })
            }}
          >
            {KIND_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {nodeKindLabels[k]}
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
        {node.kind === 'riser' && (
          <label className="form__row">
            <span>{t('sewer.panel.riserHeight')}</span>
            <LengthField value={node.height ?? DEFAULT_RISER_HEIGHT} min={100} onCommit={(height) => set({ height })} />
          </label>
        )}
        {node.kind === 'septic' && (
          <>
            <label className="form__row">
              <span>{t('shared.ui.model')}</span>
              <Input
                size="sm"
                value={model ?? node.model ?? ''}
                placeholder={t('sewer.panel.modelPlaceholder')}
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
            <label className="form__row">
              <span>{t('shared.ui.length')}</span>
              <LengthField value={node.w ?? DEFAULT_SEPTIC.w} min={300} onCommit={(w) => set({ w })} />
            </label>
            <label className="form__row">
              <span>{t('sewer.panel.width')}</span>
              <LengthField value={node.d ?? DEFAULT_SEPTIC.d} min={300} onCommit={(d) => set({ d })} />
            </label>
            <div className="form__row">
              <span>{t('sewer.panel.rotation')}</span>
              <Segmented
                size="sm"
                value={String(((Math.round(node.rotationDeg ?? 0) % 360) + 360) % 360)}
                options={['0', '90', '180', '270'].map((v) => ({ value: v, label: `${v}°` }))}
                onChange={(v) => set({ rotationDeg: Number(v) })}
              />
            </div>
          </>
        )}
      </div>
      <dl className="props props--compact">
        {lvl !== undefined && (
          <>
            <dt>{t('sewer.panel.invertLevel')}</dt>
            <dd>{level(lvl)}</dd>
          </>
        )}
        {outlet && (
          <>
            <dt>{t('sewer.panel.outletDepth')}</dt>
            <dd>{fmtM(outlet.depth)}</dd>
          </>
        )}
        {septic && (
          <>
            <dt>{t('sewer.panel.inletDepth')}</dt>
            <dd>{septic.depth !== null ? fmtM(septic.depth) : '—'}</dd>
            <dt>{t('sewer.panel.toFoundation')}</dt>
            <dd>
              {septic.toHouse === null ? '—' : <Badge tone={septic.toHouse < SEPTIC_TO_HOUSE_MIN ? 'warn' : 'ok'}>{fmtM(septic.toHouse)}</Badge>}
            </dd>
            <dt>{t('sewer.panel.toBoundary')}</dt>
            <dd>
              {septic.toBoundary === null ? '—' : <Badge tone={septic.toBoundary < SEPTIC_TO_BOUNDARY_MIN ? 'warn' : 'ok'}>{fmtM(septic.toBoundary)}</Badge>}
            </dd>
          </>
        )}
        <dt>{t('shared.ui.center')}</dt>
        <dd>
          {Math.round(node.x)}, {Math.round(node.y)}
        </dd>
      </dl>
      {septic && (
        <p className="hint">
          {t('sewer.panel.septicNorms', { house: fmtM(SEPTIC_TO_HOUSE_MIN), boundary: fmtM(SEPTIC_TO_BOUNDARY_MIN) })}
        </p>
      )}
      <Warnings calc={calc} refId={node.id} />
      <div className="inspector__actions">
        <span />
        <Button size="sm" variant="danger" onClick={() => commit(deleteNode(plan, node.id))}>
          {t('shared.ui.delete')}
        </Button>
      </div>
      <p className="hint">{t('sewer.panel.nodeHint')}</p>
    </aside>
  )
}

export function SewerSummary({ plan }: { plan: Plan }) {
  const { t } = useTranslation('networks')
  const catalog = useCatalog()
  const viewOnly = useViewOnly()
  const commit = usePlanStore((st) => st.commit)
  const select = useSewerUi((st) => st.select)
  const calc = useMemo(() => computeSewer(plan), [plan])
  const s = sewerOf(plan)
  const items = useMemo(() => priceAll(calc.items, s.materials, catalog), [calc, s.materials, catalog])
  const total = items.reduce((acc, i) => acc + itemSum(i), 0)
  const missing = items.filter((i) => i.price === undefined).length

  return (
    <div className="inspector__materials net-summary">
      <div className="inspector__head">
        <div className="eyebrow">{t('shared.ui.networks')}</div>
        <div className="inspector__title">{t('shared.layers.sewer')}</div>
      </div>
      {s.pipes.length === 0 && (
        <p className="muted">{t('sewer.summary.empty')}</p>
      )}
      {calc.lengths.length > 0 && (
        <dl className="props props--compact">
          {calc.lengths.map((l) => (
            <div key={`${l.diameter}-${l.location}`} className="net-props__pair">
              <dt>
                Ø{l.diameter} {l.location === 'outside' ? t('shared.ui.outsideLower') : t('shared.ui.insideLower')}
              </dt>
              <dd>{fmtM(l.lengthMm)}</dd>
            </div>
          ))}
          {calc.outlets.map((o) => (
            <div key={o.nodeId} className="net-props__pair">
              <dt>{t('sewer.summary.outletRow', { id: o.nodeId })}</dt>
              <dd>{fmtM(o.depth)}</dd>
            </div>
          ))}
          {calc.septics.map((x) => (
            <div key={x.nodeId} className="net-props__pair">
              <dt>{x.model ? t('sewer.summary.septicRowModel', { model: x.model }) : t('sewer.summary.septicRow')}</dt>
              <dd>{x.depth !== null ? fmtM(x.depth) : '—'}</dd>
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
                {unitLabel(i.buyUnit) !== unitLabel(i.unit) && <div className="muted">{fmt(i.qty)} {unitLabel(i.unit)}</div>}
              </div>
              <div className="net-item__sum">{i.price !== undefined ? formatMoney(itemSum(i)) : <span className="muted">{t('shared.ui.noPrice')}</span>}</div>
            </div>
          ))}
          <div className="row total">
            <span>{t('sewer.summary.total')}</span>
            <strong>{formatMoney(total)}</strong>
          </div>
          {missing > 0 && <div className="muted">{t('shared.ui.missing', { count: missing })}</div>}
        </div>
      )}
      {calc.warnings.length > 0 && (
        <div className="inspector__section">
          <div className="eyebrow">{t('shared.ui.warnings', { count: calc.warnings.length })}</div>
          <div className="net-warnings">
            {calc.warnings.map((w, i) =>
              w.ref && !viewOnly ? (
                <button key={i} className="layout-hint layout-hint--warn net-warning" onClick={() => select(w.ref!)}>
                  {w.text}
                </button>
              ) : (
                <div key={i} className="layout-hint layout-hint--warn">
                  {w.text}
                </div>
              ),
            )}
          </div>
        </div>
      )}
      {!viewOnly && (
        <div className="inspector__section">
          <label className="row row--center">
            <span>{t('sewer.summary.floorAbove')}</span>
            <LengthField
              value={s.floorLevel ?? DEFAULT_FLOOR_LEVEL}
              min={0}
              onCommit={(floorLevel) => commit(withSewer(plan, (x) => ({ ...x, floorLevel })))}
            />
          </label>
        </div>
      )}
      <p className="hint">
        {t('sewer.summary.hint')}
      </p>
    </div>
  )
}
