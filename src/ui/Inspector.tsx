import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n, { fmtNum, fmtDateTime } from '../i18n'
import {
  DEFAULT_WASTE_PCT,
  computeWallEstimate,
  findMaterial,
  fitOffset,
  formatLength,
  formatMoney,
  kindLabels,
  materialColor,
  setWallLength,
  unitLabels,
  updateOpening,
  updateFurniture,
  updateZone,
  deleteZone,
  zoneKindLabels,
  polygonAreaMm2,
  polygonPerimeter,
  type Zone,
  deleteFurniture,
  normalizeDeg,
  type Furniture,
  updateWall,
  wallLength,
  wallPanelCount,
  type Material,
  type Opening,
  type Plan,
  type Wall,
  type WallEstimateLine,
} from '../model'
import { usePlanStore } from '../store/planStore'
import { useViewOnly } from '../store/viewOnly'
import { resolveFurniture } from '../furniture/catalog'
import { buildingSel, selSummary, streetAlignDeg, type Selection } from '../canvas/selection/model'
import { PlanSummary as StatsSummary } from '../stats'
import { Badge } from './Badge'
import { Button } from './Button'
import { IconButton } from './IconButton'
import { Input } from './Input'
import { LengthField } from './LengthField'
import { Segmented } from './Segmented'
import { SewerInspector, SewerSummary, WaterInspector, WaterSummary, useLayers, useSewerSelection, useSewerUi, useWaterSelection, useWaterUi } from '../networks'
import { ElectricInspector, ElectricSummary, useElectricSelection, useElectricUi } from '../networks/electric'
import { HeatingInspector, HeatingSummary, useHeatingSelection, useHeatingUi } from '../networks/heating'

export function Inspector() {
  const plan = usePlanStore((s) => s.plan)
  const selectedWallId = usePlanStore((s) => s.selectedWallId)
  const selectedOpeningId = usePlanStore((s) => s.selectedOpeningId)
  const selectedFurnitureId = usePlanStore((s) => s.selectedFurnitureId)
  const selectedZoneId = usePlanStore((s) => s.selectedZoneId)
  const group = usePlanStore((s) => s.group)
  const viewOnly = useViewOnly()
  const sewerOn = useLayers((s) => s.sewer)
  const sewerSel = useSewerSelection(plan)
  const electricOn = useLayers((s) => s.electric)
  const electricSel = useElectricSelection(plan)
  const heatingOn = useLayers((s) => s.heating)
  const heatingSel = useHeatingSelection(plan)
  const waterOn = useLayers((s) => s.water)
  const waterSel = useWaterSelection(plan)
  if (!plan) return null
  if (viewOnly) return <SummaryPanel plan={plan} />
  if (sewerOn && sewerSel) return <SewerInspector plan={plan} sel={sewerSel} />
  if (waterOn && waterSel) return <WaterInspector plan={plan} sel={waterSel} />
  if (electricOn && electricSel) return <ElectricInspector plan={plan} sel={electricSel} />
  if (heatingOn && heatingSel) return <HeatingInspector plan={plan} sel={heatingSel} />
  if (group) return <GroupInspector plan={plan} group={group} />
  const item = plan.furniture.find((f) => f.id === selectedFurnitureId)
  const zone = plan.site.zones?.find((z) => z.id === selectedZoneId)
  if (zone) return zone.locked ? <LockedZoneInspector zone={zone} /> : <ZoneInspector plan={plan} zone={zone} />
  if (item) return <FurnitureInspector plan={plan} item={item} />
  const opening = plan.openings.find((o) => o.id === selectedOpeningId)
  if (opening) return <OpeningInspector plan={plan} opening={opening} />
  const wall = plan.walls.find((w) => w.id === selectedWallId)
  if (wall) return <WallInspector plan={plan} wall={wall} />
  return <SummaryPanel plan={plan} />
}

function InspectorClose() {
  const { t } = useTranslation('plan')
  const selectWall = usePlanStore((st) => st.selectWall)
  return (
    <IconButton label={t('close')} size="sm" className="inspector__close" onClick={() => selectWall(null)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </IconButton>
  )
}

const typeLabel = (type: Opening['type']) => i18n.t(`plan:openingTypes.${type}`)

const panelsDative = (n: number) => {
  if (!Number.isInteger(Math.round(n * 1000) / 1000)) return i18n.t('plan:wall.panelsFrac', { n: fmt(n) })
  return i18n.t('plan:wall.panelsDative', { count: Math.round(n) })
}

const fmt = (v: number, d = 2) => fmtNum(v, d)

export function panelFit(len: number, m?: Material) {
  if (!m?.panelWidth) return null
  const n = len / m.panelWidth
  const half = m.panelWidth / 2
  const rest = len % half
  const aligned = rest < 1 || half - rest < 1
  const down = Math.floor(len / half) * half
  const up = Math.ceil(len / half) * half
  return { n, aligned, down, up, frac: n - Math.floor(n), half }
}

function WallInspector({ plan, wall }: { plan: Plan; wall: Wall }) {
  const { t } = useTranslation('plan')
  const commit = usePlanStore((s) => s.commit)
  const deleteWall = usePlanStore((s) => s.deleteWall)
  const material = findMaterial(plan, wall.materialId)
  const openings = plan.openings.filter((o) => o.wallId === wall.id)
  const len = wallLength(wall)
  const panels = material ? wallPanelCount(wall, material) : undefined
  const fit = panelFit(len, material)
  const selectOpening = usePlanStore((s) => s.selectOpening)

  return (
    <aside className="inspector card">
      <div className="inspector__head">
        <InspectorClose />
        <div className="eyebrow">{t('wall.eyebrow')}</div>
        <div className="inspector__title">{wall.id}</div>
      </div>
      <div className="form">
        <label className="form__row">
          <span>{t('wall.length')}</span>
          <LengthField value={len} min={100} onCommit={(mm) => commit(setWallLength(plan, wall.id, mm))} />
        </label>
        <label className="form__row">
          <span>{t('wall.thickness')}</span>
          <LengthField value={wall.thickness} min={10} onCommit={(mm) => commit(updateWall(plan, wall.id, { thickness: mm }))} />
        </label>
        <label className="form__row">
          <span>{t('height')}</span>
          <LengthField value={wall.height} min={100} onCommit={(mm) => commit(updateWall(plan, wall.id, { height: mm }))} />
        </label>
        <label className="form__row">
          <span>{t('wall.material')}</span>
          <select
            className="select form__select"
            value={wall.materialId ?? ''}
            onChange={(e) => {
              const m = findMaterial(plan, e.target.value || undefined)
              const next = { ...wall, thickness: m?.thickness ?? wall.thickness }
              delete (next as { materialId?: string }).materialId
              commit({
                ...plan,
                walls: plan.walls.map((w) => (w.id === wall.id ? (m ? { ...next, materialId: m.id } : next) : w)),
              })
            }}
          >
            <option value="">{t('wall.noMaterial')}</option>
            {plan.materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <dl className="props props--compact">
        <dt>{t('area')}</dt>
        <dd>{fmt((len * wall.height) / 1e6)} {t('common:units.m2')}</dd>
        {panels !== undefined && (
          <>
            <dt>{t('wall.panels')}</dt>
            <dd>{panels} {t('common:units.pcs')}</dd>
          </>
        )}
        <dt>a → b</dt>
        <dd>
          {Math.round(wall.a.x)}, {Math.round(wall.a.y)} → {Math.round(wall.b.x)}, {Math.round(wall.b.y)}
        </dd>
      </dl>
      {fit && material && (
        <div className={`layout-hint ${fit.aligned ? '' : 'layout-hint--warn'}`}>
          {fit.aligned ? (
            <>
              <Badge tone="ok">{t('wall.multipleOf', { panels: panelsDative(fit.n) })}</Badge> {t('wall.panelWidth', { width: material.panelWidth })}
            </>
          ) : (
            <>
              <Badge tone="warn">{t('wall.extraPanels', { n: fmt(fit.frac) })}</Badge>{' '}
              {t('wall.notAligned', { half: (material.panelWidth ?? 0) / 2, down: formatLength(fit.down), up: formatLength(fit.up) })}
              <div className="layout-hint__actions">
                <Button size="sm" variant="ghost" onClick={() => commit(setWallLength(plan, wall.id, fit.down))}>
                  {formatLength(fit.down)}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => commit(setWallLength(plan, wall.id, fit.up))}>
                  {formatLength(fit.up)}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
      {openings.length > 0 && (
        <div className="inspector__section">
          <div className="eyebrow">{t('wall.openings')}</div>
          {openings.map((o) => (
            <button key={o.id} className="row row--link" onClick={() => selectOpening(o.id)}>
              <span>
                {typeLabel(o.type)} {o.id}
              </span>
              <span className="muted">
                {o.width}×{o.height}, {t('wall.fromA', { offset: o.offset })}
              </span>
            </button>
          ))}
        </div>
      )}
      <Button size="sm" onClick={() => usePlanStore.getState().setGroup(buildingSel(plan, wall.id))}>
        {t('wall.selectBuilding')}
      </Button>
      <Button variant="danger" className="inspector__delete" onClick={() => deleteWall(wall.id)}>
        {t('wall.delete')}
      </Button>
      <p className="hint">{t('wall.hint')}</p>
    </aside>
  )
}

function DegField({ onCommit }: { onCommit: (deg: number) => void }) {
  const [draft, setDraft] = useState('0')
  const [invalid, setInvalid] = useState(false)
  const commit = () => {
    const v = Number(draft.trim().replace(',', '.').replace('−', '-'))
    if (!Number.isFinite(v)) {
      setInvalid(true)
      return
    }
    setDraft('0')
    setInvalid(false)
    if (v) onCommit(v)
  }
  return (
    <Input
      size="sm"
      suffix="°"
      invalid={invalid}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value)
        setInvalid(false)
      }}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        else if (e.key === 'Escape') {
          setDraft('0')
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}

function GroupInspector({ plan, group }: { plan: Plan; group: Selection }) {
  const { t } = useTranslation('plan')
  const moveGroup = usePlanStore((s) => s.moveGroup)
  const rotateGroup = usePlanStore((s) => s.rotateGroup)
  const deleteGroup = usePlanStore((s) => s.deleteGroup)
  const setGroup = usePlanStore((s) => s.setGroup)
  const street = streetAlignDeg(plan, group)
  return (
    <aside className="inspector card">
      <div className="inspector__head">
        <IconButton label={t('group.deselect')} size="sm" className="inspector__close" onClick={() => setGroup(null)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </IconButton>
        <div className="eyebrow">{t('group.eyebrow')}</div>
        <div className="inspector__title">{t('group.selected', { summary: selSummary(group) })}</div>
      </div>
      <div className="form">
        <label className="form__row">
          <span>{t('group.moveX')}</span>
          <LengthField value={0} min={-1e7} onCommit={(mm) => moveGroup(mm, 0)} />
        </label>
        <label className="form__row">
          <span>{t('group.moveY')}</span>
          <LengthField value={0} min={-1e7} onCommit={(mm) => moveGroup(0, mm)} />
        </label>
        <label className="form__row">
          <span>{t('group.rotateDeg')}</span>
          <DegField onCommit={rotateGroup} />
        </label>
      </div>
      <div className="inspector__actions">
        {[-15, -1, 1, 15].map((d) => (
          <Button key={d} size="sm" onClick={() => rotateGroup(d)}>
            {d > 0 ? `+${d}` : `−${-d}`}°
          </Button>
        ))}
      </div>
      {street !== null && street !== 0 && (
        <Button size="sm" onClick={() => rotateGroup(street)}>
          {t('group.alignStreet')}
        </Button>
      )}
      <Button variant="danger" className="inspector__delete" onClick={deleteGroup}>
        {t('delete')}
      </Button>
      <p className="hint">
        {t('group.hint')}
      </p>
    </aside>
  )
}

function OpeningInspector({ plan, opening: o }: { plan: Plan; opening: Opening }) {
  const { t } = useTranslation('plan')
  const commit = usePlanStore((s) => s.commit)
  const selectWall = usePlanStore((s) => s.selectWall)
  const wall = plan.walls.find((w) => w.id === o.wallId)
  const len = wall ? wallLength(wall) : 0
  const set = (patch: Partial<Opening>) => {
    const next = { ...o, ...patch }
    if (patch.width !== undefined || patch.offset !== undefined) {
      const at = fitOffset(plan, o.wallId, next.width, next.offset, o.id)
      if (at === null) return
      next.offset = at
    }
    commit(updateOpening(plan, o.id, next))
  }

  return (
    <aside className="inspector card">
      <div className="inspector__head">
        <InspectorClose />
        <div className="eyebrow">{typeLabel(o.type)}</div>
        <div className="inspector__title">{o.id}</div>
      </div>
      <div className="form">
        <div className="form__row">
          <span>{t('type')}</span>
          <Segmented
            size="sm"
            value={o.type}
            options={[
              { value: 'door', label: typeLabel('door') },
              { value: 'window', label: typeLabel('window') },
              { value: 'gate', label: typeLabel('gate') },
            ]}
            onChange={(type) =>
              set(
                type === 'door'
                  ? { type, sill: 0, hinge: o.hinge ?? 'start', side: o.side ?? 'right' }
                  : type === 'gate'
                    ? { type, sill: 0, hinge: undefined, side: o.side ?? 'right' }
                    : { type, sill: o.sill || 800, hinge: undefined, side: undefined },
              )
            }
          />
        </div>
        <label className="form__row">
          <span>{t('width')}</span>
          <LengthField value={o.width} min={300} onCommit={(width) => set({ width })} />
        </label>
        <label className="form__row">
          <span>{t('height')}</span>
          <LengthField value={o.height} min={300} onCommit={(height) => set({ height })} />
        </label>
        <label className="form__row">
          <span>{t('opening.sill')}</span>
          <LengthField value={o.sill} onCommit={(sill) => set({ sill })} />
        </label>
        <label className="form__row">
          <span>{t('opening.offset')}</span>
          <LengthField value={o.offset} onCommit={(offset) => set({ offset })} />
        </label>
        {o.type === 'door' && (
          <>
            <div className="form__row">
              <span>{t('opening.hinges')}</span>
              <Segmented
                size="sm"
                value={o.hinge ?? 'start'}
                options={[
                  { value: 'start', label: t('opening.hingeStart') },
                  { value: 'end', label: t('opening.hingeEnd') },
                ]}
                onChange={(hinge) => set({ hinge })}
              />
            </div>
          </>
        )}
        {(o.type === 'door' || o.type === 'gate') && (
          <>
            <div className="form__row">
              <span>{t('opening.swing')}</span>
              <Segmented
                size="sm"
                value={o.side ?? 'right'}
                options={[
                  { value: 'left', label: t('opening.left') },
                  { value: 'right', label: t('opening.right') },
                ]}
                onChange={(side) => set({ side })}
              />
            </div>
          </>
        )}
      </div>
      <dl className="props props--compact">
        <dt>{t('opening.toEnd')}</dt>
        <dd>{Math.round(len - o.offset - o.width)} {t('common:units.mm')}</dd>
        <dt>{t('area')}</dt>
        <dd>{fmt((o.width * o.height) / 1e6)} {t('common:units.m2')}</dd>
      </dl>
      <div className="inspector__actions">
        {wall && (
          <Button size="sm" onClick={() => selectWall(wall.id)}>
            {t('opening.wall', { id: wall.id })}
          </Button>
        )}
        <Button
          size="sm"
          variant="danger"
          onClick={() => commit({ ...plan, openings: plan.openings.filter((x) => x.id !== o.id) })}
        >
          {t('delete')}
        </Button>
      </div>
      <p className="hint">{t('opening.hint')}</p>
    </aside>
  )
}

function LockedZoneInspector({ zone }: { zone: Zone }) {
  const { t } = useTranslation('plan')
  return (
    <aside className="inspector card">
      <div className="inspector__head">
        <InspectorClose />
        <div className="eyebrow eyebrow--lock">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          {t('zone.lockedEyebrow')}
        </div>
        <div className="inspector__title">{zone.name}</div>
      </div>
      <dl className="props props--compact">
        <dt>{t('area')}</dt>
        <dd>{fmt(polygonAreaMm2(zone.polygon) / 1e6, 1)} {t('common:units.m2')}</dd>
      </dl>
      <p className="hint">{t('zone.lockedHint')}</p>
    </aside>
  )
}

function ZoneInspector({ plan, zone }: { plan: Plan; zone: Zone }) {
  const { t } = useTranslation('plan')
  const commit = usePlanStore((s) => s.commit)
  const [name, setName] = useState<string | null>(null)
  const area = polygonAreaMm2(zone.polygon) / 1e6
  const saveName = () => {
    if (name === null) return
    const v = name.trim()
    setName(null)
    if (v && v !== zone.name) commit(updateZone(plan, zone.id, { name: v }))
  }
  return (
    <aside className="inspector card">
      <div className="inspector__head">
        <InspectorClose />
        <div className="eyebrow">{t('zone.eyebrow')}</div>
        <div className="inspector__title">{zone.name}</div>
      </div>
      <div className="form">
        <label className="form__row">
          <span>{t('zone.name')}</span>
          <Input
            size="sm"
            value={name ?? zone.name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
          />
        </label>
        <div className="form__row">
          <span>{t('type')}</span>
          <select
            className="select form__select"
            value={zone.kind}
            onChange={(e) => commit(updateZone(plan, zone.id, { kind: e.target.value as Zone['kind'] }))}
          >
            {(Object.keys(zoneKindLabels) as Zone['kind'][]).map((k) => (
              <option key={k} value={k}>
                {zoneKindLabels[k]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <dl className="props props--compact">
        <dt>{t('area')}</dt>
        <dd>{fmt(area, 1)} {t('common:units.m2')}</dd>
        <dt>{t('zone.perimeter')}</dt>
        <dd>{formatLength(polygonPerimeter(zone.polygon))}</dd>
        <dt>{t('zone.vertices')}</dt>
        <dd>{zone.polygon.length}</dd>
      </dl>
      <div className="inspector__actions">
        <span />
        <Button size="sm" variant="danger" onClick={() => commit(deleteZone(plan, zone.id))}>
          {t('delete')}
        </Button>
      </div>
      <p className="hint">{t('zone.hint')}</p>
    </aside>
  )
}

function FurnitureInspector({ plan, item }: { plan: Plan; item: Furniture }) {
  const { t } = useTranslation('plan')
  const commit = usePlanStore((s) => s.commit)
  const r = resolveFurniture(item)
  const set = (patch: Partial<Furniture>) => commit(updateFurniture(plan, item.id, patch))
  return (
    <aside className="inspector card">
      <div className="inspector__head">
        <InspectorClose />
        <div className="eyebrow">{t('furniture.eyebrow')}</div>
        <div className="inspector__title">{r.def?.name ?? item.type}</div>
      </div>
      <div className="form">
        <label className="form__row">
          <span>{t('width')}</span>
          <LengthField value={r.w} min={100} onCommit={(w) => set({ w })} />
        </label>
        <label className="form__row">
          <span>{t('furniture.depth')}</span>
          <LengthField value={r.d} min={100} onCommit={(d) => set({ d })} />
        </label>
        <label className="form__row">
          <span>{t('height')}</span>
          <LengthField value={r.h} min={50} onCommit={(h) => set({ h })} />
        </label>
        <div className="form__row">
          <span>{t('furniture.rotation')}</span>
          <Segmented
            size="sm"
            value={String(normalizeDeg(item.rotationDeg))}
            options={['0', '90', '180', '270'].map((v) => ({ value: v, label: `${v}°` }))}
            onChange={(v) => set({ rotationDeg: Number(v) })}
          />
        </div>
        <label className="form__row">
          <span>{t('furniture.color')}</span>
          <input
            type="color"
            className="form__color"
            value={item.color && /^#[0-9a-f]{6}$/i.test(item.color) ? item.color : '#ffffff'}
            onChange={(e) => set({ color: e.target.value })}
          />
        </label>
      </div>
      <dl className="props props--compact">
        <dt>{t('furniture.center')}</dt>
        <dd>
          {Math.round(item.x)}, {Math.round(item.y)}
        </dd>
      </dl>
      <div className="inspector__actions">
        <Button size="sm" onClick={() => set({ rotationDeg: normalizeDeg(item.rotationDeg + 90) })}>
          {t('furniture.rotate90')}
        </Button>
        <Button size="sm" variant="danger" onClick={() => commit(deleteFurniture(plan, item.id))}>
          {t('delete')}
        </Button>
      </div>
      <p className="hint">{t('furniture.hint')}</p>
    </aside>
  )
}

const checked = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : fmtDateTime(d, { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function EstimateRow({ line }: { line: WallEstimateLine }) {
  const { t } = useTranslation('plan')
  const m = line.material
  const unit = line.unit ? unitLabels[line.unit] : ''
  const facts = [
    t('estimate.walls', { count: line.wallCount, length: formatLength(line.lengthMm) }),
    `${fmt(line.netAreaM2)} ${t('common:units.m2')}`,
    line.panels !== undefined ? t('estimate.panels', { count: line.panels }) : null,
  ].filter(Boolean)

  return (
    <div className="material">
      <span className="swatch swatch--lg" style={{ background: materialColor(m) }} />
      <div className="material__body">
        <div className="material__name">{line.name}</div>
        <div className="muted">
          {m ? `${kindLabels[m.kind]} · ${fmt(m.thickness, 0)} ${t('common:units.mm')}${m.name.includes('+') ? t('estimate.wholeWall') : ''}` : t('estimate.noMaterial')}
          {m?.panelWidth && m.panelHeight ? t('estimate.panelSize', { w: m.panelWidth, h: m.panelHeight }) : ''}
        </div>
        <div className="muted">{facts.join(' · ')}</div>
        {line.panelsWithWaste !== undefined && (
          <div className="muted">
            {t('estimate.withWaste', { pct: line.wastePct, n: line.panelsWithWaste })}
          </div>
        )}
        <div className="material__calc">
          {line.qty !== null ? `${fmt(line.qty)} ${unit}` : '—'}
          {line.price !== undefined ? ` × ${formatMoney(line.price)}` : ''}
          {line.cost !== null ? ' = ' : ''}
          {line.cost !== null && <strong>{formatMoney(line.cost)}</strong>}
          <span className="muted">{t('estimate.areaWithWaste', { area: fmt(line.areaWithWasteM2) })}</span>
          {line.price === undefined && <div className="muted">{t('estimate.noPrice')}</div>}
        </div>
        {line.piecesPerM2 !== undefined && (
          <div className="muted">
            {t('estimate.piecesPerM2', { n: fmt(line.piecesPerM2, 1), l: m?.unitLength, h: m?.unitHeight, joint: m?.jointMm ?? 10 })}
            {line.unit !== 'pcs' && line.pieces !== undefined ? t('estimate.pieces', { n: fmt(line.pieces, 0) }) : ''}
          </div>
        )}
        {(line.url || line.source || line.checkedAt) && (
          <div className="material__source muted">
            {line.url ? (
              <a href={line.url} target="_blank" rel="noreferrer">
                {line.source || t('estimate.source')}
              </a>
            ) : (
              line.source
            )}
            {line.checkedAt && t('estimate.checked', { date: checked(line.checkedAt) })}
          </div>
        )}
      </div>
    </div>
  )
}

const NET_TAB_KEY = 'house-planner:panel-tab'
const NET_TABS = ['sewer', 'water', 'electric', 'heating'] as const
type NetTab = (typeof NET_TABS)[number]
const readNetTab = (): NetTab | null => {
  try {
    const v = localStorage.getItem(NET_TAB_KEY)
    return (NET_TABS as readonly string[]).includes(v ?? '') ? (v as NetTab) : null
  } catch {
    return null
  }
}
const writeNetTab = (v: NetTab | null) => {
  try {
    if (v) localStorage.setItem(NET_TAB_KEY, v)
    else localStorage.removeItem(NET_TAB_KEY)
  } catch {
    return
  }
}

function SummaryPanel({ plan }: { plan: Plan }) {
  const { t } = useTranslation('plan')
  const rawTab = usePlanStore((s) => s.summaryTab)
  const tab = rawTab === 'materials' ? 'materials' : 'general'
  const setTab = usePlanStore((s) => s.setSummaryTab)
  const open = usePlanStore((s) => s.summaryOpen)
  const setOpen = usePlanStore((s) => s.setSummaryOpen)
  const sewerOn = useLayers((s) => s.sewer)
  const sewerTab = useSewerUi((s) => s.panel) && sewerOn
  const setSewerTab = useSewerUi((s) => s.setPanel)
  const waterOn = useLayers((s) => s.water)
  const waterTab = useWaterUi((s) => s.panel) && waterOn
  const setWaterTab = useWaterUi((s) => s.setPanel)
  const electricOn = useLayers((s) => s.electric)
  const electricTab = useElectricUi((s) => s.tab) && electricOn
  const setElectricTab = useElectricUi((s) => s.setTab)
  const heatingOn = useLayers((s) => s.heating)
  const heatingTab = useHeatingUi((s) => s.tab) && heatingOn
  const setHeatingTab = useHeatingUi((s) => s.setTab)
  const setNetTab = (v: string) => {
    setSewerTab(v === 'sewer')
    setWaterTab(v === 'water')
    setElectricTab(v === 'electric')
    setHeatingTab(v === 'heating')
  }
  useEffect(() => {
    const saved = readNetTab()
    if (saved) setNetTab(saved)
  }, [])
  return (
    <aside className={`inspector inspector--summary card ${open ? 'inspector--open' : ''}`}>
      <div className="inspector__tabs">
        <Segmented
          size="sm"
          value={heatingTab ? 'heating' : electricTab ? 'electric' : waterTab ? 'water' : sewerTab ? 'sewer' : tab}
          options={[
            { value: 'general', label: t('tabs.general') },
            { value: 'materials', label: t('tabs.materials') },
            ...(sewerOn ? [{ value: 'sewer', label: t('tabs.sewer') }] : []),
            ...(waterOn ? [{ value: 'water', label: t('tabs.water') }] : []),
            ...(electricOn ? [{ value: 'electric', label: t('tabs.electric') }] : []),
            ...(heatingOn ? [{ value: 'heating', label: t('tabs.heating') }] : []),
          ]}
          onChange={(v) => {
            setNetTab(v)
            const net = (NET_TABS as readonly string[]).includes(v) ? (v as NetTab) : null
            writeNetTab(net)
            if (!net) setTab(v as 'general' | 'materials')
          }}
        />
        <IconButton label={t('close')} size="sm" className="inspector__sheet-close" onClick={() => setOpen(false)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </IconButton>
      </div>
      {heatingTab ? <HeatingSummary plan={plan} /> : electricTab ? <ElectricSummary plan={plan} /> : waterTab ? <WaterSummary plan={plan} /> : sewerTab ? <SewerSummary plan={plan} /> : tab === 'general' ? <StatsSummary plan={plan} /> : <PlanSummary plan={plan} />}
    </aside>
  )
}

function PlanSummary({ plan }: { plan: Plan }) {
  const { t } = useTranslation('plan')
  const commit = usePlanStore((s) => s.commit)
  const estimate = computeWallEstimate(plan)
  const unused = plan.materials.filter((m) => !estimate.lines.some((l) => l.materialId === m.id))

  const setWaste = (value: number) => {
    if (!Number.isFinite(value)) return
    const pct = Math.min(30, Math.max(0, Math.round(value)))
    commit({
      ...plan,
      estimate: { lines: [], purchases: {}, ...plan.estimate, wasteSipPct: pct },
    })
  }

  return (
    <div className="inspector__materials">
      <div className="inspector__head">
        <div className="eyebrow">{t('materials.eyebrow')}</div>
        <div className="inspector__title">{t('materials.title')}</div>
      </div>
      {estimate.lines.length === 0 && <p className="muted">{t('materials.noWalls')}</p>}
      {estimate.lines.map((l) => (
        <EstimateRow key={l.id} line={l} />
      ))}
      {unused.map((m) => (
        <div key={m.id} className="material material--unused">
          <span className="swatch swatch--lg" style={{ background: materialColor(m) }} />
          <div className="material__body">
            <div className="material__name">{m.name}</div>
            <div className="muted">{t('materials.unused')}</div>
          </div>
        </div>
      ))}
      <div className="inspector__section">
        <label className="row row--center">
          <span>{t('materials.waste')}</span>
          <Input
            size="sm"
            type="number"
            min={0}
            max={30}
            step={1}
            suffix="%"
            className="waste"
            value={plan.estimate?.wasteSipPct ?? DEFAULT_WASTE_PCT}
            onChange={(e) => setWaste(Number(e.target.value))}
          />
        </label>
        <div className="row total">
          <span>{t('materials.total')}</span>
          <strong>{formatMoney(estimate.total)}</strong>
        </div>
        {estimate.missingPrices > 0 && <div className="muted">{t('materials.noPrice', { count: estimate.missingPrices })}</div>}
      </div>
      <p className="hint">{t('materials.hint')}</p>
    </div>
  )
}
