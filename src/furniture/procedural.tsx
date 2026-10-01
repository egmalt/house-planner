import { RoundedBox } from '@react-three/drei'
import type { ReactNode } from 'react'
import { finishMaterial, type Finish, type FurnitureLook } from './materials3d'

const M = 0.001

type Paint = { look: FurnitureLook; color?: string; primary: Finish[] }
type V3 = [number, number, number]

const PROCEDURAL = new Set([
  'wardrobe',
  'hall-wardrobe',
  'dresser',
  'dishwasher',
  'water-heater',
  'shoe-cabinet',
  'fireplace',
  'masonry-stove',
  'gas-boiler',
  'floor-boiler',
  'bookcase',
  'table-round',
  'generic',
])

export function hasProcedural(type: string) {
  return PROCEDURAL.has(type)
}

function mat(paint: Paint, f: Finish) {
  return finishMaterial(f, paint.look, paint.primary.includes(f) ? paint.color : undefined)
}

function Box({ p, s, f, r = 0, paint }: { p: V3; s: V3; f: Finish; r?: number; paint: Paint }) {
  const size = s.map((v) => Math.max(v, 0.5) * M) as V3
  const pos = p.map((v) => v * M) as V3
  const radius = Math.min(r, ...s.map((v) => v / 2 - 0.5)) * M
  if (radius <= 0.0005) {
    return (
      <mesh position={pos} material={mat(paint, f)} castShadow receiveShadow>
        <boxGeometry args={size} />
      </mesh>
    )
  }
  return <RoundedBox args={size} radius={radius} smoothness={3} position={pos} material={mat(paint, f)} castShadow receiveShadow />
}

function Cyl({ p, r, h, f, paint, rot, seg = 32 }: { p: V3; r: number; h: number; f: Finish; paint: Paint; rot?: V3; seg?: number }) {
  return (
    <mesh position={p.map((v) => v * M) as V3} rotation={rot} material={mat(paint, f)} castShadow receiveShadow>
      <cylinderGeometry args={[r * M, r * M, h * M, seg]} />
    </mesh>
  )
}

function Handle({ x, y, z, len, vertical, paint }: { x: number; y: number; z: number; len: number; vertical?: boolean; paint: Paint }) {
  return <Box p={[x, y, z + 12]} s={vertical ? [12, len, 14] : [len, 12, 14]} r={5} f="metalMedium" paint={paint} />
}

type P = { w: number; d: number; h: number; paint: Paint }

function Wardrobe({ w, d, h, paint }: P) {
  const plinth = 80
  const doors = Math.max(1, Math.round(w / 500))
  const dw = w / doors
  const items: ReactNode[] = [
    <Box key="c" p={[0, h / 2, -10]} s={[w, h, d - 20]} r={6} f="wood" paint={paint} />,
    <Box key="p" p={[0, plinth / 2, d / 2 - 60]} s={[w - 40, plinth, 20]} f="woodDark" paint={paint} />,
  ]
  for (let i = 0; i < doors; i++) {
    const x = -w / 2 + dw * (i + 0.5)
    items.push(<Box key={`d${i}`} p={[x, plinth + (h - plinth) / 2, d / 2 - 10]} s={[dw - 4, h - plinth - 6, 20]} r={4} f="wood" paint={paint} />)
    const hx = x + (i % 2 ? -1 : 1) * (dw / 2 - 45)
    items.push(<Handle key={`h${i}`} x={hx} y={h * 0.5} z={d / 2} len={260} vertical paint={paint} />)
  }
  return <>{items}</>
}

function HallWardrobe({ w, d, h, paint }: P) {
  const pw = w / 2 + 40
  return (
    <>
      <Box p={[0, h / 2, -20]} s={[w, h, d - 40]} r={6} f="wood" paint={paint} />
      <Box p={[0, 40, d / 2 - 50]} s={[w - 20, 80, 20]} f="woodDark" paint={paint} />
      <Box p={[0, h - 25, d / 2 - 20]} s={[w, 50, 40]} f="metalMedium" paint={paint} />
      <Box p={[-w / 2 + pw / 2, h / 2 + 20, d / 2 - 38]} s={[pw, h - 90, 18]} r={3} f="wood" paint={paint} />
      <Box p={[w / 2 - pw / 2, h / 2 + 20, d / 2 - 14]} s={[pw, h - 90, 18]} r={3} f="glass" paint={paint} />
      <Box p={[w / 2 - pw / 2, h / 2 + 20, d / 2 - 22]} s={[pw - 60, h - 150, 4]} f="metalLight" paint={paint} />
    </>
  )
}

function Drawers({ w, d, h, paint, rows, legs }: P & { rows: number; legs: number }) {
  const cols = Math.max(1, Math.round(w / 500))
  const top = 25
  const bodyH = h - legs
  const fh = (bodyH - top - 30) / rows
  const cw = (w - 30) / cols
  const items: ReactNode[] = [
    <Box key="c" p={[0, legs + bodyH / 2, -10]} s={[w, bodyH, d - 20]} r={8} f="wood" paint={paint} />,
    <Box key="t" p={[0, h - top / 2, 0]} s={[w + 10, top, d + 10]} r={6} f="wood" paint={paint} />,
  ]
  if (legs > 0) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) items.push(<Box key={`l${sx}${sz}`} p={[sx * (w / 2 - 50), legs / 2, sz * (d / 2 - 50)]} s={[30, legs, 30]} r={6} f="woodDark" paint={paint} />)
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = -w / 2 + 15 + cw * (c + 0.5)
      const y = legs + 15 + fh * (r + 0.5)
      items.push(<Box key={`f${r}${c}`} p={[x, y, d / 2 - 8]} s={[cw - 6, fh - 6, 18]} r={4} f="wood" paint={paint} />)
      items.push(<Handle key={`h${r}${c}`} x={x} y={y + fh * 0.2} z={d / 2} len={Math.min(160, cw * 0.4)} paint={paint} />)
    }
  }
  return <>{items}</>
}

function ShoeCabinet({ w, d, h, paint }: P) {
  const cols = Math.max(1, Math.round(w / 450))
  const cw = w / cols
  const fh = (h - 80) / 2
  const items: ReactNode[] = [
    <Box key="c" p={[0, h / 2, -10]} s={[w, h, d - 20]} r={6} f="plaster" paint={paint} />,
    <Box key="t" p={[0, h - 12, 0]} s={[w + 10, 24, d + 10]} r={5} f="wood" paint={paint} />,
  ]
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < cols; c++) {
      const x = -w / 2 + cw * (c + 0.5)
      const y = 60 + fh * (r + 0.5)
      items.push(<Box key={`f${r}${c}`} p={[x, y, d / 2 - 6]} s={[cw - 6, fh - 6, 16]} r={4} f="plaster" paint={paint} />)
      items.push(<Handle key={`h${r}${c}`} x={x} y={y + fh / 2 - 40} z={d / 2} len={Math.min(140, cw * 0.4)} paint={paint} />)
    }
  }
  return <>{items}</>
}

function Dishwasher({ w, d, h, paint }: P) {
  const top = 38
  return (
    <>
      <Box p={[0, (h - top) / 2, -10]} s={[w - 4, h - top, d - 20]} r={4} f="metalLight" paint={paint} />
      <Box p={[0, h - top / 2, 10]} s={[w, top, d + 20]} r={4} f="stone" paint={paint} />
      <Box p={[0, 50, d / 2 - 40]} s={[w - 10, 100, 20]} f="woodDark" paint={paint} />
      <Box p={[0, (h - top + 100) / 2, d / 2 - 8]} s={[w - 8, h - top - 110, 16]} r={4} f="metalLight" paint={paint} />
      <Box p={[0, h - top - 45, d / 2 + 2]} s={[w - 8, 70, 6]} r={3} f="metalDark" paint={paint} />
      <Handle x={0} y={h - top - 120} z={d / 2} len={w * 0.6} paint={paint} />
    </>
  )
}

function WaterHeater({ w, d, h, paint }: P) {
  const r = Math.min(w, d) / 2
  const cz = d / 2 - r
  return (
    <>
      <Cyl p={[0, h / 2, cz]} r={r} h={h - r * 0.5} f="metalLight" paint={paint} />
      <mesh position={[0, (h - r * 0.25) * M, cz * M]} scale={[1, 0.25, 1]} material={mat(paint, 'metalLight')} castShadow>
        <sphereGeometry args={[r * M, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh position={[0, r * 0.25 * M, cz * M]} scale={[1, 0.25, 1]} rotation={[Math.PI, 0, 0]} material={mat(paint, 'metalLight')} castShadow>
        <sphereGeometry args={[r * M, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <Box p={[0, h * 0.35, cz + r - 5]} s={[r * 0.6, r * 0.35, 16]} r={6} f="metalDark" paint={paint} />
      <Cyl p={[-r * 0.3, -60, cz]} r={12} h={140} f="metal" paint={paint} />
      <Cyl p={[r * 0.3, -60, cz]} r={12} h={140} f="metal" paint={paint} />
      <Box p={[0, h * 0.75, -d / 2 + 10]} s={[r * 1.1, 60, 20]} f="metalMedium" paint={paint} />
    </>
  )
}

function GasBoiler({ w, d, h, paint }: P) {
  return (
    <>
      <Box p={[0, h / 2, 0]} s={[w, h, d]} r={30} f="white" paint={paint} />
      <Box p={[0, 70, d / 2 - 4]} s={[w - 40, 90, 14]} r={10} f="metalDark" paint={paint} />
      <Box p={[-w * 0.2, 70, d / 2 + 4]} s={[w * 0.25, 40, 4]} r={2} f="screen" paint={paint} />
      <Cyl p={[0, h + 90, -d / 2 + 120]} r={50} h={180} f="metal" paint={paint} />
      {[-0.3, -0.1, 0.1, 0.3].map((x) => (
        <Cyl key={x} p={[w * x, -70, 0]} r={11} h={140} f="metal" paint={paint} />
      ))}
    </>
  )
}

function FloorBoiler({ w, d, h, paint }: P) {
  return (
    <>
      <Box p={[0, h / 2, 0]} s={[w, h, d]} r={25} f="white" paint={paint} />
      <Box p={[0, h - 60, d / 2 - 4]} s={[w - 30, 90, 14]} r={10} f="metalDark" paint={paint} />
      <Box p={[0, h * 0.42, d / 2 - 2]} s={[w - 60, h * 0.55, 8]} r={8} f="white" paint={paint} />
      <Cyl p={[0, h + 150, -d / 2 + 150]} r={75} h={300} f="metal" paint={paint} />
      <Box p={[0, 25, 0]} s={[w + 10, 50, d + 10]} r={6} f="metalMedium" paint={paint} />
    </>
  )
}

function Fireplace({ w, d, h, paint }: P) {
  const fw = w * 0.56
  const fh = h * 0.5
  return (
    <>
      <Box p={[0, 40, 90]} s={[w + 300, 80, d + 180]} r={10} f="stone" paint={paint} />
      <Box p={[0, h / 2, 0]} s={[w, h, d]} r={10} f="plaster" paint={paint} />
      <Box p={[0, h - 30, 30]} s={[w + 120, 60, d + 60]} r={10} f="wood" paint={paint} />
      <Box p={[0, 80 + fh / 2, d / 2 - 90]} s={[fw, fh, 200]} r={20} f="soot" paint={paint} />
      <Box p={[0, 80 + fh + 30, d / 2 - 5]} s={[fw + 40, 50, 20]} r={6} f="stone" paint={paint} />
      <Box p={[0, 80 + 25, d / 2 - 60]} s={[fw * 0.6, 50, 120]} r={20} f="woodDark" paint={paint} />
    </>
  )
}

function MasonryStove({ w, d, h, paint }: P) {
  const doorW = Math.min(360, w * 0.35)
  return (
    <>
      <Box p={[0, h / 2, 0]} s={[w, h, d]} r={15} f="brick" paint={paint} />
      <Box p={[0, h - 40, 0]} s={[w + 40, 80, d + 40]} r={15} f="brick" paint={paint} />
      <Box p={[0, 130, 0]} s={[w + 40, 260, d + 40]} r={15} f="brick" paint={paint} />
      <Box p={[0, 420, d / 2 + 4]} s={[doorW, doorW * 0.8, 16]} r={8} f="metalDark" paint={paint} />
      <Box p={[0, 180, d / 2 + 22]} s={[doorW * 0.8, 110, 12]} r={6} f="metalDark" paint={paint} />
      <Box p={[0, h * 0.65, d / 2 + 2]} s={[w * 0.6, 12, 10]} f="metalMedium" paint={paint} />
    </>
  )
}

function Bookcase({ w, d, h, paint }: P) {
  const t = 22
  const shelves = Math.max(2, Math.round(h / 380))
  const step = (h - 2 * t - 60) / shelves
  const sections = Math.max(1, Math.round(w / 420))
  const sw = (w - 2 * t) / sections
  const tones: Finish[] = ['linen', 'textileDark', 'woodDark', 'textileBlue', 'linen', 'textile']
  const items: ReactNode[] = [
    <Box key="l" p={[-w / 2 + t / 2, h / 2, 0]} s={[t, h, d]} f="wood" paint={paint} />,
    <Box key="r" p={[w / 2 - t / 2, h / 2, 0]} s={[t, h, d]} f="wood" paint={paint} />,
    <Box key="b" p={[0, h / 2, -d / 2 + 5]} s={[w - 2 * t, h, 10]} f="wood" paint={paint} />,
    <Box key="k" p={[0, 30, d / 2 - 30]} s={[w - 2 * t, 60, 20]} f="woodDark" paint={paint} />,
  ]
  for (let i = 1; i < sections; i++) items.push(<Box key={`v${i}`} p={[-w / 2 + t + sw * i, h / 2, 0]} s={[t, h - 2 * t, d - 20]} f="wood" paint={paint} />)
  for (let i = 0; i <= shelves; i++) {
    const y = 60 + t / 2 + step * i
    items.push(<Box key={`s${i}`} p={[0, i === shelves ? h - t / 2 : y, 0]} s={[w, t, d]} f="wood" paint={paint} />)
    if (i === shelves) continue
    for (let c = 0; c < sections; c++) {
      if ((i + c) % 3 === 2) continue
      const seed = i * 7 + c * 3
      const fill = 0.45 + ((seed * 37) % 40) / 100
      const bw = (sw - 40) * fill
      const bh = step * (0.62 + ((seed * 13) % 20) / 100)
      const x0 = -w / 2 + t + sw * c + 20 + (seed % 2 ? sw - 40 - bw : 0)
      const parts = Math.max(2, Math.round(bw / 70))
      for (let k = 0; k < parts; k++) {
        const pw = bw / parts
        const ph = bh * (0.85 + ((seed + k * 5) % 4) * 0.05)
        items.push(<Box key={`bk${i}-${c}-${k}`} p={[x0 + pw * (k + 0.5), y + t / 2 + ph / 2, 10]} s={[pw - 4, ph, d * 0.7]} r={3} f={tones[(seed + k) % tones.length]} paint={paint} />)
      }
    }
  }
  return <>{items}</>
}

function RoundTable({ w, h, paint }: P) {
  const r = w / 2
  return (
    <>
      <Cyl p={[0, h - 18, 0]} r={r} h={36} f="wood" paint={paint} seg={64} />
      <Cyl p={[0, (h - 36) / 2, 0]} r={45} h={h - 36} f="wood" paint={paint} />
      <Cyl p={[0, 12, 0]} r={r * 0.45} h={24} f="woodDark" paint={paint} seg={48} />
    </>
  )
}

function Generic({ w, d, h, paint }: P) {
  return <Box p={[0, h / 2, 0]} s={[w, h, d]} r={20} f="white" paint={paint} />
}

export function ProceduralFurniture({ type, w, d, h, paint }: { type: string } & P) {
  const p = { w, d, h, paint }
  switch (type) {
    case 'wardrobe':
      return <Wardrobe {...p} />
    case 'hall-wardrobe':
      return <HallWardrobe {...p} />
    case 'dresser':
      return <Drawers {...p} rows={3} legs={0} />
    case 'shoe-cabinet':
      return <ShoeCabinet {...p} />
    case 'dishwasher':
      return <Dishwasher {...p} />
    case 'water-heater':
      return <WaterHeater {...p} />
    case 'gas-boiler':
      return <GasBoiler {...p} />
    case 'floor-boiler':
      return <FloorBoiler {...p} />
    case 'fireplace':
      return <Fireplace {...p} />
    case 'masonry-stove':
      return <MasonryStove {...p} />
    case 'bookcase':
      return <Bookcase {...p} />
    case 'table-round':
      return <RoundTable {...p} />
    default:
      return <Generic {...p} />
  }
}
