import type { InputHTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> & {
  label?: ReactNode
  onChange?: (checked: boolean) => void
}

export function Checkbox({ label, onChange, className, ...rest }: CheckboxProps) {
  return (
    <label className={cx('checkbox', className)}>
      <input type="checkbox" className="checkbox__control" onChange={(e) => onChange?.(e.target.checked)} {...rest} />
      <span className="checkbox__box" aria-hidden />
      {label && <span className="checkbox__label">{label}</span>}
    </label>
  )
}
