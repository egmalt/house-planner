import { Trans, useTranslation } from 'react-i18next'
import { restorePreview } from '../storage'
import { usePlanStore } from '../store/planStore'
import { useViewOnly } from '../store/viewOnly'
import { Button } from './Button'

export function PreviewBar() {
  const { t } = useTranslation('common')
  const vp = usePlanStore((s) => s.versionPreview)
  const exitPreview = usePlanStore((s) => s.exitPreview)
  const viewOnly = useViewOnly()
  if (!vp) return null
  return (
    <div className="preview-bar card">
      <span>
        <Trans t={t} i18nKey="preview.label" values={{ label: vp.label }} components={{ strong: <strong /> }} />
      </span>
      <div className="preview-bar__actions">
        <Button size="sm" onClick={() => exitPreview()}>
          {t('preview.back')}
        </Button>
        {!viewOnly && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              if (window.confirm(t('preview.confirm', { label: vp.label }))) restorePreview()
            }}
          >
            {t('preview.restore')}
          </Button>
        )}
      </div>
    </div>
  )
}
