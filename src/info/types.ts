export type Pt = [number, number]

export type Fact = { label: string; value: string; hint?: string; unverified?: boolean }
export type Link = { title: string; url: string; note?: string }
export type ListItem = { title: string; status?: string; note?: string; date?: string; url?: string }

export type Base = { auto?: string; title?: string; source?: string; unverified?: boolean }

export type Block = Base &
  (
    | { type: 'facts'; items: Fact[] }
    | { type: 'text'; paragraphs: string[] }
    | { type: 'markdown'; text: string }
    | { type: 'heading'; text: string }
    | { type: 'table'; columns: string[]; rows: string[][] }
    | { type: 'links'; items: Link[] }
    | { type: 'list'; items: ListItem[] }
    | { type: 'note'; text: string; tone?: 'pending' | 'info' | 'warn' }
    | { type: 'group'; blocks: Block[]; open?: boolean }
    | MapBlock
  )

export type MapBlock = Base & {
  type: 'map'
  caption?: string
  north?: number
  parcel: { label: string; note?: string; points: Pt[] }
  sides?: { at: Pt; len: number; angle?: number }[]
  neighbors?: { label: string; note?: string; points: Pt[] }[]
  zone?: { label?: string; points: Pt[] }
  street?: { label: string; at: Pt; angle?: number; band?: Pt[] } | null
  strip?: { label: string; at: Pt; angle?: number } | null
}

export type Section = {
  id: string
  title: string
  lead?: string
  status?: 'ready' | 'collecting'
  blocks: Block[]
}

export type HouseData = {
  title: string
  subtitle?: string
  updated?: string
  sections: Section[]
}
