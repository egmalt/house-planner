export const CHAIR = { w: 450, d: 520, tuck: 120 }

export type Seat = { x: number; y: number; rot: number }

export type DiningLayout = {
  round: boolean
  table: { w: number; d: number }
  seats: Seat[]
}

export function diningLayout(type: string, w: number, d: number): DiningLayout {
  const reach = CHAIR.d - CHAIR.tuck
  if (type === 'dining-round') {
    const dia = Math.max(600, Math.min(w, d) - 2 * reach)
    const r = dia / 2 + reach - CHAIR.d / 2
    const seats = [0, 90, 180, 270].map((deg) => {
      const a = (deg * Math.PI) / 180
      return { x: Math.sin(a) * r, y: -Math.cos(a) * r, rot: deg }
    })
    return { round: true, table: { w: dia, d: dia }, seats }
  }
  const perSide = type === 'dining-6' ? 3 : 2
  const tw = w
  const td = Math.max(600, d - 2 * reach)
  const seats: Seat[] = []
  const yTop = -td / 2 - reach + CHAIR.d / 2
  for (let i = 0; i < perSide; i++) {
    const x = -tw / 2 + (tw / perSide) * (i + 0.5)
    seats.push({ x, y: yTop, rot: 0 })
    seats.push({ x, y: -yTop, rot: 180 })
  }
  return { round: false, table: { w: tw, d: td }, seats }
}

export function isDining(type: string) {
  return type === 'dining-4' || type === 'dining-6' || type === 'dining-round'
}
