import { t } from '../i18n'
import { Badge, type BadgeTone, Table, Td, Th } from '../ui'
import { Cell, Md, Rich } from './format'
import { fmtDate } from './util'
import { ParcelMap } from './ParcelMap'
import type { Block } from './types'

const STATUS_TONE: Record<string, BadgeTone> = {
  решено: 'ok',
  есть: 'ok',
  готово: 'ok',
  рассматривается: 'accent',
  'в работе': 'accent',
  нужно: 'danger',
  позже: 'neutral',
  отменено: 'neutral',
  decided: 'ok',
  done: 'ok',
  ready: 'ok',
  have: 'ok',
  available: 'ok',
  'in place': 'ok',
  considering: 'accent',
  'under review': 'accent',
  'in progress': 'accent',
  needed: 'danger',
  required: 'danger',
  todo: 'danger',
  later: 'neutral',
  cancelled: 'neutral',
  canceled: 'neutral',
}

function Status({ value }: { value?: string }) {
  if (!value) return null
  return <Badge tone={STATUS_TONE[value.toLowerCase()] ?? 'accent'}>{value}</Badge>
}

function Unverified({ on }: { on?: boolean }) {
  return on ? (
    <Badge tone="warn" className="info-unverified">
      {t('info:unverified')}
    </Badge>
  ) : null
}

function Source({ value }: { value?: string }) {
  return value ? <div className="info-source">{t('info:source')} <Rich text={value} /></div> : null
}

export function BlockView({ block }: { block: Block }) {
  const title =
    block.title && block.type !== 'group' && block.type !== 'map' ? (
      <h3 className="info-block__title">
        {block.title}
        <Unverified on={block.unverified} />
      </h3>
    ) : null
  switch (block.type) {
    case 'facts':
      return (
        <div className="info-block">
          {title}
          <dl className="info-facts">
            {block.items.map((f) => (
              <div key={f.label} className="info-fact">
                <dt>{f.label}</dt>
                <dd>
                  <Rich text={/^\d{4}-\d{2}-\d{2}$/.test(f.value) ? fmtDate(f.value) : f.value} />
                  <Unverified on={f.unverified ?? block.unverified} />
                  {f.hint && (
                    <span className="info-fact__hint">
                      <Rich text={f.hint} />
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <Source value={block.source} />
        </div>
      )
    case 'text':
      return (
        <div className="info-block info-text">
          {title}
          {block.paragraphs.map((p, i) => (
            <p key={i}>
              <Rich text={p} />
              {block.unverified && /\d/.test(p) && <Unverified on />}
            </p>
          ))}
        </div>
      )
    case 'markdown':
      return (
        <div className="info-block">
          {title}
          <Md text={block.text} />
        </div>
      )
    case 'heading':
      return <h3 className="info-block__title info-block__title--sub">{block.text}</h3>
    case 'table':
      return (
        <div className="info-block">
          {title}
          <div className="info-frame">
            <Table>
              <thead>
                <tr>
                  {block.columns.map((c, i) => (
                    <Th key={i}>
                      <Rich text={c} />
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => (
                      <Td key={j}>
                        <Cell value={c} />
                        {block.unverified && j > 0 && /\d/.test(c) && <Unverified on />}
                      </Td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          <Source value={block.source} />
        </div>
      )
    case 'links':
      return (
        <div className="info-block">
          {title}
          <ul className="info-links">
            {block.items.map((l) => (
              <li key={l.url + l.title}>
                <a href={l.url} target="_blank" rel="noreferrer">
                  {l.title}
                </a>
                {l.note && <span className="info-links__note">{l.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )
    case 'list':
      return (
        <div className="info-block">
          {title}
          <ul className="info-list">
            {block.items.map((d, i) => (
              <li key={i} className="info-list__item">
                <div className="info-list__main">
                  <strong>{d.url ? <a href={d.url} target="_blank" rel="noreferrer">{d.title}</a> : d.title}</strong>
                  {d.date && <span className="info-list__date">{t('info:dated', { date: fmtDate(d.date) })}</span>}
                  {d.note && (
                    <span className="info-list__note">
                      <Rich text={d.note} />
                    </span>
                  )}
                </div>
                <Status value={d.status} />
              </li>
            ))}
          </ul>
        </div>
      )
    case 'note':
      return (
        <div className={`info-note info-note--${block.tone ?? 'info'}`}>
          <Rich text={block.text} />
        </div>
      )
    case 'group':
      return (
        <details className="info-group" open={block.open}>
          <summary>{block.title ?? t('info:more')}</summary>
          <div className="info-group__body">
            {block.blocks.map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </div>
          <Source value={block.source} />
        </details>
      )
    case 'map':
      return (
        <div className="info-block">
          {block.title && <h3 className="info-block__title">{block.title}</h3>}
          <ParcelMap block={block} />
        </div>
      )
    default:
      return null
  }
}
