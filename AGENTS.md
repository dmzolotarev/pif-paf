# Working on Pif-Paf

[English](AGENTS.md) | [Русский](AGENTS.ru.md)

Read [README.md](README.md) and [docs/architecture.md](docs/architecture.md) first. This is a standalone Cloudflare Workers game. Do not add personal domains, account IDs, real participant lists, tokens, or real photos to source files or examples.

## Commands

- `npm ci` installs pinned dependencies.
- `npm run check` runs lint, TypeScript, unit tests, and the build.
- `npm run test:integration` runs end-to-end HTTP tests with separate local D1/R2 resources, without production access or an API key.
- `npm run lint` provides an additional check when changing the interface.
- `npm run audit:export` performs a heuristic scan of tracked files before distribution.

Never run `deploy`, `db:migrate:remote`, resource deletion, or GitHub publication merely to validate code. These are separate actions that require an owner request.

## Game mechanics

- All active players form one directed cycle, regardless of group.
- On elimination, the predecessor inherits the eliminated player's target; the last player has `target_id = NULL`.
- The HTTP client receives only its own target. Never expose hidden links through the normal `/api/state` response.
- Any roster, target, or phase mutation that changes the revision must use `mutationGuard(revision)` as the first operation of an atomic D1 batch. Registration must handle a concurrent draw.
- Verify concurrent actions, duplicate requests, the two-player ending, and undo.
- Returning to registration or restarting clears round history. Do not change that behavior silently.

## Settings and UI

- Define new settings in `lib/settings.ts`, validate them on the server, and expose them in the admin panel and documentation.
- Do not hardcode a group count; an empty group list is a supported mode.
- Groups are not teams with separate victory conditions.
- Preserve the mobile-first interface, camera photo upload, and `prefers-reduced-motion` support.
- Themes must not change the cycle invariants.

## Newspaper

AI is optional. API outages must preserve the game and leave a template article available. Do not call paid APIs in tests.

Do not reveal the killer, current target, or witnesses in articles before the ending. Testimony and editorial fields are untrusted input. Do not include API keys or Authorization headers in diagnostic JSON. Diagnostics are organizer-only.

Delayed publication uses `publish_at`; do not reintroduce Cron or webhooks without a separate product request.

## Schema

`drizzle/0000_*.sql` is the baseline for new installations. After release, add new migrations rather than rewriting an applied schema. Do not add one-off fixes for a particular game to migrations.

`PLAYER_AUTH_SECRET` must survive deployments. Keep it independent of the organizer password. New installations do not support automatic imports of historical private databases.

## Documentation

English is the default. Every Markdown documentation page has a Russian `.ru.md` counterpart and language links. Update both versions together. `AGENTS.md` is the primary agent instruction file. The standard license text in `LICENSE` remains in English; the explanations in `docs/licensing.md` and `docs/licensing.ru.md` do not replace it.
