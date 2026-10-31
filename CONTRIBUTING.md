# Contributing

[English](CONTRIBUTING.md) | [Русский](CONTRIBUTING.ru.md)

Discuss changes to game mechanics before starting a large refactor. Describe the observed behavior, the reason for the change, and how you verified it.

Before submitting, run `npm run check` and `npm run test:integration`. For UI changes, check a narrow screen, keyboard access, and reduced motion. Cover new cycle rules with meaningful scenarios, including concurrent actions.

Use fictional data. Do not attach databases, participant photos, API keys, or unredacted diagnostic snapshots. Keep `.dev.vars`, `.env*`, `.wrangler/`, and build output local.

Make new settings available to the organizer and document them. Preserve play without AI and without groups.

See [AGENTS.md](AGENTS.md) for coding agent instructions. Update English and Russian documentation together and preserve the language links.

The project uses [PolyForm Noncommercial 1.0.0](LICENSE); dependencies retain their own licenses. Read the [licensing details](docs/licensing.md) before contributing.
