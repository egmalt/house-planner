import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card } from '../ui'
import { BlockView } from './Blocks'
import { fmtDate } from './util'
import type { Block, HouseData } from './types'
import './info.css'

const DATA_URL = `${import.meta.env.BASE_URL}data/house.json`

const pairs = (blocks: Block[]) =>
  blocks.map((b, i) => {
    const next = blocks[i + 1]
    const prev = blocks[i - 1]
    return (b.type === 'facts' && next?.type === 'map') || (b.type === 'map' && prev?.type === 'facts')
  })

export default function InfoPage() {
  const { t } = useTranslation('info')
  const [data, setData] = useState<HouseData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refs = useRef<Record<string, HTMLElement | null>>({})

  useEffect(() => {
    let alive = true
    fetch(DATA_URL, { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<HouseData>
      })
      .then((d) => alive && setData(d))
      .catch((e: unknown) => alive && setError(t('loadError', { error: e instanceof Error ? e.message : String(e) })))
    return () => {
      alive = false
    }
  }, [])

  if (error) return <div className="info"><div className="info-note info-note--warn">{error}</div></div>
  if (!data) return <div className="info"><div className="info-loading">{t('loading')}</div></div>

  return (
    <div className="info">
      <header className="info-hero">
        <div>
          <h1 className="info-hero__title">{data.title}</h1>
          {data.subtitle && <div className="info-hero__sub">{data.subtitle}</div>}
        </div>
        {data.updated && <div className="info-hero__updated">{t('updated', { date: fmtDate(data.updated) })}</div>}
      </header>

      <nav className="info-nav" aria-label={t('sectionsNav')}>
        {data.sections.map((s) => (
          <Button key={s.id} size="sm" onClick={() => refs.current[s.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            {s.title}
            {s.status === 'collecting' && <span className="info-nav__dot" title={t('collecting')} />}
          </Button>
        ))}
      </nav>

      {data.sections.map((s) => {
        const half = pairs(s.blocks)
        return (
          <section key={s.id} className="info-anchor" ref={(el) => void (refs.current[s.id] = el)}>
            <Card className="info-section">
              <div className="info-section__head">
                <h2 className="info-section__title">{s.title}</h2>
                {s.status === 'collecting' && <Badge tone="accent">{t('collecting')}</Badge>}
              </div>
              {s.lead && <p className="info-section__lead">{s.lead}</p>}
              <div className="info-section__body">
                {s.blocks.map((b, i) => (
                  <div key={b.auto ?? i} className={half[i] ? 'info-cell info-cell--half' : 'info-cell'}>
                    <BlockView block={b} />
                  </div>
                ))}
              </div>
            </Card>
          </section>
        )
      })}
    </div>
  )
}
