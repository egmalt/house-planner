import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useSyncStore } from '../storage'

const REPO = 'https://github.com/egmalt/house-planner'

export function DemoBanner() {
  const { t } = useTranslation()
  const demo = useSyncStore((s) => s.demo)

  useEffect(() => {
    if (!demo) return
    document.documentElement.classList.add('is-demo')
    return () => document.documentElement.classList.remove('is-demo')
  }, [demo])

  if (!demo) return null
  return createPortal(
    <div className="demo-banner" role="note">
      <span className="demo-banner__text demo-banner__text--long">
        {t('demo.long')}
      </span>
      <span className="demo-banner__text demo-banner__text--short">{t('demo.short')}</span>
      <a className="demo-banner__link" href={REPO} target="_blank" rel="noreferrer">
        GitHub
      </a>
    </div>,
    document.body,
  )
}
