import { useStore } from 'zustand'
import { useTranslation } from 'react-i18next'
import { redo, undo, usePlanStore, type Tool } from '../store/planStore'
import { useViewOnly } from '../store/viewOnly'
import { OPENING_PRESETS, materialColor } from '../model'
import { CanvasToolbar, ToolbarSeparator } from './CanvasToolbar'
import { LayersButton, lockedToast, stopEdit, useLayers, useNetworkEdit, wallsLockedText } from '../networks'

const tools: { id: Tool; key: string; icon: string }[] = [
  { id: 'select', key: 'V', icon: 'M5 3l14 8-6 1.5L10 19z' },
  { id: 'wall', key: 'W', icon: 'M3 9h18v6H3z' },
  { id: 'door', key: 'D', icon: 'M6 3h12v18H6zM8 5v16h8V5zM13 11h2v2h-2z' },
  { id: 'window', key: 'O', icon: 'M4 4h16v16H4zM6 6h5v5H6zM13 6h5v5h-5zM6 13h5v5H6zM13 13h5v5h-5z' },
  { id: 'zone', key: '', icon: 'M4 6l7-3 9 4-2 12-12 2zM6.5 7.5l.5 10.2 9.5-1.6L18 8.3 11 5.3z' },
  { id: 'building', key: 'B', icon: 'M12 2.5l9 7.5v11.5H3V10zM5 11v8.5h14V11l-7-5.8zM12 8.3l2.6 2.6h-1.8v2.3h2.3v-1.8l2.6 2.6-2.6 2.6v-1.8h-2.3v2.3h1.8L12 20.7l-2.6-2.6h1.8v-2.3H8.9v1.8l-2.6-2.6 2.6-2.6v1.8h2.3v-2.3H9.4z' },
]

export function Toolbar() {
  const { t: tr } = useTranslation('plan')
  const toolLabel = (id: Tool) => tr(`toolbar.tools.${id}`)
  const tool = usePlanStore((s) => s.tool)
  const setTool = usePlanStore((s) => s.setTool)
  const plan = usePlanStore((s) => s.plan)
  const materials = plan?.materials ?? []
  const activeMaterialId = usePlanStore((s) => s.activeMaterialId)
  const setActiveMaterial = usePlanStore((s) => s.setActiveMaterial)
  const requestFit = usePlanStore((s) => s.requestFit)
  const underlay = usePlanStore((s) => s.underlay)
  const aligning = usePlanStore((s) => s.aligning)
  const setAligning = usePlanStore((s) => s.setAligning)
  const setUnderlay = usePlanStore((s) => s.setUnderlay)
  const furniturePanel = usePlanStore((s) => s.furniturePanel)
  const setFurniturePanel = usePlanStore((s) => s.setFurniturePanel)
  const doorPreset = usePlanStore((s) => s.doorPreset)
  const summaryOpen = usePlanStore((s) => s.summaryOpen)
  const setSummaryOpen = usePlanStore((s) => s.setSummaryOpen)
  const setDoorPreset = usePlanStore((s) => s.setDoorPreset)
  const active = materials.find((m) => m.id === activeMaterialId)
  const pct = Math.round(underlay.opacity * 100)
  const viewOnly = useViewOnly()
  const netEditing = useNetworkEdit((s) => !!s.editing)
  const wallsLocked = useLayers((s) => s.locks.walls)
  const zonesLocked = useLayers((s) => s.locks.zones)
  const toolLocked = (id: Tool) => (wallsLocked && (id === 'wall' || id === 'door' || id === 'window')) || (zonesLocked && id === 'zone')
  const showDims = usePlanStore((s) => s.showDims)
  const setShowDims = usePlanStore((s) => s.setShowDims)
  const canUndo = useStore(usePlanStore.temporal, (t) => t.pastStates.length > 0)
  const canRedo = useStore(usePlanStore.temporal, (t) => t.futureStates.length > 0)

  return (
    <CanvasToolbar placement="top-left" direction="column" className="toolbar">
      {!viewOnly && (
      <div className="toolbar__history">
        <button className="tool tool--mini" onClick={undo} disabled={!canUndo} title={tr('toolbar.undoTitle')} aria-label={tr('toolbar.undo')}>
          <svg viewBox="0 0 24 24" className="tool__icon tool__icon--line" aria-hidden>
            <path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />
          </svg>
        </button>
        <button className="tool tool--mini" onClick={redo} disabled={!canRedo} title={tr('toolbar.redoTitle')} aria-label={tr('toolbar.redo')}>
          <svg viewBox="0 0 24 24" className="tool__icon tool__icon--line" aria-hidden>
            <path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />
          </svg>
        </button>
      </div>
      )}
      {!viewOnly && <ToolbarSeparator />}
      {tools.filter((t) => !viewOnly || t.id === 'select').map((t) => (
        <button
          key={t.id}
          className={`tool ${tool === t.id && !(netEditing && t.id === 'select') ? 'tool--active' : ''}`}
          aria-disabled={toolLocked(t.id) || undefined}
          onClick={() => {
            if (toolLocked(t.id)) {
              lockedToast(t.id === 'zone' ? 'zones' : 'walls')
              return
            }
            setTool(t.id)
            if (netEditing) stopEdit()
          }}
          title={t.id === 'building' ? tr('toolbar.buildingTitle') : toolLocked(t.id) ? (t.id === 'zone' ? tr('toolbar.zonesLocked') : wallsLockedText()) : t.key ? `${toolLabel(t.id)} (${t.key})` : t.id === 'zone' ? tr('toolbar.zoneTitle') : toolLabel(t.id)}
        >
          <svg viewBox="0 0 24 24" className="tool__icon" aria-hidden>
            <path d={t.icon} fillRule="evenodd" />
          </svg>
          <span className="tool__label">{viewOnly && t.id === 'select' ? tr('toolbar.view') : toolLabel(t.id)}</span>
        </button>
      ))}
{!viewOnly && (
      <button
        className={`tool ${furniturePanel ? 'tool--on' : ''}`}
        onClick={() => setFurniturePanel(!furniturePanel)}
        title={tr('toolbar.furnitureTitle')}
        aria-pressed={furniturePanel}
      >
        <svg viewBox="0 0 24 24" className="tool__icon tool__icon--line" aria-hidden>
          <path d="M4 11V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4M3 11h18v6H3zM5 17v2M19 17v2" />
        </svg>
        <span className="tool__label">{tr('toolbar.furniture')}</span>
      </button>
      )}
      <button
        className={`tool ${tool === 'measure' ? 'tool--active' : ''}`}
        onClick={() => setTool(tool === 'measure' ? 'select' : 'measure')}
        title={tr('toolbar.measureTitle')}
      >
        <svg viewBox="0 0 24 24" className="tool__icon tool__icon--line" aria-hidden>
          <path d="M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2" />
        </svg>
        <span className="tool__label">{tr('toolbar.measure')}</span>
      </button>
      <button className="tool tool--narrow" onClick={() => setSummaryOpen(!summaryOpen)} title={tr('toolbar.summaryTitle')}>
        <svg viewBox="0 0 24 24" className="tool__icon tool__icon--line" aria-hidden>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
        <span className="tool__label">{tr('toolbar.summary')}</span>
      </button>
      <ToolbarSeparator />
      <LayersButton />
      <button
        className={`tool ${showDims ? 'tool--on' : ''}`}
        onClick={() => setShowDims(!showDims)}
        title={tr('toolbar.dimsTitle')}
        aria-pressed={showDims}
      >
        <svg viewBox="0 0 24 24" className="tool__icon tool__icon--line" aria-hidden>
          <path d="M3 8v8M21 8v8M3 12h18M7 10l-4 2 4 2M17 10l4 2-4 2" />
        </svg>
        <span className="tool__label">{tr('toolbar.dims')}</span>
      </button>
      <button className="tool" onClick={requestFit} title={tr('toolbar.fitTitle')}>
        <svg viewBox="0 0 24 24" className="tool__icon tool__icon--line" aria-hidden>
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </svg>
        <span className="tool__label">{tr('toolbar.fit')}</span>
      </button>
      <button
        className={`tool ${underlay.on ? 'tool--on' : ''}`}
        onClick={() => {
          if (underlay.on) setAligning(false)
          setUnderlay({ on: !underlay.on })
        }}
        title={tr('toolbar.mapTitle')}
        aria-pressed={underlay.on}
      >
        <svg viewBox="0 0 24 24" className="tool__icon tool__icon--line" aria-hidden>
          <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14" />
        </svg>
        <span className="tool__label">{tr('toolbar.map')}</span>
      </button>
      {underlay.on && !viewOnly && (
        <button
          className={`tool ${aligning ? 'tool--active' : ''}`}
          onClick={() => setAligning(!aligning)}
          title={tr('toolbar.alignTitle')}
          aria-pressed={aligning}
        >
          <svg viewBox="0 0 24 24" className="tool__icon tool__icon--line" aria-hidden>
            <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />
          </svg>
          <span className="tool__label">{tr('toolbar.align')}</span>
        </button>
      )}
      {underlay.on && (
        <label className="toolbar__opacity" title={tr('toolbar.opacityTitle', { pct })}>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={pct}
            onChange={(e) => setUnderlay({ opacity: Number(e.target.value) / 100 })}
          />
          <span>{pct}%</span>
        </label>
      )}
      {!viewOnly && tool === 'door' && (
        <div className="toolbar__material card">
          <select className="select" value={doorPreset} onChange={(e) => setDoorPreset(e.target.value as 'entry' | 'interior' | 'gate')}>
            <option value="entry">{OPENING_PRESETS.entry.label}</option>
            <option value="interior">{OPENING_PRESETS.interior.label}</option>
            <option value="gate">{OPENING_PRESETS.gate.label}</option>
          </select>
          <span className="muted">{tr('toolbar.clickWall')}</span>
        </div>
      )}
      {!viewOnly && tool === 'window' && (
        <div className="toolbar__material card">
          <span className="muted">{OPENING_PRESETS.window.label} · {tr('toolbar.clickWall')}</span>
        </div>
      )}
      {!viewOnly && tool === 'wall' && (
        <div className="toolbar__material card">
          <span className="swatch" style={{ background: materialColor(active) }} />
          <select
            className="select"
            value={activeMaterialId ?? ''}
            onChange={(e) => setActiveMaterial(e.target.value || null)}
          >
            <option value="">{tr('toolbar.noMaterial')}</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name.includes(String(m.thickness)) ? m.name : `${m.name}, ${m.thickness} ${tr('common:units.mm')}`}
              </option>
            ))}
          </select>
        </div>
      )}
    </CanvasToolbar>
  )
}
