import type { HTMLAttributes, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cx } from './cx'

export function Table({ className, dense, ...rest }: TableHTMLAttributes<HTMLTableElement> & { dense?: boolean }) {
  return (
    <div className="table-wrap">
      <table className={cx('table', dense && 'table--dense', className)} {...rest} />
    </div>
  )
}

export function Th({ className, num, ...rest }: ThHTMLAttributes<HTMLTableCellElement> & { num?: boolean }) {
  return <th className={cx(num && 'num', className)} {...rest} />
}

export function Td({ className, num, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { num?: boolean }) {
  return <td className={cx(num && 'num', className)} {...rest} />
}

export function Tr({ className, muted, ...rest }: HTMLAttributes<HTMLTableRowElement> & { muted?: boolean }) {
  return <tr className={cx(muted && 'table__row--muted', className)} {...rest} />
}
