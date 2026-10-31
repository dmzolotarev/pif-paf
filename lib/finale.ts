import { GAME_ID } from "./game";

// Release every article when the game ends, including held and suppressed ones.
// Keep past publication times intact so the feed retains its chronology.
export function releaseFinalArticles(DB: D1Database, now: string) {
  return DB.prepare(
    `UPDATE events
        SET publish_at = CASE
              WHEN publish_at IS NULL OR publish_at > ?
                OR (approval_required = 1 AND approved_at IS NULL)
              THEN ? ELSE publish_at END,
            approved_at = CASE WHEN approval_required = 1
              THEN COALESCE(approved_at, ?) ELSE approved_at END,
            article_suppressed = 0
      WHERE game_id = ? AND undone_at IS NULL
        AND EXISTS (SELECT 1 FROM games g
                     WHERE g.id = events.game_id AND g.status = 'finished' AND g.ended_at = ?)`,
  ).bind(now, now, now, GAME_ID, now);
}

export function parseWinnerIds(json: string, legacyId: string | null): string[] {
  try {
    const ids: unknown = JSON.parse(json);
    if (Array.isArray(ids) && ids.length > 0) {
      return [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
    }
  } catch { /* Old games still have winner_id. */ }
  return legacyId ? [legacyId] : [];
}
