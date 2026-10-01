import type { Plan } from '../model'

export type Loaded = { plan: Plan; rev: number; updatedAt?: string; author?: string; demo?: boolean }
export type Saved = { rev: number; updatedAt: string }
export type VersionInfo = { rev: number; updatedAt?: string; author?: string; walls?: number; openings?: number }

export interface PlanStorage {
  readonly kind: 'server' | 'local'
  load(): Promise<Loaded>
  save(plan: Plan, baseRev: number, author?: string): Promise<Saved>
  list(): Promise<VersionInfo[]>
  get(rev: number): Promise<Plan>
}

export class ConflictError extends Error {
  readonly plan: Plan
  readonly rev: number
  constructor(plan: Plan, rev: number) {
    super('conflict')
    this.plan = plan
    this.rev = rev
  }
}

export class AuthError extends Error {}
export class UnavailableError extends Error {}
export class OfflineError extends Error {}
export class OutdatedError extends Error {}
