import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { cx } from './cx'

export function Card({
  className,
  padded = true,
  ref,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { padded?: boolean; ref?: Ref<HTMLDivElement> }) {
  return <div ref={ref} className={cx('card', padded && 'card--padded', className)} {...rest} />
}

type PanelProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  title?: ReactNode
  eyebrow?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  ref?: Ref<HTMLElement>
}

export function Panel({ title, eyebrow, actions, footer, className, children, ref, ...rest }: PanelProps) {
  return (
    <section ref={ref} className={cx('card', 'panel', className)} {...rest}>
      {(title || eyebrow || actions) && (
        <header className="panel__head">
          <div className="panel__titles">
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            {title && <div className="panel__title">{title}</div>}
          </div>
          {actions && <div className="panel__actions">{actions}</div>}
        </header>
      )}
      <div className="panel__body">{children}</div>
      {footer && <footer className="panel__foot">{footer}</footer>}
    </section>
  )
}
