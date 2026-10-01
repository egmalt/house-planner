import * as THREE from 'three'

export type FurnitureLook = 'model' | 'real'

export type Finish =
  | 'wood'
  | 'woodDark'
  | 'textile'
  | 'textileDark'
  | 'textileBlue'
  | 'linen'
  | 'white'
  | 'porcelain'
  | 'metal'
  | 'metalLight'
  | 'metalMedium'
  | 'metalDark'
  | 'glass'
  | 'water'
  | 'plant'
  | 'lamp'
  | 'brick'
  | 'plaster'
  | 'stone'
  | 'soot'
  | 'screen'

type Spec = { color: string; roughness: number; metalness?: number; opacity?: number }

const REAL: Record<Finish, Spec> = {
  wood: { color: '#c7a582', roughness: 0.78 },
  woodDark: { color: '#7d6150', roughness: 0.8 },
  textile: { color: '#b3aea5', roughness: 0.95 },
  textileDark: { color: '#8e8a83', roughness: 0.95 },
  textileBlue: { color: '#8f9aa1', roughness: 0.95 },
  linen: { color: '#f2f0eb', roughness: 0.95 },
  white: { color: '#eeede9', roughness: 0.7 },
  porcelain: { color: '#f6f6f3', roughness: 0.35 },
  metal: { color: '#c3c6c7', roughness: 0.45, metalness: 0.35 },
  metalLight: { color: '#ecedea', roughness: 0.5, metalness: 0.1 },
  metalMedium: { color: '#8f9497', roughness: 0.5, metalness: 0.3 },
  metalDark: { color: '#4f5458', roughness: 0.6, metalness: 0.2 },
  glass: { color: '#d9e4e6', roughness: 0.1, opacity: 0.35 },
  water: { color: '#c9dbe0', roughness: 0.15 },
  plant: { color: '#7c9667', roughness: 0.9 },
  lamp: { color: '#f4efe2', roughness: 0.8 },
  brick: { color: '#c4927c', roughness: 0.95 },
  plaster: { color: '#ece9e3', roughness: 0.95 },
  stone: { color: '#b9b6b0', roughness: 0.9 },
  soot: { color: '#2f3033', roughness: 1 },
  screen: { color: '#26282c', roughness: 0.3 },
}

const MODEL: Record<Finish, Spec> = Object.fromEntries(
  (Object.keys(REAL) as Finish[]).map((k) => {
    const dark = k === 'soot' || k === 'screen' || k === 'metalDark'
    const mid = k === 'woodDark' || k === 'textileDark' || k === 'metalMedium' || k === 'brick'
    const tone = k === 'wood' || k === 'textile' || k === 'textileBlue' || k === 'stone' || k === 'plant'
    const color = dark ? '#8d8b87' : mid ? '#cfccc6' : tone ? '#dfddd7' : '#f0efeb'
    const glass = k === 'glass'
    return [k, { color: glass ? '#dde4e6' : color, roughness: glass ? 0.2 : 1, opacity: glass ? 0.35 : undefined }]
  }),
) as Record<Finish, Spec>

const KENNEY: Record<string, Finish> = {
  wood: 'wood',
  woodDark: 'woodDark',
  carpet: 'textile',
  carpetDarker: 'textileDark',
  carpetBlue: 'textileBlue',
  carpetWhite: 'linen',
  metal: 'metal',
  metalLight: 'metalLight',
  metalMedium: 'metalMedium',
  metalDark: 'metalDark',
  glass: 'glass',
  _defaultMat: 'porcelain',
  plant: 'plant',
  lamp: 'lamp',
  fur: 'textile',
}

export function kenneyFinish(name: string): Finish {
  return KENNEY[name] ?? 'white'
}

const cache = new Map<string, THREE.MeshStandardMaterial>()

export function finishMaterial(finish: Finish, look: FurnitureLook, color?: string) {
  const key = `${look}|${finish}|${color ?? ''}`
  let m = cache.get(key)
  if (!m) {
    const spec = (look === 'model' ? MODEL : REAL)[finish]
    m = new THREE.MeshStandardMaterial({
      color: color && look === 'real' ? color : spec.color,
      roughness: spec.roughness,
      metalness: spec.metalness ?? 0,
      transparent: spec.opacity !== undefined,
      opacity: spec.opacity ?? 1,
      depthWrite: spec.opacity === undefined,
    })
    m.name = `furniture-${finish}`
    cache.set(key, m)
  }
  return m
}
