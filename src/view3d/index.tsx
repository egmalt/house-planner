import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Palette, Plan } from '../model'
import { FurnitureModel } from '../furniture'
import { useViewOnly } from '../store/viewOnly'
import { Button, CanvasToolbar, Segmented, ToolbarSeparator } from '../ui'
import { ColorPicker } from './ColorPicker'
import { SceneErrorBoundary } from './ErrorBoundary'
import { DEFAULT_ACCENT, DEFAULT_WALLS } from './palette'
import { FINISHES, type Look } from './looks'
import { LOOKS, Scene3D, VIEWS, WALL_CUTS, primaryFinish, type View3D, type WallCut } from './Scene'
import type { Finish } from './types'
import './view3d.css'

const lookOptions = () => LOOKS.map((l) => ({ value: l.id, label: l.label }))
const viewOptions = () => (Object.keys(VIEWS) as View3D[]).map((v) => ({ value: v, label: VIEWS[v].label }))
const finishOptions = () => FINISHES.map((f) => ({ value: f.id, label: f.label }))
const hasFinish = (kind: string) => kind === 'sip' || kind === 'pir' || kind === 'frame'

const CUT_KEY = 'house-planner:view3d-cut'

const readCut = (): WallCut => {
  try {
    const v = localStorage.getItem(CUT_KEY)
    return v === 'low' || v === 'floor' ? v : 'full'
  } catch {
    return 'full'
  }
}

type Props = { plan: Plan; onChange?: (next: Plan) => void }

export default function View3DSection({ plan, onChange }: Props) {
  const { t } = useTranslation('view3d')
  const [view, setView] = useState<View3D>('iso')
  const [look, setLook] = useState<Look>('model')
  const viewOnly = useViewOnly()
  const [grid, setGrid] = useState(true)
  const [cut, setCutState] = useState<WallCut>(readCut)
  const setCut = (v: WallCut) => {
    setCutState(v)
    try {
      localStorage.setItem(CUT_KEY, v)
    } catch {
      return
    }
  }
  const [nonce, setNonce] = useState(0)
  const [finishOverride, setFinishOverride] = useState<Finish | null>(null)
  const currentFinish = finishOverride ?? primaryFinish(plan)
  const [paletteOverride, setPaletteOverride] = useState<Palette | null>(null)
  const palette: Palette = paletteOverride ?? plan.palette ?? {}
  const shown = paletteOverride ? { ...plan, palette: paletteOverride } : plan
  const writePalette = (next: Palette) => {
    if (!onChange) return setPaletteOverride(next)
    setPaletteOverride(null)
    onChange({ ...plan, palette: next })
  }
  const pickWalls = (ral: string) => writePalette({ ...palette, name: undefined, walls: ral })
  const pickAccent = (ral: string) => writePalette({ ...palette, name: undefined, accent: ral, windows: ral, gates: ral, plinth: ral })

  const pickView = (v: View3D) => (v === view ? setNonce((n) => n + 1) : setView(v))
  const pickFinish = (finish: Finish) => {
    if (!onChange) return setFinishOverride(finish)
    setFinishOverride(null)
    onChange({ ...plan, materials: plan.materials.map((m) => (hasFinish(m.kind) ? { ...m, finish } : m)) })
  }

  return (
    <div className="view3d">
      <SceneErrorBoundary resetKey={plan}>
        <Scene3D
          plan={shown}
          view={view}
          nonce={nonce}
          look={look}
          grid={grid}
          finishOverride={finishOverride}
          cut={cut}
          renderFurniture={(item) => <FurnitureModel item={item} placed={false} look={look} />}
        />
      </SceneErrorBoundary>
      <CanvasToolbar placement="top-left" className="view3d__bar">
        <Segmented options={lookOptions()} value={look} onChange={setLook} size="sm" />
        <ToolbarSeparator />
        <Segmented options={viewOptions()} value={view} onChange={pickView} size="sm" />
        <ToolbarSeparator />
        <Segmented options={WALL_CUTS} value={cut} onChange={setCut} size="sm" />
        <ToolbarSeparator />
        <Button size="sm" variant="ghost" pressed={grid} onClick={() => setGrid((g) => !g)}>
          {t('toolbar.grid')}
        </Button>
      </CanvasToolbar>
      {currentFinish && !viewOnly && (
        <CanvasToolbar placement="top-right" className="view3d__bar view3d__finish">
          <span className="view3d__label">{t('toolbar.facade')}</span>
          <Segmented options={finishOptions()} value={currentFinish} onChange={pickFinish} size="sm" />
        </CanvasToolbar>
      )}
      {!viewOnly && (
        <CanvasToolbar placement="top-right" className="view3d__colors">
          <ColorPicker label={t('toolbar.wallColor')} value={palette.walls ?? DEFAULT_WALLS} onPick={pickWalls} presets={writePalette} />
          <ColorPicker label={t('toolbar.accent')} value={palette.accent ?? DEFAULT_ACCENT} onPick={pickAccent} />
        </CanvasToolbar>
      )}
    </div>
  )
}
