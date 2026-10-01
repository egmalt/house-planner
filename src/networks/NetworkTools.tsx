import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useViewOnly } from '../store/viewOnly'
import { Checkbox, IconButton } from '../ui'
import { LAYER_LABELS, useLayers, type LayerKey } from './layers'
import { startEdit, stopEdit, useNetworkEdit } from './registry'
import { useSewerUi } from './sewerStore'
import { useWaterUi } from './waterStore'
import './networks.css'

const GAP = 10
const MARGIN = 8

const isTyping = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

function usePopoverPosition(open: boolean, anchor: RefObject<HTMLElement | null>, panel: RefObject<HTMLElement | null>) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const place = () => {
      const a = anchor.current?.getBoundingClientRect()
      const p = panel.current?.getBoundingClientRect()
      if (!a || !p) return
      const vw = window.innerWidth
      const vh = window.innerHeight
      let left = a.right + GAP
      if (left + p.width > vw - MARGIN) left = a.left - GAP - p.width
      left = Math.max(MARGIN, Math.min(left, vw - MARGIN - p.width))
      let top = a.top
      if (top + p.height > vh - MARGIN) top = vh - MARGIN - p.height
      if (left < a.right && left + p.width > a.left && top + p.height > a.top) top = a.top - GAP - p.height
      top = Math.max(MARGIN, top)
      setPos({ left, top })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, anchor, panel])
  return pos
}

const PencilIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />
  </svg>
)

const LockIcon = ({ locked }: { locked: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={locked ? 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3' : 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 6.8-1.2'} />
  </svg>
)

export function LayersButton() {
  const { t } = useTranslation('networks')
  const [open, setOpen] = useState(false)
  const layers = useLayers()
  const viewOnly = useViewOnly()
  const editing = useNetworkEdit((s) => s.editing)
  const defs = useNetworkEdit((s) => s.defs)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const pos = usePopoverPosition(open, btnRef, panelRef)
  const keys = (Object.keys(LAYER_LABELS) as LayerKey[]).filter((k) => typeof layers[k] === 'boolean')
  const count = keys.filter((k) => layers[k]).length

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (!btnRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        className={`tool ${open || editing ? 'tool--on' : ''}`}
        onClick={() => setOpen(!open)}
        title={t('shared.tools.buttonTitle')}
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" className="tool__icon tool__icon--line" aria-hidden>
          <path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5" />
        </svg>
        <span className="tool__label">{t('shared.tools.buttonLabel', { count })}</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="net-layers card"
            role="menu"
            style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0, visibility: 'hidden' }}
          >
            <div className="eyebrow">{t('shared.tools.heading')}</div>
            {keys.map((k) => {
              const def = defs[k]
              return (
                <div key={k} className="net-layers__row">
                  <Checkbox
                    checked={layers[k]}
                    label={LAYER_LABELS[k]}
                    onChange={(on) => {
                      layers.setLayer(k, on)
                      if (k === 'sewer') useSewerUi.getState().setPanel(on)
                      if (k === 'water') useWaterUi.getState().setPanel(on)
                    }}
                  />
                  {!viewOnly && (
                  <span className="net-layers__actions">
                    <IconButton
                      size="sm"
                      label={t(layers.locks[k] ? 'shared.tools.unlock' : 'shared.tools.lock', { layer: LAYER_LABELS[k] })}
                      title={layers.locks[k] ? t('shared.tools.lockedTitle') : t('shared.tools.lockTitle')}
                      className={layers.locks[k] ? 'net-layers__lock net-layers__lock--on' : 'net-layers__lock'}
                      aria-pressed={layers.locks[k]}
                      onClick={() => layers.setLock(k, !layers.locks[k])}
                    >
                      <LockIcon locked={layers.locks[k]} />
                    </IconButton>
                  {def && (
                    <IconButton
                      size="sm"
                      label={t('shared.tools.edit', { layer: LAYER_LABELS[k] })}
                      title={t('shared.tools.edit', { layer: LAYER_LABELS[k] })}
                      className={editing === k ? 'net-layers__edit net-layers__edit--on' : 'net-layers__edit'}
                      onClick={() => {
                        if (editing === k) stopEdit()
                        else {
                          if (layers.locks[k]) layers.setLock(k, false)
                          startEdit(k)
                        }
                        setOpen(false)
                      }}
                    >
                      <PencilIcon />
                    </IconButton>
                  )}
                  </span>
                  )}
                </div>
              )
            })}
            <span className="muted net-layers__note">{t('shared.tools.note')}</span>
          </div>,
          document.body,
        )}
      <NetworkEditBar />
    </>
  )
}

export function NetworkEditBar() {
  const { t } = useTranslation('networks')
  const editing = useNetworkEdit((s) => s.editing)
  const def = useNetworkEdit((s) => (s.editing ? s.defs[s.editing] : undefined))
  const viewOnly = useViewOnly()

  useEffect(() => {
    if (viewOnly && editing) stopEdit()
  }, [viewOnly, editing])

  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isTyping(e)) return
      const st = useNetworkEdit.getState()
      const h = st.editing ? st.defs[st.editing] : undefined
      if (h?.onEscape?.()) return
      stopEdit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing])

  if (!editing || !def || viewOnly) return null
  const Tools = def.Tools
  return createPortal(
    <div className="net-editbar card" role="toolbar" aria-label={t('shared.tools.editing', { layer: LAYER_LABELS[editing] })}>
      <span className="net-editbar__title">{LAYER_LABELS[editing]}</span>
      <Tools />
      <IconButton size="sm" label={t('shared.tools.exitLabel')} title={t('shared.tools.exitTitle')} onClick={stopEdit}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </IconButton>
    </div>,
    document.body,
  )
}
