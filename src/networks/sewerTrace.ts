import type { Plan, Point, SewerDiameter, SewerNode, SewerPipe } from '../model'
import { firstCrossing, insideAny, type SewerTarget } from './sewerSnap'
import { type NewSewerPipe, DEFAULT_SEPTIC, FURNITURE_FIXTURE, addNode, addPipe, defaultSlope, nodeById, sewerOf, splitPipe, upstreamDiameter } from './sewerModel'
import type { NextKind } from './sewerStore'

export type TraceStep = { plan: Plan; draft: string | null; last: string | null }

function nodeFromTarget(plan: Plan, t: SewerTarget, nextKind: NextKind): { plan: Plan; id: string; end: boolean } {
  if (t.kind === 'node') return { plan, id: t.id, end: true }
  if (t.kind === 'pipe') {
    const r = splitPipe(plan, t.id, t.point)
    if (r) return { ...r, end: true }
  }
  if (t.kind === 'fixture') {
    const r = addNode(plan, { x: t.point.x, y: t.point.y, kind: 'fixture', fixture: FURNITURE_FIXTURE[t.furniture.type], furnitureId: t.furniture.id })
    return { ...r, end: true }
  }
  const extra: Partial<SewerNode> = nextKind === 'septic' ? { w: DEFAULT_SEPTIC.w, d: DEFAULT_SEPTIC.d, rotationDeg: 0 } : {}
  const r = addNode(plan, { x: t.point.x, y: t.point.y, kind: nextKind, ...extra })
  return { ...r, end: nextKind === 'septic' }
}

function pipeSpec(plan: Plan, fromId: string, toId: string, location: SewerPipe['location']): NewSewerPipe {
  const s = sewerOf(plan)
  const from = nodeById(s, fromId)
  const to = nodeById(s, toId)
  let d: SewerDiameter = upstreamDiameter(s, fromId) ?? 50
  if (from?.kind === 'riser') d = 110
  if ((location === 'outside' || to?.kind === 'septic' || to?.kind === 'riser') && d < 110) d = 110
  return { from: fromId, to: toId, diameter: d, slope: defaultSlope(d, location), location }
}

export function connect(plan: Plan, fromId: string, toId: string, footprints: Point[][]): Plan {
  const s = sewerOf(plan)
  const a = nodeById(s, fromId)
  const b = nodeById(s, toId)
  if (!a || !b || a.id === b.id) return plan
  const aIn = a.kind !== 'outlet' && insideAny(a, footprints)
  const bIn = insideAny(b, footprints)
  const downstreamOut = a.kind === 'outlet' || s.pipes.some((p) => p.to === a.id && p.location === 'outside')
  if (aIn && !bIn) {
    const c = firstCrossing(a, b, footprints)
    if (c && Math.hypot(c.x - a.x, c.y - a.y) > 50 && Math.hypot(c.x - b.x, c.y - b.y) > 50) {
      const o = addNode(plan, { x: c.x, y: c.y, kind: 'outlet' })
      const p1 = addPipe(o.plan, pipeSpec(o.plan, fromId, o.id, 'inside'))
      return addPipe(p1.plan, pipeSpec(p1.plan, o.id, toId, 'outside')).plan
    }
  }
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const location: SewerPipe['location'] = downstreamOut || (!insideAny(mid, footprints) && footprints.length > 0) ? 'outside' : 'inside'
  return addPipe(plan, pipeSpec(plan, fromId, toId, location)).plan
}

export function traceClick(plan: Plan, draft: string | null, t: SewerTarget, nextKind: NextKind, footprints: Point[][]): TraceStep {
  if (draft && t.kind === 'node' && t.id === draft) return { plan, draft: null, last: draft }
  const r = nodeFromTarget(plan, t, draft ? nextKind : t.kind === 'point' ? nextKind : 'junction')
  if (!draft) return { plan: r.plan, draft: r.id, last: r.id }
  const next = connect(r.plan, draft, r.id, footprints)
  return { plan: next, draft: r.end ? null : r.id, last: r.id }
}
