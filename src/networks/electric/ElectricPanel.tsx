import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ElectricCircuit, ElectricPoint, ElectricPointKind, Plan } from '../../model'
import { formatMoney } from '../../model'
import { fmtNum, t as tt } from '../../i18n'
import { unitLabel } from '../../i18n/units'
import { usePlanStore } from '../../store/planStore'
import { useViewOnly } from '../../store/viewOnly'
import { useCatalog } from '../../estimate/catalog'
import { Badge, Button, IconButton, Input, Table, Td, Th, Tr } from '../../ui'
import { computeElectric, pointPower, type ElectricWarning } from './calc'
import {
  CABLES,
  RATINGS,
  addCircuit,
  cableLabel,
  circuitColor,
  CIRCUIT_KINDS,
  POINT_KINDS,
  circuitKindLabel,
  circuitPresets,
  deleteCircuit,
  deletePoints,
  electricOf,
  kindLabel,
  setPanel,
  setRoutes,
  updateCircuit,
  updatePoints,
} from './model'
import { autoRoute } from './route'
import { electricSum, priceElectric } from './pricing'
import { useElectricUi } from './store'
import './electric.css'

const fmt = (v: number, d = 1) => fmtNum(v, d)
const breakerLabel = (c: ElectricCircuit) =>
  `${c.breaker.type === 'RCBO' ? tt('networks:electric.panel.rcboPrefix') : c.breaker.type === 'RCD' ? tt('networks:electric.panel.rcdPrefix') : ''}${c.breaker.curve ?? 'C'}${c.breaker.rating}`

const CLOSE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

export function useElectricSelection(plan: Plan | null) {
  const selected = useElectricUi((s) => s.selected)
  const panelSelected = useElectricUi((s) => s.panelSelected)
  if (!plan) return null
  const e = electricOf(plan)
  const points = e.points.filter((p) => selected.includes(p.id))
  if (panelSelected && e.panel) return { points: [] as ElectricPoint[], panel: true }
  return points.length ? { points, panel: false } : null
}

export function ElectricInspector({ plan, sel }: { plan: Plan; sel: { points: ElectricPoint[]; panel: boolean } }) {
  const { t } = useTranslation('networks')
  const commit = usePlanStore((s) => s.commit)
  const select = useElectricUi((s) => s.select)
  const e = electricOf(plan)
  const ids = sel.points.map((p) => p.id)
  const one = sel.points.length === 1 ? sel.points[0] : null
  const same = <K extends keyof ElectricPoint>(k: K) => (sel.points.every((p) => p[k] === sel.points[0][k]) ? sel.points[0][k] : undefined)
  const patch = (p: Partial<ElectricPoint>) => commit(updatePoints(plan, ids, p))

  if (sel.panel && e.panel) {
    const panel = e.panel
    const calc = computeElectric(plan)
    return (
      <aside className="inspector card">
        <div className="inspector__head">
          <IconButton label={t('electric.panel.clearSelection')} size="sm" className="inspector__close" onClick={() => select([])}>
            {CLOSE_ICON}
          </IconButton>
          <div className="eyebrow">{t('electric.layer')}</div>
          <div className="inspector__title">{t('electric.panel.panelTitle')}</div>
        </div>
        <dl className="props">
          <dt>{t('electric.panel.devices')}</dt>
          <dd>{t('electric.panel.modules', { n: calc.modules })}</dd>
          <dt>{t('electric.panel.panelNeeded')}</dt>
          <dd>{calc.panelSize ? t('electric.panel.panelFor', { n: calc.panelSize }) : '—'}</dd>
        </dl>
        <label className="row row--center el-field">
          <span>{t('electric.panel.modulesInPanel')}</span>
          <Input
            size="sm"
            type="number"
            min={4}
            step={1}
            className="el-num"
            value={panel.modules ?? ''}
            placeholder={String(calc.panelSize || '')}
            onChange={(ev) => {
              const v = Math.round(Number(ev.target.value))
              const next = { ...panel }
              if (v > 0) next.modules = v
              else delete next.modules
              commit(setPanel(plan, next))
            }}
          />
        </label>
        <Button variant="danger" className="inspector__delete" onClick={() => {
          commit(setPanel(plan, undefined))
          select([])
        }}>
          {t('electric.panel.removePanel')}
        </Button>
      </aside>
    )
  }

  const kind = same('kind')
  const height = same('height')
  const circuit = same('circuitId')
  return (
    <aside className="inspector card">
      <div className="inspector__head">
        <IconButton label={t('electric.panel.clearSelection')} size="sm" className="inspector__close" onClick={() => select([])}>
          {CLOSE_ICON}
        </IconButton>
        <div className="eyebrow">{t('electric.layer')}</div>
        <div className="inspector__title">{one ? `${kindLabel(one.kind)} ${one.label ?? one.id}` : t('electric.panel.pointsCount', { n: sel.points.length })}</div>
      </div>
      <div className="el-form">
        <label className="row row--center el-field">
          <span>{t('electric.panel.group')}</span>
          <select className="select" value={circuit ?? ''} onChange={(ev) => {
            const v = ev.target.value
            if (v === '__new') {
              const res = addCircuit(plan, kind === 'light' || kind === 'switch' || kind === 'switch2' || kind === 'light_wall' ? 'light' : kind === 'power' ? 'power' : kind === 'socket_ip44' ? 'wet' : kind === 'outdoor' ? 'outdoor' : 'socket')
              commit(updatePoints(res.plan, ids, { circuitId: res.id }))
              return
            }
            commit(v ? updatePoints(plan, ids, { circuitId: v }) : updatePoints(plan, ids, { circuitId: undefined }))
          }}>
            {circuit === undefined && sel.points.length > 1 && !sel.points.every((p) => !p.circuitId) && <option value="">{t('electric.panel.mixed')}</option>}
            <option value="">{t('electric.panel.noGroup')}</option>
            {e.circuits.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="__new">{t('electric.panel.newGroup')}</option>
          </select>
        </label>
        {one && (
          <label className="row row--center el-field">
            <span>{t('electric.panel.type')}</span>
            <select className="select" value={one.kind} onChange={(ev) => patch({ kind: ev.target.value as ElectricPointKind })}>
              {POINT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {kindLabel(k)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="row row--center el-field">
          <span>{t('electric.panel.height')}</span>
          <Input
            size="sm"
            type="number"
            min={0}
            step={50}
            suffix={t('common:units.mm')}
            className="el-num"
            value={height ?? ''}
            placeholder={t('electric.panel.heightMixed')}
            onChange={(ev) => {
              const v = Number(ev.target.value)
              if (Number.isFinite(v) && v >= 0 && ev.target.value !== '') patch({ height: Math.round(v) })
            }}
          />
        </label>
        {one && (
          <>
            <label className="row row--center el-field">
              <span>{t('electric.panel.power')}</span>
              <Input
                size="sm"
                type="number"
                min={0}
                step={50}
                suffix={t('common:units.w')}
                className="el-num"
                value={one.powerW ?? ''}
                placeholder={String(pointPower({ ...one, powerW: undefined }))}
                onChange={(ev) => patch({ powerW: ev.target.value === '' ? undefined : Math.max(0, Math.round(Number(ev.target.value))) })}
              />
            </label>
            <label className="row row--center el-field">
              <span>{t('electric.panel.label')}</span>
              <Input size="sm" className="el-text" value={one.label ?? ''} placeholder={t('electric.panel.labelPlaceholder')} onChange={(ev) => patch({ label: ev.target.value || undefined })} />
            </label>
          </>
        )}
      </div>
      <p className="hint">{t('electric.panel.pointHint')}</p>
      <Button variant="danger" className="inspector__delete" onClick={() => {
        commit(deletePoints(plan, ids))
        select([])
      }}>
        {sel.points.length > 1 ? t('electric.panel.deletePoints', { count: sel.points.length }) : t('electric.panel.deletePoint')}
      </Button>
    </aside>
  )
}

function Warnings({ list, onPick }: { list: ElectricWarning[]; onPick: (w: ElectricWarning) => void }) {
  const { t } = useTranslation('networks')
  if (!list.length) return <p className="muted">{t('electric.panel.noWarnings')}</p>
  return (
    <div className="el-warnings">
      {list.map((w, i) => (
        <button key={i} type="button" className={`el-warning el-warning--${w.level}`} onClick={() => onPick(w)}>
          {w.text}
        </button>
      ))}
    </div>
  )
}

export function ElectricSummary({ plan }: { plan: Plan }) {
  const { t } = useTranslation('networks')
  const commit = usePlanStore((s) => s.commit)
  const viewOnly = useViewOnly()
  const catalog = useCatalog()
  const select = useElectricUi((s) => s.select)
  const selectPanel = useElectricUi((s) => s.selectPanel)
  const [editId, setEditId] = useState<string | null>(null)
  const [newKind, setNewKind] = useState<ElectricCircuit['kind']>('socket')
  const e = electricOf(plan)
  const calc = useMemo(() => computeElectric(plan), [plan])
  const priced = useMemo(() => priceElectric(calc.items, e.materials, catalog), [calc, e.materials, catalog])
  const total = priced.reduce((s, i) => s + electricSum(i), 0)
  const missing = priced.filter((i) => i.price === undefined).length
  const edit = e.circuits.find((c) => c.id === editId)

  const routeAll = (ids: string[]) => {
    let routes = ids.flatMap((id) => autoRoute(plan, id))
    if (!e.panel) routes = []
    commit(setRoutes(plan, ids, routes))
  }

  const pickWarning = (w: ElectricWarning) => {
    if (!w.ref) return
    if (w.ref.kind === 'point') select([w.ref.id])
    else if (w.ref.kind === 'panel') selectPanel(true)
    else setEditId(w.ref.id)
  }

  return (
    <div className="el-summary">
      <div className="inspector__head">
        <div className="eyebrow">{t('electric.panel.layerEyebrow')}</div>
        <div className="inspector__title">{t('electric.layer')}</div>
      </div>
      <dl className="props">
        <dt>{t('electric.panel.points')}</dt>
        <dd>{e.points.length}</dd>
        <dt>{t('electric.panel.circuits')}</dt>
        <dd>{e.circuits.length}</dd>
        <dt>{t('electric.panel.load')}</dt>
        <dd>{fmt(calc.totalLoadW / 1000)} {t('common:units.kw')}</dd>
        <dt>{t('electric.panel.panelRow')}</dt>
        <dd>{e.panel ? t('electric.panel.panelState', { modules: calc.modules, size: calc.panelSize || '—' }) : t('electric.panel.notPlaced')}</dd>
      </dl>

      <div className="inspector__section">
        <div className="el-head">
          <strong>{t('electric.panel.groups')}</strong>
          {!viewOnly && e.circuits.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => routeAll(e.circuits.map((c) => c.id))} disabled={!e.panel} title={e.panel ? t('electric.panel.autoRouteTitle') : t('electric.panel.placePanelFirst')}>
              {t('electric.panel.autoRoute')}
            </Button>
          )}
        </div>
        {e.circuits.length === 0 ? (
          <p className="muted">{t('electric.panel.noGroups')}</p>
        ) : (
          <Table dense className="el-table">
            <thead>
              <tr>
                <Th>{t('electric.panel.colGroup')}</Th>
                <Th>{t('electric.panel.colProtection')}</Th>
                <Th num>{t('common:units.m')}</Th>
                <Th num>{t('electric.panel.colPoints')}</Th>
                <Th num>{t('common:units.kw')}</Th>
              </tr>
            </thead>
            <tbody>
              {calc.circuits.map((c) => (
                <Tr key={c.circuit.id} className={`el-row ${editId === c.circuit.id ? 'el-row--active' : ''}`} onClick={() => setEditId(editId === c.circuit.id ? null : c.circuit.id)}>
                  <Td>
                    <span className="el-dot" style={{ background: circuitColor(e, c.circuit.id) }} />
                    {c.circuit.name}
                    <div className="muted el-sub">{cableLabel(c.circuit.cable)}</div>
                  </Td>
                  <Td>{breakerLabel(c.circuit)}</Td>
                  <Td num title={c.routed ? t('electric.panel.routed') : t('electric.panel.estimated')}>
                    {c.routed ? '' : '≈'}
                    {c.cableM}
                  </Td>
                  <Td num>{c.points}</Td>
                  <Td num>{fmt(c.loadW / 1000)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {edit && <CircuitEditor plan={plan} circuit={edit} readOnly={viewOnly} onClose={() => setEditId(null)} onRoute={() => routeAll([edit.id])} />}
        {!viewOnly && (
          <div className="el-add">
            <select className="select" value={newKind} onChange={(ev) => setNewKind(ev.target.value as ElectricCircuit['kind'])}>
              {CIRCUIT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {circuitKindLabel(k)}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={() => {
              const res = addCircuit(plan, newKind)
              commit(res.plan)
              setEditId(res.id)
              useElectricUi.getState().setActiveCircuit(res.id)
            }}>
              {t('electric.panel.addGroup')}
            </Button>
          </div>
        )}
      </div>

      <div className="inspector__section">
        <strong>{t('electric.panel.materials')}</strong>
        <div className="el-items">
          {priced.map((i) => (
            <div key={i.key} className="el-item">
              <div className="el-item__name">
                {i.url ? (
                  <a href={i.url} target="_blank" rel="noreferrer">
                    {i.name}
                  </a>
                ) : (
                  i.name
                )}
                {i.priceFrom && <div className="muted el-sub">{i.priceFrom}</div>}
              </div>
              <div className="el-item__qty">
                {fmt(i.buyQty)} {unitLabel(i.buyUnit)}
              </div>
              <div className="el-item__sum">{i.price !== undefined ? formatMoney(electricSum(i)) : '—'}</div>
            </div>
          ))}
          {!priced.length && <p className="muted">{t('electric.panel.noMaterials')}</p>}
        </div>
        <div className="row total">
          <span>{t('electric.panel.total')}</span>
          <strong>{formatMoney(total)}</strong>
        </div>
        {missing > 0 && <div className="muted">{t('electric.panel.noPrice', { n: missing })}</div>}
      </div>

      <div className="inspector__section">
        <strong>{t('electric.panel.warnings')}</strong>
        <Warnings list={calc.warnings} onPick={pickWarning} />
      </div>

      <details className="inspector__section el-howto">
        <summary>{t('electric.panel.howto')}</summary>
        <ol>
          {(t('electric.steps', { returnObjects: true }) as string[]).map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        <p className="muted">
          {t('electric.panel.howtoNote')}
        </p>
      </details>
    </div>
  )
}

function CircuitEditor({ plan, circuit: c, readOnly, onClose, onRoute }: { plan: Plan; circuit: ElectricCircuit; readOnly: boolean; onClose: () => void; onRoute: () => void }) {
  const { t } = useTranslation('networks')
  const commit = usePlanStore((s) => s.commit)
  const e = electricOf(plan)
  const patch = (p: Partial<ElectricCircuit>) => commit(updateCircuit(plan, c.id, p))
  const pts = e.points.filter((p) => p.circuitId === c.id)
  if (readOnly)
    return (
      <div className="el-edit">
        <dl className="props">
          <dt>{t('electric.panel.type')}</dt>
          <dd>{circuitKindLabel(c.kind)}</dd>
          <dt>{t('electric.panel.protection')}</dt>
          <dd>{breakerLabel(c)}</dd>
          <dt>{t('electric.panel.cable')}</dt>
          <dd>{cableLabel(c.cable)}</dd>
          {c.phase && (
            <>
              <dt>{t('electric.panel.phase')}</dt>
              <dd>{c.phase}</dd>
            </>
          )}
        </dl>
      </div>
    )
  return (
    <div className="el-edit">
      <div className="el-head">
        <Badge tone="accent">{c.id}</Badge>
        <IconButton label={t('electric.panel.collapse')} size="sm" onClick={onClose}>
          {CLOSE_ICON}
        </IconButton>
      </div>
      <label className="row row--center el-field">
        <span>{t('electric.panel.name')}</span>
        <Input size="sm" className="el-text" value={c.name} onChange={(ev) => patch({ name: ev.target.value })} />
      </label>
      <label className="row row--center el-field">
        <span>{t('electric.panel.type')}</span>
        <select className="select" value={c.kind} onChange={(ev) => {
          const kind = ev.target.value as ElectricCircuit['kind']
          patch({ kind, ...structuredClone(circuitPresets[kind]) })
        }}>
          {CIRCUIT_KINDS.map((k) => (
            <option key={k} value={k}>
              {circuitKindLabel(k)}
            </option>
          ))}
        </select>
      </label>
      <label className="row row--center el-field">
        <span>{t('electric.panel.device')}</span>
        <select className="select" value={c.breaker.type} onChange={(ev) => patch({ breaker: { ...c.breaker, type: ev.target.value as ElectricCircuit['breaker']['type'] } })}>
          <option value="MCB">{t('electric.panel.mcb')}</option>
          <option value="RCBO">{t('electric.panel.rcbo')}</option>
          <option value="RCD">{t('electric.panel.rcd')}</option>
        </select>
      </label>
      <label className="row row--center el-field">
        <span>{t('electric.panel.rating')}</span>
        <span className="el-pair">
          <select className="select" value={c.breaker.curve ?? 'C'} onChange={(ev) => patch({ breaker: { ...c.breaker, curve: ev.target.value } })}>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="D">D</option>
          </select>
          <select className="select" value={c.breaker.rating} onChange={(ev) => patch({ breaker: { ...c.breaker, rating: Number(ev.target.value) } })}>
            {[...new Set([...RATINGS, c.breaker.rating])].sort((a, b) => a - b).map((r) => (
              <option key={r} value={r}>
                {t('electric.amps', { value: r })}
              </option>
            ))}
          </select>
        </span>
      </label>
      <label className="row row--center el-field">
        <span>{t('electric.panel.cable')}</span>
        <select className="select" value={c.cable} onChange={(ev) => patch({ cable: ev.target.value })}>
          {[...new Set([...CABLES, c.cable])].map((k) => (
            <option key={k} value={k}>
              {cableLabel(k)}
            </option>
          ))}
        </select>
      </label>
      <label className="row row--center el-field">
        <span>{t('electric.panel.phase')}</span>
        <select className="select" value={c.phase ?? ''} onChange={(ev) => patch({ phase: (ev.target.value || undefined) as ElectricCircuit['phase'] })}>
          <option value="">—</option>
          <option value="L1">L1</option>
          <option value="L2">L2</option>
          <option value="L3">L3</option>
        </select>
      </label>
      <div className="inspector__actions">
        <Button size="sm" variant="ghost" onClick={() => useElectricUi.getState().select(pts.map((p) => p.id))} disabled={!pts.length}>
          {t('electric.panel.selectPoints')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onRoute} disabled={!e.panel || !pts.length}>
          {t('electric.panel.route')}
        </Button>
        <Button size="sm" variant="danger" onClick={() => {
          commit(deleteCircuit(plan, c.id))
          onClose()
        }}>
          {t('electric.panel.delete')}
        </Button>
      </div>
    </div>
  )
}
