import { t } from '../i18n'

export type FurnitureCategory = 'bedroom' | 'living' | 'kitchen' | 'bathroom' | 'hall' | 'other'

export const FURNITURE_CATEGORIES: { id: FurnitureCategory; name: string }[] = (
  ['bedroom', 'living', 'kitchen', 'bathroom', 'hall', 'other'] as const
).map((id) => ({
  id,
  get name() {
    return t(`plan:furniture.categories.${id}`)
  },
}))

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

export type Clearance = { front?: number; side?: number }

export type FurnitureDef = {
  type: string
  name: string
  category: FurnitureCategory
  w: number
  d: number
  h: number
  elevation?: number
  resizable: boolean
  clearance?: Clearance
  note?: string
}

const def = (
  type: string,
  category: FurnitureCategory,
  [w, d, h]: [number, number, number],
  extra: Partial<Pick<FurnitureDef, 'resizable' | 'clearance' | 'elevation' | 'note'>> = {},
): FurnitureDef => ({
  type,
  get name() {
    return t(`plan:furniture.items.${type}`)
  },
  category,
  w,
  d,
  h,
  resizable: false,
  ...extra,
})

export const FURNITURE_CATALOG: FurnitureDef[] = [
  def('bed-1600', 'bedroom', [1700, 2100, 1000], { clearance: { front: 600, side: 600 } }),
  def('bed-1800', 'bedroom', [1900, 2100, 1000], { clearance: { front: 600, side: 600 } }),
  def('bed-900', 'bedroom', [1000, 2100, 900], { clearance: { side: 600 } }),
  def('nightstand', 'bedroom', [450, 400, 550]),
  def('wardrobe', 'bedroom', [1200, 600, 2200], { resizable: true, clearance: { front: 800 } }),
  def('dresser', 'bedroom', [1000, 450, 850], { resizable: true, clearance: { front: 700 } }),

  def('sofa', 'living', [2200, 950, 850], { resizable: true, clearance: { front: 600 } }),
  def('sofa-corner', 'living', [2700, 1650, 850], { resizable: true, clearance: { front: 600 } }),
  def('armchair', 'living', [850, 850, 850], { clearance: { front: 450 } }),
  def('coffee-table', 'living', [1100, 600, 450], { resizable: true }),
  def('tv-stand', 'living', [1600, 420, 1300], { resizable: true }),
  def('bookcase', 'living', [800, 350, 2000], { resizable: true, clearance: { front: 600 } }),
  def('plant', 'living', [450, 450, 1200]),

  def('kitchen-base', 'kitchen', [600, 600, 900], { resizable: true, clearance: { front: 1000 } }),
  def('kitchen-drawers', 'kitchen', [600, 600, 900], { resizable: true, clearance: { front: 1000 } }),
  def('kitchen-corner', 'kitchen', [900, 900, 900], { clearance: { front: 1000 } }),
  def('kitchen-upper', 'kitchen', [600, 330, 720], { resizable: true, elevation: 1450 }),
  def('kitchen-sink', 'kitchen', [800, 600, 900], { resizable: true, clearance: { front: 1000 } }),
  def('stove', 'kitchen', [600, 600, 900], { clearance: { front: 1000 } }),
  def('dishwasher', 'kitchen', [600, 600, 900], { clearance: { front: 1000 } }),
  def('fridge', 'kitchen', [600, 650, 2000], { clearance: { front: 1000 } }),
  def('dining-4', 'kitchen', [1200, 1600, 750], { clearance: { side: 300 } }),
  def('dining-6', 'kitchen', [1800, 1700, 750], { clearance: { side: 300 } }),
  def('dining-round', 'kitchen', [1800, 1800, 750]),
  def('chair', 'kitchen', [450, 520, 900]),

  def('toilet', 'bathroom', [380, 680, 780], { clearance: { front: 600, side: 200 } }),
  def('washbasin', 'bathroom', [600, 460, 850], { clearance: { front: 700 } }),
  def('vanity', 'bathroom', [800, 480, 850], { resizable: true, clearance: { front: 700 } }),
  def('bathtub', 'bathroom', [1700, 750, 600], { resizable: true, clearance: { front: 700 } }),
  def('shower', 'bathroom', [900, 900, 2000], { resizable: true, clearance: { front: 700 } }),
  def('washer', 'bathroom', [600, 600, 850], { clearance: { front: 800 } }),
  def('water-heater', 'bathroom', [450, 470, 800], { elevation: 1100 }),

  def('coat-rack', 'hall', [1000, 350, 1800], { resizable: true, clearance: { front: 600 } }),
  def('shoe-cabinet', 'hall', [800, 320, 1000], { resizable: true, clearance: { front: 600 } }),
  def('hall-wardrobe', 'hall', [1600, 600, 2400], { resizable: true, clearance: { front: 700 } }),

  def('desk', 'other', [1200, 600, 750], { resizable: true, clearance: { front: 800 } }),
  def('office-chair', 'other', [650, 650, 1050]),
  def('fireplace', 'other', [1000, 550, 1100], { clearance: { front: 1000 } }),
  def('masonry-stove', 'other', [1150, 900, 2000], { resizable: true, clearance: { front: 1250, side: 380 } }),
  def('gas-boiler', 'other', [440, 340, 740], { elevation: 1000, clearance: { front: 700 } }),
  def('floor-boiler', 'other', [500, 650, 900], { clearance: { front: 1000, side: 400 } }),
]

export const FURNITURE_BY_TYPE: Record<string, FurnitureDef> = Object.fromEntries(
  FURNITURE_CATALOG.map((d) => [d.type, d]),
)

export function furnitureDef(type: string): FurnitureDef | undefined {
  return FURNITURE_BY_TYPE[type]
}

export type ResolvedFurniture = { def: FurnitureDef | undefined; w: number; d: number; h: number; elevation: number }

export function resolveFurniture(item: Pick<FurnitureItem, 'type' | 'w' | 'd' | 'h'>): ResolvedFurniture {
  const d = furnitureDef(item.type)
  return {
    def: d,
    w: item.w ?? d?.w ?? 600,
    d: item.d ?? d?.d ?? 600,
    h: item.h ?? d?.h ?? 900,
    elevation: d?.elevation ?? 0,
  }
}

export function createFurniture(type: string, x: number, y: number, id: string, rotationDeg = 0): FurnitureItem {
  return { id, type, x, y, rotationDeg }
}
