import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: string
  children: ReactNode
  active?: boolean
  size?: 'sm' | 'md'
}

export function IconButton({ label, children, active, size = 'md', className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx('icon-btn', size === 'sm' && 'icon-btn--sm', active && 'icon-btn--active', className)}
      {...rest}
    >
      {children}
    </button>
  )
}
