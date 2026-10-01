import { CHAIR, diningLayout } from './layout'

export type StrokeKind = 'main' | 'thin' | 'none'
export type FillKind = 'paper' | 'tone' | 'dark' | 'water' | 'none'

type Style = { s?: StrokeKind; f?: FillKind; dash?: boolean }

export type Prim =
  | ({ k: 'rect'; x: number; y: number; w: number; h: number; r?: number } & Style)
  | ({ k: 'circle'; cx: number; cy: number; r: number } & Style)
  | ({ k: 'ellipse'; cx: number; cy: number; rx: number; ry: number } & Style)
  | ({ k: 'line'; p: number[]; closed?: boolean } & Style)
  | ({ k: 'path'; d: string } & Style)
  | { k: 'group'; x: number; y: number; rot: number; items: Prim[] }

export const SYMBOL_STYLE = {
  ink: '#2b2d33',
  thin: '#6f737b',
  paper: '#ffffff',
  tone: '#ecebe6',
  dark: '#474a52',
  water: '#eef4f7',
  main: 1.1,
  thinWidth: 0.7,
  dash: [5, 3],
}

const rect = (x: number, y: number, w: number, h: number, o: Style & { r?: number } = {}): Prim => ({ k: 'rect', x, y, w, h, ...o })
const circle = (cx: number, cy: number, r: number, o: Style = {}): Prim => ({ k: 'circle', cx, cy, r, ...o })
const ellipse = (cx: number, cy: number, rx: number, ry: number, o: Style = {}): Prim => ({ k: 'ellipse', cx, cy, rx, ry, ...o })
const line = (p: number[], o: Style & { closed?: boolean } = {}): Prim => ({ k: 'line', p, s: 'thin', f: 'none', ...o })
const path = (d: string, o: Style = {}): Prim => ({ k: 'path', d, ...o })
const group = (x: number, y: number, rot: number, items: Prim[]): Prim => ({ k: 'group', x, y, rot, items })

const n = (v: number) => Math.round(v * 10) / 10

function hatch(x0: number, y0: number, w: number, h: number, step: number): Prim[] {
  const out: Prim[] = []
  const start = x0 + y0 + step
  const end = x0 + w + y0 + h
  for (let k = start; k < end; k += step) {
    const xa = Math.max(x0, k - (y0 + h))
    const xb = Math.min(x0 + w, k - y0)
    if (xb - xa < 1) continue
    out.push(line([xa, k - xa, xb, k - xb]))
  }
  return out
}

function bed(w: number, d: number, pillows: number): Prim[] {
  const x0 = -w / 2
  const y0 = -d / 2
  const y1 = d / 2
  const head = 70
  const m = 45
  const mx0 = x0 + m
  const mw = w - 2 * m
  const gap = 70
  const pw = (mw - gap * (pillows + 1)) / pillows
  const ph = Math.min(380, d * 0.19)
  const py = y0 + head + 70
  const by = py + ph + 90
  const bx0 = mx0 - 12
  const bx1 = x0 + w - m + 12
  const by1 = y1 - m + 12
  const fold = Math.min(360, mw * 0.36)
  const items: Prim[] = [
    rect(x0, y0, w, d, { r: 30 }),
    rect(x0, y0, w, head, { r: 20, f: 'tone' }),
    rect(mx0, y0 + head, mw, d - head - m, { r: 40, s: 'thin' }),
  ]
  for (let i = 0; i < pillows; i++) {
    items.push(rect(mx0 + gap + i * (pw + gap), py, pw, ph, { r: 90, s: 'thin' }))
  }
  items.push(
    path(`M${n(bx0)} ${n(by)} L${n(bx1)} ${n(by)} L${n(bx1)} ${n(by1 - fold)} L${n(bx1 - fold)} ${n(by1)} L${n(bx0)} ${n(by1)} Z`),
    line([bx0, by + 230, bx1, by + 230]),
    path(`M${n(bx1)} ${n(by1 - fold)} L${n(bx1 - fold)} ${n(by1)} L${n(bx1 - fold)} ${n(by1 - fold)} Z`, { s: 'thin', f: 'tone' }),
  )
  return items
}

function cabinetDoors(w: number, d: number, sliding: boolean): Prim[] {
  const x0 = -w / 2
  const y0 = -d / 2
  const y1 = d / 2
  const items: Prim[] = [rect(x0, y0, w, d, { r: 10 })]
  const rodY = y0 + (d - 60) / 2
  items.push(line([x0 + 40, rodY, x0 + w - 40, rodY]))
  const step = 110
  for (let x = x0 + 90; x < x0 + w - 60; x += step) {
    const half = (d - 150) / 2
    items.push(line([x - half * 0.3, rodY - half, x + half * 0.3, rodY + half]))
  }
  if (sliding) {
    const half = w / 2
    items.push(line([x0 + 20, y1 - 55, x0 + half + 40, y1 - 55], { s: 'main' }))
    items.push(line([x0 + half - 40, y1 - 28, x0 + w - 20, y1 - 28], { s: 'main' }))
  } else {
    const doors = Math.max(1, Math.round(w / 500))
    items.push(line([x0, y1 - 30, x0 + w, y1 - 30]))
    for (let i = 1; i < doors; i++) items.push(line([x0 + (w / doors) * i, y1 - 30, x0 + (w / doors) * i, y1]))
  }
  return items
}

function sofaPieces(x0: number, y0: number, w: number, d: number, back: number, arm: number): Prim[] {
  const items: Prim[] = [
    rect(x0, y0, w, back, { r: 50 }),
    rect(x0, y0, arm, d, { r: 50 }),
    rect(x0 + w - arm, y0, arm, d, { r: 50 }),
  ]
  const seatW = w - 2 * arm
  const count = Math.max(1, Math.round(seatW / 700))
  const cw = seatW / count
  for (let i = 0; i < count; i++) {
    items.push(rect(x0 + arm + i * cw + 8, y0 + back + 8, cw - 16, d - back - 16, { r: 45, s: 'thin' }))
  }
  return items
}

function sofa(w: number, d: number): Prim[] {
  const back = Math.min(230, d * 0.26)
  const arm = Math.min(220, w * 0.12)
  return sofaPieces(-w / 2, -d / 2, w, d, back, arm)
}

function sofaCorner(w: number, d: number): Prim[] {
  const x0 = -w / 2
  const y0 = -d / 2
  const x1 = w / 2
  const y1 = d / 2
  const back = 230
  const arm = 200
  const seat = Math.min(980, d * 0.6, w * 0.4)
  const items: Prim[] = [
    rect(x0, y0, w, back, { r: 50 }),
    rect(x1 - back, y0, back, d, { r: 50 }),
    rect(x0, y0, arm, seat, { r: 50 }),
    rect(x1 - seat, y1 - arm, seat, arm, { r: 50 }),
  ]
  const mainW = x1 - seat - (x0 + arm)
  const count = Math.max(1, Math.round(mainW / 700))
  const cw = mainW / count
  for (let i = 0; i < count; i++) {
    items.push(rect(x0 + arm + i * cw + 8, y0 + back + 8, cw - 16, seat - back - 16, { r: 45, s: 'thin' }))
  }
  items.push(rect(x1 - seat + 8, y0 + back + 8, seat - back - 16, seat - back - 16, { r: 45, s: 'thin' }))
  items.push(rect(x1 - seat + 8, y0 + seat + 8, seat - back - 16, y1 - arm - (y0 + seat) - 16, { r: 45, s: 'thin' }))
  return items
}

function chair(w: number, d: number): Prim[] {
  const x0 = -w / 2
  const y0 = -d / 2
  return [
    rect(x0 + 15, y0 + 60, w - 30, d - 60, { r: 50 }),
    rect(x0, y0, w, 100, { r: 40, f: 'tone' }),
  ]
}

function dining(type: string, w: number, d: number): Prim[] {
  const lay = diningLayout(type, w, d)
  const items: Prim[] = lay.seats.map((s) => group(s.x, s.y, s.rot, chair(CHAIR.w, CHAIR.d)))
  if (lay.round) {
    items.push(circle(0, 0, lay.table.w / 2))
    items.push(circle(0, 0, lay.table.w / 2 - 40, { s: 'thin', f: 'none' }))
  } else {
    items.push(rect(-lay.table.w / 2, -lay.table.d / 2, lay.table.w, lay.table.d, { r: 25 }))
    items.push(rect(-lay.table.w / 2 + 40, -lay.table.d / 2 + 40, lay.table.w - 80, lay.table.d - 80, { r: 10, s: 'thin', f: 'none' }))
  }
  return items
}

function kitchenBase(w: number, d: number, handle: 'door' | 'drawer'): Prim[] {
  const x0 = -w / 2
  const y0 = -d / 2
  const y1 = d / 2
  const items: Prim[] = [rect(x0, y0, w, d), line([x0, y1 - 40, x0 + w, y1 - 40], { dash: true })]
  if (handle === 'door') items.push(line([x0 + w - 70, y1 - 20, x0 + w - 70, y1 - 60], { s: 'main' }))
  else items.push(line([-Math.min(120, w * 0.2), y1 - 20, Math.min(120, w * 0.2), y1 - 20], { s: 'main' }))
  return items
}

function kitchenCorner(w: number, d: number): Prim[] {
  const x0 = -w / 2
  const y0 = -d / 2
  const x1 = w / 2
  const y1 = d / 2
  const cd = Math.min(600, w - 200, d - 200)
  return [
    rect(x0, y0, w, d),
    line([x1, y0 + cd - 40, x0 + cd - 40, y0 + cd - 40, x0 + cd - 40, y1], { dash: true }),
  ]
}

function stove(w: number, d: number): Prim[] {
  const x0 = -w / 2
  const y0 = -d / 2
  const y1 = d / 2
  const qx = w / 4
  const qy = (d - 90) / 4
  const cy = y0 + (d - 90) / 2
  const big = Math.min(qx, qy) * 0.78
  const small = big * 0.72
  const items: Prim[] = [rect(x0, y0, w, d), line([x0, y1 - 90, x0 + w, y1 - 90])]
  const burners: [number, number, number][] = [
    [-qx, cy - qy, small],
    [qx, cy - qy, big],
    [-qx, cy + qy, big],
    [qx, cy + qy, small],
  ]
  for (const [bx, by, r] of burners) {
    items.push(circle(bx, by, r, { s: 'main', f: 'none' }))
    items.push(circle(bx, by, r * 0.55, { s: 'thin', f: 'none' }))
  }
  for (let i = 0; i < 4; i++) items.push(circle(x0 + (w / 5) * (i + 1), y1 - 45, 16, { s: 'thin', f: 'paper' }))
  return items
}

function kitchenSink(w: number, d: number): Prim[] {
  const x0 = -w / 2
  const y0 = -d / 2
  const items: Prim[] = [rect(x0, y0, w, d), line([x0, d / 2 - 40, x0 + w, d / 2 - 40], { dash: true })]
  const drainer = w >= 750
  const bw = drainer ? Math.min(450, w * 0.55) : w - 140
  const bx = drainer ? x0 + 70 : x0 + 70
  const by = y0 + 110
  const bh = d - 230
  items.push(rect(bx, by, bw, bh, { r: 60, f: 'water' }))
  items.push(circle(bx + bw / 2, by + bh / 2 + 20, 28, { s: 'thin', f: 'none' }))
  items.push(circle(bx + bw / 2, y0 + 55, 22, { s: 'thin', f: 'paper' }))
  items.push(line([bx + bw / 2, y0 + 55, bx + bw / 2, by + 60], { s: 'main' }))
  if (drainer) {
    const dx0 = bx + bw + 50
    const dx1 = x0 + w - 60
    items.push(rect(dx0, by, dx1 - dx0, bh, { r: 30, s: 'thin', f: 'none' }))
    for (let y = by + 60; y < by + bh - 30; y += 60) items.push(line([dx0 + 40, y, dx1 - 40, y]))
  }
  return items
}

function toilet(w: number, d: number): Prim[] {
  const x0 = -w / 2
  const y0 = -d / 2
  const y1 = d / 2
  const tank = Math.min(190, d * 0.28)
  const top = y0 + tank - 20
  const rx = w * 0.46
  const len = y1 - top
  const bowl = (s: number, dy: number) => {
    const r = rx * s
    const t = top + dy
    const b = y1 - (1 - s) * len * 0.35
    const l = b - t
    return `M${n(-r)} ${n(t)} L${n(r)} ${n(t)} C${n(r)} ${n(t + l * 0.6)} ${n(r * 0.7)} ${n(b)} 0 ${n(b)} C${n(-r * 0.7)} ${n(b)} ${n(-r)} ${n(t + l * 0.6)} ${n(-r)} ${n(t)} Z`
  }
  return [
    path(bowl(1, 0)),
    path(bowl(0.66, len * 0.22), { s: 'thin', f: 'water' }),
    rect(x0, y0, w, tank, { r: 30 }),
    rect(-w * 0.12, y0 + tank * 0.35, w * 0.24, tank * 0.3, { r: 12, s: 'thin', f: 'none' }),
  ]
}

function washbasin(w: number, d: number): Prim[] {
  const x0 = -w / 2
  const y0 = -d / 2
  const y1 = d / 2
  const x1 = w / 2
  const shoulder = y0 + d * 0.3
  const outer = `M${n(x0)} ${n(y0)} L${n(x1)} ${n(y0)} L${n(x1)} ${n(shoulder)} C${n(x1)} ${n(y1)} ${n(x1 * 0.55)} ${n(y1)} 0 ${n(y1)} C${n(x0 * 0.55)} ${n(y1)} ${n(x0)} ${n(y1)} ${n(x0)} ${n(shoulder)} Z`
  return [
    path(outer),
    ellipse(0, y0 + d * 0.56, w * 0.36, d * 0.3, { s: 'thin', f: 'water' }),
    circle(0, y0 + d * 0.6, 22, { s: 'thin', f: 'none' }),
    circle(0, y0 + 55, 20, { s: 'thin', f: 'paper' }),
    line([0, y0 + 55, 0, y0 + d * 0.3], { s: 'main' }),
  ]
}

function vanity(w: number, d: number): Prim[] {
  const x0 = -w / 2
  const y0 = -d / 2
  const bw = Math.min(w - 160, 520)
  const bh = d - 170
  return [
    rect(x0, y0, w, d, { r: 12 }),
    line([x0, d / 2 - 30, x0 + w, d / 2 - 30], { dash: true }),
    rect(-bw / 2, y0 + 110, bw, bh, { r: Math.min(bw, bh) * 0.4, s: 'thin', f: 'water' }),
    circle(0, y0 + 110 + bh / 2 + 15, 22, { s: 'thin', f: 'none' }),
    circle(0, y0 + 55, 20, { s: 'thin', f: 'paper' }),
    line([0, y0 + 55, 0, y0 + 120], { s: 'main' }),
  ]
}

function bathtub(w: number, d: number): Prim[] {
  const x0 = -w / 2
  const y0 = -d / 2
  const m = 70
  return [
    rect(x0, y0, w, d, { r: 40 }),
    rect(x0 + m, y0 + m, w - 2 * m, d - 2 * m, { r: Math.min(220, (d - 2 * m) / 2), s: 'thin', f: 'water' }),
    circle(x0 + m + 150, 0, 25, { s: 'thin', f: 'none' }),
    rect(x0 + 18, -60, 40, 120, { r: 12, s: 'thin', f: 'paper' }),
  ]
}

function shower(w: number, d: number): Prim[] {
  const x0 = -w / 2
  const y0 = -d / 2
  const m = 45
  const ix0 = x0 + m
  const iy0 = y0 + m
  const iw = w - 2 * m
  const ih = d - 2 * m
  return [
    rect(x0, y0, w, d, { r: 10 }),
    rect(ix0, iy0, iw, ih, { r: 30, s: 'thin', f: 'water' }),
    line([ix0 + 20, iy0 + 20, ix0 + iw - 20, iy0 + ih - 20]),
    line([ix0 + iw - 20, iy0 + 20, ix0 + 20, iy0 + ih - 20]),
    circle(0, 0, 45, { s: 'thin', f: 'paper' }),
    circle(0, 0, 20, { s: 'thin', f: 'none' }),
  ]
}

function washer(w: number, d: number): Prim[] {
  const x0 = -w / 2
  const y0 = -d / 2
  const r = Math.min(w, d - 110) * 0.36
  const cy = y0 + 110 + (d - 110) / 2
  return [
    rect(x0, y0, w, d, { r: 25 }),
    line([x0, y0 + 110, x0 + w, y0 + 110]),
    rect(x0 + 40, y0 + 30, w * 0.3, 55, { r: 8, s: 'thin', f: 'none' }),
    circle(x0 + w - 90, y0 + 57, 22, { s: 'thin', f: 'none' }),
    circle(0, cy, r, { s: 'main', f: 'none' }),
    circle(0, cy, r * 0.72, { s: 'thin', f: 'water' }),
  ]
}

function waterHeater(w: number, d: number): Prim[] {
  const r = Math.min(w, d) / 2
  const cy = d / 2 - r
  return [
    line([-r * 0.35, -d / 2, -r * 0.35, cy], { s: 'main' }),
    line([r * 0.35, -d / 2, r * 0.35, cy], { s: 'main' }),
    circle(0, cy, r),
    circle(0, cy, r * 0.8, { s: 'thin', f: 'none' }),
    rect(-r * 0.3, cy + r * 0.25, r * 0.6, r * 0.28, { r: 10, s: 'thin', f: 'none' }),
  ]
}

function coatRack(w: number, d: number): Prim[] {
  const x0 = -w / 2
  const y0 = -d / 2
  const items: Prim[] = [rect(x0, y0, w, d, { f: 'none', dash: true }), rect(x0, y0, w, 40, { f: 'tone' })]
  const coats = Math.max(1, Math.floor((w - 40) / 330))
  const step = (w - 40) / coats
  for (let i = 0; i < coats; i++) {
    const x = x0 + 20 + step * (i + 0.5)
    const cw = Math.min(300, step - 30)
    items.push(rect(x - cw / 2, y0 + 70, cw, d - 110, { r: 70, s: 'thin', f: 'paper' }))
    items.push(line([x - cw * 0.32, y0 + 95, x + cw * 0.32, y0 + 95], { s: 'main' }))
    items.push(circle(x, y0 + 60, 14, { s: 'thin', f: 'tone' }))
  }
  return items
}

function shoeCabinet(w: number, d: number): Prim[] {
  const x0 = -w / 2
  const y0 = -d / 2
  const y1 = d / 2
  const items: Prim[] = [rect(x0, y0, w, d, { r: 8 }), line([x0, y1 - 30, x0 + w, y1 - 30])]
  const pairs = Math.max(1, Math.floor((w - 60) / 260))
  const pw = (w - 60) / pairs
  for (let i = 0; i < pairs; i++) {
    const cx = x0 + 30 + pw * (i + 0.5)
    const sy = y0 + 40
    const sh = d - 110
    items.push(ellipse(cx - 55, sy + sh / 2, 42, sh / 2, { s: 'thin', f: 'none' }))
    items.push(ellipse(cx + 55, sy + sh / 2, 42, sh / 2, { s: 'thin', f: 'none' }))
  }
  return items
}

function desk(w: number, d: number): Prim[] {
  const x0 = -w / 2
  const y0 = -d / 2
  const y1 = d / 2
  const mw = Math.min(600, w * 0.45)
  const kw = Math.min(440, w * 0.36)
  return [
    rect(x0, y0, w, d, { r: 10 }),
    rect(-mw / 2, y0 + 90, mw, 36, { r: 8, s: 'thin', f: 'dark' }),
    rect(-70, y0 + 126, 140, 60, { r: 10, s: 'thin', f: 'none' }),
    rect(-kw / 2, y1 - 230, kw, 140, { r: 12, s: 'thin', f: 'none' }),
    ellipse(kw / 2 + 110, y1 - 160, 34, 52, { s: 'thin', f: 'none' }),
  ]
}

function officeChair(w: number, d: number): Prim[] {
  const r = Math.min(w, d) / 2 - 25
  const items: Prim[] = []
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    items.push(line([0, 0, x, y], { s: 'main' }))
    items.push(circle(x, y, 24, { s: 'thin', f: 'paper' }))
  }
  const sw = w * 0.74
  const sd = d * 0.64
  items.push(rect(-sw / 2, -sd / 2 + 30, sw, sd, { r: 90 }))
  items.push(path(`M${n(-sw / 2 - 10)} ${n(-sd / 2 + 60)} Q0 ${n(-d / 2 - 40)} ${n(sw / 2 + 10)} ${n(-sd / 2 + 60)} L${n(sw / 2 - 20)} ${n(-sd / 2 + 100)} Q0 ${n(-d / 2 + 20)} ${n(-sw / 2 + 20)} ${n(-sd / 2 + 100)} Z`, { f: 'tone' }))
  return items
}

function fireplace(w: number, d: number): Prim[] {
  const x0 = -w / 2
  const y0 = -d / 2
  const y1 = d / 2
  const fw = w * 0.56
  const fd = d * 0.55
  return [
    rect(x0, y0, w, d),
    ...hatch(x0, y0, w, d, 70),
    path(`M${n(-fw / 2)} ${n(y1)} L${n(-fw * 0.34)} ${n(y1 - fd)} L${n(fw * 0.34)} ${n(y1 - fd)} L${n(fw / 2)} ${n(y1)} Z`, { f: 'tone' }),
    rect(x0, y0, w, d, { f: 'none' }),
  ]
}

function masonryStove(w: number, d: number): Prim[] {
  const x0 = -w / 2
  const y0 = -d / 2
  const y1 = d / 2
  const fw = Math.min(420, w * 0.4)
  const cw = Math.min(270, w * 0.25)
  return [
    rect(x0, y0, w, d),
    ...hatch(x0, y0, w, d, 90),
    rect(-fw / 2, y1 - 120 - d * 0.35, fw, d * 0.35 + 120, { f: 'tone' }),
    line([-fw / 2 - 40, y1, fw / 2 + 40, y1], { s: 'main' }),
    rect(x0 + w - cw - 90, y0 + 90, cw, cw, { f: 'paper' }),
    line([x0 + w - cw - 90, y0 + 90, x0 + w - 90, y0 + 90 + cw]),
    line([x0 + w - 90, y0 + 90, x0 + w - cw - 90, y0 + 90 + cw]),
    rect(x0, y0, w, d, { f: 'none' }),
  ]
}

function gasBoiler(w: number, d: number): Prim[] {
  const x0 = -w / 2
  const y0 = -d / 2
  const r = Math.min(w, d) * 0.22
  return [
    rect(x0, y0, w, d, { r: 25 }),
    rect(x0 + 35, y0 + 35, w - 70, d - 70, { r: 18, s: 'thin', f: 'none' }),
    circle(0, 0, r, { s: 'thin', f: 'none' }),
    circle(0, 0, r * 0.45, { s: 'thin', f: 'tone' }),
  ]
}

function floorBoiler(w: number, d: number): Prim[] {
  const x0 = -w / 2
  const y0 = -d / 2
  const y1 = d / 2
  return [
    rect(x0, y0, w, d, { r: 20 }),
    line([x0, y1 - 40, x0 + w, y1 - 40]),
    circle(0, y0 + 150, 75, { s: 'main', f: 'tone' }),
    circle(0, y0 + 150, 45, { s: 'thin', f: 'none' }),
    rect(-w * 0.3, y1 - 200, w * 0.6, 110, { r: 10, s: 'thin', f: 'none' }),
  ]
}

function nightstand(w: number, d: number): Prim[] {
  return [
    rect(-w / 2, -d / 2, w, d, { r: 12 }),
    line([-w / 2, d / 2 - 25, w / 2, d / 2 - 25]),
    circle(0, -15, Math.min(w, d) * 0.24, { s: 'thin', f: 'none' }),
    circle(0, -15, Math.min(w, d) * 0.07, { s: 'thin', f: 'tone' }),
  ]
}

function dresser(w: number, d: number): Prim[] {
  const x0 = -w / 2
  const y1 = d / 2
  const items: Prim[] = [rect(x0, -d / 2, w, d, { r: 10 }), line([x0, y1 - 30, x0 + w, y1 - 30])]
  const cols = Math.max(1, Math.round(w / 500))
  for (let i = 1; i < cols; i++) items.push(line([x0 + (w / cols) * i, y1 - 30, x0 + (w / cols) * i, y1]))
  return items
}

function coffeeTable(w: number, d: number): Prim[] {
  return [
    rect(-w / 2, -d / 2, w, d, { r: 60 }),
    rect(-w / 2 + 50, -d / 2 + 50, w - 100, d - 100, { r: 30, s: 'thin', f: 'none' }),
  ]
}

function tvStand(w: number, d: number): Prim[] {
  const tw = Math.min(w * 0.85, 1450)
  const y0 = -d / 2
  return [
    rect(-w / 2, y0, w, d, { r: 10 }),
    line([-w / 2, d / 2 - 30, w / 2, d / 2 - 30]),
    rect(-150, y0 + 70, 300, 160, { r: 20, s: 'thin', f: 'none' }),
    rect(-tw / 2, y0 + 110, tw, 45, { r: 10, s: 'main', f: 'dark' }),
  ]
}

function bookcase(w: number, d: number): Prim[] {
  const x0 = -w / 2
  const y0 = -d / 2
  const items: Prim[] = [rect(x0, y0, w, d), rect(x0 + 25, y0 + 25, w - 50, d - 50, { s: 'thin', f: 'none' })]
  const sections = Math.max(1, Math.round(w / 400))
  for (let i = 1; i < sections; i++) items.push(line([x0 + (w / sections) * i, y0 + 25, x0 + (w / sections) * i, y0 + d - 25]))
  items.push(line([x0, y0, x0 + w, y0 + d]))
  return items
}

function upper(w: number, d: number): Prim[] {
  return [
    rect(-w / 2, -d / 2, w, d, { f: 'none', dash: true }),
    line([-w / 2, -d / 2, w / 2, d / 2], { dash: true }),
  ]
}

function dishwasher(w: number, d: number): Prim[] {
  const x0 = -w / 2
  const y0 = -d / 2
  const items: Prim[] = [rect(x0, y0, w, d), rect(x0 + 50, y0 + 50, w - 100, d - 130, { r: 20, s: 'thin', f: 'none' })]
  for (let i = 1; i <= 4; i++) {
    const x = x0 + 50 + ((w - 100) / 5) * i
    items.push(line([x, y0 + 80, x, y0 + d - 110]))
  }
  items.push(line([x0, d / 2 - 40, x0 + w, d / 2 - 40], { dash: true }))
  return items
}

function fridge(w: number, d: number): Prim[] {
  const x0 = -w / 2
  const y0 = -d / 2
  const y1 = d / 2
  return [
    rect(x0, y0, w, d, { r: 20 }),
    line([x0, y1 - 60, x0 + w, y1 - 60], { s: 'main' }),
    line([x0 + 30, y0 + 30, x0 + w - 30, y1 - 90]),
    line([x0 + w - 30, y0 + 30, x0 + 30, y1 - 90]),
    line([x0 + w - 70, y1 - 60, x0 + w - 70, y1 - 10], { s: 'main' }),
  ]
}

function plant(w: number, d: number): Prim[] {
  const r = Math.min(w, d) / 2
  const pot = r * 0.62
  const items: Prim[] = [circle(0, 0, pot, { s: 'thin', f: 'tone' })]
  const leaves = 9
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + (i % 2) * 0.25
    const len = r * (i % 2 ? 0.86 : 1)
    const tx = Math.cos(a) * len
    const ty = Math.sin(a) * len
    const mx = Math.cos(a) * len * 0.5
    const my = Math.sin(a) * len * 0.5
    const wx = -Math.sin(a) * len * 0.24
    const wy = Math.cos(a) * len * 0.24
    items.push(path(`M0 0 Q${n(mx + wx)} ${n(my + wy)} ${n(tx)} ${n(ty)} Q${n(mx - wx)} ${n(my - wy)} 0 0 Z`, { s: 'thin', f: 'paper' }))
    items.push(line([Math.cos(a) * len * 0.15, Math.sin(a) * len * 0.15, tx * 0.85, ty * 0.85]))
  }
  return items
}

function armchair(w: number, d: number): Prim[] {
  const back = Math.min(200, d * 0.24)
  const arm = Math.min(170, w * 0.2)
  return sofaPieces(-w / 2, -d / 2, w, d, back, arm)
}

function generic(w: number, d: number): Prim[] {
  return [rect(-w / 2, -d / 2, w, d, { r: 10 }), line([-w / 2, -d / 2, w / 2, d / 2]), line([w / 2, -d / 2, -w / 2, d / 2])]
}

export function furnitureSymbol(type: string, w: number, d: number): Prim[] {
  switch (type) {
    case 'bed-1600':
    case 'bed-1800':
      return bed(w, d, 2)
    case 'bed-900':
      return bed(w, d, 1)
    case 'nightstand':
      return nightstand(w, d)
    case 'wardrobe':
      return cabinetDoors(w, d, false)
    case 'hall-wardrobe':
      return cabinetDoors(w, d, true)
    case 'dresser':
      return dresser(w, d)
    case 'sofa':
      return sofa(w, d)
    case 'sofa-corner':
      return sofaCorner(w, d)
    case 'armchair':
      return armchair(w, d)
    case 'coffee-table':
      return coffeeTable(w, d)
    case 'tv-stand':
      return tvStand(w, d)
    case 'bookcase':
      return bookcase(w, d)
    case 'plant':
      return plant(w, d)
    case 'kitchen-base':
      return kitchenBase(w, d, 'door')
    case 'kitchen-drawers':
      return kitchenBase(w, d, 'drawer')
    case 'kitchen-corner':
      return kitchenCorner(w, d)
    case 'kitchen-upper':
      return upper(w, d)
    case 'kitchen-sink':
      return kitchenSink(w, d)
    case 'stove':
      return stove(w, d)
    case 'dishwasher':
      return dishwasher(w, d)
    case 'fridge':
      return fridge(w, d)
    case 'dining-4':
    case 'dining-6':
    case 'dining-round':
      return dining(type, w, d)
    case 'chair':
      return chair(w, d)
    case 'toilet':
      return toilet(w, d)
    case 'washbasin':
      return washbasin(w, d)
    case 'vanity':
      return vanity(w, d)
    case 'bathtub':
      return bathtub(w, d)
    case 'shower':
      return shower(w, d)
    case 'washer':
      return washer(w, d)
    case 'water-heater':
      return waterHeater(w, d)
    case 'coat-rack':
      return coatRack(w, d)
    case 'shoe-cabinet':
      return shoeCabinet(w, d)
    case 'desk':
      return desk(w, d)
    case 'office-chair':
      return officeChair(w, d)
    case 'fireplace':
      return fireplace(w, d)
    case 'masonry-stove':
      return masonryStove(w, d)
    case 'gas-boiler':
      return gasBoiler(w, d)
    case 'floor-boiler':
      return floorBoiler(w, d)
    default:
      return generic(w, d)
  }
}
