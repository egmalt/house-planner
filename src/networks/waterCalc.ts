import type { Plan, Point, WaterPipe } from '../model'
import { projectOnSegment, segmentIntersection, sewerOf } from './sewerModel'
import { fixtureLabels } from './sewerModel'
import {
  FROST_DEPTH,
  LINE_SHORT,
  SOURCE_TO_SEPTIC_MIN,
  SOURCE_TO_SEPTIC_PASSPORT_MIN,
  WATER_TO_SEWER_MIN,
  collectorLine,
  pipeMaterial,
  waterOf,
  waterPipeLength,
  wNode,
} from './waterModel'
import type { SewerRef, SewerWarning } from './sewerCalc'
import { t } from '../i18n'
import { fmtM, type ItemUnit } from './labels'

export type WaterItemKind = 'pipe' | 'elbow' | 'tee' | 'socket' | 'reducer' | 'collector' | 'collector-out' | 'sleeve' | 'insulation' | 'heat-cable' | 'head' | 'tap' | 'adapter' | 'pump'

export type WaterItem = {
  key: string
  kind: WaterItemKind
  name: string
  qty: number
  unit: ItemUnit
  diameter?: number
  material?: string
  model?: string
  location?: WaterPipe['location']
  lengthMm?: number
}

export type WaterCalc = {
  lengths: { line: WaterPipe['line']; diameter: number; material: string; location: WaterPipe['location']; lengthMm: number }[]
  items: WaterItem[]
  warnings: SewerWarning[]
}

function segDist(a: Point, b: Point, c: Point, d: Point) {
  if (segmentIntersection(a, b, c, d)) return 0
  return Math.min(projectOnSegment(a, c, d).dist, projectOnSegment(b, c, d).dist, projectOnSegment(c, a, b).dist, projectOnSegment(d, a, b).dist)
}

export function computeWater(plan: Plan): WaterCalc {
  const w = waterOf(plan)
  const warnings: SewerWarning[] = []
  const items = new Map<string, WaterItem>()
  const add = (it: Omit<WaterItem, 'qty'>, qty: number) => {
    if (qty <= 0) return
    const cur = items.get(it.key)
    items.set(it.key, { ...it, qty: (cur?.qty ?? 0) + qty })
  }
  const inc = new Map<string, WaterPipe[]>(w.nodes.map((n) => [n.id, []]))
  const out = new Map<string, WaterPipe[]>(w.nodes.map((n) => [n.id, []]))
  for (const p of w.pipes) {
    inc.get(p.to)?.push(p)
    out.get(p.from)?.push(p)
  }
  const ends = (p: WaterPipe) => {
    const a = wNode(w, p.from)
    const b = wNode(w, p.to)
    return a && b ? { a, b } : null
  }

  const lengths = new Map<string, WaterCalc['lengths'][number]>()
  for (const p of w.pipes) {
    const len = waterPipeLength(w, p)
    const mat = pipeMaterial(p)
    const key = `${p.line}-${p.diameter}-${mat}-${p.location}`
    const cur = lengths.get(key) ?? { line: p.line, diameter: p.diameter, material: mat, location: p.location, lengthMm: 0 }
    cur.lengthMm += len
    lengths.set(key, cur)
    const ref: SewerRef = { kind: 'pipe', id: p.id }
    if (p.line === 'hot' || p.line === 'recirc' || p.location === 'outside') {
      const it = items.get(`insul-${p.diameter}`) ?? { key: `insul-${p.diameter}`, kind: 'insulation' as const, name: t('networks:water.item.insulation', { d: p.diameter }), unit: 'm' as const, diameter: p.diameter, qty: 0, lengthMm: 0 }
      items.set(it.key, { ...it, lengthMm: (it.lengthMm ?? 0) + len })
    }
    if (p.location === 'outside') {
      if (p.heated) add({ key: 'heat-cable', kind: 'heat-cable', name: t('networks:water.item.heatCable'), unit: 'm' }, Math.ceil(len / 100) / 10)
      if (!p.heated && (p.depth === undefined || p.depth < FROST_DEPTH))
        warnings.push({
          text:
            p.depth === undefined
              ? t('networks:water.warn.frostNoDepth', { id: p.id, frost: fmtM(FROST_DEPTH) })
              : t('networks:water.warn.frostShallow', { id: p.id, depth: fmtM(p.depth), frost: fmtM(FROST_DEPTH) }),
          ref,
        })
    }
    const e = ends(p)
    if (e && p.location === 'inside') {
      const crossings = plan.walls.filter((wl) => segmentIntersection(e.a, e.b, wl.a, wl.b)).length
      add({ key: `sleeve-${p.diameter}`, kind: 'sleeve', name: t('networks:water.item.sleeve', { d: p.diameter }), unit: 'pcs', diameter: p.diameter }, crossings)
    }
  }
  for (const it of items.values()) if (it.kind === 'insulation') items.set(it.key, { ...it, qty: Math.ceil((it.lengthMm ?? 0) / 100) / 10 })
  for (const l of lengths.values()) {
    const key = `pipe-${l.diameter}-${l.material}-${l.location}`
    const name = t(l.location === 'outside' ? 'networks:water.item.pipeOut' : 'networks:water.item.pipe', { material: l.material, d: l.diameter })
    const cur = items.get(key)
    items.set(key, {
      key,
      kind: 'pipe',
      name,
      unit: 'm',
      diameter: l.diameter,
      material: l.material,
      location: l.location,
      lengthMm: (cur?.lengthMm ?? 0) + l.lengthMm,
      qty: Math.ceil(((cur?.lengthMm ?? 0) + l.lengthMm) / 100) / 10,
    })
  }

  const sewer = sewerOf(plan)
  const sewerSegs = sewer.pipes
    .map((p) => {
      const a = sewer.nodes.find((n) => n.id === p.from)
      const b = sewer.nodes.find((n) => n.id === p.to)
      return a && b ? { a, b, outside: p.location === 'outside' } : null
    })
    .filter(Boolean) as { a: Point; b: Point; outside: boolean }[]
  for (const p of w.pipes) {
    if (p.location !== 'outside') continue
    const e = ends(p)
    if (!e) continue
    const d = Math.min(Infinity, ...sewerSegs.filter((s) => s.outside).map((s) => segDist(e.a, e.b, s.a, s.b)))
    if (d < WATER_TO_SEWER_MIN)
      warnings.push({ text: t('networks:water.warn.toSewer', { id: p.id, dist: fmtM(d), min: fmtM(WATER_TO_SEWER_MIN) }), ref: { kind: 'pipe', id: p.id } })
  }

  const septics = sewer.nodes.filter((n) => n.kind === 'septic')
  for (const n of w.nodes) {
    const ins = inc.get(n.id)!
    const outs = out.get(n.id)!
    const all = [...ins, ...outs]
    const d = all.reduce((m, p) => Math.max(m, p.diameter), 0)
    const ref: SewerRef = { kind: 'node', id: n.id }
    if (n.kind === 'source') {
      if (n.source !== 'well') add({ key: 'head', kind: 'head', name: t('networks:water.item.head'), unit: 'pcs' }, 1)
      for (const s of septics) {
        const dist = Math.hypot(s.x - n.x, s.y - n.y)
        const what = t(n.source === 'well' ? 'networks:water.source.well' : 'networks:water.source.borehole')
        if (dist < SOURCE_TO_SEPTIC_PASSPORT_MIN)
          warnings.push({ text: t('networks:water.warn.sourcePassport', { what, dist: fmtM(dist), min: fmtM(SOURCE_TO_SEPTIC_PASSPORT_MIN) }), ref })
        else if (dist < SOURCE_TO_SEPTIC_MIN)
          warnings.push({ text: t('networks:water.warn.sourceSanpin', { what, dist: fmtM(dist), min: fmtM(SOURCE_TO_SEPTIC_MIN), passport: fmtM(SOURCE_TO_SEPTIC_PASSPORT_MIN) }), ref })
      }
      continue
    }
    if (n.kind === 'tap_outdoor') {
      add({ key: 'tap-outdoor', kind: 'tap', name: t('networks:water.item.tap'), unit: 'pcs' }, 1)
      continue
    }
    if (n.kind === 'fixture') {
      for (const p of ins) add({ key: `socket-${p.diameter}`, kind: 'socket', name: t('networks:water.item.socket', { d: p.diameter }), unit: 'pcs', diameter: p.diameter }, 1)
      const name = n.fixture ? fixtureLabels[n.fixture] : n.id
      if (!ins.some((p) => p.line === 'cold')) warnings.push({ text: t('networks:water.warn.noCold', { name }), ref })
      for (const p of ins) {
        let cur = wNode(w, p.from)
        let guard = 0
        while (cur && cur.kind === 'junction' && guard++ < 50) {
          if ((out.get(cur.id) ?? []).length > 1) {
            warnings.push({ text: t('networks:water.warn.viaTee', { name, line: LINE_SHORT[p.line] }), ref })
            break
          }
          cur = wNode(w, (inc.get(cur.id) ?? [])[0]?.from ?? '')
        }
        if (cur && cur.kind !== 'collector' && cur.kind !== 'junction' && p.line !== 'recirc')
          warnings.push({ text: t('networks:water.warn.notFromCollector', { name, line: LINE_SHORT[p.line] }), ref })
      }
      continue
    }
    if (n.kind === 'collector') {
      const used = outs.length
      const size = Math.max(n.outputs ?? used, used, 2)
      add({ key: `collector-${size}`, kind: 'collector', name: t('networks:water.item.collector', { count: size }), unit: 'pcs' }, 1)
      for (const p of outs) add({ key: `collector-out-${p.diameter}`, kind: 'collector-out', name: t('networks:water.item.collectorOut', { d: p.diameter }), unit: 'pcs', diameter: p.diameter }, 1)
      if (n.outputs && used > n.outputs) warnings.push({ text: t('networks:water.warn.collectorFull', { line: LINE_SHORT[collectorLine(n) === 'hot' ? 'hot' : 'cold'], used, outputs: n.outputs }), ref })
      continue
    }
    if (n.kind === 'pump') add({ key: 'pump', kind: 'pump', name: n.model ? t('networks:water.item.pumpModel', { model: n.model }) : t('networks:water.item.pump'), unit: 'pcs', model: n.model }, 1)
    if (n.kind === 'pump' || n.kind === 'filter' || n.kind === 'boiler') {
      add({ key: `adapter-${d || 20}`, kind: 'adapter', name: t('networks:water.item.adapter', { d: d || 20 }), unit: 'pcs', diameter: d || 20 }, all.length)
      continue
    }
    if (n.kind === 'entry') add({ key: `sleeve-${d || 32}`, kind: 'sleeve', name: t('networks:water.item.sleeve', { d: d || 32 }), unit: 'pcs', diameter: d || 32 }, 1)
    const byLine = new Map<string, WaterPipe[]>()
    for (const p of all) byLine.set(p.line, [...(byLine.get(p.line) ?? []), p])
    for (const group of byLine.values()) {
      if (group.length >= 3) {
        add({ key: `tee-${d}`, kind: 'tee', name: t('networks:water.item.tee', { d }), unit: 'pcs', diameter: d }, group.length - 2)
        continue
      }
      if (group.length !== 2) continue
      const [a, b] = [group.find((p) => p.to === n.id), group.find((p) => p.from === n.id)]
      if (!a || !b) continue
      if (a.diameter !== b.diameter) {
        const big = Math.max(a.diameter, b.diameter)
        const small = Math.min(a.diameter, b.diameter)
        add({ key: `reducer-${big}x${small}`, kind: 'reducer', name: t('networks:water.item.reducer', { big, small }), unit: 'pcs', diameter: big }, 1)
      }
      const pa = wNode(w, a.from)
      const pb = wNode(w, b.to)
      if (!pa || !pb) continue
      const u = { x: n.x - pa.x, y: n.y - pa.y }
      const v = { x: pb.x - n.x, y: pb.y - n.y }
      const cos = (u.x * v.x + u.y * v.y) / ((Math.hypot(u.x, u.y) || 1) * (Math.hypot(v.x, v.y) || 1))
      if (Math.acos(Math.max(-1, Math.min(1, cos))) > (15 * Math.PI) / 180)
        add({ key: `elbow-${b.diameter}`, kind: 'elbow', name: t('networks:water.item.elbow', { d: b.diameter }), unit: 'pcs', diameter: b.diameter }, 1)
    }
  }

  const unconnected = w.nodes.filter((n) => n.kind === 'fixture' && !(inc.get(n.id) ?? []).length)
  for (const n of unconnected) warnings.push({ text: t('networks:shared.warn.notConnected', { name: n.fixture ? fixtureLabels[n.fixture] : n.id }), ref: { kind: 'node', id: n.id } })

  const order: WaterItemKind[] = ['head', 'pump', 'pipe', 'collector', 'collector-out', 'socket', 'elbow', 'tee', 'reducer', 'adapter', 'sleeve', 'insulation', 'heat-cable', 'tap']
  return {
    lengths: [...lengths.values()].sort((a, b) => a.line.localeCompare(b.line) || b.diameter - a.diameter),
    items: [...items.values()].filter((i) => i.qty > 0).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || (b.diameter ?? 0) - (a.diameter ?? 0)),
    warnings,
  }
}

