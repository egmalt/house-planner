import { useTranslation } from 'react-i18next'
import type { ElectricPointKind } from '../../model'
import { t as tt } from '../../i18n'
import { usePlanStore } from '../../store/planStore'
import { Segmented } from '../../ui'
import { registerNetworkLayer } from '../registry'
import { EMPTY_ELECTRIC, electricOf } from './model'
import { useElectricUi, type ElectricTool } from './store'
import './electric.css'

type Mode = 'select' | Exclude<ElectricTool, null>

const MODES: Mode[] = ['select', 'socket', 'switch', 'light', 'panel']

const KINDS: Record<'socket' | 'switch' | 'light', ElectricPointKind[]> = {
  socket: ['socket', 'socket2', 'socket_ip44', 'power', 'outdoor'],
  switch: ['switch', 'switch2'],
  light: ['light', 'light_wall', 'junction'],
}

function ElectricEditTools() {
  const { t } = useTranslation('networks')
  const ui = useElectricUi()
  const circuits = usePlanStore((s) => (s.plan ? electricOf(s.plan).circuits : EMPTY_ELECTRIC.circuits))
  const mode: Mode = ui.tool ?? 'select'
  const sub = mode === 'socket' || mode === 'switch' || mode === 'light' ? mode : null
  const kind = sub === 'socket' ? ui.socketKind : sub === 'switch' ? ui.switchKind : ui.lightKind

  return (
    <>
      <Segmented size="sm" value={mode} options={MODES.map((m) => ({ value: m, label: t(`electric.tools.mode.${m}.label`), title: t(`electric.tools.mode.${m}.title`) }))} onChange={(m) => ui.setTool(m === 'select' ? null : m)} />
      {sub && <Segmented size="sm" value={kind} options={KINDS[sub].map((k) => ({ value: k, label: t(`electric.tools.kind.${k}`) }))} onChange={(k) => ui.setKind(sub, k)} />}
      {mode !== 'panel' && (
        <select
          className="select el-group-select"
          value={ui.activeCircuit ?? ''}
          onChange={(ev) => ui.setActiveCircuit(ev.target.value || null)}
          title={t('electric.tools.groupTitle')}
        >
          <option value="">{t('electric.tools.noGroup')}</option>
          {circuits.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <span className="muted net-editbar__hint">
        {mode === 'select' ? t('electric.tools.hintSelect') : mode === 'light' && kind === 'light' ? t('electric.tools.hintCeiling') : t('electric.tools.hintWall')}
      </span>
    </>
  )
}

registerNetworkLayer({
  key: 'electric',
  get label() {
    return tt('networks:electric.layer')
  },
  Tools: ElectricEditTools,
  enter: () => {
    const ui = useElectricUi.getState()
    ui.select([])
    ui.setTab(true)
    ui.setTool('socket')
  },
  exit: () => {
    const ui = useElectricUi.getState()
    ui.setTool(null)
    ui.select([])
  },
  onEscape: () => {
    const ui = useElectricUi.getState()
    if (ui.tool) {
      ui.setTool(null)
      return true
    }
    if (ui.selected.length || ui.panelSelected) {
      ui.select([])
      return true
    }
    return false
  },
})
