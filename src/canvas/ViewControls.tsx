import { useTranslation } from 'react-i18next'
import { CanvasToolbar, ToolbarSeparator } from '../ui/CanvasToolbar'
import { IconButton } from '../ui/IconButton'
import { Segmented } from '../ui/Segmented'

type Props = {
  rotation: number
  northUp: number | null
  onRotate: (deg: number, fit?: boolean) => void
}

const near = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180) < 0.5

export function ViewControls({ rotation, northUp, onRotate }: Props) {
  const { t } = useTranslation('common')
  const mode = near(rotation, 0) ? 'plan' : northUp !== null && near(rotation, northUp) ? 'north' : 'free'
  const north = northUp !== null ? -90 - northUp + rotation : null
  return (
    <CanvasToolbar placement="bottom-right" className="view-controls">
      <Segmented
        size="sm"
        value={mode}
        options={[
          { value: 'plan', label: t('canvas.planUp') },
          ...(northUp !== null ? [{ value: 'north', label: t('canvas.northUp') }] : []),
          ...(mode === 'free' ? [{ value: 'free', label: `${Math.round(rotation)}°` }] : []),
        ]}
        onChange={(v) => {
          if (v === 'plan') onRotate(0, true)
          else if (v === 'north' && northUp !== null) onRotate(northUp, true)
        }}
      />
      <ToolbarSeparator />
      <IconButton label={t('canvas.rotateCcw')} size="sm" onClick={() => onRotate(rotation - 15)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 9a8 8 0 1 1 1 7M4 4v5h5" />
        </svg>
      </IconButton>
      <IconButton label={t('canvas.rotateCw')} size="sm" onClick={() => onRotate(rotation + 15)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 9a8 8 0 1 0-1 7M20 4v5h-5" />
        </svg>
      </IconButton>
      {north !== null && (
        <IconButton label={t('canvas.compass')} size="sm" className="compass" onClick={() => onRotate(0, true)}>
          <svg viewBox="0 0 24 24" aria-hidden style={{ transform: `rotate(${north + 90}deg)` }}>
            <path d="M12 3l4 9h-8z" fill="var(--accent)" />
            <path d="M12 21l-4-9h8z" fill="var(--line-strong)" />
          </svg>
        </IconButton>
      )}
    </CanvasToolbar>
  )
}
