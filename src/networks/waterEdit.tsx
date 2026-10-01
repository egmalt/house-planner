import { useTranslation } from 'react-i18next'
import { Segmented } from '../ui'
import { registerNetworkLayer } from './registry'
import { useWaterUi, type WaterMode, type WaterNextKind } from './waterStore'
import { waterKindLabels } from './waterModel'

const LINE_MODES = ['cold', 'hot', 'recirc'] as const

const NEXT: WaterNextKind[] = ['junction', 'source', 'entry', 'pump', 'filter', 'boiler', 'collector', 'tap_outdoor']

function WaterEditTools() {
  const { t } = useTranslation('networks')
  const modes: { value: WaterMode; label: string; title: string }[] = [
    { value: 'select', label: t('shared.ui.modeSelect'), title: t('shared.ui.modeSelectTitle') },
    ...LINE_MODES.map((m) => ({ value: m, label: t(`water.edit.${m}`), title: t(`water.edit.${m}Title`) })),
  ]
  const mode = useWaterUi((s) => s.mode)
  const nextKind = useWaterUi((s) => s.nextKind)
  return (
    <>
      <Segmented size="sm" value={mode} options={modes} onChange={(m) => useWaterUi.getState().setMode(m)} />
      {mode !== 'select' && (
        <select className="select" value={nextKind} onChange={(e) => useWaterUi.getState().setNextKind(e.target.value as WaterNextKind)} title={t('water.edit.nextTitle')}>
          {NEXT.map((k) => (
            <option key={k} value={k}>
              {waterKindLabels[k]}
            </option>
          ))}
        </select>
      )}
      <span className="muted net-editbar__hint">
        {mode === 'select' ? t('shared.ui.hintSelect') : t('water.edit.hintTrace')}
      </span>
    </>
  )
}

registerNetworkLayer({
  key: 'water',
  Tools: WaterEditTools,
  enter: () => {
    const ui = useWaterUi.getState()
    ui.select(null)
    ui.setMode('cold')
    ui.setPanel(true)
  },
  exit: () => {
    const ui = useWaterUi.getState()
    ui.setMode('select')
    ui.setDraft(null)
    ui.select(null)
    ui.setHover(null)
  },
  onEscape: () => {
    const ui = useWaterUi.getState()
    if (ui.draft) {
      ui.setDraft(null)
      return true
    }
    if (ui.selected) {
      ui.select(null)
      return true
    }
    return false
  },
})
