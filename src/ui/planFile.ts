import { parsePlan, type Plan, type ParseResult } from '../model'
import { t } from '../i18n'

export function downloadPlan(plan: Plan) {
  const blob = new Blob([JSON.stringify(plan, null, 2) + '\n'], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${plan.name.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/g, '') || 'plan'}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export async function readPlanFile(file: File): Promise<ParseResult> {
  try {
    return parsePlan(JSON.parse(await file.text()))
  } catch (e) {
    return { ok: false, error: t('common:planFile.notJson', { message: (e as Error).message }) }
  }
}
