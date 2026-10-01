import { useTranslation } from 'react-i18next'
import { t as tt } from '../../i18n'
import { Button } from '../../ui'
import { registerNetworkLayer } from '../registry'
import { runAutoLayout } from './actions'
import { useHeatingUi } from './store'
import './heating.css'

function HeatingEditTools() {
  const { t } = useTranslation('networks')
  const selected = useHeatingUi((s) => s.selected)
  return (
    <>
      <Button size="sm" onClick={runAutoLayout}>
        {t('heating.tools.autoLayout')}
      </Button>
      <span className="muted net-editbar__hint">
        {selected ? t('heating.tools.hintSelected') : t('heating.tools.hintIdle')}
      </span>
    </>
  )
}

registerNetworkLayer({
  key: 'heating',
  get label() {
    return tt('networks:heating.layer')
  },
  Tools: HeatingEditTools,
  enter: () => {
    const ui = useHeatingUi.getState()
    ui.select(null)
    ui.setTab(true)
  },
  exit: () => useHeatingUi.getState().select(null),
  onEscape: () => {
    const ui = useHeatingUi.getState()
    if (ui.selected || ui.collectorSelected) {
      ui.select(null)
      return true
    }
    return false
  },
})
