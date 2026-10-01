import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parsePlan } from '../src/model/schema.ts'

const files = process.argv.slice(2)
if (!files.length) {
  console.error('usage: node scripts/plan-validate.mts <plan.json> [...]')
  process.exit(1)
}
let bad = 0
for (const f of files) {
  const r = parsePlan(JSON.parse(readFileSync(resolve(f), 'utf8')))
  if (r.ok) console.log(`${f}: ok`)
  else {
    bad++
    console.error(`${f}:\n${r.error}`)
  }
}
process.exit(bad ? 1 : 0)
