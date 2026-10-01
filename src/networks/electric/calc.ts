import type { ElectricCircuit, ElectricPoint, ElectricPointKind, Plan, Point } from '../../model'
import { resolveFurniture } from '../../furniture/catalog'
import { detectRooms, pointInPolygon } from '../../stats/rooms'
import { fmtNum, t } from '../../i18n'
import {
  CABLE_RESERVE,
  PANEL_HEIGHT,
  PANEL_TAIL,
  ROUTE_BELOW_CEILING,
  cableLabel,
  ceilingOf,
  circuitKindLabel,
  defaultPower,
  electricOf,
  isSocket,
  kindLabel,
  parseCable,
  pathLength,
} from './model'

export type ElectricItemKind = 'cable' | 'device' | 'frame' | 'box' | 'breaker' | 'rcbo' | 'rcd' | 'main' | 'panel' | 'conduit'

export type ElectricSpec = {
  cores?: number
  section?: number
  rating?: number
  curve?: string
  poles?: number
  leakage?: number
  modules?: number
  diameter?: number
  device?: ElectricPointKind | 'relay'
}

export type ElectricItem = { key: string; kind: ElectricItemKind; name: string; qty: number; unit: 'm' | 'pcs'; spec?: ElectricSpec }

export type ElectricRef = { kind: 'point' | 'circuit' | 'panel'; id: string }

export type ElectricWarning = { text: string; level: 'error' | 'warn' | 'info'; ref?: ElectricRef }

export type CircuitCalc = {
  circuit: ElectricCircuit
  points: number
  loadW: number
  currentA: number
  horizontalMm: number
  dropsMm: number
  cableM: number
  routed: boolean
  maxBreaker: number | null
  dropPct: number | null
}

export type ElectricCalc = {
  circuits: CircuitCalc[]
  items: ElectricItem[]
  warnings: ElectricWarning[]
  modules: number
  panelSize: number
  totalLoadW: number
  cableByMark: { cable: string; m: number }[]
}

const MAX_BREAKER: Record<string, number> = { '1.5': 10, '2.5': 16, '4': 25, '6': 32, '10': 40, '16': 63 }
const RHO_CU = 0.0175
const PANEL_SIZES = [12, 18, 24, 36, 48, 54, 72, 96]
const DEVICE_BOXES: Record<ElectricPointKind, number> = {
  socket: 1,
  socket2: 2,
  socket_ip44: 1,
  power: 1,
  switch: 1,
  switch2: 1,
  light: 0,
  light_wall: 1,
  junction: 0,
  outdoor: 0,
}
const FRAMED = new Set<ElectricPointKind>(['socket', 'socket2', 'socket_ip44', 'switch', 'switch2'])
const DEVICE_NAMES = new Set<ElectricPointKind>(['socket', 'socket2', 'socket_ip44', 'power', 'switch', 'switch2', 'light', 'light_wall', 'junction', 'outdoor'])

export const pointPower = (p: ElectricPoint) => p.powerW ?? defaultPower[p.kind]

export function maxBreakerFor(cable: string) {
  const c = parseCable(cable)
  return c ? (MAX_BREAKER[String(c.section)] ?? null) : null
}

function mstManhattan(nodes: Point[]) {
  if (nodes.length < 2) return 0
  const inTree = [true, ...nodes.slice(1).map(() => false)]
  const best = nodes.map((p) => Math.abs(p.x - nodes[0].x) + Math.abs(p.y - nodes[0].y))
  let total = 0
  for (let k = 1; k < nodes.length; k++) {
    let u = -1
    for (let i = 0; i < nodes.length; i++) if (!inTree[i] && (u < 0 || best[i] < best[u])) u = i
    inTree[u] = true
    total += best[u]
    for (let i = 0; i < nodes.length; i++)
      if (!inTree[i]) best[i] = Math.min(best[i], Math.abs(nodes[i].x - nodes[u].x) + Math.abs(nodes[i].y - nodes[u].y))
  }
  return total
}

function distToRect(p: Point, f: { x: number; y: number; rotationDeg: number }, w: number, d: number) {
  const a = (-f.rotationDeg * Math.PI) / 180
  const lx = (p.x - f.x) * Math.cos(a) - (p.y - f.y) * Math.sin(a)
  const ly = (p.x - f.x) * Math.sin(a) + (p.y - f.y) * Math.cos(a)
  const dx = Math.max(0, Math.abs(lx) - w / 2)
  const dy = Math.max(0, Math.abs(ly) - d / 2)
  return Math.hypot(dx, dy)
}

export function computeElectric(plan: Plan): ElectricCalc {
  const e = electricOf(plan)
  const warnings: ElectricWarning[] = []
  const items = new Map<string, ElectricItem>()
  const add = (it: Omit<ElectricItem, 'qty'>, qty: number) => {
    if (qty <= 0) return
    const cur = items.get(it.key)
    items.set(it.key, { ...it, qty: (cur?.qty ?? 0) + qty })
  }
  const panel = e.panel
  const ceilingAt = (wallId?: string) => ceilingOf(plan, wallId)
  const routeLevel = (wallId?: string) => ceilingAt(wallId) - ROUTE_BELOW_CEILING

  const cableMm = new Map<string, number>()
  let modules = 0
  let threePhase = false

  const circuits: CircuitCalc[] = e.circuits.map((c) => {
    const pts = e.points.filter((p) => p.circuitId === c.id)
    const routes = (e.routes ?? []).filter((r) => r.circuitId === c.id)
    const routed = routes.length > 0
    const horizontalMm = routed
      ? routes.reduce((s, r) => s + pathLength(r.path), 0)
      : mstManhattan([...(panel ? [{ x: panel.x, y: panel.y }] : []), ...pts.map((p) => ({ x: p.x, y: p.y }))])
    const dropsMm =
      pts.reduce((s, p) => s + Math.abs(routeLevel(p.wallId) - Math.min(p.height, ceilingAt(p.wallId))), 0) +
      (panel ? Math.abs(routeLevel(panel.wallId) - PANEL_HEIGHT) : 0)
    const raw = horizontalMm + dropsMm + (pts.length ? PANEL_TAIL : 0)
    const cableM = pts.length ? Math.ceil((raw * (1 + CABLE_RESERVE)) / 1000) : 0
    const loadW = pts.reduce((s, p) => s + pointPower(p), 0)
    const cab = parseCable(c.cable)
    const three = !!cab && cab.cores >= 5
    if (three) threePhase = true
    const currentA = three ? loadW / (Math.sqrt(3) * 400 * 0.95) : loadW / 230
    const maxBreaker = maxBreakerFor(c.cable)
    const lengthM = raw / 1000
    const dropPct = cab ? (((three ? 1 : 2) * lengthM * currentA * RHO_CU) / cab.section / (three ? 400 : 230)) * 100 : null
    const ref: ElectricRef = { kind: 'circuit', id: c.id }

    cableMm.set(c.cable, (cableMm.get(c.cable) ?? 0) + (pts.length ? raw * (1 + CABLE_RESERVE) : 0))

    const poles = three ? 3 : 1
    const curve = c.breaker.curve ?? 'C'
    if (c.breaker.type === 'RCBO') {
      add({ key: `rcbo-${curve}${c.breaker.rating}-${poles}p`, kind: 'rcbo', name: t(three ? 'networks:electric.item.rcbo4p' : 'networks:electric.item.rcbo', { curve, rating: c.breaker.rating }), unit: 'pcs', spec: { rating: c.breaker.rating, curve, poles: three ? 4 : 2, leakage: 30 } }, 1)
      modules += three ? 4 : 2
    } else {
      add({ key: `mcb-${curve}${c.breaker.rating}-${poles}p`, kind: 'breaker', name: t('networks:electric.item.breaker', { curve, rating: c.breaker.rating, poles }), unit: 'pcs', spec: { rating: c.breaker.rating, curve, poles } }, 1)
      modules += poles
      if (c.breaker.type === 'RCD') {
        const r = c.breaker.rating <= 25 ? 25 : c.breaker.rating <= 40 ? 40 : 63
        add({ key: `rcd-${r}-${three ? 4 : 2}p`, kind: 'rcd', name: t('networks:electric.item.rcd', { rating: r, poles: three ? '4P' : '2P' }), unit: 'pcs', spec: { rating: r, poles: three ? 4 : 2, leakage: 30 } }, 1)
        modules += three ? 4 : 2
      }
    }

    const label = c.name || c.id
    if (!cab) warnings.push({ text: t('networks:electric.warn.cableUnknown', { label, cable: c.cable }), level: 'warn', ref })
    if (maxBreaker !== null && c.breaker.rating > maxBreaker)
      warnings.push({ text: t('networks:electric.warn.breakerOverCable', { label, rating: c.breaker.rating, cable: cableLabel(c.cable), max: maxBreaker }), level: 'error', ref })
    if (currentA > c.breaker.rating)
      warnings.push({ text: t('networks:electric.warn.overload', { label, load: fmtNum(Math.round(loadW), 0), current: fmtNum(currentA, 1, 1), rating: c.breaker.rating }), level: 'warn', ref })
    const wet = c.kind === 'wet' || c.kind === 'outdoor' || c.kind === 'garage' || pts.some((p) => p.kind === 'socket_ip44' || p.kind === 'outdoor')
    if (wet && c.breaker.type === 'MCB')
      warnings.push({ text: t('networks:electric.warn.wetNoRcd', { label, kind: circuitKindLabel(c.kind).toLowerCase() }), level: 'error', ref })
    else if (c.kind === 'socket' && c.breaker.type === 'MCB')
      warnings.push({ text: t('networks:electric.warn.socketRcd', { label }), level: 'info', ref })
    if (dropPct !== null && dropPct > 5)
      warnings.push({ text: t('networks:electric.warn.voltageDrop', { label, pct: fmtNum(dropPct, 1, 1) }), level: 'warn', ref })
    const sockets = pts.filter((p) => isSocket(p.kind) && p.kind !== 'power').reduce((s, p) => s + (p.kind === 'socket2' ? 2 : 1), 0)
    if (sockets > 10) warnings.push({ text: t('networks:electric.warn.tooManySockets', { label, sockets }), level: 'info', ref })
    if (pts.some((p) => p.kind === 'power') && pts.length > 1)
      warnings.push({ text: t('networks:electric.warn.powerSeparate', { label }), level: 'warn', ref })
    if (c.kind === 'light' && pts.some((p) => isSocket(p.kind)))
      warnings.push({ text: t('networks:electric.warn.lightWithSockets', { label }), level: 'warn', ref })
    if (!pts.length) warnings.push({ text: t('networks:electric.warn.emptyCircuit', { label }), level: 'info', ref })

    return { circuit: c, points: pts.length, loadW, currentA, horizontalMm, dropsMm, cableM, routed, maxBreaker, dropPct }
  })

  const rooms = detectRooms(plan).buildings.flatMap((b) => b.rooms)
  const wet = plan.furniture.filter((f) => f.type === 'bathtub' || f.type === 'shower')
  const known = new Set(e.circuits.map((c) => c.id))
  for (const p of e.points) {
    const ref: ElectricRef = { kind: 'point', id: p.id }
    const name = `${kindLabel(p.kind)} ${p.label ?? p.id}`
    add({ key: `dev-${p.kind}`, kind: 'device', name: DEVICE_NAMES.has(p.kind) ? t(`networks:electric.device.${p.kind}`) : kindLabel(p.kind), unit: 'pcs', spec: { device: p.kind } }, 1)
    if (FRAMED.has(p.kind))
      add(
        p.kind === 'socket_ip44'
          ? { key: 'frame-1-ip44', kind: 'frame', name: t('networks:electric.item.frameIp44'), unit: 'pcs', spec: { device: 'socket_ip44' } }
          : { key: 'frame-1', kind: 'frame', name: t('networks:electric.item.frame'), unit: 'pcs', spec: { device: 'socket' } },
        1,
      )
    add({ key: 'box-flush', kind: 'box', name: t('networks:electric.item.box'), unit: 'pcs' }, DEVICE_BOXES[p.kind])
    if (!p.circuitId) warnings.push({ text: t('networks:electric.warn.noCircuit', { name }), level: 'warn', ref })
    else if (!known.has(p.circuitId)) warnings.push({ text: t('networks:electric.warn.unknownCircuit', { name, id: p.circuitId }), level: 'error', ref })
    if (isSocket(p.kind) || p.kind === 'switch' || p.kind === 'switch2') {
      for (const f of wet) {
        const r = resolveFurniture(f)
        const d = distToRect(p, f, r.w, r.d)
        if (d <= 1)
          warnings.push({ text: t(f.type === 'bathtub' ? 'networks:electric.warn.zone01Bath' : 'networks:electric.warn.zone01Shower', { name }), level: 'error', ref })
        else if (d < 600 && isSocket(p.kind))
          warnings.push({ text: t(f.type === 'bathtub' ? 'networks:electric.warn.zone2Bath' : 'networks:electric.warn.zone2Shower', { name, d: fmtNum(Math.round(d), 0) }), level: 'error', ref })
      }
      const inBath = rooms.some((r) => r.kind === 'bath' && (pointInPolygon(p, r.clearPolygon) || nearPoly(p, r.clearPolygon, 30)))
      if (inBath && isSocket(p.kind) && p.kind !== 'socket_ip44' && p.kind !== 'outdoor')
        warnings.push({ text: t('networks:electric.warn.bathSocket', { name }), level: 'warn', ref })
      if (inBath && isSocket(p.kind) && p.circuitId) {
        const c = e.circuits.find((x) => x.id === p.circuitId)
        if (c && c.breaker.type === 'MCB') warnings.push({ text: t('networks:electric.warn.bathNoRcd', { name, circuit: c.name }), level: 'error', ref })
      }
    }
  }

  if (e.points.length && !panel) warnings.push({ text: t('networks:electric.warn.noPanel'), level: 'warn' })

  for (const [cable, mm] of cableMm) {
    if (mm <= 0) continue
    add({ key: `cable-${cable}`, kind: 'cable', name: t('networks:electric.item.cable', { cable: cableLabel(cable) }), unit: 'm', spec: { cores: parseCable(cable)?.cores, section: parseCable(cable)?.section } }, Math.ceil(mm / 1000))
  }
  const conduit = new Map<number, number>()
  for (const [cable, mm] of cableMm) {
    const c = parseCable(cable)
    const d = c && c.section >= 6 ? 25 : c && (c.section >= 4 || c.cores >= 5) ? 20 : 16
    conduit.set(d, (conduit.get(d) ?? 0) + mm)
  }
  for (const [d, mm] of conduit) {
    if (mm <= 0) continue
    add({ key: `conduit-${d}`, kind: 'conduit', name: t('networks:electric.item.conduit', { d }), unit: 'm', spec: { diameter: d } }, Math.ceil((mm - PANEL_TAIL * circuits.filter((c) => c.points).length) / 1000))
  }

  if (e.circuits.length) {
    add({ key: threePhase ? 'main-3p' : 'main-2p', kind: 'main', name: t(threePhase ? 'networks:electric.item.main3p' : 'networks:electric.item.main2p'), unit: 'pcs', spec: threePhase ? { rating: 32, curve: 'C', poles: 3 } : { rating: 40, curve: 'C', poles: 2 } }, 1)
    add({ key: 'relay-voltage', kind: 'main', name: t('networks:electric.item.relay'), unit: 'pcs', spec: { device: 'relay' } }, threePhase ? 0 : 1)
    modules += threePhase ? 3 : 4
  }
  const needed = Math.ceil(modules * 1.2)
  const panelSize = modules ? (PANEL_SIZES.find((s) => s >= needed) ?? PANEL_SIZES.at(-1)!) : 0
  if (panelSize) add({ key: `panel-${panelSize}`, kind: 'panel', name: t('networks:electric.item.panel', { modules: panelSize }), unit: 'pcs', spec: { modules: panelSize } }, 1)
  if (panel?.modules && panel.modules < modules)
    warnings.push({ text: t('networks:electric.warn.panelTooSmall', { modules: panel.modules, need: modules, size: panelSize }), level: 'error', ref: { kind: 'panel', id: panel.id } })

  const order: ElectricItemKind[] = ['cable', 'conduit', 'device', 'frame', 'box', 'panel', 'main', 'rcd', 'rcbo', 'breaker']
  const list = [...items.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.key.localeCompare(b.key))
  const rank = { error: 0, warn: 1, info: 2 }
  warnings.sort((a, b) => rank[a.level] - rank[b.level])

  return {
    circuits,
    items: list,
    warnings,
    modules,
    panelSize,
    totalLoadW: circuits.reduce((s, c) => s + c.loadW, 0),
    cableByMark: [...cableMm].filter(([, mm]) => mm > 0).map(([cable, mm]) => ({ cable, m: Math.ceil(mm / 1000) })),
  }
}

function nearPoly(p: Point, poly: Point[], tol: number) {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const l2 = dx * dx + dy * dy || 1
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
    if (Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t) <= tol) return true
  }
  return false
}
