## What and why

<!-- What this pull request changes and the reason. Link the issue: Closes #123 -->

## How it was checked

<!-- Browser steps, plan used, screenshots for visible changes (desktop and, if UI changed, phone width under 700 px). -->

## Checklist

- [ ] `npx tsc -b`, `npm run build`, `npm run plan:validate` and `npm run lint` pass
- [ ] Plan format changes are backward compatible and described in `docs/plan-format.md`; `CLIENT_VERSION` and `MIN_CLIENT_VERSION` raised together if old clients could lose data
- [ ] API changes are described in `docs/api.md`
- [ ] UI uses primitives from `src/ui/` and tokens from `src/styles/tokens.css`; no comments in CSS
- [ ] Norm-based checks name the document and clause
- [ ] No personal data: addresses, cadastral numbers, names, private domains, passwords
- [ ] `CHANGELOG.md` updated under "Unreleased" for user-visible changes
