import { fmtRub, t } from '../i18n'
import { wallLength } from './geometry'
import type { Material, Plan, PricePer, Wall } from './schema'

export const DEFAULT_WASTE_PCT = 7
export const NO_MATERIAL_ID = 'none'

export type WallEstimateLine = {
  id: string
  materialId: string
  material?: Material
  name: string
  category: 'стены'
  wallCount: number
  lengthMm: number
  grossAreaM2: number
  openingsAreaM2: number
  netAreaM2: number
  volumeM3: number
  panels?: number
  panelsWithWaste?: number
  pieces?: number
  piecesPerM2?: number
  areaWithWasteM2: number
  wastePct: number
  qty: number | null
  unit: PricePer | null
  price?: number
  cost: number | null
  url?: string
  source?: string
  checkedAt?: string
}

export type WallEstimate = {
  lines: WallEstimateLine[]
  total: number
  missingPrices: number
  wastePct: number
}

export const wallEstimateId = (materialId: string) => `auto:wall:${materialId}`

const round = (v: number, digits = 2) => Math.round(v * 10 ** digits) / 10 ** digits

export function wallPanelCount(wall: Wall, material: Material): number | undefined {
  if (!material.panelWidth || !material.panelHeight) return undefined
  return Math.ceil(wallLength(wall) / material.panelWidth - 1e-9) * Math.ceil(wall.height / material.panelHeight - 1e-9)
}

export function computeWallEstimate(plan: Plan): WallEstimate {
  const wastePct = plan.estimate?.wasteSipPct ?? DEFAULT_WASTE_PCT
  const k = 1 + wastePct / 100
  const materials = new Map(plan.materials.map((m) => [m.id, m]))
  const groups = new Map<string, Wall[]>()
  for (const w of plan.walls) {
    const key = w.materialId && materials.has(w.materialId) ? w.materialId : NO_MATERIAL_ID
    groups.set(key, [...(groups.get(key) ?? []), w])
  }

  const lines: WallEstimateLine[] = []
  for (const [materialId, walls] of groups) {
    const material = materials.get(materialId)
    const ids = new Set(walls.map((w) => w.id))
    const lengthMm = walls.reduce((s, w) => s + wallLength(w), 0)
    const grossAreaM2 = walls.reduce((s, w) => s + (wallLength(w) * w.height) / 1e6, 0)
    const openingsAreaM2 = plan.openings
      .filter((o) => ids.has(o.wallId))
      .reduce((s, o) => s + (o.width * o.height) / 1e6, 0)
    const netAreaM2 = Math.max(0, grossAreaM2 - openingsAreaM2)
    const thickness = material?.thickness ?? 0
    const volumeM3 = (netAreaM2 * thickness) / 1000

    const panelCounts = material ? walls.map((w) => wallPanelCount(w, material)) : []
    const panels = material && panelCounts.every((n) => n !== undefined)
      ? panelCounts.reduce<number>((s, n) => s + (n ?? 0), 0)
      : undefined
    const panelsWithWaste = panels !== undefined ? Math.ceil(panels * k - 1e-9) : undefined

    const joint = material?.jointMm ?? 10
    const piecesPerM2 =
      material?.unitLength && material.unitHeight ? 1e6 / ((material.unitLength + joint) * (material.unitHeight + joint)) : undefined
    const pieces = piecesPerM2 !== undefined ? Math.ceil(netAreaM2 * k * piecesPerM2 - 1e-9) : undefined

    const unit: PricePer | null =
      material?.pricePer ?? (panels !== undefined || pieces !== undefined ? 'pcs' : material ? 'm2' : null)
    let qty: number | null = null
    if (unit === 'pcs') qty = panelsWithWaste ?? pieces ?? null
    else if (unit === 'm2') qty = round(netAreaM2 * k)
    else if (unit === 'm3') qty = round(volumeM3 * k, 3)
    else if (unit === 'm') qty = round((lengthMm / 1000) * k)

    const price = material?.price
    const cost = price !== undefined && qty !== null ? Math.round(price * qty) : null

    lines.push({
      id: wallEstimateId(materialId),
      materialId,
      material,
      name: material?.name ?? t('estimate:wallLine.noMaterial'),
      category: 'стены',
      wallCount: walls.length,
      lengthMm,
      grossAreaM2: round(grossAreaM2),
      openingsAreaM2: round(openingsAreaM2),
      netAreaM2: round(netAreaM2),
      volumeM3: round(volumeM3, 3),
      panels,
      panelsWithWaste,
      pieces,
      piecesPerM2: piecesPerM2 !== undefined ? round(piecesPerM2, 2) : undefined,
      areaWithWasteM2: round(netAreaM2 * k),
      wastePct,
      qty,
      unit,
      price,
      cost,
      url: material?.url,
      source: material?.source,
      checkedAt: material?.checkedAt,
    })
  }

  return {
    lines,
    total: lines.reduce((s, l) => s + (l.cost ?? 0), 0),
    missingPrices: lines.filter((l) => l.cost === null).length,
    wastePct,
  }
}

export const unitLabels: Record<PricePer, string> = {
  get pcs() { return t('common:units.pcs') },
  get m2() { return t('common:units.m2') },
  get m3() { return t('common:units.m3') },
  get m() { return t('common:units.m') },
}

export const formatMoney = (rub: number) => fmtRub(rub)
