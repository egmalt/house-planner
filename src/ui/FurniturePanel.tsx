import { useTranslation } from 'react-i18next'
import { FURNITURE_CATALOG, FURNITURE_CATEGORIES, resolveFurniture } from '../furniture/catalog'
import { FurnitureIcon } from '../furniture/icons'
import { toWorld } from '../canvas/camera'
import { addFurniture, distanceToSegment, snapOffset, type Plan, type Point } from '../model'
import { usePlanStore } from '../store/planStore'
import { useViewOnly } from '../store/viewOnly'
import { IconButton } from './IconButton'
import { Panel } from './Card'

function freeSpot(plan: Plan, center: Point, w: number, d: number): Point {
  const r = Math.hypot(w, d) / 2
  const fits = (p: Point) =>
    plan.furniture.every((f) => {
      const o = resolveFurniture(f)
      return Math.hypot(f.x - p.x, f.y - p.y) > (r + Math.hypot(o.w, o.d) / 2) * 0.85
    }) && plan.walls.every((wall) => distanceToSegment(p, wall.a, wall.b) > Math.max(w, d) / 2 + wall.thickness / 2 + 50)
  const step = Math.max(300, Math.min(w, d) / 2)
  for (let ring = 0; ring <= 20; ring += 1) {
    for (let i = -ring; i <= ring; i += 1) {
      for (const [dx, dy] of [[i, -ring], [i, ring], [-ring, i], [ring, i]]) {
        const p = { x: center.x + dx * step, y: center.y + dy * step }
        if (fits(p)) return p
      }
    }
  }
  return center
}

export function FurniturePanel() {
  const { t } = useTranslation('plan')
  const open = usePlanStore((s) => s.furniturePanel)
  const setOpen = usePlanStore((s) => s.setFurniturePanel)
  const viewOnly = useViewOnly()
  if (!open || viewOnly) return null

  const place = (type: string) => {
    const { plan, cam, commit, selectFurniture, setTool } = usePlanStore.getState()
    if (!plan) return
    const center = cam
      ? toWorld(cam, { x: window.innerWidth / 2, y: window.innerHeight / 2 })
      : { x: plan.site.width / 2, y: plan.site.depth / 2 }
    const size = resolveFurniture({ type })
    const at = freeSpot(plan, center, size.w, size.d)
    const res = addFurniture(plan, { type, x: snapOffset(at.x), y: snapOffset(at.y), rotationDeg: 0 })
    commit(res.plan)
    setTool('select')
    selectFurniture(res.id)
  }

  return (
    <Panel
      className="furniture-panel"
      eyebrow={t('furniturePanel.eyebrow')}
      title={t('furniturePanel.title')}
      actions={
        <IconButton label={t('close')} size="sm" onClick={() => setOpen(false)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </IconButton>
      }
      footer={<span className="muted">{t('furniturePanel.hint')}</span>}
    >
      {FURNITURE_CATEGORIES.map((c) => {
        const items = FURNITURE_CATALOG.filter((d) => d.category === c.id)
        if (items.length === 0) return null
        return (
          <section key={c.id} className="furniture-panel__group">
            <div className="eyebrow">{c.name}</div>
            <div className="furniture-panel__grid">
              {items.map((d) => (
                <button
                  key={d.type}
                  className="furniture-panel__item"
                  draggable
                  title={`${d.name}, ${d.w}×${d.d} ${t('common:units.mm')}`}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/x-furniture', d.type)
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={() => place(d.type)}
                >
                  <FurnitureIcon type={d.type} size={40} />
                  <span className="furniture-panel__name">{d.name}</span>
                </button>
              ))}
            </div>
          </section>
        )
      })}
    </Panel>
  )
}
