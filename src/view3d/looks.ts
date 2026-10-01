import { t } from '../i18n'
import type { Finish, Material, MaterialKind } from './types'
import type { SeamPattern } from './geometry'

export type Look = 'model' | 'real'

export type TextureSet = 'osb' | 'plaster' | 'timber' | 'planken' | 'brick' | 'concrete' | 'grass'

export const TEXTURE_SIZE: Record<TextureSet, [number, number]> = {
  osb: [1.25, 1.25],
  plaster: [2.0, 2.0],
  timber: [1.4, 1.4],
  planken: [2.24, 1.12],
  brick: [2.4, 1.2],
  concrete: [1.1, 0.55],
  grass: [1.4, 1.4],
}

export const FINISHES: { id: Finish; label: string }[] = [
  { id: 'osb', label: 'OSB' },
  { id: 'plaster', get label() { return t('view3d:finishes.plaster') } },
  { id: 'timber', get label() { return t('view3d:finishes.timber') } },
  { id: 'planken', get label() { return t('view3d:finishes.planken') } },
]

const hasFinish = (kind: MaterialKind) => kind === 'sip' || kind === 'pir' || kind === 'frame'

export function finishOf(material: Material | undefined, override: Finish | null): Finish | null {
  if (!material || !hasFinish(material.kind)) return null
  return override ?? material.finish ?? 'osb'
}

const MODEL_BY_FINISH: Record<Finish, string> = {
  osb: '#ebe3d3',
  plaster: '#f2f0eb',
  timber: '#e0cfb2',
  planken: '#c9bba7',
}

const MODEL_BY_KIND: Record<MaterialKind, string> = {
  sip: '#ebe3d3',
  pir: '#ebe3d3',
  frame: '#ebe3d3',
  brick: '#d4a592',
  block: '#e3e1db',
  timber: '#e0cfb2',
  concrete: '#dcdcd8',
  glass: '#dce9ee',
  other: '#e8e6e1',
}

export function modelColor(material: Material | undefined, finish: Finish | null) {
  if (material?.color) return material.color
  if (finish) return MODEL_BY_FINISH[finish]
  return MODEL_BY_KIND[material?.kind ?? 'other']
}

export function textureSet(material: Material | undefined, finish: Finish | null): TextureSet {
  if (finish) return finish
  switch (material?.kind) {
    case 'brick':
      return 'brick'
    case 'timber':
      return 'timber'
    case 'concrete':
      return 'concrete'
    default:
      return 'plaster'
  }
}

export function seamPattern(material: Material | undefined, finish: Finish | null): SeamPattern | null {
  if (finish === 'osb') {
    const panel = material ? Math.min(material.length ?? 1250, material.height ?? 1250) : 1250
    return { dir: 'vertical', step: panel }
  }
  if (finish === 'timber' || material?.kind === 'timber') return { dir: 'horizontal', step: 180 }
  if (finish === 'planken') return { dir: 'horizontal', step: 140 }
  return null
}

export function shade(hex: string, k: number) {
  const n = parseInt(hex.replace('#', ''), 16)
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * k)))
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`
}
