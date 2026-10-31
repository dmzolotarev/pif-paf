# Hosting your own game

[English](hosting.md) | [Русский](hosting.ru.md)

The supported setup uses Cloudflare Workers for the app, D1 for state, and R2 for photos. Follow these steps in your own account. Check the services' current documentation for terms and pricing.

## 1. Preparation

Install Node.js 22.18+ and clone the repository. Run:

```sh
npm ci
npx wrangler login
npx wrangler d1 create pif-paf-db
npx wrangler r2 bucket create pif-paf-photos
```

Cloudflare may require enabling R2 for your account. Keep the new bucket private: the app serves the photos.

In `wrangler.jsonc`, replace the placeholder `database_id` with the ID returned by `d1 create`. If you chose different resource names, update `database_name`, `bucket_name`, and the Worker name. Keep the binding names `DB`, `PHOTOS`, and `ASSETS`.

The template contains no account ID, domain, or someone else's database ID. The zero UUID is for local development and does not identify a production database.

## 2. Database and first deployment

```sh
npm run db:migrate:remote
npm run deploy
```

Apply migrations before publishing a new version. `deploy` does not apply them automatically. The Cloudflare Vite plugin writes the built Worker's configuration; `wrangler deploy` uses the build output.

The first run creates an empty game with a random registration code. Organizer login and registration will not be ready until production secrets are configured.

## 3. Secrets

```sh
npx wrangler secret put ORGANIZER_SECRET
npx wrangler secret put PLAYER_AUTH_SECRET
```

Enter **different, long, random values**. The first is the organizer password. The second signs player sessions and PIN hashes; retain it for upgrades and backup restoration.

For local values, `npm run secrets:generate` writes the ignored `.dev.vars` file. This file is not automatically uploaded as production secrets.

For generated newspaper articles, optionally add:

```sh
npx wrangler secret put OPENAI_API_KEY
```

Select the model in the admin panel. Without a key, the newspaper uses templates. The key is never sent to the browser. Use your own API project; its settings determine access and costs.

No Cron, separate scheduling Worker, or webhook needs to be configured.

## 4. First login

Open the `workers.dev` address returned by deployment, then visit `/admin`. Enter `ORGANIZER_SECRET` and configure the name, groups, and rules. Save them before players register. Share the common link and code, or create a shared invite link that skips the code.

## 5. Custom domain

In Cloudflare, open the Worker → Settings → Domains & Routes → add a Custom Domain. Use a domain you control. Verify login and photos at the new address before sharing it with players.

Sessions belong to the domain. After changing the address, players sign in again with their name and PIN.

## Upgrades

Make a backup, obtain the new source version, run `npm ci`, `npm run check`, `npm run db:migrate:remote`, then `npm run deploy`. Keep `PLAYER_AUTH_SECRET` unchanged during normal upgrades, or existing PINs and sessions will stop working.

The repository pins tool versions that were tested together. Upgrade Vinext and the Cloudflare Vite plugin separately from game-rule changes and verify them with integration tests.

## Backups

Export D1:

```sh
npx wrangler d1 export DB --remote --output game-backup.sql
```

Keep the export outside Git: it contains names, history, PIN hashes, and article diagnostics. A full restoration also needs the R2 objects and the same `PLAYER_AUTH_SECRET`. The SQL export alone does not include photos. Back up R2 separately using R2/S3 tools.

## Shutdown

The Pause button blocks game actions while leaving the app accessible. To close access to the installation, configure access restrictions in Cloudflare or delete its Worker through the dashboard. Keeping D1/R2 allows later restoration. Deleting a database or bucket is a separate irreversible action and is not required to stop the app.

## Other platforms

The current version uses Cloudflare bindings directly. VPS/Docker, Vercel, and static hosting are not documented as supported deployment methods. They would require different database and photo-storage adapters.

References: [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [R2](https://developers.cloudflare.com/r2/).
