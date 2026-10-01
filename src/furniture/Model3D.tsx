import { Suspense, memo, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { resolveFurniture, type FurnitureItem } from './catalog'
import { CHAIR, diningLayout, isDining } from './layout'
import { finishMaterial, kenneyFinish, type Finish, type FurnitureLook } from './materials3d'
import { ProceduralFurniture, hasProcedural } from './procedural'
import { KENNEY_MODELS, type KenneySpec } from './models'

const M = 0.001

export const FURNITURE_MODELS_BASE = `${import.meta.env.BASE_URL}models/furniture/`

export type FurnitureModelProps = {
  item: FurnitureItem
  look?: FurnitureLook
  baseY?: number
  placed?: boolean
  modelsBase?: string
  castShadow?: boolean
}


export const FurnitureModel = memo(function FurnitureModel({
  item,
  look = 'real',
  baseY = 0,
  placed = true,
  modelsBase = FURNITURE_MODELS_BASE,
  castShadow = true,
}: FurnitureModelProps) {
  const { w, d, h, elevation } = resolveFurniture(item)
  const body = <FurnitureBody type={item.type} w={w} d={d} h={h} look={look} color={item.color} base={modelsBase} shadow={castShadow} />
  if (!placed) return elevation ? <group position={[0, baseY + elevation * M, 0]}>{body}</group> : body
  return (
    <group position={[item.x * M, baseY + elevation * M, item.y * M]} rotation={[0, (-item.rotationDeg * Math.PI) / 180, 0]}>
      {body}
    </group>
  )
})

type BodyProps = { type: string; w: number; d: number; h: number; look: FurnitureLook; color?: string; base: string; shadow: boolean }

function FurnitureBody({ type, w, d, h, look, color, base, shadow }: BodyProps) {
  if (isDining(type)) return <Dining type={type} w={w} d={d} h={h} look={look} color={color} base={base} shadow={shadow} />
  if (type === 'tv-stand') {
    const standH = Math.min(520, h * 0.4)
    const tvW = Math.min(w * 0.85, 1450)
    return (
      <>
        <Fitted spec={KENNEY_MODELS['tv-stand']} w={w} d={d} h={standH} look={look} color={color} base={base} shadow={shadow} />
        <group position={[0, standH * M, (-d / 2 + 140) * M]}>
          <Fitted spec={KENNEY_MODELS.tv} w={tvW} d={220} h={Math.min(h - standH, tvW * 0.6)} look={look} base={base} shadow={shadow} />
        </group>
      </>
    )
  }
  const spec = KENNEY_MODELS[type]
  if (spec) return <Fitted spec={spec} w={w} d={d} h={h} look={look} color={color} base={base} shadow={shadow} />
  if (hasProcedural(type)) {
    return <ProceduralFurniture type={type} w={w} d={d} h={h} paint={{ look, color, primary: ['wood', 'textile', 'plaster', 'brick'] }} />
  }
  return <ProceduralFurniture type="generic" w={w} d={d} h={h} paint={{ look, color, primary: ['white'] }} />
}

function Dining({ type, w, d, h, look, color, base, shadow }: BodyProps) {
  const lay = diningLayout(type, w, d)
  return (
    <>
      {lay.round ? (
        <ProceduralFurniture type="table-round" w={lay.table.w} d={lay.table.d} h={h} paint={{ look, color, primary: ['wood'] }} />
      ) : (
        <Fitted spec={KENNEY_MODELS.table} w={lay.table.w} d={lay.table.d} h={h} look={look} color={color} base={base} shadow={shadow} />
      )}
      {lay.seats.map((s, i) => (
        <group key={i} position={[s.x * M, 0, s.y * M]} rotation={[0, (-s.rot * Math.PI) / 180, 0]}>
          <Fitted spec={KENNEY_MODELS.chair} w={CHAIR.w} d={CHAIR.d} h={900} look={look} color={color} base={base} shadow={shadow} />
        </group>
      ))}
    </>
  )
}

type FittedProps = { spec: KenneySpec; w: number; d: number; h: number; look: FurnitureLook; color?: string; base: string; shadow: boolean }

function Fitted(props: FittedProps) {
  return (
    <Suspense fallback={<Placeholder w={props.w} d={props.d} h={props.h} look={props.look} />}>
      <FittedGLTF {...props} />
    </Suspense>
  )
}

function Placeholder({ w, d, h, look }: { w: number; d: number; h: number; look: FurnitureLook }) {
  return (
    <mesh position={[0, (h * M) / 2, 0]} material={finishMaterial('white', look)}>
      <boxGeometry args={[w * M, h * M, d * M]} />
    </mesh>
  )
}

function FittedGLTF({ spec, w, d, h, look, color, base, shadow }: FittedProps) {
  const gltf = useGLTF(base + spec.file)
  const fitted = useMemo(() => {
    const root = new THREE.Group()
    const inner = gltf.scene.clone(true)
    inner.rotation.y = ((spec.rotY ?? 0) * Math.PI) / 180
    root.add(inner)
    const primary = new Set<Finish>(spec.primary ?? ['textile'])
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const swap = (m: THREE.Material) => {
        const f = spec.remap?.[m.name] ?? kenneyFinish(m.name)
        return finishMaterial(f, look, primary.has(f) ? color : undefined)
      }
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material)
      mesh.castShadow = shadow
      mesh.receiveShadow = true
    })
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    return { root, size, center }
  }, [gltf, spec, look, color, shadow])

  const sx = (w * M) / (fitted.size.x || 1)
  const sy = (h * M) / (fitted.size.y || 1)
  const sz = (d * M) / (fitted.size.z || 1)
  return (
    <group scale={[sx, sy, sz]}>
      <group position={[-fitted.center.x, -fitted.center.y + fitted.size.y / 2, -fitted.center.z]}>
        <primitive object={fitted.root} />
      </group>
    </group>
  )
}

export function preloadFurnitureModels(base = FURNITURE_MODELS_BASE) {
  for (const spec of Object.values(KENNEY_MODELS)) useGLTF.preload(base + spec.file)
}

