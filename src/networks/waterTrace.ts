import { distanceToSegment, type Plan, type Point, type WaterLine, type WaterPipe } from '../model'
import { firstCrossing, insideAny, type SewerTarget } from './sewerSnap'
import { FURNITURE_FIXTURE } from './sewerModel'
import { addWaterNode, addWaterPipe, collectorLine, splitWaterPipe, waterOf, wNode, type NewWaterPipe } from './waterModel'
import type { WaterNextKind } from './waterStore'
import { t } from '../i18n'

export type WaterStep = { plan: Plan; draft: string | null; message?: string }

function nodeFromTarget(plan: Plan, t: SewerTarget, nextKind: WaterNextKind, line: WaterLine) {
  if (t.kind === 'node') return { plan, id: t.id, end: true }
  if (t.kind === 'pipe') {
    const r = splitWaterPipe(plan, t.id, t.point)
    if (r) return { ...r, end: true }
  }
  if (t.kind === 'fixture') {
    const r = addWaterNode(plan, { x: t.point.x, y: t.point.y, kind: 'fixture', fixture: FURNITURE_FIXTURE[t.furniture.type], furnitureId: t.furniture.id })
    return { ...r, end: true }
  }
  const extra = nextKind === 'collector' || nextKind === 'boiler' ? { line: nextKind === 'boiler' ? ('hot' as const) : line === 'recirc' ? ('hot' as const) : line } : {}
  const r = addWaterNode(plan, { x: t.point.x, y: t.point.y, kind: nextKind, ...extra })
  return { ...r, end: nextKind === 'tap_outdoor' }
}

function spec(plan: Plan, fromId: string, toId: string, line: WaterLine, location: WaterPipe['location']): NewWaterPipe {
  const to = wNode(waterOf(plan), toId)
  if (location === 'outside') return { from: fromId, to: toId, line, diameter: 32, material: 'PE', location }
  const leaf = to?.kind === 'fixture' || to?.kind === 'tap_outdoor' || line === 'recirc'
  return { from: fromId, to: toId, line, diameter: leaf ? 16 : 20, material: 'PEX', location }
}

export function connectWater(plan: Plan, fromId: string, toId: string, line: WaterLine, footprints: Point[][]): Plan {
  const w = waterOf(plan)
  const a = wNode(w, fromId)
  const b = wNode(w, toId)
  if (!a || !b || a.id === b.id) return plan
  const aIn = insideAny(a, footprints)
  const bIn = insideAny(b, footprints)
  if (!aIn && bIn && a.kind !== 'entry') {
    const c = firstCrossing(a, b, footprints)
    if (c && Math.hypot(c.x - a.x, c.y - a.y) > 50 && Math.hypot(c.x - b.x, c.y - b.y) > 50) {
      const e = addWaterNode(plan, { x: c.x, y: c.y, kind: 'entry' })
      const p1 = addWaterPipe(e.plan, spec(e.plan, fromId, e.id, line, 'outside'))
      return addWaterPipe(p1.plan, spec(p1.plan, e.id, toId, line, 'inside')).plan
    }
  }
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const location: WaterPipe['location'] = footprints.length > 0 && !insideAny(mid, footprints) ? 'outside' : 'inside'
  return addWaterPipe(plan, spec(plan, fromId, toId, line, location)).plan
}

export function radialToFixture(plan: Plan, fixtureId: string, line: WaterLine): WaterStep {
  const w = waterOf(plan)
  const f = wNode(w, fixtureId)
  if (!f) return { plan, draft: null }
  const feedLine: WaterLine = line === 'recirc' ? 'hot' : line
  if (w.pipes.some((p) => p.to === fixtureId && p.line === feedLine)) return { plan, draft: null, message: t(feedLine === 'hot' ? 'networks:water.trace.alreadyHot' : 'networks:water.trace.alreadyCold') }
  const collectors = w.nodes.filter((n) => n.kind === 'collector' && collectorLine(n) === feedLine)
  if (!collectors.length) return { plan, draft: null, message: t(feedLine === 'hot' ? 'networks:water.trace.needHotCollector' : 'networks:water.trace.needColdCollector') }
  const c = collectors.reduce((m, n) => (Math.hypot(n.x - f.x, n.y - f.y) < Math.hypot(m.x - f.x, m.y - f.y) ? n : m))
  const corners = [
    { x: f.x, y: c.y },
    { x: c.x, y: f.y },
  ]
  const wallDist = (p: Point) => Math.min(Infinity, ...plan.walls.map((wl) => distanceToSegment(p, wl.a, wl.b) - wl.thickness / 2))
  const corner = corners.sort((p, q) => wallDist(p) - wallDist(q))[0]
  const straight = Math.abs(f.x - c.x) < 30 || Math.abs(f.y - c.y) < 30
  let next = plan
  let from = c.id
  if (!straight) {
    const j = addWaterNode(next, { x: Math.round(corner.x), y: Math.round(corner.y), kind: 'junction' })
    next = addWaterPipe(j.plan, { from, to: j.id, line: feedLine, diameter: 16, material: 'PEX', location: 'inside' }).plan
    from = j.id
  }
  next = addWaterPipe(next, { from, to: fixtureId, line: feedLine, diameter: 16, material: 'PEX', location: 'inside' }).plan
  return { plan: next, draft: null }
}

export function waterClick(plan: Plan, draft: string | null, t: SewerTarget, nextKind: WaterNextKind, line: WaterLine, footprints: Point[][]): WaterStep {
  const w = waterOf(plan)
  if (draft && t.kind === 'node' && t.id === draft) return { plan, draft: null }
  if (!draft) {
    const fixtureNode = t.kind === 'node' ? wNode(w, t.id) : undefined
    if (t.kind === 'fixture' || fixtureNode?.kind === 'fixture') {
      const r = nodeFromTarget(plan, t, nextKind, line)
      return radialToFixture(r.plan, r.id, line)
    }
    const r = nodeFromTarget(plan, t, nextKind, line)
    return { plan: r.plan, draft: r.id }
  }
  const r = nodeFromTarget(plan, t, nextKind, line)
  return { plan: connectWater(r.plan, draft, r.id, line, footprints), draft: r.end ? null : r.id }
}
