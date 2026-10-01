import { useCallback, useMemo, useRef, useState } from 'react'
import type { Plan, Point } from '../model'
import { imageryOf, moveImagery, moveImageryInPlan, roundGeo, type Geo, type Imagery } from './geo'

export type UnderlayAlign = {
  geo: Geo | null
  preview: Geo | null
  shown: Geo | null
  imagery: Imagery
  pivot: Point
  handleAngle: number
  nudge: (deltaDeg: number) => void
  startMove: () => void
  move: (pos: Point) => void
  endMove: (pos: Point) => void
  startRotate: () => void
  rotate: (angleDeg: number) => void
  endRotate: (angleDeg: number) => void
}

type Start = { geo: Geo; imagery: Imagery; pivot: Point; angle: number }

export function useUnderlayAlign(
  plan: Plan,
  onGeoChange: (geo: Geo) => void,
  onImageryChange?: (imagery: Imagery) => void,
): UnderlayAlign {
  const src = plan.site.geo
  const lat = src?.lat
  const lng = src?.lng
  const rot = src?.rotationDeg
  const geo = useMemo(
    () => (lat !== undefined && lng !== undefined ? roundGeo({ lat, lng, rotationDeg: rot ?? 0 }) : null),
    [lat, lng, rot],
  )
  const saved = imageryOf(plan.site as { imagery?: Partial<Imagery> })
  const { offsetE, offsetN, rotationDeg: imRot } = saved
  const imagery = useMemo<Imagery>(() => ({ offsetE, offsetN, rotationDeg: imRot }), [offsetE, offsetN, imRot])
  const [preview, setPreview] = useState<{ geo: Geo; imagery: Imagery } | null>(null)
  const [pivot, setPivot] = useState<Point>({ x: 0, y: 0 })
  const [handleAngle, setHandleAngle] = useState(0)
  const start = useRef<Start | null>(null)

  const apply = useCallback(
    (s: Start, rotationDeg: number, shift?: Point) => {
      if (onImageryChange) return { geo: s.geo, imagery: moveImageryInPlan(s.imagery, s.geo, rotationDeg, s.pivot, shift) }
      return { geo: moveImagery(s.geo, rotationDeg, s.pivot, shift), imagery: s.imagery }
    },
    [onImageryChange],
  )

  const commit = useCallback(
    (next: { geo: Geo; imagery: Imagery }) => {
      if (onImageryChange) onImageryChange(next.imagery)
      else onGeoChange(next.geo)
    },
    [onGeoChange, onImageryChange],
  )

  const begin = useCallback(() => {
    if (geo) start.current = { geo, imagery, pivot, angle: handleAngle }
  }, [geo, imagery, pivot, handleAngle])

  const shiftOf = (s: Start, pos: Point) => ({ x: pos.x - s.pivot.x, y: pos.y - s.pivot.y })

  const move = useCallback(
    (pos: Point) => {
      const s = start.current
      if (s) setPreview(apply(s, 0, shiftOf(s, pos)))
    },
    [apply],
  )

  const endMove = useCallback(
    (pos: Point) => {
      const s = start.current
      start.current = null
      if (!s) return
      setPreview(null)
      setPivot(pos)
      commit(apply(s, 0, shiftOf(s, pos)))
    },
    [apply, commit],
  )

  const rotate = useCallback(
    (angleDeg: number) => {
      const s = start.current
      if (!s) return
      setHandleAngle(angleDeg)
      setPreview(apply(s, angleDeg - s.angle))
    },
    [apply],
  )

  const endRotate = useCallback(
    (angleDeg: number) => {
      const s = start.current
      start.current = null
      if (!s) return
      setPreview(null)
      setHandleAngle(angleDeg)
      commit(apply(s, angleDeg - s.angle))
    },
    [apply, commit],
  )

  const nudge = useCallback(
    (deltaDeg: number) => {
      if (!geo) return
      setHandleAngle((a) => a + deltaDeg)
      commit(apply({ geo, imagery, pivot, angle: 0 }, deltaDeg))
    },
    [geo, imagery, pivot, apply, commit],
  )

  return {
    geo,
    preview: preview?.geo ?? null,
    shown: preview?.geo ?? geo,
    imagery: preview?.imagery ?? imagery,
    pivot,
    handleAngle,
    nudge,
    startMove: begin,
    move,
    endMove,
    startRotate: begin,
    rotate,
    endRotate,
  }
}
