import type { Material, MaterialKind, Plan, Wall } from './schema'
import { t } from '../i18n'

export const kindColors: Record<MaterialKind, string> = {
  sip: '#e8b86a',
  pir: '#e3c27a',
  brick: '#c9624a',
  block: '#b9b4a8',
  timber: '#b0824f',
  frame: '#d9c29a',
  concrete: '#9aa0a6',
  glass: '#8cc6e0',
  other: '#8a8f98',
}

export const kindLabels = Object.defineProperties(
  {},
  Object.fromEntries(
    (Object.keys(kindColors) as MaterialKind[]).map((k) => [k, { enumerable: true, get: () => t(`plan:materialKinds.${k}`) }]),
  ),
) as Record<MaterialKind, string>

export const DEFAULT_WALL_COLOR = '#5b6270'
export const DEFAULT_WALL_THICKNESS = 200
export const DEFAULT_WALL_HEIGHT = 2800

export const materialColor = (m?: Material) => (m ? m.color ?? kindColors[m.kind] : DEFAULT_WALL_COLOR)

export const findMaterial = (plan: Plan, id?: string) => (id ? plan.materials.find((m) => m.id === id) : undefined)

export const wallColor = (plan: Plan, w: Wall) => materialColor(findMaterial(plan, w.materialId))
