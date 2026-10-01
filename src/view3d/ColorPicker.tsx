import { useTranslation } from 'react-i18next'
import type { Palette } from '../model'
import { Button, Menu, MenuItem, MenuSection } from '../ui'
import { PANEL_RAL, PRESETS, ralName } from './palette'
import { ralCode, ralHex } from './ral'

const Swatch = ({ hex, size = 14 }: { hex: string; size?: number }) => (
  <span className="view3d__swatch" style={{ background: hex, width: size, height: size }} aria-hidden />
)

type Props = {
  label: string
  value: string
  onPick: (ral: string) => void
  presets?: (palette: Palette) => void
  align?: 'left' | 'right'
}

export function ColorPicker({ label, value, onPick, presets, align = 'right' }: Props) {
  const { t } = useTranslation('view3d')
  const code = ralCode(value) ?? ''
  return (
    <Menu
      align={align}
      width={340}
      trigger={({ open, toggle }) => (
        <Button size="sm" variant="ghost" pressed={open} onClick={toggle} title={`${label}: RAL ${code} ${ralName(code)}`}>
          <span className="view3d__label">{label}</span>
          <Swatch hex={ralHex(value) ?? '#ccc'} />
          <span className="num">{code}</span>
        </Button>
      )}
    >
      {(close) => (
        <>
          <MenuSection title={label}>
            <div className="view3d__swatches">
              {PANEL_RAL.map((c) => (
                <MenuItem
                  key={c}
                  className={c === code ? 'view3d__swatch-item view3d__swatch-item--active' : 'view3d__swatch-item'}
                  onClick={() => {
                    onPick(`RAL ${c}`)
                    close()
                  }}
                  title={ralName(c)}
                >
                  <Swatch hex={ralHex(c)!} size={18} />
                  <span className="num">{c}</span>
                  <span className="view3d__swatch-name muted">{ralName(c)}</span>
                </MenuItem>
              ))}
            </div>
          </MenuSection>
          {presets && (
            <MenuSection title={t('toolbar.presets')}>
              {PRESETS.map((p) => (
                <MenuItem
                  key={p.name}
                  onClick={() => {
                    presets(p.palette)
                    close()
                  }}
                  hint={
                    <span className="view3d__preset">
                      {[p.palette.walls, p.palette.accent, p.palette.windows, p.palette.plinth].map((c, i) => (
                        <Swatch key={i} hex={ralHex(c) ?? '#ccc'} />
                      ))}
                    </span>
                  }
                >
                  {p.name}
                </MenuItem>
              ))}
            </MenuSection>
          )}
        </>
      )}
    </Menu>
  )
}
