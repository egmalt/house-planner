# Editing the plan as JSON (and with an AI assistant)

**English** | [Русский](../ru/plan-via-chat.md)

The whole project — site, walls, openings, furniture, networks, estimate — is one JSON document in integer millimetres. Anything you can do in the editor you can also do by editing that file, by hand or with an LLM assistant. This is often faster for bulk or precise changes: "move all interior walls 50 mm", "add sockets every 2 m along the living room walls", "replace the wall material everywhere".

## Two ways to get the file

**From the browser.** «⋯» → «Экспорт JSON» downloads the current plan; «Импорт JSON» validates a file and saves it as a new revision. Good for one-off edits.

**With scripts.** `scripts/plan-pull.sh` and `scripts/plan-push.sh` talk to the same API as the browser, so versioning and conflict detection work the same way. Good for repeated edits and for assistants that can run shell commands (Claude Code, Codex CLI, Aider and similar).

## Setting up the scripts

The scripts need `bash`, `curl` and `python3`. Create `.env.deploy` in the repository root (it is git-ignored) or export the variables:

```bash
HOUSE_URL=https://plan.example.com
HOUSE_PASSWORD=your-planner-password
```

`HOUSE_URL` falls back to `DEPLOY_URL` if that is already set for deployment. For a local Docker run use `http://localhost:8080`.

## The loop

```bash
scripts/plan-pull.sh                               # → plans/server.json
# edit plans/server.json
node scripts/plan-validate.mts plans/server.json   # same zod schema as the app
scripts/plan-push.sh                               # → new revision on the server
```

`plan-pull.sh` prints the revision, time, author and the number of walls and openings. `--rev N` fetches an older revision, `--out file` writes somewhere else. The `plans/` folder at the repository root is git-ignored.

`plan-push.sh [file]` sends the file with `If-Match: <rev>`, taking `rev` from the file itself (pull puts it there) or from `--rev N`. The author label defaults to `cli`; set it with `--author`, for example `--author assistant`, so you can tell those revisions apart in «Версии».

**Conflicts.** If the plan changed on the server after your pull, nothing is overwritten. The script saves the server copy as `plans/server.conflict.json` and exits with code `2`. Move your edits onto that copy (or pull again and repeat them) and push again.

Open browser tabs pick up the new revision; if one of them was in the middle of an edit, it reapplies the edit on top of your version.

## Working with an assistant

Give the assistant three things:

1. The format: [docs/plan-format.md](../../plan-format.md) (in Russian; any modern model reads it fine) and, for exact types, [src/model/schema.ts](../../../src/model/schema.ts).
2. The current plan, `plans/server.json`.
3. The rules below.

A system prompt that works well:

```text
You edit a house plan stored as JSON (format: docs/plan-format.md, schema: src/model/schema.ts).
Rules:
- All coordinates and sizes are integer millimetres. Axes: X along plot side 0–1, Y points down on screen.
- Walls are axis lines a→b; corners join only if the end points are exactly equal.
- Openings reference walls by wallId; offset is measured from wall point a; offset + width must not exceed the wall length.
- Every id is unique within its array; materialId and network material ids must exist.
- Do not change rev, updatedAt, author: the server manages them; rev is the base revision for If-Match.
- Change only what was asked. Keep unknown fields as they are.
After editing run: node scripts/plan-validate.mts plans/server.json, fix errors, then scripts/plan-push.sh --author assistant.
```

If the assistant can run commands, let it run the whole loop: pull, edit, validate, push, and report the new revision. If it cannot, paste the JSON (or the relevant part) into the chat, take the result back, and validate and push it yourself.

## Recipes

| Request | What changes in JSON |
|---|---|
| "Add a 5 m wall from the house corner to the east" | new item in `walls` with `a` at the corner (copy it from an existing wall end) and `b = a + (5000, 0)` |
| "A 1200 mm window centred on wall w2" | new item in `openings` with `wallId: "w2"`, `type: "window"`, `offset = (length of w2 − 1200) / 2`, `width: 1200`, `height`, `sill` |
| "Make the bedroom door open the other way" | flip `side` (`left` ↔ `right`) or `hinge` (`start` ↔ `end`) of that door |
| "Add a material from this product link" | new item in `materials` with `name`, `kind`, `thickness`, `price`, `pricePer`, `url`, `checkedAt`; then set `materialId` on the walls |
| "Label the room at the south-west corner as Kitchen" | new item in `rooms` with a point inside the room and `kind: "kitchen"` |
| "Mark the SIP panels as bought at 5400" | `estimate.purchases["auto:wall:sip-174"] = { "done": true, "actualPrice": 5400 }` |

Length of a wall is not stored: it is `√((b.x − a.x)² + (b.y − a.y)²)`.

## Pitfalls

- An invalid plan is rejected by the app on load and by `plan-validate.mts`; always validate before pushing.
- Deleting a wall in JSON does not delete its openings: remove them too, or validation fails on the dangling `wallId`.
- If the server has `site-fixed.json`, the boundary, street side, geo-reference and locked zones come from that file; edits to them in JSON are silently replaced. See [docs/api.md](../../api.md).
- Big plans fit in a chat, but for small changes it is cheaper to send only the relevant arrays and merge the answer back.
- Every push is a new revision kept forever, so a bad push is fixed by restoring the previous revision in «Версии».
