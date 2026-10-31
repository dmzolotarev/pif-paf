# Organizer guide

[English](organizer-guide.md) | [Русский](organizer-guide.ru.md)

## Before the game

1. Open `/admin` with your installation's password.
2. Set the game and newspaper names, context, time zone, and safety rules.
3. Leave groups empty or list the groups you need. Groups only organize the roster: all players share one cycle.
4. Choose the exposure rule. In one mode, a witnessed killer is eliminated; in the other, the attempt is cancelled and both players remain active. Players see only the selected rules.
5. Configure the newspaper delay and fog-of-war threshold. If approval during fog is enabled, the organizer must release those articles manually.
6. Optionally edit roles and newspaper formats. An empty role list is allowed; custom tags remain available.
7. Share the common link with a code, or create a shared invite link that skips the code. Creating a new invite link invalidates the old one.

Name preloading is optional. A registering player claims a preloaded entry with the same name. Completed profiles must have distinct names; add a recognizable detail if necessary.

Check completed profiles. The draw locks names, groups, and photos. At least three completed players are required; unfinished invitations are excluded from the round.

## During the game

Players see only their own target. A successful elimination requires the game's conditions: be alone together, make a finger-gun gesture, and say “pif-paf.” Explain safety rules and the selected witness rule before the game.

The eliminated player taps “Я выбыл” (“I'm out”), selects a reason, and confirms. The mode that cancels witnessed attempts offers only “Меня убили” (“I was killed”). Their predecessor immediately inherits their target. The eliminated player then submits circumstances and final words separately, without waiting for AI on that screen.

Pause blocks eliminations and hides targets. Resume preserves the same cycle.

Reset forgotten PINs in the player's card. Give the new code to the player privately. Their previous sessions are invalidated.

Before the draw, deletion removes a profile and its photo. During the game, exclusion preserves history while removing the player from the roster and rewiring the cycle. Excluded players can be restored after returning to registration.

## Newspaper and fog of war

Publication time is assigned on elimination. No browser tab needs to remain open: the server compares the time with `publish_at` when the feed is read. An open screen polls state every 12 seconds.

Ordinary articles appear automatically. Articles marked for manual approval wait for the organizer even after their delay expires. Turning fog off does not approve everything: review previously held articles in the editor.

Fog conceals the exact remaining count and roster statuses. It cannot erase earlier articles or what players already know.

The editor can revise an article, regenerate it with the same or a new format, publish it immediately, or suppress it. Diagnostics show the request body and model response, which can contain testimony and personal player data. API keys and Authorization headers are not recorded there.

## Corrections and ending

Undo latest elimination restores the last eliminated player and the previous links. Earlier events cannot be undone individually. If the roster has since been changed manually, returning to registration may be necessary.

The game ends automatically with one player left. The organizer can also finish early and select several active players as winners. The winner list can be corrected after the ending.

The ending immediately reveals all current articles, including held and suppressed ones, the full timeline, and statistics. Result timestamps record confirmation in the app rather than a proven time of the in-person event.

Redraw and start preserves profiles, clears events, articles, and diagnostics, and builds a new cycle. Return to registration also clears round history but reopens profiles. Save any results you need before using either action.

## Easter eggs

Three quick taps on rule 02 trigger finger-gun emoji rain; seven on rule 06 trigger the Six Seven effect. Taps must be no more than one second apart. Easter eggs can be disabled in the settings before the game starts.
