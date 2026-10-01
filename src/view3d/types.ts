import type { Material as ModelMaterial } from '../model'

export type { Opening, Plan, Point, Site, Wall, MaterialKind } from '../model'

export type Finish = 'osb' | 'plaster' | 'timber' | 'planken'

export type Material = ModelMaterial & { finish?: Finish }

export type FurnitureItem = {
  id: string
  type: string
  x: number
  y: number
  rotationDeg: number
  w?: number
  d?: number
  h?: number
  color?: string
}
