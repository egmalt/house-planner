import type { InputHTMLAttributes, ReactNode, Ref } from 'react'
import { cx } from './cx'

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label?: ReactNode
  suffix?: ReactNode
  size?: 'sm' | 'md'
  invalid?: boolean
  ref?: Ref<HTMLInputElement>
}

export function Input({ label, suffix, size = 'md', invalid, className, ref, ...rest }: InputProps) {
  const field = (
    <span className={cx('input', size === 'sm' && 'input--sm', invalid && 'input--invalid', !label && className)}>
      <input ref={ref} className="input__control" {...rest} />
      {suffix && <span className="input__suffix">{suffix}</span>}
    </span>
  )
  if (!label) return field
  return (
    <label className={cx('field', className)}>
      <span className="field__label">{label}</span>
      {field}
    </label>
  )
}
