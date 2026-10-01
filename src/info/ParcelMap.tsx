import { useTranslation } from 'react-i18next'
import { fmtNum } from '../i18n'
import type { MapBlock, Pt } from './types'

const MARGIN = 16
const path = (pts: Pt[]) => `M${pts.map((p) => p.join(' ')).join('L')}Z`
const center = (pts: Pt[]): Pt => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length]
const num = (v: number) => fmtNum(v, 2, 2)

export function ParcelMap({ block }: { block: MapBlock }) {
  const { t } = useTranslation('info')
  const own = block.parcel.points
  const xs = own.map((p) => p[0])
  const ys = own.map((p) => p[1])
  const x0 = Math.min(...xs) - MARGIN
  const y0 = Math.min(...ys) - MARGIN
  const w = Math.max(...xs) - Math.min(...xs) + MARGIN * 2
  const h = Math.max(...ys) - Math.min(...ys) + MARGIN * 2
  const c = center(own)

  return (
    <figure className="info-map">
      <svg className="info-map__svg" viewBox={`${x0} ${y0} ${w} ${h}`} role="img" aria-label={block.title ?? t('map.title')}>
        <defs>
          <pattern id="info-hatch" width="1.2" height="1.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="1.2" className="info-map__hatch" />
          </pattern>
        </defs>
        <rect x={x0} y={y0} width={w} height={h} className="info-map__ground" />
        {block.neighbors?.map((n) => (
          <g key={n.label}>
            <path d={path(n.points)} className="info-map__neighbor" />
            {(() => {
              const at = labelAt(n.points, own, x0, y0, w, h)
              return (
                <text x={at[0]} y={at[1]} className="info-map__nlabel">
                  {n.label}
                  {n.note && (
                    <tspan x={at[0]} dy="2.2" className="info-map__nnote">
                      {n.note}
                    </tspan>
                  )}
                </text>
              )
            })()}
          </g>
        ))}
        {block.street?.band && <path d={path(block.street.band)} className="info-map__street" />}
        {block.street && (
          <text
            x={block.street.at[0]}
            y={block.street.at[1]}
            transform={`rotate(${block.street.angle ?? 0} ${block.street.at[0]} ${block.street.at[1]})`}
            className="info-map__slabel"
          >
            {block.street.label}
          </text>
        )}
        {block.strip && (
          <text
            x={block.strip.at[0]}
            y={block.strip.at[1]}
            transform={`rotate(${block.strip.angle ?? 0} ${block.strip.at[0]} ${block.strip.at[1]})`}
            className="info-map__road"
          >
            {block.strip.label}
          </text>
        )}
        <path d={path(own)} className="info-map__parcel" />
        {block.zone && <path d={path(block.zone.points)} className="info-map__zone" />}
        {block.zone?.label && (
          <text x={center(block.zone.points)[0]} y={center(block.zone.points)[1] + 2.2} className="info-map__zlabel">
            {block.zone.label}
          </text>
        )}
        <text x={c[0]} y={c[1] - 1} className="info-map__plabel">
          {block.parcel.label}
          {block.parcel.note && <tspan className="info-map__pnote"> {block.parcel.note}</tspan>}
        </text>
        {block.sides?.map((s, i) => (
          <SideLabel key={i} at={s.at} c={c} angle={s.angle ?? 0} text={`${num(s.len)} ${t('common:units.m')}`} />
        ))}
        {block.north != null && (
          <g transform={`translate(${x0 + w - 4.5} ${y0 + 5}) rotate(${block.north})`} className="info-map__north">
            <circle r="3.4" />
            <path d="M0 -2.6L1.3 1.4L0 0.6L-1.3 1.4Z" />
            <text y="-4.2" transform={`rotate(${-block.north} 0 -4.2)`}>
              {t('map.north')}
            </text>
          </g>
        )}
      </svg>
      <figcaption className="info-map__legend">
        <span className="info-map__key info-map__key--parcel">{t('map.parcel')}</span>
        {block.zone && <span className="info-map__key info-map__key--zone">{t('map.zone')}</span>}
        {block.neighbors?.length ? <span className="info-map__key info-map__key--neighbor">{t('map.neighbors')}</span> : null}
        {block.street && <span className="info-map__key info-map__key--street">{t('map.street')}</span>}
        {block.caption && <span className="info-map__caption">{block.caption}</span>}
      </figcaption>
    </figure>
  )
}

function SideLabel({ at, c, angle, text }: { at: Pt; c: Pt; angle: number; text: string }) {
  const dx = at[0] - c[0]
  const dy = at[1] - c[1]
  const len = Math.hypot(dx, dy) || 1
  const x = at[0] + (dx / len) * 1.6
  const y = at[1] + (dy / len) * 1.6
  return (
    <text x={x} y={y} dy="0.5" transform={`rotate(${angle} ${x} ${y})`} className="info-map__side">
      {text}
    </text>
  )
}

function labelAt(pts: Pt[], own: Pt[], x0: number, y0: number, w: number, h: number): Pt {
  const inside = pts.map(([x, y]): Pt => [Math.min(Math.max(x, x0 + 1), x0 + w - 1), Math.min(Math.max(y, y0 + 1), y0 + h - 1)])
  const nc = center(inside)
  const oc = center(own)
  const dx = nc[0] - oc[0]
  const dy = nc[1] - oc[1]
  const len = Math.hypot(dx, dy) || 1
  return [nc[0] + (dx / len) * 2.5, nc[1] + (dy / len) * 2.5 - 0.4]
}
