import type { ElectricRoute, Plan, Point, Wall } from '../../model'
import { electricOf, isWallMounted, projectOnWall } from './model'

const MERGE = 30

type Graph = { nodes: Point[]; adj: Map<number, { to: number; w: number }[]> }

function makeGraph(): Graph & { node: (p: Point) => number; link: (a: number, b: number) => void } {
  const nodes: Point[] = []
  const adj = new Map<number, { to: number; w: number }[]>()
  const node = (p: Point) => {
    const i = nodes.findIndex((q) => Math.abs(q.x - p.x) <= MERGE && Math.abs(q.y - p.y) <= MERGE)
    if (i >= 0) return i
    nodes.push({ x: Math.round(p.x), y: Math.round(p.y) })
    adj.set(nodes.length - 1, [])
    return nodes.length - 1
  }
  const link = (a: number, b: number) => {
    if (a === b) return
    const w = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y)
    adj.get(a)!.push({ to: b, w })
    adj.get(b)!.push({ to: a, w })
  }
  return { nodes, adj, node, link }
}

function axisCross(p: Wall, q: Wall): Point | null {
  const r = { x: p.b.x - p.a.x, y: p.b.y - p.a.y }
  const s = { x: q.b.x - q.a.x, y: q.b.y - q.a.y }
  const den = r.x * s.y - r.y * s.x
  if (Math.abs(den) < 1e-9) return null
  const t = ((q.a.x - p.a.x) * s.y - (q.a.y - p.a.y) * s.x) / den
  const u = ((q.a.x - p.a.x) * r.y - (q.a.y - p.a.y) * r.x) / den
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return { x: p.a.x + r.x * t, y: p.a.y + r.y * t }
}

function nearestWall(plan: Plan, p: Point, wallId?: string) {
  const own = wallId ? plan.walls.find((w) => w.id === wallId) : undefined
  if (own) return own
  let best: Wall | null = null
  let d = Infinity
  for (const w of plan.walls) {
    const pr = projectOnWall(p, w)
    if (pr.dist < d) {
      d = pr.dist
      best = w
    }
  }
  return best
}

function simplify(path: Point[]) {
  const out: Point[] = []
  for (const p of path) {
    const last = out.at(-1)
    if (last && Math.abs(last.x - p.x) < 1 && Math.abs(last.y - p.y) < 1) continue
    if (out.length >= 2) {
      const a = out[out.length - 2]
      const b = out[out.length - 1]
      const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
      if (Math.abs(cross) < 1e-3 * Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(p.x - a.x, p.y - a.y) + 1) out.pop()
    }
    out.push(p)
  }
  return out
}

export function autoRoute(plan: Plan, circuitId: string): ElectricRoute[] {
  const e = electricOf(plan)
  const panel = e.panel
  const terms = e.points.filter((p) => p.circuitId === circuitId)
  if (!panel || !terms.length) return []

  const g = makeGraph()
  const onWall = new Map<string, Point[]>(plan.walls.map((w) => [w.id, [w.a, w.b]]))
  for (const w of plan.walls) {
    for (const q of plan.walls) {
      if (q.id === w.id) continue
      for (const end of [q.a, q.b]) {
        const pr = projectOnWall(end, w)
        if (pr.dist <= w.thickness / 2 + q.thickness / 2 + 20) onWall.get(w.id)!.push(pr.point)
      }
      const x = axisCross(w, q)
      if (x) onWall.get(w.id)!.push(x)
    }
  }

  const attach = (p: Point & { wallId?: string }, mounted: boolean) => {
    const t = g.node(p)
    const w = nearestWall(plan, p, mounted ? p.wallId : undefined)
    if (!w) return t
    const pr = projectOnWall(p, w)
    onWall.get(w.id)!.push(pr.point)
    return { t, proj: pr.point }
  }

  const links: { t: number; proj: Point }[] = []
  const panelAt = attach({ x: panel.x, y: panel.y, wallId: panel.wallId }, true)
  const termAt = terms.map((p) => attach(p, isWallMounted(p.kind)))
  for (const a of [panelAt, ...termAt]) if (typeof a !== 'number') links.push(a)

  for (const w of plan.walls) {
    const pts = onWall.get(w.id)!
    const sorted = pts
      .map((p) => ({ p, t: projectOnWall(p, w).t }))
      .sort((a, b) => a.t - b.t)
      .map((x) => g.node(x.p))
    for (let i = 1; i < sorted.length; i++) g.link(sorted[i - 1], sorted[i])
  }
  for (const l of links) g.link(l.t, g.node(l.proj))

  const idx = (a: number | { t: number }) => (typeof a === 'number' ? a : a.t)
  const root = idx(panelAt)
  const tree = new Set<number>([root])
  const left = new Set(termAt.map(idx))
  left.delete(root)
  const routes: ElectricRoute[] = []

  while (left.size) {
    const n = g.nodes.length
    const dist = new Array<number>(n).fill(Infinity)
    const prev = new Array<number>(n).fill(-1)
    const done = new Array<boolean>(n).fill(false)
    for (const t of tree) dist[t] = 0
    for (;;) {
      let u = -1
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i
      if (u < 0) break
      done[u] = true
      if (left.has(u)) break
      for (const { to, w } of g.adj.get(u)!) {
        if (dist[u] + w < dist[to]) {
          dist[to] = dist[u] + w
          prev[to] = u
        }
      }
    }
    let target = -1
    for (const t of left) if (dist[t] < Infinity && (target < 0 || dist[t] < dist[target])) target = t
    if (target < 0) {
      const t = [...left][0]
      const from = [...tree].reduce((m, x) =>
        Math.abs(g.nodes[x].x - g.nodes[t].x) + Math.abs(g.nodes[x].y - g.nodes[t].y) <
        Math.abs(g.nodes[m].x - g.nodes[t].x) + Math.abs(g.nodes[m].y - g.nodes[t].y)
          ? x
          : m,
      )
      const a = g.nodes[from]
      const b = g.nodes[t]
      routes.push({ circuitId, path: simplify([a, { x: b.x, y: a.y }, b]) })
      tree.add(t)
      left.delete(t)
      continue
    }
    const chain: number[] = []
    for (let c = target; c >= 0; c = tree.has(c) ? -1 : prev[c]) chain.unshift(c)
    chain.forEach((c) => {
      tree.add(c)
      left.delete(c)
    })
    const path = simplify(chain.map((c) => g.nodes[c]))
    if (path.length >= 2) routes.push({ circuitId, path })
  }
  return routes
}
