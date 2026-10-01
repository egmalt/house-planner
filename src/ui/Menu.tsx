import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cx } from './cx'

type MenuProps = {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode
  children: ReactNode | ((close: () => void) => ReactNode)
  align?: 'left' | 'right'
  width?: number
}

export function Menu({ trigger, children, align = 'right', width = 280 }: MenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const close = () => setOpen(false)
  return (
    <div className="menu" ref={ref}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div className={cx('card', 'menu__panel', `menu__panel--${align}`)} style={{ width }} role="menu">
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  )
}

export function MenuItem({ className, hint, children, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { hint?: ReactNode }) {
  return (
    <button type={type} role="menuitem" className={cx('menu__item', className)} {...rest}>
      <span className="menu__label">{children}</span>
      {hint && <span className="menu__hint">{hint}</span>}
    </button>
  )
}

export function MenuSection({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <div className="menu__section">
      {title && <div className="menu__title eyebrow">{title}</div>}
      {children}
    </div>
  )
}
