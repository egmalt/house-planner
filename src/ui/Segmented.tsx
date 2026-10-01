import { cx } from './cx'

export type SegmentedOption<T extends string> = { value: T; label: string; href?: string; title?: string }

type Props<T extends string> = {
  options: readonly SegmentedOption<T>[]
  value: T
  onChange?: (value: T) => void
  size?: 'sm' | 'md'
  className?: string
}

export function Segmented<T extends string>({ options, value, onChange, size = 'md', className }: Props<T>) {
  return (
    <div className={cx('segmented', size === 'sm' && 'segmented--sm', className)} role="tablist">
      {options.map((o) => {
        const cls = cx('segmented__item', o.value === value && 'segmented__item--active')
        return o.href ? (
          <a key={o.value} href={o.href} className={cls} role="tab" aria-selected={o.value === value} title={o.title}>
            {o.label}
          </a>
        ) : (
          <button
            key={o.value}
            type="button"
            className={cls}
            role="tab"
            aria-selected={o.value === value}
            title={o.title}
            onClick={() => onChange?.(o.value)}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
