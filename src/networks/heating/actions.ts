import { usePlanStore } from '../../store/planStore'
import { showToast } from '../../ui/Toast'
import { t } from '../../i18n'
import { autoLayout } from './layout'
import { heatingOf, withHeating } from './model'
import { useHeatingUi } from './store'

export function runAutoLayout() {
  const plan = usePlanStore.getState().plan
  if (!plan) return
  const have = heatingOf(plan).loops.length
  if (have && !window.confirm(t('networks:heating.actions.confirmReplace', { count: have }))) return
  const res = autoLayout(plan)
  usePlanStore.getState().commit(withHeating(plan, () => res.heating))
  useHeatingUi.getState().select(null)
  useHeatingUi.getState().setTab(true)
  showToast(t('networks:heating.actions.done', { count: res.heating.loops.length, notes: res.notes.slice(0, 2).join('. ') }))
}
