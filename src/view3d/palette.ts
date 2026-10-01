import { t } from '../i18n'
import type { Palette } from '../model'
import { RAL_CLASSIC, ralCode, ralHex } from './ral'

export type PalettePart = 'walls' | 'accent' | 'roof' | 'windows' | 'gates' | 'plinth'

export const PANEL_RAL = [
  '1014', '1015', '1018', '2004', '3000', '3003', '3005', '3009', '3011', '5002', '5005', '5015', '5021', '6002', '6005', '6018',
  '6019', '6029', '7004', '7005', '7016', '7024', '7035', '7040', '7047', '8004', '8017', '8019', '9002', '9003', '9006', '9010',
].filter((c) => RAL_CLASSIC[c])

export const DEFAULT_WALLS = 'RAL 7004'
export const DEFAULT_ACCENT = 'RAL 7024'

const preset = (key: string, colors: Omit<Palette, 'name'>) => ({
  get name() {
    return t(`view3d:presets.${key}`)
  },
  get palette(): Palette {
    return { name: t(`view3d:presets.${key}`), ...colors }
  },
})

export const PRESETS: { name: string; palette: Palette }[] = [
  preset('granite', { walls: 'RAL 7004', gates: 'RAL 7004', roof: 'RAL 7024', accent: 'RAL 7024', plinth: 'RAL 7024', windows: 'RAL 7016' }),
  preset('scandinavia', { walls: 'RAL 9003', accent: 'RAL 7024', windows: 'RAL 7024', gates: 'RAL 7024', roof: 'RAL 7024', plinth: 'RAL 7024' }),
  preset('graphite', { walls: 'RAL 7024', accent: 'RAL 9003', windows: 'RAL 9003', gates: 'RAL 7024', roof: 'RAL 7024', plinth: 'RAL 7016' }),
  preset('warm', { walls: 'RAL 1015', accent: 'RAL 8017', windows: 'RAL 8017', gates: 'RAL 8017', roof: 'RAL 8017', plinth: 'RAL 8017' }),
  preset('forest', { walls: 'RAL 6005', accent: 'RAL 9003', windows: 'RAL 9003', gates: 'RAL 6005', roof: 'RAL 7024', plinth: 'RAL 7024' }),
]

export type Colors = Record<PalettePart, string> & { explicitWalls: boolean }

export function resolveColors(palette: Palette | undefined): Colors {
  const hex = (v: string | undefined, fallback: string) => ralHex(v) ?? ralHex(fallback)!
  const accent = hex(palette?.accent, DEFAULT_ACCENT)
  const part = (v: string | undefined) => ralHex(v) ?? accent
  return {
    walls: hex(palette?.walls, DEFAULT_WALLS),
    accent,
    windows: part(palette?.windows),
    gates: part(palette?.gates),
    plinth: part(palette?.plinth),
    roof: part(palette?.roof),
    explicitWalls: !!ralCode(palette?.walls),
  }
}

export const ralName = (code: string) => RAL_CLASSIC[code]?.[1] ?? ''
