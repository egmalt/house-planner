import { gridSteps } from '../canvas/camera'
import { useTranslation } from 'react-i18next'
import { formatNumber } from '../model'
import { t as tr } from '../i18n'

const size = (mm: number) => (mm >= 1000 ? `${formatNumber(mm / 1000, 2)} ${tr('common:units.m')}` : `${formatNumber(mm / 10, 1)} ${tr('common:units.cm')}`)

export function GridLegend({ scale }: { scale: number }) {
  const { t } = useTranslation('common')
  const { minor, major } = gridSteps(scale)
  return (
    <span className="grid-legend muted" title={t('grid.title')}>
      <span className="grid-legend__cell" aria-hidden />
      {t('grid.legend', { minor: size(minor), major: size(major) })}
    </span>
  )
}
