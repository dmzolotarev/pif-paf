import { buildFinalStats, type FinalTimelineRecord } from "@/lib/final-stats";
import { parseWinnerIds } from "@/lib/finale";
import { bindings, currentPlayer, ensureGame, GAME_ID, isFogOfWarActive, jsonError, type ExposureRule, type FogMode, type GameStatus } from "@/lib/game";
import { readSettings } from "@/lib/settings";
import { crewRoles, roleLabel } from "@/lib/roles";

export async function GET(request: Request) {
  try {
    await ensureGame();
    const { DB } = bindings();
    const now = new Date().toISOString();
    const game = await DB.prepare(
      "SELECT id, title, settings_json, status, started_at, ended_at, winner_id, winner_ids_json, crew_roles_json, fog_mode, exposure_rule FROM games WHERE id = ?",
    )
      .bind(GAME_ID)
      .first<{
        id: string;
        title: string;
        status: GameStatus;
        started_at: string | null;
        ended_at: string | null;
        winner_id: string | null;
        winner_ids_json: string;
        crew_roles_json: string;
        fog_mode: FogMode;
        exposure_rule: ExposureRule;
        settings_json: string;
      }>();
    const config = readSettings(game?.settings_json);
    const configuredRoles = crewRoles(game?.crew_roles_json);

    const rosterRows = await DB.prepare(
      `SELECT p.id, p.name, p.group_name, p.role_key, p.custom_role, p.feminine, p.photo_key,
              CASE
                WHEN p.status = 'eliminated' AND (e.publish_at IS NULL OR e.publish_at <= ?)
                  AND (e.approval_required = 0 OR e.approved_at IS NOT NULL)
                THEN 'eliminated' ELSE 'active'
              END AS public_status,
              CASE
                WHEN p.status = 'eliminated' AND (e.publish_at IS NULL OR e.publish_at <= ?)
                  AND (e.approval_required = 0 OR e.approved_at IS NOT NULL)
                THEN e.type ELSE NULL
              END AS public_reason
         FROM players p
         LEFT JOIN events e
           ON e.eliminated_player_id = p.id AND e.undone_at IS NULL
        WHERE p.game_id = ? AND p.profile_completed = 1 AND p.status != 'removed'
        ORDER BY p.group_name ASC, p.name COLLATE NOCASE ASC`,
    )
      .bind(now, now, GAME_ID)
      .all<{
        id: string;
        name: string;
        group_name: string;
        role_key: string;
        custom_role: string;
        feminine: number;
        photo_key: string | null;
        public_status: "active" | "eliminated";
        public_reason: "killed" | "exposed" | null;
      }>();
    const roster = rosterRows.results.map((item) => ({
      id: item.id,
      name: item.name,
      group_name: item.group_name,
      role: roleLabel(item.role_key, Boolean(item.feminine), item.custom_role, configuredRoles),
      hasPhoto: Boolean(item.photo_key),
      status: item.public_status,
      eliminationReason: item.public_reason,
    }));

    const events = await DB.prepare(
      `SELECT e.id, e.type, e.epitaph, e.publish_at, e.article_format,
              e.article_section, e.article_headline, e.article_body, e.article_quote,
              e.article_suppressed, p.id AS player_id, p.name, p.feminine,
              p.photo_key IS NOT NULL AS has_photo
         FROM events e
         JOIN players p ON p.id = e.eliminated_player_id
        WHERE e.game_id = ? AND e.undone_at IS NULL
          AND (e.publish_at IS NULL OR e.publish_at <= ?)
          AND (e.approval_required = 0 OR e.approved_at IS NOT NULL)
        ORDER BY e.revision DESC
        LIMIT ?`,
      )
      .bind(GAME_ID, now, game?.status === "finished" ? -1 : 30)
      .all<{
        id: string;
        type: "killed" | "exposed";
        epitaph: string;
        publish_at: string | null;
        article_format: string | null;
        article_section: string | null;
        article_headline: string | null;
        article_body: string | null;
        article_quote: string | null;
        article_suppressed: number;
        player_id: string;
        has_photo: number;
        name: string;
        feminine: number;
      }>();

    const player = await currentPlayer(request);
    let target: { id: string; name: string; group_name: string; role: string; hasPhoto: boolean } | null = null;
    if (player?.status === "active" && player.target_id && game?.status === "running") {
      const row = await DB.prepare(
        "SELECT id, name, group_name, role_key, custom_role, feminine, photo_key FROM players WHERE id = ? AND status = 'active'",
      )
        .bind(player.target_id)
        .first<{ id: string; name: string; group_name: string; role_key: string; custom_role: string; feminine: number; photo_key: string | null }>();
      if (row) {
        target = {
          id: row.id,
          name: row.name,
          group_name: row.group_name,
          role: roleLabel(row.role_key, Boolean(row.feminine), row.custom_role, configuredRoles),
          hasPhoto: Boolean(row.photo_key),
        };
      }
    }

    let press: { type: "killed" | "exposed"; submitted: boolean } | null = null;
    if (player?.status === "eliminated") {
      const row = await DB.prepare(
        `SELECT type, press_submitted_at
           FROM events
          WHERE game_id = ? AND eliminated_player_id = ? AND undone_at IS NULL
          ORDER BY revision DESC
          LIMIT 1`,
      )
        .bind(GAME_ID, player.id)
        .first<{ type: "killed" | "exposed"; press_submitted_at: string | null }>();
      if (row) press = { type: row.type, submitted: Boolean(row.press_submitted_at) };
    }

    const publicGameStatus = game?.status ?? "draft";
    const winnerIds = publicGameStatus === "finished" && game
      ? parseWinnerIds(game.winner_ids_json, game.winner_id) : [];
    const winnerRows = winnerIds.length
      ? await DB.prepare(
          `SELECT id, name, group_name, photo_key IS NOT NULL AS has_photo
             FROM players WHERE game_id = ? AND status = 'active'
               AND id IN (${winnerIds.map(() => "?").join(",")})`,
        ).bind(GAME_ID, ...winnerIds).all<{ id: string; name: string; group_name: string; has_photo: number }>()
      : null;
    const winnerById = new Map(winnerRows?.results.map((person) => [person.id, person]));
    const winners = winnerIds.flatMap((id) => {
      const person = winnerById.get(id);
      return person ? [{ id: person.id, name: person.name, group_name: person.group_name, hasPhoto: Boolean(person.has_photo) }] : [];
    });

    let finalTimeline: FinalTimelineRecord[] = [];
    if (publicGameStatus === "finished") {
      const timelineRows = await DB.prepare(
        `SELECT e.id, e.type, e.created_at AS occurred_at,
                eliminated.id AS eliminated_id, eliminated.name AS eliminated_name,
                eliminated.group_name AS eliminated_boat, eliminated.photo_key IS NOT NULL AS eliminated_has_photo,
                predecessor.id AS predecessor_id, predecessor.name AS predecessor_name,
                predecessor.group_name AS predecessor_boat, predecessor.photo_key IS NOT NULL AS predecessor_has_photo,
                inherited.id AS inherited_id, inherited.name AS inherited_name,
                inherited.group_name AS inherited_boat, inherited.photo_key IS NOT NULL AS inherited_has_photo
           FROM events e
           JOIN players eliminated ON eliminated.id = e.eliminated_player_id
           JOIN players predecessor ON predecessor.id = e.predecessor_id
           JOIN players inherited ON inherited.id = e.inherited_target_id
          WHERE e.game_id = ? AND e.undone_at IS NULL
          ORDER BY e.revision ASC`,
      )
        .bind(GAME_ID)
        .all<{
          id: string;
          type: "killed" | "exposed";
          occurred_at: string;
          eliminated_id: string;
          eliminated_name: string;
          eliminated_boat: string;
          eliminated_has_photo: number;
          predecessor_id: string;
          predecessor_name: string;
          predecessor_boat: string;
          predecessor_has_photo: number;
          inherited_id: string;
          inherited_name: string;
          inherited_boat: string;
          inherited_has_photo: number;
        }>();
      finalTimeline = timelineRows.results.map((event) => ({
        id: event.id,
        type: event.type,
        occurredAt: event.occurred_at,
        killer: event.type === "killed"
          ? { id: event.predecessor_id, name: event.predecessor_name, group_name: event.predecessor_boat, hasPhoto: Boolean(event.predecessor_has_photo) }
          : { id: event.eliminated_id, name: event.eliminated_name, group_name: event.eliminated_boat, hasPhoto: Boolean(event.eliminated_has_photo) },
        victim: event.type === "killed"
          ? { id: event.eliminated_id, name: event.eliminated_name, group_name: event.eliminated_boat, hasPhoto: Boolean(event.eliminated_has_photo) }
          : { id: event.inherited_id, name: event.inherited_name, group_name: event.inherited_boat, hasPhoto: Boolean(event.inherited_has_photo) },
      }));
    }
    const finalStats = publicGameStatus === "finished" ? buildFinalStats(finalTimeline) : null;

    const actualActiveCount = await DB.prepare(
      "SELECT COUNT(*) AS count FROM players WHERE game_id = ? AND profile_completed = 1 AND status = 'active'",
    )
      .bind(GAME_ID)
      .first<{ count: number }>();
    const fogOfWar = game
      ? isFogOfWarActive(game.fog_mode, publicGameStatus, Number(actualActiveCount?.count ?? 0), config.fogThreshold)
      : false;
    const publicRoster = fogOfWar
      ? roster.map((item) => ({ ...item, status: "active" as const, eliminationReason: null }))
      : roster;

    return Response.json({
      config,
      game: {
        status: publicGameStatus,
        activeCount: fogOfWar ? null : roster.filter((item) => item.status === "active").length,
        totalCount: roster.length,
        fogOfWar,
        exposureRule: game?.exposure_rule ?? "eliminate_killer",
        winners,
      },
      events: events.results,
      roster: publicRoster,
      crewRoles: configuredRoles,
      player: player
        ? {
            id: player.id,
            name: player.name,
            group_name: player.group_name,
            roleKey: player.role_key,
            role: roleLabel(player.role_key, Boolean(player.feminine), player.custom_role, configuredRoles),
            customRole: player.custom_role,
            feminine: Boolean(player.feminine),
            profileComplete: Boolean(player.profile_completed),
            hasPin: Boolean(player.pin_hash),
            status: player.status,
            hasPhoto: Boolean(player.photo_key),
            eliminationReason: player.elimination_reason,
          }
        : null,
      target,
      press,
      finalTimeline,
      finalStats,
    });
  } catch (error) {
    return jsonError(error);
  }
}
