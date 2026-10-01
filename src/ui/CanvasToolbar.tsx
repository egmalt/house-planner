import type { HTMLAttributes } from 'react'
import { cx } from './cx'

export type ToolbarPlacement = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center'

type Props = HTMLAttributes<HTMLDivElement> & {
  placement?: ToolbarPlacement
  direction?: 'row' | 'column'
}

export function CanvasToolbar({ placement = 'top-left', direction = 'row', className, ...rest }: Props) {
  return (
    <div
      className={cx('card', 'canvas-toolbar', `canvas-toolbar--${placement}`, `canvas-toolbar--${direction}`, className)}
      {...rest}
    />
  )
}

export function ToolbarSeparator() {
  return <span className="canvas-toolbar__sep" aria-hidden />
}
