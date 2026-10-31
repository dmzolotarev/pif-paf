# Architecture

[English](architecture.md) | [Русский](architecture.ru.md)

React 19 + TypeScript, Vinext/Vite, a Cloudflare Worker, D1, and R2. One installation serves one game with the internal ID `default`.

- `app/GameApp.tsx`: state loading, tabs, and current-player actions.
- `app/components/`: login and profiles, roster, testimony, and results.
- `app/admin/`: game management, with separate event and journalist settings components.
- `app/api/`: server-side authorization and game operations.
- `lib/game-engine.ts`: pure functions for the draw and single-cycle validation.
- `lib/game.ts`: bindings, sessions, PINs, and shared server functions.
- `lib/mutation.ts`: stale-revision protection for atomic cycle updates.
- `lib/settings.ts`: settings and validation; `settings-store.ts` reads them from D1.
- `lib/journalist*.ts`, `article-generation.ts`: formats, prompts, generation, fallback, and diagnostics.
- `lib/finale.ts`, `final-stats.ts`: releasing articles at the ending and calculating results.
- `db/schema.ts`, `drizzle/`: table definitions and baseline migrations for new installations.
- `worker/index.ts`, `vite.config.ts`, `wrangler.jsonc`: the standalone Cloudflare runtime.

## Data

`games` stores settings and the revision. `players` stores profiles, photo keys, statuses, and current targets. `events` stores eliminations with previous links, testimony, and articles. `article_generations` stores admin diagnostics. `game_mutations` stores unique mutation revisions that cannot be applied twice.

D1 contains photo object keys; the photos themselves live in a private R2 bucket. Local resources are stored in `.wrangler/`, excluded from Git, and not uploaded automatically on deployment.

## Invariants

With at least two active players, everyone has one target and one predecessor, forming a single cycle. Eliminated players have no target. The final winner also has no target. Groups do not affect the draw.

Cycle updates use D1 `batch`. The first operation claims the next revision in `game_mutations`; a conflict rolls back the entire batch. Revisions are not reset between rounds. Events retain previous links so the latest elimination can be undone.

The client does not calculate new targets. The state API returns only the current player's target. Full links are available to the organizer and are revealed in the completed game's results.

## Publication

`publish_at` is the earliest time an article can appear in the feed. Reads also check manual approval. No Cron or external scheduling service is used. An open client polls the server every 12 seconds.

The testimony HTTP request finishes before generation, which runs through `after()`. If generation fails, a template is available. The organizer can inspect the status and regenerate. There is no durable queue with guaranteed retries.

The ending releases delays and publication restrictions for current events. The leaderboard counts successful kills only; exposure does not award the killer a kill.
