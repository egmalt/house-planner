import { CLIENT_VERSION, parsePlan, type Plan } from '../model'
import { t } from '../i18n'
import {
  AuthError,
  ConflictError,
  OfflineError,
  OutdatedError,
  UnavailableError,
  type Loaded,
  type PlanStorage,
  type Saved,
  type VersionInfo,
} from './types'

const API = `${import.meta.env.BASE_URL}api/plan.php`

const revOf = (res: Response, body?: { rev?: unknown }) => {
  const header = res.headers.get('X-Plan-Rev') ?? res.headers.get('ETag')?.replace(/\D/g, '')
  const n = Number(header ?? body?.rev)
  return Number.isFinite(n) ? n : 0
}

export const apiHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
  'X-Requested-With': 'fetch',
  'X-Client-Version': String(CLIENT_VERSION),
  Accept: 'application/json',
  ...extra,
})

export type SnapshotInfo = { id: string; name: string; rev?: number; createdAt?: string; author?: string }

async function request(url: string, init: RequestInit = {}) {
  let res: Response
  try {
    res = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...init,
      headers: { ...apiHeaders(), ...(init.headers as Record<string, string> | undefined) },
    })
  } catch (e) {
    throw new OfflineError((e as Error).message)
  }
  if (res.status === 401) throw new AuthError('unauthorized')
  if (res.status === 426) throw new OutdatedError('client_outdated')
  if (res.status === 404 && !url.includes('rev=')) throw new UnavailableError('api not found')
  const type = res.headers.get('Content-Type') ?? ''
  if (!type.includes('json')) {
    if (res.redirected || type.includes('html')) throw new AuthError('redirected')
    throw new UnavailableError(`HTTP ${res.status}`)
  }
  return res
}

function toPlan(data: unknown): Plan {
  const parsed = parsePlan(data)
  if (!parsed.ok) throw new Error(t('common:sync.invalidServerPlan', { error: parsed.error }))
  return parsed.plan
}

export class ServerStorage implements PlanStorage {
  readonly kind = 'server' as const

  async load(): Promise<Loaded> {
    const res = await request(API)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const plan = toPlan(data)
    return { plan, rev: revOf(res, data), updatedAt: plan.updatedAt, author: plan.author, demo: res.headers.get('X-House-Demo') === '1' }
  }

  async save(plan: Plan, baseRev: number, author = 'web'): Promise<Saved> {
    const res = await request(API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': String(baseRev), 'X-Plan-Author': author },
      body: JSON.stringify(plan),
    })
    const data = await res.json()
    if (res.status === 409) throw new ConflictError(toPlan(data.plan), revOf(res, data))
    if (!res.ok) throw new Error(data?.message ?? `HTTP ${res.status}`)
    return { rev: Number(data.rev), updatedAt: String(data.updatedAt) }
  }

  async list(): Promise<VersionInfo[]> {
    const res = await request(`${API}?versions`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const list: VersionInfo[] = Array.isArray(data) ? data : (data.versions ?? [])
    return list.map((v) => ({ rev: Number(v.rev), updatedAt: v.updatedAt, author: v.author, walls: v.walls, openings: v.openings }))
  }

  async snapshots(): Promise<SnapshotInfo[]> {
    const res = await request(`${API}?snapshots`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const list: Record<string, unknown>[] = Array.isArray(data) ? data : (data.snapshots ?? [])
    return list.map((x) => ({
      id: String(x.id),
      name: String(x.name ?? x.id),
      rev: x.rev === undefined ? undefined : Number(x.rev),
      createdAt: (x.createdAt ?? x.updatedAt ?? x.date) as string | undefined,
      author: x.author as string | undefined,
    }))
  }

  async saveSnapshot(name: string): Promise<SnapshotInfo> {
    const res = await request(`${API}?snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.message ?? `HTTP ${res.status}`)
    return { id: String(data.id), name: String(data.name ?? name), rev: data.rev, createdAt: data.createdAt }
  }

  async snapshot(id: string): Promise<Plan> {
    const res = await request(`${API}?snapshot=${encodeURIComponent(id)}`)
    if (!res.ok) throw new Error(t('common:sync.noSnapshot', { id }))
    const data = await res.json()
    return toPlan(data.plan ?? data)
  }

  async get(rev: number): Promise<Plan> {
    const res = await request(`${API}?rev=${rev}`)
    if (!res.ok) throw new Error(t('common:sync.noVersion', { rev }))
    return toPlan(await res.json())
  }
}
