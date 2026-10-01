import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from './Input'

export function parseLength(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '').replace(',', '.')
  const m = s.match(/^(-?\d*\.?\d+)(мм|mm|см|cm|м|m)?$/)
  if (!m) return null
  const v = Number(m[1])
  if (!Number.isFinite(v)) return null
  const unit = m[2]
  if (unit === 'мм' || unit === 'mm') return Math.round(v)
  if (unit === 'см' || unit === 'cm') return Math.round(v * 10)
  if (unit === 'м' || unit === 'm') return Math.round(v * 1000)
  return m[1].includes('.') || Math.abs(v) < 30 ? Math.round(v * 1000) : Math.round(v)
}

type Props = {
  value: number
  onCommit: (mm: number) => void
  min?: number
  label?: string
  title?: string
}

export function LengthField({ value, onCommit, min = 0, label, title }: Props) {
  const { t } = useTranslation('common')
  const [draft, setDraft] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
  const commit = () => {
    if (draft === null) return
    const mm = parseLength(draft)
    if (mm === null || mm < min) {
      setInvalid(true)
      return
    }
    setDraft(null)
    setInvalid(false)
    if (mm !== Math.round(value)) onCommit(mm)
  }
  return (
    <Input
      size="sm"
      label={label}
      title={title ?? t('lengthField.title')}
      suffix={t('units.mm')}
      invalid={invalid}
      value={draft ?? String(Math.round(value))}
      onChange={(e) => {
        setDraft(e.target.value)
        setInvalid(false)
      }}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit()
          ;(e.target as HTMLInputElement).blur()
        } else if (e.key === 'Escape') {
          setDraft(null)
          setInvalid(false)
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}
