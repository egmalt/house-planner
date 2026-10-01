import { memo, useMemo, type ComponentProps, type ReactNode } from 'react'
import { Circle, Ellipse, Group, Line, Path, Rect } from 'react-konva'
import { resolveFurniture, type FurnitureItem } from './catalog'
import { furnitureSymbol, SYMBOL_STYLE, type FillKind, type Prim, type StrokeKind } from './symbols'

export const FURNITURE_ACCENT = '#f26b1d'

type GroupProps = Omit<ComponentProps<typeof Group>, 'x' | 'y' | 'rotation' | 'children'>

export type FurnitureSymbol2DProps = GroupProps & {
  item: FurnitureItem
  selected?: boolean
  showClearance?: boolean
  ghost?: boolean
}

const fillColor = (f: FillKind | undefined, def: FillKind, custom?: string) => {
  const k = f ?? def
  if (k === 'none') return undefined
  if (k === 'paper') return custom ?? SYMBOL_STYLE.paper
  return SYMBOL_STYLE[k]
}

const strokeOf = (s: StrokeKind | undefined, def: StrokeKind) => {
  const k = s ?? def
  if (k === 'none') return { stroke: undefined, strokeWidth: 0 }
  return k === 'main'
    ? { stroke: SYMBOL_STYLE.ink, strokeWidth: SYMBOL_STYLE.main }
    : { stroke: SYMBOL_STYLE.thin, strokeWidth: SYMBOL_STYLE.thinWidth }
}

function renderPrim(p: Prim, key: number, paper?: string): ReactNode {
  if (p.k === 'group') {
    return (
      <Group key={key} x={p.x} y={p.y} rotation={p.rot} listening={false}>
        {p.items.map((c, i) => renderPrim(c, i, paper))}
      </Group>
    )
  }
  const common = {
    listening: false,
    strokeScaleEnabled: false,
    perfectDrawEnabled: false,
    dash: p.dash ? SYMBOL_STYLE.dash : undefined,
    lineJoin: 'round' as const,
    lineCap: 'round' as const,
  }
  switch (p.k) {
    case 'rect':
      return <Rect key={key} {...common} x={p.x} y={p.y} width={p.w} height={p.h} cornerRadius={p.r ?? 0} fill={fillColor(p.f, 'paper', paper)} {...strokeOf(p.s, 'main')} />
    case 'circle':
      return <Circle key={key} {...common} x={p.cx} y={p.cy} radius={p.r} fill={fillColor(p.f, 'paper', paper)} {...strokeOf(p.s, 'main')} />
    case 'ellipse':
      return <Ellipse key={key} {...common} x={p.cx} y={p.cy} radiusX={p.rx} radiusY={p.ry} fill={fillColor(p.f, 'paper', paper)} {...strokeOf(p.s, 'main')} />
    case 'line':
      return <Line key={key} {...common} points={p.p} closed={p.closed} fill={fillColor(p.f, 'none', paper)} {...strokeOf(p.s, 'thin')} />
    case 'path':
      return <Path key={key} {...common} data={p.d} fill={fillColor(p.f, 'paper', paper)} {...strokeOf(p.s, 'main')} />
  }
}

export const FurnitureSymbol2D = memo(function FurnitureSymbol2D({ item, selected, showClearance, ghost, ...rest }: FurnitureSymbol2DProps) {
  const { def, w, d } = resolveFurniture(item)
  const prims = useMemo(() => furnitureSymbol(item.type, w, d), [item.type, w, d])
  const clearance = (showClearance ?? selected) ? def?.clearance : undefined
  const paper = item.color && /^#[0-9a-f]{3,8}$/i.test(item.color) ? tint(item.color) : undefined

  return (
    <Group x={item.x} y={item.y} rotation={item.rotationDeg} opacity={ghost ? 0.6 : 1} {...rest}>
      {clearance?.front ? (
        <Rect
          x={-w / 2}
          y={d / 2}
          width={w}
          height={clearance.front}
          fill="rgba(242, 107, 29, 0.07)"
          stroke={FURNITURE_ACCENT}
          strokeWidth={1}
          strokeScaleEnabled={false}
          dash={[4, 4]}
          opacity={0.7}
          listening={false}
        />
      ) : null}
      {clearance?.side
        ? [-1, 1].map((s) => (
            <Rect
              key={s}
              x={s < 0 ? -w / 2 - clearance.side! : w / 2}
              y={-d / 2}
              width={clearance.side}
              height={d}
              fill="rgba(242, 107, 29, 0.05)"
              stroke={FURNITURE_ACCENT}
              strokeWidth={1}
              strokeScaleEnabled={false}
              dash={[4, 4]}
              opacity={0.5}
              listening={false}
            />
          ))
        : null}
      <Rect x={-w / 2} y={-d / 2} width={w} height={d} fill="rgba(255,255,255,0.001)" />
      {prims.map((p, i) => renderPrim(p, i, paper))}
      {selected && (
        <Rect
          x={-w / 2}
          y={-d / 2}
          width={w}
          height={d}
          stroke={FURNITURE_ACCENT}
          strokeWidth={1.6}
          strokeScaleEnabled={false}
          fill="rgba(242, 107, 29, 0.06)"
          listening={false}
        />
      )}
    </Group>
  )
})

function tint(hex: string) {
  const h = hex.length === 4 ? '#' + [...hex.slice(1)].map((c) => c + c).join('') : hex.slice(0, 7)
  const v = parseInt(h.slice(1), 16)
  const mix = (c: number) => Math.round(c * 0.28 + 255 * 0.72)
  const r = mix((v >> 16) & 255)
  const g = mix((v >> 8) & 255)
  const b = mix(v & 255)
  return `rgb(${r}, ${g}, ${b})`
}
