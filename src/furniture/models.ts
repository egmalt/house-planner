import type { Finish } from './materials3d'

export type KenneySpec = {
  file: string
  rotY?: number
  primary?: Finish[]
  remap?: Record<string, Finish>
}

const k = (file: string, extra: Omit<KenneySpec, 'file'> = {}): KenneySpec => ({ file: `${file}.glb`, ...extra })

export const KENNEY_MODELS: Record<string, KenneySpec> = {
  'bed-1600': k('bedDouble'),
  'bed-1800': k('bedDouble'),
  'bed-900': k('bedSingle'),
  nightstand: k('cabinetBedDrawer', { primary: ['wood'] }),
  sofa: k('loungeSofa'),
  'sofa-corner': k('loungeSofaCorner'),
  armchair: k('loungeChair'),
  'coffee-table': k('tableCoffee', { primary: ['wood'] }),
  'tv-stand': k('cabinetTelevision', { primary: ['wood'] }),
  tv: k('televisionModern', { remap: { metalDark: 'screen' } }),
  plant: k('pottedPlant'),
  'kitchen-base': k('kitchenCabinet', { primary: ['wood'] }),
  'kitchen-drawers': k('kitchenCabinetDrawer', { primary: ['wood'] }),
  'kitchen-corner': k('kitchenCabinetCornerInner', { rotY: 90, primary: ['wood'] }),
  'kitchen-upper': k('kitchenCabinetUpper', { primary: ['wood'] }),
  'kitchen-sink': k('kitchenSink', { primary: ['wood'] }),
  stove: k('kitchenStove', { primary: ['wood'] }),
  fridge: k('kitchenFridgeLarge'),
  table: k('table', { primary: ['wood'] }),
  chair: k('chair', { primary: ['wood'] }),
  toilet: k('toilet'),
  washbasin: k('bathroomSink'),
  vanity: k('bathroomSinkSquare', { primary: ['wood'] }),
  bathtub: k('bathtub'),
  shower: k('shower'),
  washer: k('washer'),
  desk: k('desk', { primary: ['wood'] }),
  'office-chair': k('chairDesk'),
  'coat-rack': k('coatRack', { primary: ['wood'] }),
}
