import { useTranslation } from 'react-i18next'
import { Segmented } from '../ui'
import { registerNetworkLayer } from './registry'
import { useSewerUi, type NextKind } from './sewerStore'

type Mode = 'select' | NextKind

const MODE_KEYS: Exclude<Mode, 'select'>[] = ['junction', 'cleanout', 'riser', 'outlet', 'septic']
const EDIT_KEY: Record<Exclude<Mode, 'select'>, string> = { junction: 'trace', cleanout: 'cleanout', riser: 'riser', outlet: 'outlet', septic: 'septic' }

function SewerEditTools() {
  const { t } = useTranslation('networks')
  const modes: { value: Mode; label: string; title: string }[] = [
    { value: 'select', label: t('shared.ui.modeSelect'), title: t('shared.ui.modeSelectTitle') },
    ...MODE_KEYS.map((m) => ({ value: m, label: t(`sewer.edit.${EDIT_KEY[m]}`), title: t(`sewer.edit.${EDIT_KEY[m]}Title`) })),
  ]
  const tool = useSewerUi((s) => s.tool)
  const nextKind = useSewerUi((s) => s.nextKind)
  const mode: Mode = tool ? nextKind : 'select'
  return (
    <>
      <Segmented
        size="sm"
        value={mode}
        options={modes}
        onChange={(m) => {
          const ui = useSewerUi.getState()
          if (m === 'select') ui.setTool(false)
          else {
            ui.setNextKind(m)
            ui.setTool(true)
          }
        }}
      />
      <span className="muted net-editbar__hint">
        {tool ? t('sewer.edit.hintTrace') : t('shared.ui.hintSelect')}
      </span>
    </>
  )
}

registerNetworkLayer({
  key: 'sewer',
  Tools: SewerEditTools,
  enter: () => {
    const ui = useSewerUi.getState()
    ui.select(null)
    ui.setNextKind('junction')
    ui.setTool(true)
    ui.setPanel(true)
  },
  exit: () => {
    const ui = useSewerUi.getState()
    ui.setTool(false)
    ui.setDraft(null)
    ui.select(null)
    ui.setHover(null)
  },
  onEscape: () => {
    const ui = useSewerUi.getState()
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
