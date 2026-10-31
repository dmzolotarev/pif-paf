# Settings and customization

[English](configuration.md) | [Русский](configuration.ru.md)

## Event settings

Settings live in `games.settings_json`, are validated on the server, and are editable in the admin panel before the game starts. `lib/settings.ts` contains their type, neutral defaults, and validation.

| Field | Purpose |
| --- | --- |
| `title`, `newspaperTitle`, `tagline` | Game title, newspaper title, and tagline |
| `setting` | Event context for the journalist |
| `timezone` | IANA time zone for results; data is stored in UTC |
| `groupLabel`, `groups` | Group label and list; `[]` disables grouping |
| `safetyRules` | Phrases included in the rule about a safe moment to play |
| `publicationDelayMin`, `publicationDelayMax` | Random delay from 0 to 1440 minutes; equal values give a fixed delay |
| `fogThreshold` | Automatic fog at this number of active players or fewer |
| `approveDuringFog` | New articles during fog require approval |
| `easterEggs` | Visual Easter eggs |

Importing JSON in the admin panel fills the editor; click Save to apply it. See `examples/nautical.json`. Configure groups before registration: groups in use cannot be deleted or renamed. An empty list disables grouping.

The model, prompts, roles, and game switches are stored separately from this JSON. Secrets are never part of an imported theme.

## Authentication and secrets

`ORGANIZER_SECRET` is the admin password. `PLAYER_AUTH_SECRET` is an independent key used to sign sessions and calculate salted PIN hashes. The shared game code is generated when an empty database first loads and can be changed in the admin panel.

An HttpOnly cookie remembers a player on the same device. After clearing the browser, the player selects their profile and enters their PIN. Five failed attempts lock that profile for 15 minutes; the organizer can reset the PIN. The limit applies to the profile rather than the whole installation.

## AI journalist

Without `OPENAI_API_KEY` or a selected model, articles use templates. To enable AI, put the key in Worker secrets and enter a model ID available to your API project that supports the Responses API and JSON Schema Structured Outputs.

Never store the key in source files or public frontend variables. For `reasoning.effort`, choose a value supported by the model; `default` omits the parameter entirely. API errors produce a template article and an explanation in diagnostics.

The prompt has separate parts: a hidden-game-data filter, the main editorial instruction, event name and context, theme, random format, testimony handling, role-tag handling, and additional organizer instructions.

Creative parts are editable in the admin panel. A short filter against revealing the killer or target remains in code; player testimony is marked as untrusted material. Other names are masked before generation and checked in the result. These are practical safeguards for a game among friends, not a guarantee against every possible clue.

Roles, themes, testimony modes, and formats can be added and removed. Each item has a stable unique key. At least one format must remain for each elimination reason. Deleting a format does not erase articles already written with it.

The API key is excluded from diagnostics. Request text, the API response, the parsed article, and fallback reasons are recorded. Consider that when backing up data or sharing admin screenshots.

Official references: [Responses API](https://developers.openai.com/api/docs/guides/responses), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [reasoning](https://developers.openai.com/api/docs/guides/reasoning).
