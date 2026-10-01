import { Fragment, useMemo, useState, type InputHTMLAttributes } from 'react'
import { useTranslation } from 'react-i18next'
import { t as tr } from '../i18n'
import { unitLabel } from '../i18n/units'
import type { Plan } from '../model'
import { useViewOnly } from '../store/viewOnly'
import { RAL_CLASSIC, ralCode, ralLabel } from '../view3d/ral'
import { Button, Checkbox, IconButton, Table, Td, Th, Tr } from '../ui'
import { downloadCsv, toCsv } from './csv'
import type { PetrovichLink } from './petrovich'
import { PetrovichCart } from './PetrovichCart'
import { useCatalog, type CatalogItem } from './catalog'
import { fmtDate, fmtNum, fmtRub, numText, parseNum, today } from './format'
import { buildRows, estimateOf, newLineId, removeLine, rowSum, setPurchase, upsertLine, withEstimate, type Row } from './rows'
import './estimate.css'

type Props = {
  plan: Plan
  onChange: (next: Plan) => void
}

type CellProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string
  onCommit: (value: string) => void
}

function Cell({ value, onCommit, className, ...rest }: CellProps) {
  const [draft, setDraft] = useState(value)
  const [synced, setSynced] = useState(value)
  if (synced !== value) {
    setSynced(value)
    setDraft(value)
  }
  return (
    <>
      <span className={`est-print ${className ?? ''}`}>{value}</span>
      <input
      className={`est-cell ${className ?? ''}`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setDraft(value)
      }}
      {...rest}
      />
    </>
  )
}

const newLineName = () => tr('estimate:page.newLine')

const PALETTE_SLOTS = ['walls', 'gates', 'roof', 'windows', 'accent', 'plinth'] as const

function Colors({ plan }: { plan: Plan }) {
  const { t } = useTranslation('estimate')
  const palette = plan.palette ?? {}
  const items: { label: string; code: string }[] = []
  for (const key of PALETTE_SLOTS) {
    const label = t(`colors.slots.${key}`)
    const code = ralCode(palette[key])
    if (!code) continue
    const prev = items.at(-1)
    if (prev && prev.code === code && (key === 'gates' || key === 'plinth')) prev.label = t('colors.joined', { a: prev.label, b: label.toLowerCase() })
    else items.push({ label, code })
  }
  return (
    <section className="est-block">
      <h2 className="est-block__title">{t('colors.title')}{palette.name ? ` · ${palette.name}` : ''}</h2>
      {items.length ? (
        <table className="est-colors">
          <tbody>
            {items.map((c) => (
              <tr key={c.label}>
                <td className="est-colors__what">{c.label}</td>
                <td className="est-colors__code">
                  <span className="est-swatch" style={{ background: RAL_CLASSIC[c.code][0] }} aria-hidden />
                  {ralLabel(c.code)}
                </td>
                <td className="est-colors__name">{RAL_CLASSIC[c.code][1]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="est-empty-note">{t('colors.empty')}</p>
      )}
    </section>
  )
}

export default function EstimatePage({ plan, onChange }: Props) {
  const { t } = useTranslation('estimate')
  const catalog = useCatalog()
  const viewOnly = useViewOnly()
  const [focusId, setFocusId] = useState<string | null>(null)
  const rows = useMemo(() => buildRows(plan, catalog), [plan, catalog])
  const total = rows.reduce((s, r) => s + rowSum(r), 0)
  const purchases = estimateOf(plan).purchases

  const commit = (fn: Parameters<typeof withEstimate>[1]) => onChange(withEstimate(plan, fn))

  const toggle = (r: Row, done: boolean) =>
    commit((e) => setPurchase(e, r.id, done ? { done: true, date: today() } : undefined))

  const patch = (r: Row, p: Partial<NonNullable<Row['line']>>) => {
    const line = r.line
    if (line) commit((e) => upsertLine(e, { ...line, ...p }))
  }

  const pickName = (r: Row, name: string) => {
    const c: CatalogItem | undefined = catalog.find((x) => x.name === name)
    if (c) patch(r, { name: c.name, unit: c.unit, price: c.price, url: c.url })
    else if (name.trim()) patch(r, { name: name.trim() })
  }

  const notes = estimateOf(plan).notes ?? []
  const [noteFocus, setNoteFocus] = useState<number | null>(null)

  const setNote = (i: number, v: string) =>
    commit((e) => {
      const next = [...(e.notes ?? [])]
      if (v.trim()) next[i] = v.trim()
      else next.splice(i, 1)
      return { ...e, notes: next }
    })

  const addNote = () => {
    commit((e) => ({ ...e, notes: [...(e.notes ?? []), t('page.newNote')] }))
    setNoteFocus(notes.length)
  }

  const add = () => {
    const id = newLineId(estimateOf(plan))
    commit((e) => upsertLine(e, { id, category: 'прочее', name: newLineName(), qty: 1, unit: tr('common:units.pcs') }))
    setFocusId(id)
  }

  return (
    <div className="est">
      <div className="est-tools">
        <button type="button" className="est-tool" onClick={() => downloadCsv(t('csv.fileName', { date: today() }), toCsv(rows))}>
          {t('page.downloadCsv')}
        </button>
        <PetrovichCart
          rows={rows}
          saved={(estimateOf(plan).petrovichLinks as PetrovichLink[] | undefined) ?? []}
          onSave={(links) => commit((e) => ({ ...e, petrovichLinks: links }))}
        />
      </div>
      <article className="est-sheet">
        <header className="est-head">
          <h1 className="est-head__title">{t('page.title')}</h1>
          <div className="est-head__sub">{plan.name}</div>
        </header>

        <Table className="est-table">
          <colgroup>
            <col className="est-col--n" />
            <col className="est-col--check" />
            <col />
            <col className="est-col--qty" />
            <col className="est-col--unit" />
            <col className="est-col--price" />
            <col className="est-col--sum" />
            <col className="est-col--del" />
          </colgroup>
          <thead>
            <tr>
              <Th num>{t('columns.n')}</Th>
              <Th aria-label={t('page.bought')} />
              <Th>{t('columns.name')}</Th>
              <Th num>{t('columns.qty')}</Th>
              <Th>{t('columns.unit')}</Th>
              <Th num>{t('columns.price')}</Th>
              <Th num>{t('columns.sum')}</Th>
              <Th className="est-del" aria-label={t('page.delete')} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const date = purchases[r.id]?.date
              const heading = r.group && r.group !== rows[i - 1]?.group
              return (
                <Fragment key={r.id}>
                {heading && (
                  <tr className="est-group">
                    <td colSpan={8}>{r.group}</td>
                  </tr>
                )}
                <Tr muted={r.bought}>
                  <Td num>{i + 1}</Td>
                  <Td>
                    <Checkbox
                      checked={r.bought}
                      disabled={viewOnly}
                      onChange={(done) => toggle(r, done)}
                      aria-label={r.bought ? t('page.bought') : t('page.markBought')}
                      title={r.bought && date ? t('page.boughtOn', { date: fmtDate(date) }) : undefined}
                    />
                  </Td>
                  <Td>
                    {!viewOnly && r.line ? (
                      <div className="est-name">
                        <Cell
                          value={r.name}
                          list="est-catalog"
                          autoFocus={focusId === r.id}
                          onFocus={(e) => e.target.value === newLineName() && e.target.select()}
                          onCommit={(v) => pickName(r, v)}
                        />
                        {r.url && (
                          <a className="est-name__go" href={r.url} target="_blank" rel="noreferrer" aria-label={t('page.openInStore')}>
                            ↗
                          </a>
                        )}
                      </div>
                    ) : (
                      <>
                        {r.url ? (
                          <a href={r.url} target="_blank" rel="noreferrer" className="est-link">
                            {r.name}
                          </a>
                        ) : (
                          r.name
                        )}
                        {r.priceFrom && (
                          <div className="est-from" title={r.priceFrom}>
                            {r.priceFrom}
                          </div>
                        )}
                      </>
                    )}
                    {r.note && <div className="est-note">{r.note}</div>}
                  </Td>
                  <Td num>
                    {!viewOnly && r.line ? (
                      <Cell
                        className="est-cell--num"
                        inputMode="decimal"
                        value={numText(r.qty)}
                        onCommit={(v) => patch(r, { qty: parseNum(v) ?? 0 })}
                      />
                    ) : (
                      fmtNum(r.qty)
                    )}
                  </Td>
                  <Td>{!viewOnly && r.line ? <Cell value={unitLabel(r.unit)} onCommit={(v) => patch(r, { unit: v.trim() || tr('common:units.pcs') })} /> : unitLabel(r.unit)}</Td>
                  <Td num>
                    {!viewOnly && r.line ? (
                      <Cell
                        className="est-cell--num"
                        inputMode="decimal"
                        placeholder="—"
                        value={numText(r.price)}
                        onCommit={(v) => patch(r, { price: parseNum(v) })}
                      />
                    ) : r.price !== undefined ? (
                      fmtRub(r.price)
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td num>{r.price !== undefined ? fmtRub(rowSum(r)) : '—'}</Td>
                  <Td className="est-del">
                    {!viewOnly && r.line && (
                      <IconButton
                        size="sm"
                        label={t('page.deleteLine')}
                        onClick={() => {
                          if (window.confirm(t('page.confirmDelete', { name: r.name }))) commit((e) => removeLine(e, r.id))
                        }}
                      >
                        ×
                      </IconButton>
                    )}
                  </Td>
                </Tr>
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="est-total">
              <td colSpan={6}>{t('page.total')}</td>
              <td className="num">{fmtRub(total)}</td>
              <td className="est-del" />
            </tr>
          </tfoot>
        </Table>

        {!viewOnly && (
          <Button variant="ghost" size="sm" className="est-add" onClick={add}>
            {t('page.addLine')}
          </Button>
        )}

        <Colors plan={plan} />

        <section className="est-block">
          <h2 className="est-block__title">{t('page.notesTitle')}</h2>
          {notes.length > 0 && (
            <ol className="est-notes">
              {notes.map((n, i) => (
                <li key={i}>
                  {viewOnly ? n : <Cell value={n} onCommit={(v) => setNote(i, v)} autoFocus={noteFocus === i} />}
                </li>
              ))}
            </ol>
          )}
          {!notes.length && viewOnly && <p className="est-empty-note">{t('page.noNotes')}</p>}
          {!viewOnly && (
            <Button variant="ghost" size="sm" className="est-add" onClick={addNote}>
              {t('page.addNote')}
            </Button>
          )}
        </section>
      </article>

      <datalist id="est-catalog">
        {catalog.map((c) => (
          <option key={c.id} value={c.name} label={`${c.vendor ?? ''} · ${fmtRub(c.price)}/${unitLabel(c.unit)}`} />
        ))}
      </datalist>
    </div>
  )
}
