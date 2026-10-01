import { useTranslation } from 'react-i18next'
import { formatMeters } from '../model'
import { usePlanStore } from '../store/planStore'
import { useViewOnly } from '../store/viewOnly'
import { Badge } from './Badge'
import { DemoBanner } from './DemoBanner'
import { HeaderMenu } from './HeaderMenu'
import { SaveIndicator } from './SaveIndicator'
import { Segmented } from './Segmented'
import { sectionHref, sections, useNarrow, type SectionId } from './useSection'

const meters = (mm: number) => formatMeters(mm)


export function Header({ section }: { section: SectionId }) {
  const { t } = useTranslation('common')
  const plan = usePlanStore((s) => s.plan)
  const narrow = useNarrow()
  const viewOnly = useViewOnly()
  const tabs = sections.map((s) => ({
    value: s.id,
    label: t(narrow && 'short' in s ? s.short : s.label),
    href: sectionHref(s.id),
  }))
  const subtitle = plan
    ? t('header.subtitle', {
        width: meters(plan.site.width),
        depth: meters(plan.site.depth),
        walls: t('header.walls', { count: plan.walls.length }),
        openings: t('header.openings', { count: plan.openings.length }),
      })
    : ''

  return (
    <header className={`header card header--${section}`}>
      <span className="header__logo" aria-hidden />
      <div className="header__text" title={plan ? `${plan.name} — ${subtitle}` : undefined}>
        <span className="header__title">{plan?.name ?? t('header.loadingPlan')}</span>
        {plan && <span className="header__meta">{subtitle}</span>}
      </div>
      {viewOnly && (
        <Badge tone="neutral" className="header__view">
          {t('header.viewOnly')}
        </Badge>
      )}
      <SaveIndicator />
      <Segmented options={tabs} value={section} className="header__tabs" />
      <HeaderMenu />
      <DemoBanner />
    </header>
  )
}
