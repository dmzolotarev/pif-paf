import {
  bindings,
  currentPlayer,
  ensureGame,
  GAME_ID,
  isFogOfWarActive,
  jsonError,
  randomEpitaph,
  type EliminationReason,
} from "@/lib/game";
import { chooseArticleFormat, fallbackArticle } from "@/lib/journalist";
import { releaseFinalArticles } from "@/lib/finale";
import { readSettings } from "@/lib/settings";
import { randomInteger } from "@/lib/game-engine";
import { mutationGuard } from "@/lib/mutation";
import { crewRoles, roleLabel } from "@/lib/roles";

export async function POST(request: Request) {
  try {
    await ensureGame();
    let player = await currentPlayer(request);
    if (!player) return Response.json({ error: "Откройте персональную ссылку" }, { status: 401 });
    if (player.status !== "active") return Response.json({ error: "Вы уже выбыли" }, { status: 409 });

    const body = (await request.json()) as { reason?: EliminationReason };
    const reason = body.reason;
    if (reason !== "killed" && reason !== "exposed") {
      return Response.json({ error: "Выберите причину выбытия" }, { status: 400 });
    }

    const { DB } = bindings();
    const game = await DB.prepare("SELECT status, revision, settings_json, journalist_formats_json, crew_roles_json, exposure_rule, fog_mode FROM games WHERE id = ?")
      .bind(GAME_ID)
      .first<{ status: string; revision: number; settings_json: string; journalist_formats_json: string; crew_roles_json: string; exposure_rule: "eliminate_killer" | "cancel_kill"; fog_mode: "auto" | "on" | "off" }>();
    if (game?.status !== "running") {
      return Response.json({ error: "Игра сейчас не идёт" }, { status: 409 });
    }
    if (reason === "exposed" && game.exposure_rule === "cancel_kill") {
      return Response.json({ error: "В этой игре рассекречивание отменяет попытку, но не выводит киллера из игры" }, { status: 409 });
    }
    const config = readSettings(game.settings_json);
    // Refresh the target after reading the game revision. A concurrent change
    // after this snapshot is rejected by mutationGuard in the atomic batch.
    player = await currentPlayer(request);
    if (!player || player.status !== "active") return Response.json({ error: "Вы уже выбыли" }, { status: 409 });

    const active = await DB.prepare(
      "SELECT COUNT(*) AS count FROM players WHERE game_id = ? AND status = 'active'",
    )
      .bind(GAME_ID)
      .first<{ count: number }>();
    if (Number(active?.count ?? 0) <= 1 || !player.target_id) {
      return Response.json({ error: "В игре уже определён победитель" }, { status: 409 });
    }

    const predecessor = await DB.prepare(
      "SELECT id FROM players WHERE game_id = ? AND status = 'active' AND target_id = ?",
    )
      .bind(GAME_ID, player.id)
      .first<{ id: string }>();
    if (!predecessor) throw new Error("Не удалось найти киллера игрока");

    const nextRevision = Number(game.revision) + 1;
    const winnerId = Number(active?.count) === 2 ? predecessor.id : null;
    const now = new Date().toISOString();
    const approvalRequired = config.approveDuringFog && isFogOfWarActive(game.fog_mode, "running", Number(active?.count) - 1, config.fogThreshold);
    const recentFormats = await DB.prepare(
      `SELECT article_format
         FROM events
        WHERE game_id = ? AND undone_at IS NULL AND article_format IS NOT NULL
        ORDER BY revision DESC
        LIMIT 3`,
    )
      .bind(GAME_ID)
      .all<{ article_format: string }>();
    const format = chooseArticleFormat(reason, recentFormats.results.map((item) => item.article_format), game.journalist_formats_json);
    const initialArticle = fallbackArticle({
      name: player.name,
      group_name: player.group_name,
      role: roleLabel(player.role_key, Boolean(player.feminine), player.custom_role, crewRoles(game.crew_roles_json)),
      feminine: Boolean(player.feminine),
      reason,
      format,
    });
    const delayMinutes = config.publicationDelayMin + randomInteger(config.publicationDelayMax - config.publicationDelayMin + 1);
    const publishAt = winnerId ? now : new Date(Date.now() + delayMinutes * 60_000).toISOString();
    const eventId = crypto.randomUUID();

    await DB.batch([
      mutationGuard(game.revision),
      DB.prepare(
        `INSERT INTO events
          (id, game_id, revision, eliminated_player_id, predecessor_id, inherited_target_id,
           type, epitaph, publish_at, approval_required, article_format, article_section, article_headline,
           article_body, article_quote, article_generated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        eventId,
        GAME_ID,
        nextRevision,
        player.id,
        predecessor.id,
        player.target_id,
        reason,
        randomEpitaph(reason),
        publishAt,
        approvalRequired ? 1 : 0,
        format.key,
        initialArticle.section,
        initialArticle.headline,
        initialArticle.body,
        initialArticle.quote,
        now,
        now,
      ),
      DB.prepare(
        "UPDATE players SET target_id = ? WHERE id = ? AND status = 'active' AND target_id = ?",
      ).bind(winnerId ? null : player.target_id, predecessor.id, player.id),
      DB.prepare(
        `UPDATE players
            SET status = 'eliminated', target_id = NULL, eliminated_at = ?, elimination_reason = ?
          WHERE id = ? AND status = 'active'`,
      ).bind(now, reason, player.id),
      DB.prepare(
        `UPDATE games
            SET revision = ?, status = ?, winner_id = ?, winner_ids_json = ?, ended_at = ?
          WHERE id = ? AND revision = ? AND status = 'running'`,
      ).bind(
        nextRevision,
        winnerId ? "finished" : "running",
        winnerId,
        winnerId ? JSON.stringify([winnerId]) : "[]",
        winnerId ? now : null,
        GAME_ID,
        game.revision,
      ),
      ...(approvalRequired ? [
        DB.prepare(
          `UPDATE events SET approval_required = 1
            WHERE game_id = ? AND undone_at IS NULL AND approved_at IS NULL
              AND publish_at > ?`,
        ).bind(GAME_ID, now),
      ] : []),
      ...(winnerId ? [releaseFinalArticles(DB, now)] : []),
    ]);

    return Response.json({ ok: true, winner: Boolean(winnerId), eventId });
  } catch (error) {
    return jsonError(error);
  }
}
