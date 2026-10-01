import { Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import { CameraControls, Edges, Environment, Grid, Lightformer, Line, useTexture } from '@react-three/drei'
import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { t } from '../i18n'
import type { Palette } from '../model'
import type { Finish, FurnitureItem, Material, Opening, Plan, Point, Wall } from './types'
import { resolveColors, type Colors } from './palette'
import { bounds, exteriorWalls, openingPlacement, sanitizePlan, slabOutline, wallGroups, wallEdges, wallFrame, wallSeams, wallSolid, worldUV } from './geometry'
import { TEXTURE_SIZE, finishOf, modelColor, seamPattern, shade, textureSet, type Look, type TextureSet } from './looks'

const M = 0.001
const SLAB = 0.25

export type View3D = 'iso' | 'top' | 'front'
export type { Look }

export const VIEWS: Record<View3D, { azimuth: number; polar: number; fit: number; label: string }> = {
  iso: { azimuth: Math.PI / 4, polar: 0.955, fit: 1.15, label: '3/4' },
  top: { azimuth: 0, polar: 0.0001, fit: 0.9, get label() { return t('view3d:views.top') } },
  front: { azimuth: 0, polar: Math.PI / 2 - 0.12, fit: 0.8, get label() { return t('view3d:views.front') } },
}

export const LOOKS: { id: Look; label: string }[] = [
  { id: 'model', get label() { return t('view3d:looks.model') } },
  { id: 'real', get label() { return t('view3d:looks.real') } },
]

const PALETTE = {
  model: { background: '#f3f3f0', ground: '#e9e8e2', grass: '#d6dfc9', grid: '#b4c4a3', section: '#a6b894', edge: '#7b776f', slab: '#cfcfca', door: '#8b7c6e' },
  real: { background: '#eef0f1', ground: '#dcd9cf', grass: '#e8ecdc', grid: '#b7c59a', section: '#c2cfa6', edge: '#6b665e', slab: '#bdbdb8', door: '#5d4a3c' },
}

const REAL_TINT: Partial<Record<TextureSet, string>> = { osb: '#f6f0ea', timber: '#f2ebe2', planken: '#e9ddd0' }

const GRASS_BOOST = new THREE.Color(1.12, 1.08, 1.1)

type Ctx = { look: Look; texturesUrl: string; colors: Colors }

function useSetTextures(set: TextureSet, base: string) {
  const tex = useTexture({
    map: `${base}${set}/color.jpg`,
    normalMap: `${base}${set}/normal.jpg`,
    roughnessMap: `${base}${set}/roughness.jpg`,
  })
  useMemo(() => {
    const [sx, sy] = TEXTURE_SIZE[set]
    for (const t of Object.values(tex)) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.repeat.set(1 / sx, 1 / sy)
      t.anisotropy = 8
      t.needsUpdate = true
    }
    tex.map.colorSpace = THREE.SRGBColorSpace
  }, [tex, set])
  return tex
}

function RealSurface({ set, base, attach, tint = '#ffffff' }: { set: TextureSet; base: string; attach?: string; tint?: THREE.ColorRepresentation }) {
  const tex = useSetTextures(set, base)
  return <meshStandardMaterial attach={attach} {...tex} color={tint} normalScale={new THREE.Vector2(0.8, 0.8)} />
}

function WallMesh({ wall, walls, openings, material, finish, exterior, ctx }: { wall: Wall; walls: Wall[]; openings: Opening[]; material?: Material; finish: Finish | null; exterior: boolean; ctx: Ctx }) {
  const geometry = useMemo(() => wallSolid(wall, walls, openings), [wall, walls, openings])
  const raw = seamPattern(material, finish)
  const pattern = ctx.look === 'real' && raw?.dir === 'horizontal' ? null : raw
  const seams = useMemo(() => {
    if (!pattern) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(wallSeams(wall, openings, pattern), 3))
    return g
  }, [wall, openings, pattern?.dir, pattern?.step])
  const edges = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(wallEdges(wall, walls, openings), 3))
    return g
  }, [wall, walls, openings])
  const painted = exterior ? ctx.colors.walls : null
  const color = painted ?? modelColor(material, finish)
  const model = ctx.look === 'model'
  const metal = !model && painted && material?.kind === 'pir'
  const natural = finish === 'osb' || finish === 'timber' || finish === 'planken'
  const set = painted && !metal && (ctx.colors.explicitWalls || !natural) ? 'plaster' : textureSet(material, finish)
  const tint = painted && set === 'plaster' ? painted : REAL_TINT[set]
  return (
    <group>
      <mesh geometry={geometry}>
        <meshBasicMaterial color="#2c3034" side={THREE.BackSide} />
      </mesh>
      <mesh geometry={geometry} castShadow receiveShadow>
        {model ? (
          <>
            <meshStandardMaterial attach="material-0" color={shade(color, 0.66)} roughness={1} />
            <meshStandardMaterial attach="material-1" color={color} roughness={1} />
          </>
        ) : metal ? (
          <>
            <meshStandardMaterial attach="material-0" color={shade(color, 0.7)} roughness={0.5} metalness={0.3} />
            <meshStandardMaterial attach="material-1" color={color} roughness={0.45} metalness={0.3} />
          </>
        ) : (
          <>
            <RealSurface attach="material-0" set={set} base={ctx.texturesUrl} tint={painted ? shade(painted, 0.7) : '#a39c90'} />
            <RealSurface attach="material-1" set={set} base={ctx.texturesUrl} tint={tint} />
          </>
        )}
      </mesh>
      {model && (
        <lineSegments geometry={edges}>
          <lineBasicMaterial color={PALETTE.model.edge} />
        </lineSegments>
      )}
      {seams && (
        <lineSegments geometry={seams}>
          <lineBasicMaterial color={model ? shade(color, 0.8) : '#3b3024'} transparent opacity={model ? 0.9 : 0.5} />
        </lineSegments>
      )}
    </group>
  )
}

function Frame({ w, h, depth, profile, color, bottom = true }: { w: number; h: number; depth: number; profile: number; color: string; bottom?: boolean }) {
  const d = Math.min(depth, 0.08)
  const bars: [number, number, number, number][] = [
    [0, h / 2 - profile / 2, w, profile],
    [-w / 2 + profile / 2, 0, profile, h],
    [w / 2 - profile / 2, 0, profile, h],
  ]
  if (bottom) bars.push([0, -h / 2 + profile / 2, w, profile])
  return (
    <>
      {bars.map(([x, y, bw, bh], i) => (
        <mesh key={i} castShadow position={[x, y, 0]}>
          <boxGeometry args={[bw, bh, d]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
      ))}
    </>
  )
}

function outwardSign(wall: Wall, center: Point) {
  const f = wallFrame(wall)
  const mx = (wall.a.x + wall.b.x) / 2 - center.x
  const my = (wall.a.y + wall.b.y) / 2 - center.y
  return f.dir.x * my - f.dir.y * mx >= 0 ? -1 : 1
}

function Gate({ wall, o, look, colors }: { wall: Wall; o: Opening; look: Look; colors: Colors }) {
  const t = openingPlacement(wall, o)
  const w = o.width * M
  const h = o.height * M
  const frame = 0.035
  const pw = w - frame * 2
  const ph = h - frame
  const count = Math.max(1, Math.round(ph / 0.5))
  const lh = ph / count
  const roughness = look === 'model' ? 1 : 0.55
  return (
    <group position={t.position} rotation={[0, t.rotationY, 0]}>
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i} castShadow receiveShadow position={[0, -h / 2 + lh * (i + 0.5), 0]}>
          <boxGeometry args={[pw, lh - 0.012, 0.04]} />
          <meshStandardMaterial color={colors.gates} roughness={roughness} metalness={look === 'model' ? 0 : 0.35} />
        </mesh>
      ))}
      <Frame w={w} h={h} depth={wall.thickness * M} profile={frame} color={colors.gates} bottom={false} />
    </group>
  )
}

function Door({ wall, o, colors }: { wall: Wall; o: Opening; colors: Colors }) {
  const t = openingPlacement(wall, o)
  const w = o.width * M
  const h = o.height * M
  const jamb = 0.05
  return (
    <group position={t.position} rotation={[0, t.rotationY, 0]}>
      <mesh castShadow position={[0, -jamb / 2, 0]}>
        <boxGeometry args={[w - jamb * 2, h - jamb, 0.045]} />
        <meshStandardMaterial color={colors.windows} roughness={0.7} />
      </mesh>
      <Frame w={w} h={h} depth={wall.thickness * M} profile={jamb} color={colors.windows} bottom={false} />
    </group>
  )
}

function Window({ wall, o, out, look, colors }: { wall: Wall; o: Opening; out: number; look: Look; colors: Colors }) {
  const t = openingPlacement(wall, o)
  const w = o.width * M
  const h = o.height * M
  const depth = wall.thickness * M
  const profile = 0.055
  return (
    <group position={t.position} rotation={[0, t.rotationY, 0]}>
      <Frame w={w} h={h} depth={depth} profile={profile} color={colors.windows} />
      {w > 1.2 && (
        <mesh castShadow>
          <boxGeometry args={[profile, h - profile * 2, Math.min(depth, 0.08)]} />
          <meshStandardMaterial color={colors.windows} roughness={0.6} />
        </mesh>
      )}
      <mesh>
        <boxGeometry args={[w - profile * 2, h - profile * 2, 0.01]} />
        {look === 'model' ? (
          <meshStandardMaterial color="#c5d9e2" roughness={0.2} transparent opacity={0.55} />
        ) : (
          <meshPhysicalMaterial color="#9fc3d6" roughness={0.05} metalness={0.2} transparent opacity={0.4} envMapIntensity={1.5} />
        )}
      </mesh>
      <mesh castShadow position={[0, -h / 2 - 0.015, out * (depth / 2 + 0.025)]}>
        <boxGeometry args={[w + 0.06, 0.02, 0.07]} />
        <meshStandardMaterial color={colors.accent} roughness={0.5} />
      </mesh>
    </group>
  )
}

function siteOutline(plan: Plan): Point[] {
  const { site } = plan
  if (site.boundary && site.boundary.length >= 3) return site.boundary
  return [
    { x: 0, y: 0 },
    { x: site.width, y: 0 },
    { x: site.width, y: site.depth },
    { x: 0, y: site.depth },
  ]
}

function Lawn({ geometry, ctx }: { geometry: THREE.BufferGeometry; ctx: Ctx }) {
  return (
    <mesh geometry={geometry} receiveShadow>
      {ctx.look === 'model' ? (
        <meshStandardMaterial color={PALETTE.model.grass} roughness={1} />
      ) : (
        <Suspense fallback={<meshStandardMaterial color={PALETTE.model.grass} roughness={1} />}>
          <RealSurface set="grass" base={ctx.texturesUrl} tint={GRASS_BOOST} />
        </Suspense>
      )}
    </mesh>
  )
}

function Site({ plan, grid, ctx }: { plan: Plan; grid: boolean; ctx: Ctx }) {
  const outline = useMemo(() => siteOutline(plan), [plan])
  const geometry = useMemo(() => {
    const g = new THREE.ShapeGeometry(new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x * M, -p.y * M))))
    g.rotateX(-Math.PI / 2)
    return worldUV(g)
  }, [outline])
  const b = bounds(outline)
  const cx = ((b.minX + b.maxX) / 2) * M
  const cz = ((b.minY + b.maxY) / 2) * M
  const line = useMemo(() => [...outline, outline[0]].map((p) => [p.x * M, 0.01, p.y * M] as [number, number, number]), [outline])
  const pal = PALETTE[ctx.look]
  return (
    <group>
      <mesh position={[cx, -0.01, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color={pal.ground} roughness={1} />
      </mesh>
      <Lawn geometry={geometry} ctx={ctx} />
      {grid && (
        <Grid
          position={[cx, 0.004, cz]}
          args={[(b.maxX - b.minX) * M, (b.maxY - b.minY) * M]}
          cellSize={1}
          cellThickness={0.5}
          cellColor={pal.grid}
          sectionSize={5}
          sectionThickness={0.9}
          sectionColor={pal.section}
          fadeDistance={140}
          fadeStrength={3}
        />
      )}
      <Line points={line} color="#ffffff" lineWidth={1.5} transparent opacity={0.9} />
    </group>
  )
}

function Slab({ plan, ctx }: { plan: Plan; ctx: Ctx }) {
  const parts = useMemo(
    () =>
      wallGroups(plan.walls)
        .map((group) => slabOutline(group, 100))
        .filter((outline) => outline.length >= 3)
        .map((outline) => {
          const g = new THREE.ExtrudeGeometry(new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x * M, -p.y * M))), { depth: SLAB, bevelEnabled: false })
          g.rotateX(-Math.PI / 2)
          return worldUV(g, SLAB)
        }),
    [plan.walls],
  )
  return (
    <>
      {parts.map((geometry, i) => (
        <mesh key={i} geometry={geometry} castShadow receiveShadow>
          {ctx.look === 'model' ? (
            <>
              <meshStandardMaterial attach="material-0" color={PALETTE.model.slab} roughness={1} />
              <meshStandardMaterial attach="material-1" color={ctx.colors.plinth} roughness={1} />
            </>
          ) : (
            <>
              <RealSurface attach="material-0" set="concrete" base={ctx.texturesUrl} tint={PALETTE.real.slab} />
              <RealSurface attach="material-1" set="concrete" base={ctx.texturesUrl} tint={ctx.colors.plinth} />
            </>
          )}
          {ctx.look === 'model' && <Edges threshold={25} color={PALETTE.model.edge} />}
        </mesh>
      ))}
    </>
  )
}

function Rig({ view, nonce, target, fallback }: { view: View3D; nonce: number; target: React.RefObject<THREE.Object3D | null>; fallback: { x: number; z: number; r: number } }) {
  const controls = useRef<CameraControls>(null)
  const first = useRef(true)
  useEffect(() => {
    const c = controls.current
    if (!c) return
    const animate = !first.current
    first.current = false
    const v = VIEWS[view]
    const id = requestAnimationFrame(() => {
      c.rotateTo(v.azimuth, v.polar, animate)
      if (!target.current) return
      const box = new THREE.Box3().setFromObject(target.current)
      const sphere = box.isEmpty() ? new THREE.Sphere(new THREE.Vector3(fallback.x, 0, fallback.z), fallback.r / 2 + 2) : box.getBoundingSphere(new THREE.Sphere())
      sphere.radius *= v.fit
      c.fitToSphere(sphere, animate)
    })
    return () => cancelAnimationFrame(id)
  }, [view, nonce, target, fallback])
  return <CameraControls ref={controls} makeDefault dollyToCursor minPolarAngle={0} maxPolarAngle={Math.PI / 2 - 0.02} minZoom={3} maxZoom={600} />
}

export type WallCut = 'full' | 'low' | 'floor'

export const WALL_CUTS: { value: WallCut; label: string }[] = [
  { value: 'full', get label() { return t('view3d:cuts.full') } },
  { value: 'low', get label() { return t('view3d:cuts.low') } },
  { value: 'floor', get label() { return t('view3d:cuts.floor') } },
]

const CUT_HEIGHT: Record<Exclude<WallCut, 'full'>, number> = { low: 1.0, floor: 0.1 }

function Cutaway({ target, cut, top }: { target: React.RefObject<THREE.Group | null>; cut: WallCut; top: number }) {
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), SLAB + top + 0.1), [])
  const planes = useMemo(() => [plane], [plane])
  useFrame((_, dt) => {
    const goal = SLAB + (cut === 'full' ? top + 0.1 : CUT_HEIGHT[cut])
    plane.constant = Math.abs(plane.constant - goal) < 0.002 ? goal : THREE.MathUtils.damp(plane.constant, goal, 14, Math.min(dt, 0.1))
    target.current?.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
      if (!m) return
      for (const mat of Array.isArray(m) ? m : [m]) {
        if (mat.clippingPlanes === planes) continue
        mat.clippingPlanes = planes
        mat.clipShadows = true
        mat.needsUpdate = true
      }
    })
  })
  return null
}

function HouseBody({ plan, ctx, finishOverride, roof, cut }: { plan: Plan; ctx: Ctx; finishOverride: Finish | null; roof?: ReactNode; cut: WallCut }) {
  const cutRef = useRef<THREE.Group>(null)
  const materials = useMemo(() => new Map(plan.materials.map((m) => [m.id, m as Material])), [plan.materials])
  const byWall = useMemo(() => {
    const map = new Map<string, Opening[]>()
    for (const o of plan.openings) map.set(o.wallId, [...(map.get(o.wallId) ?? []), o])
    return map
  }, [plan.openings])
  const wallsById = useMemo(() => new Map(plan.walls.map((w) => [w.id, w])), [plan.walls])
  const center = useMemo<Point>(() => {
    const b = bounds(plan.walls.flatMap((w) => [w.a, w.b]))
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
  }, [plan.walls])
  const wallTop = plan.walls.reduce((h, w) => Math.max(h, w.height * M), 0)
  const exterior = useMemo(() => exteriorWalls(plan.walls), [plan.walls])
  const empty: Opening[] = []
  return (
    <>
      <Slab plan={plan} ctx={ctx} />
      <group position={[0, SLAB, 0]} ref={cutRef}>
        {plan.walls.map((w) => {
          const material = w.materialId ? materials.get(w.materialId) : undefined
          return (
            <WallMesh
              key={w.id}
              wall={w}
              walls={plan.walls}
              openings={byWall.get(w.id) ?? empty}
              material={material}
              finish={finishOf(material, finishOverride)}
              exterior={exterior.has(w.id)}
              ctx={ctx}
            />
          )
        })}
        {plan.openings.map((o) => {
          const w = wallsById.get(o.wallId)
          if (!w) return null
          const type = o.type as string
          if (type === 'door') return <Door key={o.id} wall={w} o={o} colors={ctx.colors} />
          if (type === 'window') return <Window key={o.id} wall={w} o={o} out={outwardSign(w, center)} look={ctx.look} colors={ctx.colors} />
          if (type === 'gate') return <Gate key={o.id} wall={w} o={o} look={ctx.look} colors={ctx.colors} />
          return null
        })}
        <group name="roof" position={[0, wallTop, 0]} visible={cut === 'full'}>
          {roof}
        </group>
      </group>
      <Cutaway target={cutRef} cut={cut} top={wallTop} />
    </>
  )
}


export const defaultTexturesUrl = () => `${import.meta.env.BASE_URL}textures/`

export const primaryFinish = (plan: Plan): Finish | null => {
  const m = plan.materials.find((x) => x.kind === 'sip' || x.kind === 'pir' || x.kind === 'frame') as Material | undefined
  return m ? (m.finish ?? 'osb') : null
}

export type Scene3DProps = {
  plan: Plan
  view: View3D
  nonce: number
  look: Look
  grid: boolean
  finishOverride: Finish | null
  roof?: ReactNode
  texturesUrl?: string
  renderFurniture?: (item: FurnitureItem) => ReactNode
  cut?: WallCut
}

function Furniture({ plan, render }: { plan: Plan; render: (item: FurnitureItem) => ReactNode }) {
  const items = ((plan as Plan & { furniture?: FurnitureItem[] }).furniture ?? []).filter((i) => i && Number.isFinite(i.x) && Number.isFinite(i.y))
  return (
    <group position={[0, SLAB, 0]}>
      {items.map((item) => (
        <group key={item.id} position={[item.x * M, 0, item.y * M]} rotation={[0, (-(item.rotationDeg || 0) * Math.PI) / 180, 0]}>
          <Suspense fallback={null}>{render(item)}</Suspense>
        </group>
      ))}
    </group>
  )
}

export function Scene3D({ plan: rawPlan, view, nonce, look, grid, finishOverride, roof, texturesUrl, renderFurniture, cut = 'full' }: Scene3DProps) {
  const plan = useMemo(() => sanitizePlan(rawPlan), [rawPlan])
  const house = useRef<THREE.Group>(null)
  const base = texturesUrl ?? defaultTexturesUrl()
  const palette = (rawPlan as Plan & { palette?: Palette }).palette
  const colors = useMemo(() => resolveColors(palette), [palette])
  const ctx = useMemo<Ctx>(() => ({ look, texturesUrl: base, colors }), [look, base, colors])
  const modelCtx = useMemo<Ctx>(() => ({ look: 'model', texturesUrl: base, colors }), [base, colors])
  const focus = useMemo(() => {
    const pts = plan.walls.length ? plan.walls.flatMap((w) => [w.a, w.b]) : siteOutline(plan)
    const b = bounds(pts)
    const r = Math.max(b.maxX - b.minX, b.maxY - b.minY) * M
    return { x: ((b.minX + b.maxX) / 2) * M, z: ((b.minY + b.maxY) / 2) * M, r: Math.max(r, 6) }
  }, [plan])
  const pal = PALETTE[look]
  const s = focus.r * 1.2 + 4

  return (
    <Canvas
        shadows="percentage"
        orthographic
        dpr={[1, 2]}
        gl={{ antialias: false, stencil: false }}
        onCreated={({ gl }) => {
          gl.localClippingEnabled = true
        }}
        camera={{ position: [focus.x + 30, 30, focus.z + 30], zoom: 40, near: 0.1, far: 2000 }}
      >
        <color attach="background" args={[pal.background]} />
        <hemisphereLight args={['#ffffff', '#c9cdbf', look === 'model' ? 1.1 : 1.3]} />
        <directionalLight
          castShadow
          position={[focus.x + 14, 22, focus.z + 9]}
          intensity={look === 'model' ? 1.9 : 2.6}
          shadow-mapSize={[4096, 4096]}
          shadow-bias={-0.0003}
          shadow-normalBias={0.02}
          shadow-radius={6}
          shadow-camera-left={-s}
          shadow-camera-right={s}
          shadow-camera-top={s}
          shadow-camera-bottom={-s}
          shadow-camera-near={1}
          shadow-camera-far={120}
        >
          <object3D attach="target" position={[focus.x, 0, focus.z]} />
        </directionalLight>
        <Environment resolution={256}>
          <Lightformer form="rect" intensity={1.4} position={[0, 10, 0]} rotation-x={Math.PI / 2} scale={[30, 30, 1]} />
          <Lightformer form="rect" intensity={0.7} position={[-12, 4, 6]} rotation-y={Math.PI / 2} scale={[30, 6, 1]} />
          <Lightformer form="rect" intensity={0.5} position={[12, 4, -6]} rotation-y={-Math.PI / 2} scale={[30, 6, 1]} />
        </Environment>
        <Site plan={plan} grid={grid} ctx={ctx} />
        <group ref={house}>
          {look === 'model' ? (
            <HouseBody plan={plan} ctx={ctx} finishOverride={finishOverride} roof={roof} cut={cut} />
          ) : (
            <Suspense fallback={<HouseBody plan={plan} ctx={modelCtx} finishOverride={finishOverride} roof={roof} cut={cut} />}>
              <HouseBody plan={plan} ctx={ctx} finishOverride={finishOverride} roof={roof} cut={cut} />
            </Suspense>
          )}
        </group>
        {renderFurniture && <Furniture plan={plan} render={renderFurniture} />}
        <Rig view={view} nonce={nonce} target={house} fallback={focus} />
        <EffectComposer multisampling={4} enableNormalPass={false}>
          <N8AO halfRes quality="medium" aoRadius={1.2} distanceFalloff={0.8} intensity={look === 'model' ? 2.4 : 1.8} color="#1e2224" />
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        </EffectComposer>
    </Canvas>
  )
}
