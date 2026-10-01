import { memo, useMemo, type ReactNode, type SVGProps } from 'react'
import { resolveFurniture } from './catalog'
import { furnitureSymbol, SYMBOL_STYLE, type FillKind, type Prim, type StrokeKind } from './symbols'

export type FurnitureIconProps = Omit<SVGProps<SVGSVGElement>, 'type'> & {
  type: string
  size?: number
  pad?: number
}

const fill = (f: FillKind | undefined, def: FillKind) => {
  const k = f ?? def
  return k === 'none' ? 'none' : SYMBOL_STYLE[k]
}

function prim(p: Prim, key: number): ReactNode {
  if (p.k === 'group') {
    return (
      <g key={key} transform={`translate(${p.x} ${p.y}) rotate(${p.rot})`}>
        {p.items.map((c, i) => prim(c, i))}
      </g>
    )
  }
  const strokeKind: StrokeKind = p.s ?? (p.k === 'line' ? 'thin' : 'main')
  const st =
    strokeKind === 'none'
      ? { stroke: 'none' }
      : {
          stroke: strokeKind === 'main' ? SYMBOL_STYLE.ink : SYMBOL_STYLE.thin,
          strokeWidth: strokeKind === 'main' ? 1 : 0.6,
          vectorEffect: 'non-scaling-stroke' as const,
          strokeDasharray: p.dash ? '3 2' : undefined,
          strokeLinejoin: 'round' as const,
          strokeLinecap: 'round' as const,
        }
  switch (p.k) {
    case 'rect':
      return <rect key={key} x={p.x} y={p.y} width={p.w} height={p.h} rx={p.r ?? 0} fill={fill(p.f, 'paper')} {...st} />
    case 'circle':
      return <circle key={key} cx={p.cx} cy={p.cy} r={p.r} fill={fill(p.f, 'paper')} {...st} />
    case 'ellipse':
      return <ellipse key={key} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} fill={fill(p.f, 'paper')} {...st} />
    case 'line': {
      const pts = p.p.join(' ')
      return p.closed ? (
        <polygon key={key} points={pts} fill={fill(p.f, 'none')} {...st} />
      ) : (
        <polyline key={key} points={pts} fill="none" {...st} />
      )
    }
    case 'path':
      return <path key={key} d={p.d} fill={fill(p.f, 'paper')} {...st} />
  }
}

export const FurnitureIcon = memo(function FurnitureIcon({ type, size = 40, pad = 0.08, ...rest }: FurnitureIconProps) {
  const { w, d } = resolveFurniture({ type })
  const prims = useMemo(() => furnitureSymbol(type, w, d), [type, w, d])
  const side = Math.max(w, d) * (1 + pad * 2)
  return (
    <svg
      width={size}
      height={size}
      viewBox={`${-side / 2} ${-side / 2} ${side} ${side}`}
      role="img"
      aria-hidden={rest['aria-label'] ? undefined : true}
      {...rest}
    >
      {prims.map((p, i) => prim(p, i))}
    </svg>
  )
})
