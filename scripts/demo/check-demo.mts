import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { close, load } from './vite-load.mts'

type Pt = { x: number; y: number }
type Any = Record<string, any>

const file = process.argv[2] ?? fileURLToPath(new URL('../../public/plans/demo.json', import.meta.url))
const raw = JSON.parse(readFileSync(file, 'utf8'))
const { parsePlan } = await load<Any>('/src/model/schema.ts')
const parsed = parsePlan(raw)
if (!parsed.ok) {
  console.error(parsed.error)
  process.exit(1)
}
const plan = parsed.plan
const { computeSewer } = await load<Any>('/src/networks/sewerCalc.ts')
const { computeWater } = await load<Any>('/src/networks/waterCalc.ts')
const { computeElectric } = await load<Any>('/src/networks/electric/calc.ts')
const { computeHeating } = await load<Any>('/src/networks/heating/calc.ts')
const { computePlanSummary } = await load<Any>('/src/stats/summary.ts')
const { resolveFurniture } = await load<Any>('/src/furniture/catalog.ts')
const { pointInPolygon } = await load<Any>('/src/stats/rooms.ts')

const report = (name: string, ws: { text: string; level?: string }[]) => {
  console.log(`\n${name}: ${ws.length} warning(s)`)
  for (const w of ws) console.log(`  [${w.level ?? 'warn'}] ${w.text}`)
}
const sewer = computeSewer(plan)
report('Sewer', sewer.warnings)
console.log('  outlets', sewer.outlets.map((o: Any) => `${o.nodeId} ${(o.depth / 1000).toFixed(2)} m`).join(', '))
console.log('  septic', sewer.septics.map((s: Any) => `depth ${(s.depth / 1000).toFixed(2)} m, to house ${(s.toHouse / 1000).toFixed(1)} m, to boundary ${(s.toBoundary / 1000).toFixed(1)} m`).join('; '))
const water = computeWater(plan)
report('Water', water.warnings)
const el = computeElectric(plan)
report('Electric', el.warnings)
console.log(`  modules ${el.modules}, panel ${el.panelSize}, load ${(el.totalLoadW / 1000).toFixed(1)} kW`)
for (const c of el.circuits) console.log(`  ${c.circuit.id.padEnd(5)} ${c.circuit.name.padEnd(36)} pts ${String(c.points).padStart(2)} ${String(Math.round(c.loadW)).padStart(5)} W ${c.currentA.toFixed(1).padStart(5)} A cable ${String(c.cableM).padStart(3)} m drop ${c.dropPct?.toFixed(2)}%`)
const heat = computeHeating(plan)
report('Heating', heat.warnings)
console.log(`  loops ${plan.networks.heating.loops.length}, collector outputs ${plan.networks.heating.collector?.outputs}`)
for (const l of heat.loops) console.log(`  ${l.loop.id.padEnd(5)} ${(l.loop.roomName ?? '').padEnd(40)} step ${l.loop.stepMm} ${Math.round(l.lengthM)} m ${Math.round(l.powerW ?? 0)} W`)
for (const k of Object.keys(heat)) if (!['loops', 'warnings', 'rooms', 'items'].includes(k)) console.log(`  ${k}:`, JSON.stringify(heat[k]).slice(0, 200))

const sum = computePlanSummary(plan)
console.log('\nSummary totals', sum.totals, 'site', { area: sum.site.areaM2, built: sum.site.builtM2.toFixed(1), pct: sum.site.builtPct.toFixed(1), violations: sum.site.violations })
for (const b of sum.buildings) {
  console.log(`  ${b.name}: footprint ${b.footprintM2.toFixed(1)} m², rooms ${b.totalAreaM2.toFixed(1)} m², living ${b.livingAreaM2.toFixed(1)} m²`)
  for (const r of b.rooms) console.log(`    ${r.name.padEnd(20)} ${r.areaM2.toFixed(1).padStart(5)} m² win ${r.windows} light ${r.lightRatio === null ? '-' : r.lightRatio.toFixed(3)} ${r.lightOk === false ? 'LOW' : ''}`)
  for (const c of b.clearances) if (!c.ok) console.log(`    clearance FAIL ${c.label} ${c.distanceM.toFixed(2)} < ${c.normM}`)
  console.log(`    clearances: ${b.clearances.map((c: Any) => `${c.label} ${c.distanceM.toFixed(1)}`).join(', ')}`)
}
for (const g of sum.site.gaps) console.log(`  gap ${g.label} ${g.distanceM.toFixed(2)} m ${g.ok ? 'ok' : 'FAIL'}`)
if (sum.unmatchedLabels.length) console.log('  unmatched labels', sum.unmatchedLabels)

const rect = (f: Any) => {
  const r = resolveFurniture(f)
  const a = (f.rotationDeg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [
    [-r.w / 2, -r.d / 2],
    [r.w / 2, -r.d / 2],
    [r.w / 2, r.d / 2],
    [-r.w / 2, r.d / 2],
  ].map(([x, y]) => ({ x: f.x + x * c - y * s, y: f.y + x * s + y * c }))
}
const elevated = new Set(['kitchen-upper', 'water-heater', 'gas-boiler'])
const polys = plan.furniture.map((f: Any) => ({ f, p: rect(f) }))
const sepAxis = (a: Pt[], b: Pt[]) => {
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % poly.length]
      const n = { x: q.y - p.y, y: p.x - q.x }
      const pa = a.map((v) => v.x * n.x + v.y * n.y)
      const pb = b.map((v) => v.x * n.x + v.y * n.y)
      if (Math.max(...pa) <= Math.min(...pb) + 1 || Math.max(...pb) <= Math.min(...pa) + 1) return true
    }
  return false
}
let clashes = 0
for (let i = 0; i < polys.length; i++)
  for (let j = i + 1; j < polys.length; j++) {
    const A = polys[i]
    const B = polys[j]
    if (elevated.has(A.f.type) !== elevated.has(B.f.type)) continue
    if (!sepAxis(A.p, B.p)) {
      clashes++
      console.log(`  furniture clash ${A.f.id} × ${B.f.id}`)
    }
  }
const roomPolys = sum.buildings.flatMap((b: Any) => b.rooms.map((r: Any) => r.polygon))
for (const { f, p } of polys) {
  const ok = roomPolys.some((poly: Pt[]) => p.every((v) => pointInPolygon({ x: v.x + Math.sign(f.x - v.x) * 2, y: v.y + Math.sign(f.y - v.y) * 2 }, poly)))
  if (!ok) {
    clashes++
    console.log(`  furniture outside its room or into a wall: ${f.id}`)
  }
}
const walls = new Map(plan.walls.map((w: Any) => [w.id, w]))
for (const o of plan.openings) {
  if (o.type !== 'door') continue
  const w: Any = walls.get(o.wallId)
  const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y)
  const ux = (w.b.x - w.a.x) / len
  const uy = (w.b.y - w.a.y) / len
  const sign = o.side === 'left' ? -1 : 1
  const n = { x: -uy * sign, y: ux * sign }
  const t0 = o.hinge === 'end' ? o.offset + o.width : o.offset
  const t1 = o.hinge === 'end' ? o.offset : o.offset + o.width
  const half = w.thickness / 2
  const at = (t: number, k: number) => ({ x: w.a.x + ux * t + n.x * (half + k), y: w.a.y + uy * t + n.y * (half + k) })
  const sweep = [at(t0, 0), at(t1, 0), at(t1, o.width), at(t0, o.width)]
  for (const { f, p } of polys) {
    if (elevated.has(f.type)) continue
    if (!sepAxis(sweep, p)) {
      clashes++
      console.log(`  door swing ${o.id} hits ${f.id}`)
    }
  }
}
console.log(`\nFurniture/door checks: ${clashes} issue(s)`)
await close()
