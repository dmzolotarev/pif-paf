# Pif-Paf

[English](README.md) | [Русский](README.ru.md)

A mobile web app for playing Assassin with friends. Every player hunts one person and is someone else's target. When a player confirms their elimination, the chain updates and an in-game newspaper tells the story.

The game interface is currently in Russian; the documentation is available in English and Russian.

Each installation hosts one private roster. The organizer configures the name, groups, roles, and newspaper theme in the admin panel. Groups are disabled by default. The game works without AI, webhooks, or a scheduler.

## Features

- Self-registration with a shared code or a shared invite link that skips the code; optional name preloading.
- Name, gallery or camera photo, optional group, preset role or custom tag, and feminine role labels.
- Personal four-digit PIN, a session cookie that remembers the player, temporary lockout after failed attempts, and organizer PIN resets.
- One random cycle containing all registered players. At least three players are required to start.
- Two witness rules: the exposed killer is eliminated, or the attempt is simply cancelled.
- A secret target with a photo and a concealing cover; a roster, player statuses, and fog of war.
- Two-step elimination confirmation with an immediate target update. Testimony is submitted separately without waiting for article generation.
- A newspaper with publication delays, random formats, template articles, and an optional AI journalist.
- Editors for prompts, themes, formats, and roles; article preview, editing, approval, suppression, and regeneration. Admin diagnostics show model requests and responses.
- Pause, resume, player exclusion, undo of the latest elimination, a new draw, and return to registration.
- Automatic victory for the last player or a manual ending with selected winners; a final timeline and statistics.
- Two small CSS Easter eggs in the rules; both can be disabled and respect `prefers-reduced-motion`.

## Local quick start

Install Node.js **22.18+** and npm. Local play does not require Cloudflare login.

```sh
npm ci
npm run secrets:generate
npm run db:migrate
npm run dev
```

Open the address printed by the dev server, usually `http://localhost:3000`. Visit `/admin` and enter `ORGANIZER_SECRET` from the local `.dev.vars` file. The setup script generates two independent secrets and leaves an existing file unchanged.

Configure the event in the admin panel, save the settings, and copy the shared link and game code. Players complete their profiles, then the organizer runs the draw. Use separate browser profiles to test multiple players.

## Deployment

The supported setup is **Cloudflare Workers + D1 + R2**. Each operator uses their own account, database, photo storage, and secrets.

The [hosting guide](docs/hosting.md) covers resource creation, migrations, production secrets, domains, backups, and shutdown. The core game needs no external API.

## Documentation

- [Organizer guide](docs/organizer-guide.md)
- [Settings, themes, and AI](docs/configuration.md)
- [Architecture](docs/architecture.md)
- [Contributing](CONTRIBUTING.md)
- [Coding agent instructions](AGENTS.md)
- [License and usage restrictions](docs/licensing.md)

The [nautical settings example](examples/nautical.json) can be imported in the admin panel before registration. It uses fictional group names.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local app with local D1/R2 |
| `npm run db:migrate` | Local database migrations |
| `npm run db:migrate:remote` | Database migrations in your Cloudflare account |
| `npm run build` | Production build |
| `npm run deploy` | Build and publish the Worker |
| `npm run typecheck` | TypeScript checks |
| `npm test` | Cycle mechanics, settings, database schema, statistics, and quotations |
| `npm run test:integration` | HTTP scenarios against a separate temporary local database |
| `npm run check` | Lint, TypeScript, unit tests, and build |
| `npm run audit:export` | Scan tracked files for common secrets and private deployment files |

Tests need no API key and make no paid API calls. Integration tests create their own local resources. Verification commands do not deploy anything.

## Scope and limitations

This is a trust-based game for friends. The app records confirmations; it does not prove what happened in person. The shared code restricts registration, while names and photos of completed profiles are available on the returning-player login screen. Do not use the app to store sensitive personal records.

The initial migration is for a **new, empty database**. There is no automatic import from earlier private installations. Do not apply the new baseline schema over an existing game.

## License

Created by [Dmitrii Zolotarev](https://github.com/dmzolotarev).

Pif-Paf 1.0.0 uses [PolyForm Noncommercial 1.0.0](LICENSE). You may run noncommercial games, modify the code, and distribute it under the license and notice requirements. Commercial use requires separate permission from the copyright holder. This is a source-available project under a noncommercial license.

See [licensing details](docs/licensing.md). Dependencies retain their own licenses.
