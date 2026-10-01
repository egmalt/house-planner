import type { HeatingLoop, Plan } from '../../model'
import { detectRooms } from '../../stats/rooms'
import { fmtNum, t } from '../../i18n'
import { zoneAreaM2 } from './geometry'
import { LOOP_HARD_MAX_M, LOOP_MAX_M, PIPE_RESERVE, centroid, heatingOf, paramsOf, pathLength, zonesOf, type LoopZone } from './model'
import { classify, coverLabel, coverOf, heatRooms, lossNorm, roomOfPoint, type HeatRoom } from './rooms'

export type WarnLevel = 'error' | 'warn' | 'info'
export type HeatingWarning = { level: WarnLevel; text: string; loopId?: string }

export type LoopCalc = {
  loop: HeatingLoop
  roomName: string
  roomKey: string
  roomKeys: string[]
  cover: 'tile' | 'laminate'
  tInside: number
  areaM2: number
  coilM: number
  feedM: number
  lengthM: number
  qWm2: number
  powerW: number
  floorT: number
  capped: boolean
  flowLh: number
  flowLmin: number
  velocity: number
  dpKPa: number
  throttleKPa: number
}

export type RoomBalance = { key: string; name: string; areaM2: number; heatedM2: number; lossWm2: number; lossW: number; powerW: number; ok: boolean }

export type HeatingUnit = 'pcs' | 'm' | 'm2' | 'm3' | 'kg'

export type HeatingItem = { key: string; sub: string; name: string; qty: number; unit: HeatingUnit; spec?: Record<string, number | string> }

export type HeatingCalc = {
  loops: LoopCalc[]
  rooms: RoomBalance[]
  totals: {
    areaM2: number
    pipeM: number
    powerW: number
    lossW: number
    carrierW: number
    boilerKW: number
    flowLh: number
    maxDpKPa: number
    pumpKPa: number
    outputs: number
    screedM3: number
  }
  deltaT: number
  items: HeatingItem[]
  warnings: HeatingWarning[]
}

const K_H: Record<'tile' | 'laminate', Record<number, number>> = {
  tile: { 100: 6.7, 150: 5.9, 200: 5.2 },
  laminate: { 100: 4.2, 150: 3.8, 200: 3.4 },
}

const BOILERS = [9, 12, 14, 18, 24, 28, 32, 35, 40, 45, 50, 60]
const COLLECTORS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const DOWNWARD = 0.1
const WATER_NU = 0.66e-6
const WATER_RHO = 992
const LOCAL_LOSS = 1.3
const UNIT_KPA = 5

export const logMeanDT = (supply: number, ret: number, ti: number) => {
  if (ret <= ti || supply <= ret) return Math.max(0, (supply + ret) / 2 - ti)
  return (supply - ret) / Math.log((supply - ti) / (ret - ti))
}

export const maxFlux = (floorMax: number, ti: number) => 8.92 * Math.pow(Math.max(0, floorMax - ti), 1.1)

export function innerDiameterMm(pipe: string) {
  const m = /(\d{2})\s*[xх×*]\s*(\d(?:[.,]\d)?)/i.exec(pipe)
  if (!m) return 12
  return Number(m[1]) - 2 * Number(m[2].replace(',', '.'))
}

export function pressureDrop(lengthM: number, flowLh: number, dInnerMm: number) {
  const d = dInnerMm / 1000
  const v = flowLh / 3.6e6 / (Math.PI * (d / 2) ** 2)
  const re = (v * d) / WATER_NU
  const lambda = re < 1 ? 0 : re < 2300 ? 64 / re : 0.3164 / Math.pow(re, 0.25)
  const dp = ((lambda * lengthM) / d) * ((WATER_RHO * v * v) / 2) * LOCAL_LOSS
  return { v, dpKPa: dp / 1000 }
}

function ffd(lengths: number[], cap: number) {
  const bins: number[][] = []
  for (const l of [...lengths].sort((a, b) => b - a)) {
    const b = bins.find((x) => x.reduce((s, v) => s + v, 0) + l <= cap)
    if (b) b.push(l)
    else bins.push([l])
  }
  return bins
}

export function packCoils(lengths: number[]) {
  let c500 = 0
  let c200 = 0
  for (const bin of ffd(lengths, 500)) {
    const small = bin.every((l) => l <= 200) ? ffd(bin, 200).length : Infinity
    if (small * 200 < 500) c200 += small
    else c500 += 1
  }
  return { c500, c200 }
}

const r1 = (v: number) => Math.round(v * 10) / 10
const up = (v: number, d = 1) => Math.ceil(v * d) / d

function roomFor(rooms: HeatRoom[], zone: LoopZone) {
  return (zone.roomId ? rooms.find((r) => r.labelId === zone.roomId) : undefined) ?? roomOfPoint(rooms, centroid(zone.polygon))
}

export function computeHeating(plan: Plan): HeatingCalc {
  const h = heatingOf(plan)
  const p = paramsOf(h)
  const rooms = heatRooms(plan, detectRooms(plan))
  const warnings: HeatingWarning[] = []
  const deltaT = p.supplyT - p.returnT
  const screedCover = p.screedMm - 20
  const screedF = Math.max(0.8, Math.min(1.1, 1 - 0.004 * (screedCover - 45)))
  const dIn = (pipe: string) => innerDiameterMm(pipe)
  const active = h.loops.filter((l) => !l.off)
  const byRoom = new Map<string, RoomBalance>()

  const loops: LoopCalc[] = active.map((loop) => {
    const zones = zonesOf(loop).map((z, zi) => {
      const room = roomFor(rooms, z)
      const cls = room?.cls ?? classify(z.roomName ?? '')
      const cover = room?.cover ?? coverOf(cls)
      const ti = room?.tInside ?? (cls === 'wet' ? 24 : 20)
      const areaM2 = zoneAreaM2(z)
      const floorMax = p.floorT ?? (loop.edge ? 35 : cls === 'wet' ? 33 : 29)
      const raw = K_H[cover][loop.stepMm] * logMeanDT(p.supplyT, p.returnT, ti) * screedF
      const lim = maxFlux(floorMax, ti)
      const q = Math.min(raw, lim)
      const key = room?.labelId ?? room?.face.id ?? `loop:${loop.id}:${zi}`
      return { room, cover, ti, areaM2, q, capped: raw > lim, key, name: room?.name ?? z.roomName ?? loop.id }
    })
    const main = zones[0]
    const areaM2 = zones.reduce((s, z) => s + z.areaM2, 0)
    const powerW = zones.reduce((s, z) => s + z.q * z.areaM2, 0)
    const qWm2 = areaM2 ? powerW / areaM2 : 0
    const coilM = areaM2 / (loop.stepMm / 1000)
    const feedM = pathLength(loop.supplyPath) / 1000 + pathLength(loop.linkPath) / 1000
    const lengthM = (coilM + 2 * feedM) * (1 + PIPE_RESERVE)
    const flowLh = deltaT > 0 ? (0.86 * powerW * (1 + DOWNWARD)) / deltaT : 0
    const hyd = pressureDrop(lengthM, flowLh, dIn(loop.pipe))
    for (const z of zones) {
      const cur = byRoom.get(z.key)
      const w = z.q * z.areaM2
      if (cur) {
        cur.powerW += w
        cur.heatedM2 += z.areaM2
      } else {
        const lossWm2 = z.room?.lossWm2 ?? lossNorm(1)
        const roomArea = z.room?.face.areaM2 ?? z.areaM2
        byRoom.set(z.key, { key: z.key, name: z.name, areaM2: roomArea, heatedM2: z.areaM2, lossWm2, lossW: lossWm2 * roomArea, powerW: w, ok: true })
      }
    }
    return {
      loop,
      roomName: loop.roomName ?? main.name,
      roomKey: main.key,
      roomKeys: zones.map((z) => z.key),
      cover: main.cover,
      tInside: main.ti,
      areaM2,
      coilM,
      feedM,
      lengthM,
      qWm2,
      powerW,
      floorT: main.ti + Math.pow(main.q / 8.92, 1 / 1.1),
      capped: zones.some((z) => z.capped),
      flowLh,
      flowLmin: flowLh / 60,
      velocity: hyd.v,
      dpKPa: hyd.dpKPa,
      throttleKPa: 0,
    }
  })
  const maxDp = loops.reduce((m, l) => Math.max(m, l.dpKPa), 0)
  loops.forEach((l) => (l.throttleKPa = maxDp - l.dpKPa))

  const balance = [...byRoom.values()]
  balance.forEach((b) => (b.ok = b.powerW >= b.lossW * 0.95))

  for (const l of loops) {
    const room = l.roomName
    if (l.lengthM > LOOP_HARD_MAX_M) warnings.push({ level: 'error', text: t('networks:heating.warn.loopTooLong', { room, len: Math.round(l.lengthM), max: LOOP_HARD_MAX_M }), loopId: l.loop.id })
    else if (l.lengthM > LOOP_MAX_M) warnings.push({ level: 'warn', text: t('networks:heating.warn.loopLong', { room, len: Math.round(l.lengthM), max: LOOP_MAX_M }), loopId: l.loop.id })
    if (l.dpKPa > 20) warnings.push({ level: 'warn', text: t('networks:heating.warn.dpHigh', { room, dp: fmtNum(r1(l.dpKPa), 1) }), loopId: l.loop.id })
    if (!l.loop.supplyPath?.length) warnings.push({ level: 'info', text: t('networks:heating.warn.noFeed', { room }), loopId: l.loop.id })
  }
  for (const b of balance)
    if (!b.ok)
      warnings.push({
        level: 'warn',
        text: t(loops.some((l) => l.roomKeys.includes(b.key) && l.capped) ? 'networks:heating.warn.roomShortCapped' : 'networks:heating.warn.roomShort', { room: b.name, power: Math.round(b.powerW), loss: Math.round(b.lossW), lossWm2: b.lossWm2 }),
        loopId: loops.find((l) => l.roomKeys.includes(b.key))?.loop.id,
      })

  const heatedRooms = rooms.filter((r) => r.cls !== 'skip' && balance.some((b) => b.key === (r.labelId ?? r.face.id)))
  const lossW = balance.reduce((s, b) => s + b.lossW, 0)
  const powerW = loops.reduce((s, l) => s + l.powerW, 0)
  const carrierW = powerW * (1 + DOWNWARD)
  const boilerNeed = (Math.max(lossW, 0) * 1.2) / 1000
  const boilerKW = BOILERS.find((b) => b >= boilerNeed) ?? Math.ceil(boilerNeed)
  const flowLh = loops.reduce((s, l) => s + l.flowLh, 0)
  const outputs = Math.max(h.collector?.outputs ?? 0, loops.length)
  if (deltaT <= 0) warnings.push({ level: 'error', text: t('networks:heating.warn.returnNotBelow') })
  if (p.supplyT > 55) warnings.push({ level: 'warn', text: t('networks:heating.warn.supplyHigh', { t: p.supplyT }) })
  const insMm = Number(/(\d{2,3})/.exec(p.insulation)?.[1] ?? 0)
  if (loops.length && insMm && insMm < 100) warnings.push({ level: 'error', text: t('networks:heating.warn.insulationThin', { mm: insMm }) })
  if (loops.length && !h.collector) warnings.push({ level: 'warn', text: t('networks:heating.warn.noCollector') })
  if (h.collector && h.collector.outputs < loops.length) warnings.push({ level: 'error', text: t('networks:heating.warn.collectorOutputs', { outputs: h.collector.outputs, loops: loops.length }) })
  if (loops.length > 12) warnings.push({ level: 'warn', text: t('networks:heating.warn.tooManyLoops', { count: loops.length }) })

  const heatedM2 = heatedRooms.reduce((s, r) => s + r.face.areaM2, 0) || loops.reduce((s, l) => s + l.areaM2, 0)
  const perimeterM = heatedRooms.reduce((s, r) => s + r.face.clearPolygon.reduce((a, q, i, arr) => a + Math.hypot(arr[(i + 1) % arr.length].x - q.x, arr[(i + 1) % arr.length].y - q.y), 0), 0) / 1000
  const screedM3 = (heatedM2 * p.screedMm) / 1000

  const items: HeatingItem[] = []
  if (loops.length) {
    const pipes = new Map<string, number[]>()
    for (const l of loops) pipes.set(l.loop.pipe, [...(pipes.get(l.loop.pipe) ?? []), l.lengthM])
    for (const [pipe, lens] of pipes) {
      const k = pipe.replace(/\s+/g, '-').replace(/[×х]/g, 'x').toLowerCase()
      const { c500, c200 } = packCoils(lens)
      const total = Math.round(lens.reduce((s, v) => s + v, 0))
      if (c500) items.push({ key: `pipe-${k}-500`, sub: 'pipe', name: t('networks:heating.item.pipe500', { pipe, total }), qty: c500, unit: 'pcs', spec: { coil: 500, pipe } })
      if (c200) items.push({ key: `pipe-${k}-200`, sub: 'pipe', name: t(c500 ? 'networks:heating.item.pipe200' : 'networks:heating.item.pipe200Total', { pipe, total }), qty: c200, unit: 'pcs', spec: { coil: 200, pipe } })
    }
    const collectors = outputs > 12 ? [Math.ceil(outputs / 2), Math.floor(outputs / 2)] : [outputs]
    for (const n0 of collectors) {
      const n = COLLECTORS.find((c) => c >= n0) ?? n0
      items.push({ key: `collector-${n}`, sub: 'collector', name: t('networks:heating.item.collector', { n }), qty: 1, unit: 'pcs', spec: { outputs: n } })
    }
    items.push({ key: 'mixing-unit', sub: 'mixing', name: t('networks:heating.item.mixing'), qty: 1, unit: 'pcs' })
    items.push({ key: 'pump-25-60', sub: 'pump', name: t('networks:heating.item.pump', { head: fmtNum(r1((maxDp + UNIT_KPA) / 9.81), 1) }), qty: 1, unit: 'pcs', spec: { headM: r1((maxDp + UNIT_KPA) / 9.81) } })
    for (const n0 of collectors) {
      const n = COLLECTORS.find((c) => c >= n0) ?? n0
      items.push({ key: `cabinet-${n}`, sub: 'cabinet', name: t('networks:heating.item.cabinet', { n }), qty: 1, unit: 'pcs', spec: { outputs: n } })
    }
    items.push({ key: 'eurocone-16', sub: 'eurocone', name: t('networks:heating.item.eurocone'), qty: loops.length * 2, unit: 'pcs' })
    items.push({ key: 'damper-tape', sub: 'damper', name: t('networks:heating.item.damper'), qty: Math.ceil(perimeterM * 1.1), unit: 'm' })
    items.push({ key: `insulation-${p.insulation.replace(/\s+/g, '-').toLowerCase()}`, sub: 'insulation', name: t('networks:heating.item.insulation', { insulation: p.insulation }), qty: up(heatedM2 * 1.05), unit: 'm2', spec: { insulation: p.insulation } })
    items.push({ key: 'film', sub: 'film', name: t('networks:heating.item.film'), qty: up(heatedM2 * 1.15), unit: 'm2', spec: { thickness: 0.2 } })
    const pipeM = loops.reduce((s, l) => s + l.lengthM, 0)
    if (p.fixing === 'staples') items.push({ key: 'staples', sub: 'staples', name: t('networks:heating.item.staples'), qty: Math.ceil(pipeM / 0.4 / 100) * 100, unit: 'pcs' })
    else items.push({ key: 'mesh', sub: 'mesh', name: t('networks:heating.item.mesh'), qty: up(heatedM2 * 1.1), unit: 'm2' })
    if (p.fixing !== 'staples') items.push({ key: 'ties', sub: 'ties', name: t('networks:heating.item.ties'), qty: Math.ceil(pipeM / 0.4 / 100) * 100, unit: 'pcs' })
    if (p.screedMix === 'cps') items.push({ key: 'cps', sub: 'cps', name: t('networks:heating.item.cps', { mm: p.screedMm, m3: fmtNum(r1(screedM3), 1) }), qty: Math.ceil(screedM3 * 2000), unit: 'kg' })
    else {
      items.push({ key: 'cement-m500', sub: 'cement', name: t('networks:heating.item.cement', { mm: p.screedMm, m3: fmtNum(r1(screedM3), 1) }), qty: Math.ceil(screedM3 * 400), unit: 'kg' })
      items.push({ key: 'sand', sub: 'sand', name: t('networks:heating.item.sand'), qty: Math.ceil(screedM3 * 1200 * 1.05), unit: 'kg' })
    }
    items.push({ key: 'fiber', sub: 'fiber', name: t('networks:heating.item.fiber'), qty: up(screedM3 * 0.9, 10), unit: 'kg' })
  }

  return {
    loops,
    rooms: balance,
    totals: {
      areaM2: loops.reduce((s, l) => s + l.areaM2, 0),
      pipeM: loops.reduce((s, l) => s + l.lengthM, 0),
      powerW,
      lossW,
      carrierW,
      boilerKW,
      flowLh,
      maxDpKPa: maxDp,
      pumpKPa: maxDp + UNIT_KPA,
      outputs,
      screedM3,
    },
    deltaT,
    items,
    warnings,
  }
}

export { coverLabel }
