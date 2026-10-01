import { useTranslation } from 'react-i18next'
import { fmtDateTime } from '../i18n'
import { loadFromServer, useSyncStore } from '../storage'

const time = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : fmtDateTime(d, { hour: '2-digit', minute: '2-digit' })
}

export function SaveIndicator() {
  const { t } = useTranslation('common')
  const status = useSyncStore((s) => s.status)
  const savedAt = useSyncStore((s) => s.savedAt)
  const error = useSyncStore((s) => s.error)
  if (status === 'saving') {
    return (
      <span className="save save--busy">
        <span className="save__dot" />
        <span className="save__text">{t('save.saving')}</span>
      </span>
    )
  }
  if (status === 'offline' || status === 'error') {
    return (
      <button className="save save--err" title={error ?? ''} onClick={() => void loadFromServer(false)}>
        <span className="save__dot" />
        <span className="save__text">{t('save.offline')}</span>
      </button>
    )
  }
  const at = time(savedAt)
  return (
    <span className="save">
      <span className="save__dot" />
      <span className="save__text">{at ? t('save.savedAt', { time: at }) : t('save.saved')}</span>
    </span>
  )
}
