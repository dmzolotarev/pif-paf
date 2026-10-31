import { generateEventArticle } from "@/lib/article-generation";
import { normalizeArticleQuote } from "@/lib/article-quote";
import { parseWinnerIds, releaseFinalArticles } from "@/lib/finale";
import {
  ADMIN_COOKIE,
  bindings,
  ensureGame,
  GAME_ID,
  hashPin,
  hashSecret,
  isExposureRule,
  isFogMode,
  isFogOfWarActive,
  jsonError,
  makePinSalt,
  makeSecret,
  organizerSecret,
  requireAdmin,
  sessionCookie,
  type ExposureRule,
  type FogMode,
  type GameStatus,
} from "@/lib/game";
import { getSettings } from "@/lib/settings-store";
import { readSettings, validateSettings } from "@/lib/settings";
import { drawCycle } from "@/lib/game-engine";
import { mutationGuard } from "@/lib/mutation";
import {
  CORE_PROMPT,
  DEFAULT_JOURNALIST_EFFORT,
  DEFAULT_JOURNALIST_MODEL,
  DEFAULT_ROLE_PROMPT,
  DEFAULT_SOURCE_PROMPT,
  isJournalistDetailMode,
  isJournalistEffort,
  isJournalistPreset,
  journalistDetailModes,
  journalistFormats,
  journalistPresets,
  type JournalistDetailModeConfig,
  type JournalistFormatConfig,
  type JournalistPreset,
} from "@/lib/journalist-config";
import { crewRoles, type CrewRole } from "@/lib/roles";

type NewPlayer = { name?: string; group_name?: string };

async function adminState() {
  const { DB } = bindings();
  const game = await DB.prepare(
    `SELECT status, started_at, ended_at, winner_id, winner_ids_json, revision, access_code,
            registration_invite_hash IS NOT NULL AS has_registration_invite,
            journalist_preset, journalist_detail_mode, journalist_notes,
            journalist_model, journalist_effort, journalist_core_prompt,
            journalist_source_prompt, journalist_role_prompt,
            journalist_presets_json, journalist_detail_modes_json,
            journalist_formats_json, crew_roles_json, settings_json, fog_mode, exposure_rule
       FROM games WHERE id = ?`,
  )
    .bind(GAME_ID)
    .first<{
      status: GameStatus;
      started_at: string | null;
      ended_at: string | null;
      winner_id: string | null;
      winner_ids_json: string;
      revision: number;
      access_code: string;
      has_registration_invite: number;
      journalist_preset: string;
      journalist_detail_mode: string;
      journalist_notes: string;
      journalist_model: string;
      journalist_effort: string;
      journalist_core_prompt: string;
      journalist_source_prompt: string;
      journalist_role_prompt: string;
      journalist_presets_json: string;
      journalist_detail_modes_json: string;
      journalist_formats_json: string;
      crew_roles_json: string;
      settings_json: string;
      fog_mode: FogMode;
      exposure_rule: ExposureRule;
    }>();
  const players = await DB.prepare(
    `SELECT id, name, group_name, role_key, custom_role, feminine, profile_completed,
            status, photo_key IS NOT NULL AS has_photo,
            target_id, eliminated_at, elimination_reason, removed_at,
            pin_hash IS NOT NULL AS has_pin
       FROM players
      WHERE game_id = ?
      ORDER BY status ASC, name COLLATE NOCASE ASC`,
  )
    .bind(GAME_ID)
    .all();
  const articles = await DB.prepare(
    `SELECT e.id, e.type, e.article_format, e.article_section, e.article_headline,
            e.article_body, e.article_quote, e.publish_at, e.press_submitted_at,
            e.approval_required, e.approved_at,
            e.article_manual, e.article_suppressed, e.article_status, e.undone_at,
            (SELECT COUNT(*) FROM article_generations ag WHERE ag.event_id = e.id) AS generation_count,
            (SELECT ag.outcome FROM article_generations ag WHERE ag.event_id = e.id ORDER BY ag.created_at DESC LIMIT 1) AS latest_generation_outcome,
            (SELECT ag.fallback_reason FROM article_generations ag WHERE ag.event_id = e.id ORDER BY ag.created_at DESC LIMIT 1) AS latest_fallback_reason,
            p.name AS player_name, p.group_name
       FROM events e
       JOIN players p ON p.id = e.eliminated_player_id
      WHERE e.game_id = ?
      ORDER BY e.revision DESC
      LIMIT 30`,
  )
    .bind(GAME_ID)
    .all();
  const history = await DB.prepare(
    `SELECT e.id, e.type, e.epitaph, e.created_at, e.undone_at,
            p.name AS player_name, predecessor.name AS predecessor_name,
            inherited.name AS inherited_name
       FROM events e
       JOIN players p ON p.id = e.eliminated_player_id
       JOIN players predecessor ON predecessor.id = e.predecessor_id
       JOIN players inherited ON inherited.id = e.inherited_target_id
      WHERE e.game_id = ?
      ORDER BY e.revision DESC
      LIMIT 50`,
  )
    .bind(GAME_ID)
    .all();
  const active = await DB.prepare(
    "SELECT COUNT(*) AS count FROM players WHERE game_id = ? AND profile_completed = 1 AND status = 'active'",
  )
    .bind(GAME_ID)
    .first<{ count: number }>();
  const config = readSettings(game?.settings_json);
  return {
    config,
    game: game ? {
      ...game,
      winner_ids: parseWinnerIds(game.winner_ids_json, game.winner_id),
      fog_of_war: isFogOfWarActive(game.fog_mode, game.status, Number(active?.count ?? 0), config.fogThreshold),
      journalist_model: game.journalist_model || DEFAULT_JOURNALIST_MODEL,
      journalist_effort: game.journalist_effort || DEFAULT_JOURNALIST_EFFORT,
      journalist_core_prompt: game.journalist_core_prompt || CORE_PROMPT,
      journalist_source_prompt: game.journalist_source_prompt || DEFAULT_SOURCE_PROMPT,
      journalist_role_prompt: game.journalist_role_prompt || DEFAULT_ROLE_PROMPT,
      journalist_presets: journalistPresets(game.journalist_presets_json),
      journalist_detail_modes: journalistDetailModes(game.journalist_detail_modes_json),
      journalist_formats: journalistFormats(game.journalist_formats_json),
      crew_roles: crewRoles(game.crew_roles_json),
    } : null,
    players: players.results,
    articles: articles.results,
    history: history.results,
  };
}

async function articleDiagnostics(eventId: string) {
  const { DB } = bindings();
  const event = await DB.prepare("SELECT id FROM events WHERE id = ? AND game_id = ?")
    .bind(eventId, GAME_ID)
    .first();
  if (!event) return null;
  const generations = await DB.prepare(
    `SELECT id, event_id, model, effort, request_json, response_body, output_text,
            parsed_article_json, http_status, openai_request_id, response_id,
            outcome, fallback_reason, error_message, created_at
       FROM article_generations
      WHERE game_id = ? AND event_id = ?
      ORDER BY created_at DESC
      LIMIT 50`,
  )
    .bind(GAME_ID, eventId)
    .all();
  return { generations: generations.results };
}

export async function GET(request: Request) {
  try {
    const denied = await requireAdmin(request);
    if (denied) return denied;
    await ensureGame();
    const eventId = new URL(request.url).searchParams.get("eventId")?.trim();
    if (eventId) {
      const diagnostics = await articleDiagnostics(eventId);
      if (!diagnostics) return Response.json({ error: "Статья не найдена" }, { status: 404 });
      return Response.json(diagnostics);
    }
    return Response.json(await adminState());
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      secret?: string;
      players?: NewPlayer[];
      playerId?: string;
      name?: string;
      group_name?: string;
      eventId?: string;
      articleHeadline?: string;
      articleBody?: string;
      articleQuote?: string;
      accessCode?: string;
      journalistPreset?: string;
      journalistDetailMode?: string;
      journalistNotes?: string;
      journalistModel?: string;
      journalistEffort?: string;
      journalistCorePrompt?: string;
      journalistSourcePrompt?: string;
      journalistRolePrompt?: string;
      journalistPresets?: JournalistPreset[];
      journalistDetailModes?: JournalistDetailModeConfig[];
      journalistFormats?: JournalistFormatConfig[];
      crewRoles?: CrewRole[];
      fogMode?: string;
      exposureRule?: string;
      config?: unknown;
      chooseNewFormat?: boolean;
      winnerIds?: string[];
    };

    if (body.action === "login") {
      const configured = organizerSecret();
      if (!configured) {
        return Response.json({ error: "Секрет организатора ещё не настроен" }, { status: 503 });
      }
      if ((await hashSecret(body.secret ?? "")) !== (await hashSecret(configured))) {
        return Response.json({ error: "Неверный секрет" }, { status: 401 });
      }
      const response = Response.json({ ok: true });
      response.headers.append(
        "Set-Cookie",
        sessionCookie(ADMIN_COOKIE, await hashSecret(configured), request, 60 * 60 * 24 * 7),
      );
      return response;
    }

    const denied = await requireAdmin(request);
    if (denied) return denied;
    await ensureGame();
    const { DB, PHOTOS } = bindings();

    if (body.action === "logout") {
      const response = Response.json({ ok: true });
      response.headers.append("Set-Cookie", sessionCookie(ADMIN_COOKIE, "", request, 0));
      return response;
    }

    const game = await DB.prepare("SELECT status, revision, exposure_rule FROM games WHERE id = ?")
      .bind(GAME_ID)
      .first<{ status: GameStatus; revision: number; exposure_rule: ExposureRule }>();

    if (!game) return Response.json({ error: "Игра не найдена" }, { status: 404 });

    if (body.action === "updateGameSettings") {
      if (game.status !== "draft") return Response.json({ error: "Настройки мероприятия меняются до жеребьёвки" }, { status: 409 });
      let config;
      try { config = validateSettings(body.config); } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Некорректные настройки" }, { status: 400 });
      }
      const players = await DB.prepare("SELECT group_name FROM players WHERE game_id = ? AND profile_completed = 1 AND status != 'removed'")
        .bind(GAME_ID).all<{ group_name: string }>();
      if (config.groups.length && players.results.some((player) => !config.groups.includes(player.group_name))) {
        return Response.json({ error: "Нельзя удалить или переименовать группу с зарегистрированными участниками. Сначала удалите эти профили." }, { status: 409 });
      }
      await DB.batch([
        mutationGuard(game.revision),
        DB.prepare("UPDATE games SET title = ?, settings_json = ?, revision = revision + 1 WHERE id = ? AND status = 'draft'")
          .bind(config.title, JSON.stringify(config), GAME_ID),
        ...(!config.groups.length ? [DB.prepare("UPDATE players SET group_name = '' WHERE game_id = ?").bind(GAME_ID)] : []),
      ]);
      return Response.json({ ok: true });
    }

    if (body.action === "finishGame" || body.action === "updateWinners") {
      const editing = body.action === "updateWinners";
      if (editing ? game.status !== "finished" : game.status !== "running" && game.status !== "paused") {
        return Response.json({ error: editing ? "Игра ещё не завершена" : "Завершить можно только идущую или приостановленную игру" }, { status: 409 });
      }
      if (!Array.isArray(body.winnerIds) || body.winnerIds.length === 0 || body.winnerIds.length > 100 ||
          body.winnerIds.some((id) => typeof id !== "string") ||
          new Set(body.winnerIds).size !== body.winnerIds.length) {
        return Response.json({ error: "Выберите хотя бы одного победителя без повторов" }, { status: 400 });
      }
      const active = await DB.prepare(
        "SELECT id FROM players WHERE game_id = ? AND profile_completed = 1 AND status = 'active'",
      ).bind(GAME_ID).all<{ id: string }>();
      const activeIds = new Set(active.results.map((player) => player.id));
      if (body.winnerIds.some((id) => !activeIds.has(id))) {
        return Response.json({ error: "Победителями могут быть только действующие игроки" }, { status: 409 });
      }
      if (editing) {
        const results = await DB.batch([mutationGuard(game.revision), DB.prepare(
          `UPDATE games SET winner_id = ?, winner_ids_json = ?, revision = revision + 1
            WHERE id = ? AND revision = ? AND status = 'finished'`,
        ).bind(body.winnerIds[0], JSON.stringify(body.winnerIds), GAME_ID, game.revision)]);
        const updated = results[1];
        if (!updated.meta.changes) return Response.json({ error: "Игра уже изменилась, обновите страницу" }, { status: 409 });
        return Response.json({ ok: true });
      }
      const now = new Date().toISOString();
      const result = await DB.batch([
        mutationGuard(game.revision),
        DB.prepare(
          `UPDATE games SET status = 'finished', winner_id = ?, winner_ids_json = ?,
                            ended_at = ?, revision = revision + 1
            WHERE id = ? AND revision = ? AND status IN ('running', 'paused')`,
        ).bind(body.winnerIds[0], JSON.stringify(body.winnerIds), now, GAME_ID, game.revision),
        releaseFinalArticles(DB, now),
      ]);
      if (!result[1].meta.changes) return Response.json({ error: "Игра уже изменилась, обновите страницу" }, { status: 409 });
      return Response.json({ ok: true });
    }

    if (body.action === "updateExposureRule") {
      if (game.status !== "draft") {
        return Response.json({ error: "Режим игры можно менять только до жеребьёвки" }, { status: 409 });
      }
      if (!isExposureRule(body.exposureRule)) {
        return Response.json({ error: "Выберите режим игры" }, { status: 400 });
      }
      await DB.prepare("UPDATE games SET exposure_rule = ? WHERE id = ? AND status = 'draft'")
        .bind(body.exposureRule, GAME_ID)
        .run();
      return Response.json({ ok: true });
    }

    if (body.action === "updateFogMode") {
      if (!isFogMode(body.fogMode)) {
        return Response.json({ error: "Выберите режим тумана войны" }, { status: 400 });
      }
      const active = await DB.prepare("SELECT COUNT(*) AS count FROM players WHERE game_id = ? AND profile_completed = 1 AND status = 'active'")
        .bind(GAME_ID)
        .first<{ count: number }>();
      const now = new Date().toISOString();
      const config = await getSettings();
      await DB.batch([
        DB.prepare("UPDATE games SET fog_mode = ? WHERE id = ?").bind(body.fogMode, GAME_ID),
        ...(config.approveDuringFog && isFogOfWarActive(body.fogMode, game.status, Number(active?.count ?? 0), config.fogThreshold) ? [
          DB.prepare(
            `UPDATE events SET approval_required = 1
              WHERE game_id = ? AND undone_at IS NULL AND approved_at IS NULL
                AND publish_at > ?`,
          ).bind(GAME_ID, now),
        ] : []),
      ]);
      return Response.json({ ok: true });
    }

    if (body.action === "pause") {
      if (game.status !== "running") {
        return Response.json({ error: "Поставить на паузу можно только идущую игру" }, { status: 409 });
      }
      await DB.batch([mutationGuard(game.revision), DB.prepare("UPDATE games SET status = 'paused', revision = revision + 1 WHERE id = ? AND status = 'running' AND revision = ?")
        .bind(GAME_ID, game.revision)
      ]);
      return Response.json({ ok: true });
    }

    if (body.action === "resume") {
      if (game.status !== "paused") {
        return Response.json({ error: "Игра сейчас не на паузе" }, { status: 409 });
      }
      await DB.batch([mutationGuard(game.revision), DB.prepare("UPDATE games SET status = 'running', revision = revision + 1 WHERE id = ? AND status = 'paused' AND revision = ?")
        .bind(GAME_ID, game.revision)
      ]);
      return Response.json({ ok: true });
    }

    if (body.action === "updateAccessCode") {
      if (game.status !== "draft") {
        return Response.json({ error: "Код регистрации можно менять до жеребьёвки" }, { status: 409 });
      }
      const code = String(body.accessCode ?? "").trim().replace(/\s+/g, " ").slice(0, 24);
      if (code.length < 4) return Response.json({ error: "Код должен быть не короче четырёх символов" }, { status: 400 });
      await DB.prepare("UPDATE games SET access_code = ? WHERE id = ?").bind(code, GAME_ID).run();
      return Response.json({ ok: true });
    }

    if (body.action === "createRegistrationInvite") {
      if (game.status !== "draft") {
        return Response.json({ error: "Ссылку регистрации можно создавать до жеребьёвки" }, { status: 409 });
      }
      const token = makeSecret();
      await DB.prepare("UPDATE games SET registration_invite_hash = ? WHERE id = ?")
        .bind(await hashSecret(token), GAME_ID)
        .run();
      return Response.json({ ok: true, token });
    }

    if (body.action === "updateJournalistSettings") {
      const preset = String(body.journalistPreset ?? "");
      const detailMode = String(body.journalistDetailMode ?? "");
      const notes = String(body.journalistNotes ?? "").trim().slice(0, 1000);
      const model = String(body.journalistModel ?? "").trim().slice(0, 80);
      const effort = String(body.journalistEffort ?? "");
      const corePrompt = String(body.journalistCorePrompt ?? "").trim().slice(0, 12_000);
      const sourcePrompt = String(body.journalistSourcePrompt ?? "").trim().slice(0, 6000);
      const rolePrompt = String(body.journalistRolePrompt ?? "").trim().slice(0, 6000);
      let presets, detailModes, formats, roles;
      try {
        presets = journalistPresets(body.journalistPresets);
        detailModes = journalistDetailModes(body.journalistDetailModes);
        formats = journalistFormats(body.journalistFormats);
        roles = crewRoles(body.crewRoles);
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Проверьте варианты редактора" }, { status: 400 });
      }
      if (!isJournalistPreset(preset, presets) || !isJournalistDetailMode(detailMode, detailModes)) {
        return Response.json({ error: "Выберите существующую тематику и режим показаний" }, { status: 400 });
      }
      if ((model && !/^[a-zA-Z0-9._-]{3,80}$/.test(model)) || !isJournalistEffort(effort)) {
        return Response.json({ error: "Проверьте название модели и уровень размышления" }, { status: 400 });
      }
      if (corePrompt.length < 40 || sourcePrompt.length < 20 || rolePrompt.length < 20) {
        return Response.json({ error: "Основные редакторские инструкции не должны быть пустыми" }, { status: 400 });
      }
      await DB.prepare(
        `UPDATE games
            SET journalist_preset = ?, journalist_detail_mode = ?, journalist_notes = ?,
                journalist_model = ?, journalist_effort = ?, journalist_core_prompt = ?,
                journalist_source_prompt = ?, journalist_role_prompt = ?,
                journalist_presets_json = ?, journalist_detail_modes_json = ?,
                journalist_formats_json = ?, crew_roles_json = ?
          WHERE id = ?`,
      )
        .bind(
          preset,
          detailMode,
          notes,
          model,
          effort,
          corePrompt,
          sourcePrompt,
          rolePrompt,
          JSON.stringify(presets),
          JSON.stringify(detailModes),
          JSON.stringify(formats),
          JSON.stringify(roles),
          GAME_ID,
        )
        .run();
      return Response.json({ ok: true });
    }

    if (body.action === "resetJournalistSettings") {
      await DB.prepare(
        `UPDATE games
            SET journalist_preset = 'detective', journalist_detail_mode = 'adapt',
                journalist_notes = '', journalist_model = ?, journalist_effort = ?,
                journalist_core_prompt = '', journalist_source_prompt = '',
                journalist_role_prompt = '', journalist_presets_json = '',
                journalist_detail_modes_json = '', journalist_formats_json = '',
                crew_roles_json = ''
          WHERE id = ?`,
      )
        .bind(DEFAULT_JOURNALIST_MODEL, DEFAULT_JOURNALIST_EFFORT, GAME_ID)
        .run();
      return Response.json({ ok: true });
    }

    if (body.action === "returnToRegistration") {
      if (game.status === "draft") {
        return Response.json({ error: "Регистрация уже открыта" }, { status: 409 });
      }
      const nextRevision = Number(game.revision) + 1;
      await DB.batch([
        mutationGuard(game.revision),
        DB.prepare("DELETE FROM article_generations WHERE game_id = ?").bind(GAME_ID),
        DB.prepare("DELETE FROM events WHERE game_id = ?").bind(GAME_ID),
        DB.prepare(
          `UPDATE players
              SET status = 'active', target_id = NULL, eliminated_at = NULL, elimination_reason = NULL
            WHERE game_id = ? AND status != 'removed'`,
        ).bind(GAME_ID),
        DB.prepare(
          `UPDATE games
              SET status = 'draft', started_at = NULL, ended_at = NULL,
                  winner_id = NULL, winner_ids_json = '[]', revision = ?
            WHERE id = ? AND revision = ?`,
        ).bind(nextRevision, GAME_ID, game.revision),
      ]);
      return Response.json({ ok: true });
    }

    if (body.action === "restart") {
      if (game.status === "draft") {
        return Response.json({ error: "Сначала проведите жеребьёвку" }, { status: 409 });
      }
      const rows = await DB.prepare(
        "SELECT id FROM players WHERE game_id = ? AND status != 'removed' AND profile_completed = 1",
      )
        .bind(GAME_ID)
        .all<{ id: string }>();
      if (rows.results.length < 3) {
        return Response.json({ error: "Для новой жеребьёвки нужно минимум три готовых игрока" }, { status: 409 });
      }
      const order = drawCycle(rows.results.map((player) => player.id));
      const now = new Date().toISOString();
      const nextRevision = Number(game.revision) + 1;
      const statements = [
        mutationGuard(game.revision),
        DB.prepare("DELETE FROM article_generations WHERE game_id = ?").bind(GAME_ID),
        DB.prepare("DELETE FROM events WHERE game_id = ?").bind(GAME_ID),
        DB.prepare(
          `UPDATE players
              SET status = 'active', target_id = NULL, eliminated_at = NULL, elimination_reason = NULL
            WHERE game_id = ? AND status != 'removed' AND profile_completed = 1`,
        ).bind(GAME_ID),
        ...order.map((player) =>
          DB.prepare("UPDATE players SET target_id = ? WHERE id = ? AND game_id = ?")
            .bind(player.targetId, player.id, GAME_ID),
        ),
        DB.prepare(
          `UPDATE games
              SET status = 'running', started_at = ?, ended_at = NULL,
                  winner_id = NULL, winner_ids_json = '[]', revision = ?
            WHERE id = ? AND revision = ?`,
        ).bind(now, nextRevision, GAME_ID, game.revision),
      ];
      await DB.batch(statements);
      return Response.json({ ok: true });
    }

    if (body.action === "addPlayers") {
      if (game?.status !== "draft") {
        return Response.json({ error: "Добавлять игроков можно только до жеребьёвки" }, { status: 409 });
      }
      const incoming = (body.players ?? [])
        .map((player) => ({ name: player.name?.trim() ?? "", group_name: player.group_name?.trim() ?? "" }))
        .filter((player) => player.name)
        .slice(0, 100);
      if (!incoming.length) return Response.json({ error: "Добавьте хотя бы одно имя" }, { status: 400 });

      const invites = await Promise.all(
        incoming.map(async (player) => {
          const id = crypto.randomUUID();
          const token = makeSecret();
          return { id, token, tokenHash: await hashSecret(token), ...player };
        }),
      );
      await DB.batch(
        [mutationGuard(game.revision), ...invites.map((player) =>
          DB.prepare(
            `INSERT INTO players (id, game_id, name, group_name, secret_hash, status)
             VALUES (?, ?, ?, ?, ?, 'active')`,
          ).bind(player.id, GAME_ID, player.name, player.group_name, player.tokenHash),
        ), DB.prepare("UPDATE games SET revision = revision + 1 WHERE id = ? AND status = 'draft'").bind(GAME_ID)],
      );
      return Response.json({
        ok: true,
        invites: invites.map(({ id, name, token }) => ({ id, name, token })),
      });
    }

    if (body.action === "updatePlayer") {
      if (game?.status !== "draft") {
        return Response.json({ error: "Список уже зафиксирован жеребьёвкой" }, { status: 409 });
      }
      const name = body.name?.trim();
      if (!body.playerId || !name) return Response.json({ error: "Укажите игрока и имя" }, { status: 400 });
      await DB.batch([mutationGuard(game.revision), DB.prepare("UPDATE players SET name = ?, group_name = ? WHERE id = ? AND game_id = ?")
        .bind(name, body.group_name?.trim() ?? "", body.playerId, GAME_ID)
        , DB.prepare("UPDATE games SET revision = revision + 1 WHERE id = ? AND status = 'draft'").bind(GAME_ID)]);
      return Response.json({ ok: true });
    }

    if (body.action === "restorePlayer") {
      if (game.status !== "draft") {
        return Response.json({ error: "Вернуть игрока можно в режиме регистрации" }, { status: 409 });
      }
      if (!body.playerId) return Response.json({ error: "Игрок не указан" }, { status: 400 });
      await DB.batch([mutationGuard(game.revision), DB.prepare(
        `UPDATE players
            SET status = 'active', target_id = NULL, eliminated_at = NULL,
                elimination_reason = NULL, removed_at = NULL
          WHERE id = ? AND game_id = ? AND status = 'removed'`,
      )
        .bind(body.playerId, GAME_ID),
        DB.prepare("UPDATE games SET revision = revision + 1 WHERE id = ? AND status = 'draft'").bind(GAME_ID)]);
      return Response.json({ ok: true });
    }

    if (body.action === "deletePlayer") {
      if (!body.playerId) return Response.json({ error: "Игрок не указан" }, { status: 400 });
      const player = await DB.prepare(
        "SELECT id, status, target_id, photo_key FROM players WHERE id = ? AND game_id = ?",
      )
        .bind(body.playerId, GAME_ID)
        .first<{ id: string; status: "active" | "eliminated" | "removed"; target_id: string | null; photo_key: string | null }>();
      if (!player) return Response.json({ error: "Игрок не найден" }, { status: 404 });

      if (game.status === "draft") {
        await DB.batch([mutationGuard(game.revision), DB.prepare("DELETE FROM players WHERE id = ? AND game_id = ?")
          .bind(body.playerId, GAME_ID)
          , DB.prepare("UPDATE games SET revision = revision + 1 WHERE id = ? AND status = 'draft'").bind(GAME_ID)]);
        if (player.photo_key) await PHOTOS.delete(player.photo_key);
        return Response.json({ ok: true });
      }

      if (game.status === "finished") {
        return Response.json(
          { error: "Сначала верните игру к регистрации или запустите новую жеребьёвку" },
          { status: 409 },
        );
      }
      if (player.status === "removed") {
        return Response.json({ error: "Игрок уже исключён" }, { status: 409 });
      }

      const now = new Date().toISOString();
      const nextRevision = Number(game.revision) + 1;
      if (player.status === "active") {
        const active = await DB.prepare(
          "SELECT COUNT(*) AS count FROM players WHERE game_id = ? AND status = 'active'",
        )
          .bind(GAME_ID)
          .first<{ count: number }>();
        const activeCount = Number(active?.count ?? 0);
        if (activeCount <= 1 || !player.target_id) {
          return Response.json({ error: "Единственного оставшегося игрока исключить нельзя" }, { status: 409 });
        }
        const predecessor = await DB.prepare(
          "SELECT id FROM players WHERE game_id = ? AND status = 'active' AND target_id = ?",
        )
          .bind(GAME_ID, player.id)
          .first<{ id: string }>();
        if (!predecessor) throw new Error("Не удалось безопасно перестроить круг");
        const winnerId = activeCount === 2 ? predecessor.id : null;
        await DB.batch([
          mutationGuard(game.revision),
          DB.prepare("UPDATE players SET target_id = ? WHERE id = ? AND status = 'active' AND target_id = ?")
            .bind(winnerId ? null : player.target_id, predecessor.id, player.id),
          DB.prepare(
            `UPDATE players
                SET status = 'removed', target_id = NULL, removed_at = ?
              WHERE id = ? AND game_id = ? AND status = 'active'`,
          ).bind(now, player.id, GAME_ID),
          DB.prepare(
            `UPDATE games
                SET revision = ?, status = ?, winner_id = ?, winner_ids_json = ?, ended_at = ?
              WHERE id = ? AND revision = ?`,
          ).bind(nextRevision, winnerId ? "finished" : game.status, winnerId,
            winnerId ? JSON.stringify([winnerId]) : "[]", winnerId ? now : null, GAME_ID, game.revision),
          ...(winnerId ? [releaseFinalArticles(DB, now)] : []),
        ]);
      } else {
        await DB.batch([
          mutationGuard(game.revision),
          DB.prepare("UPDATE players SET status = 'removed', removed_at = ? WHERE id = ? AND game_id = ? AND status = 'eliminated'")
            .bind(now, player.id, GAME_ID),
          DB.prepare("UPDATE games SET revision = ? WHERE id = ? AND revision = ?")
            .bind(nextRevision, GAME_ID, game.revision),
        ]);
      }
      return Response.json({ ok: true });
    }

    if (body.action === "rotateInvite") {
      if (!body.playerId) return Response.json({ error: "Игрок не указан" }, { status: 400 });
      const token = makeSecret();
      await DB.prepare("UPDATE players SET secret_hash = ? WHERE id = ? AND game_id = ?")
        .bind(await hashSecret(token), body.playerId, GAME_ID)
        .run();
      return Response.json({ ok: true, token });
    }

    if (body.action === "resetPin") {
      if (!body.playerId) return Response.json({ error: "Игрок не указан" }, { status: 400 });
      const player = await DB.prepare(
        "SELECT id FROM players WHERE id = ? AND game_id = ? AND profile_completed = 1 AND status != 'removed'",
      )
        .bind(body.playerId, GAME_ID)
        .first<{ id: string }>();
      if (!player) return Response.json({ error: "Готовый профиль не найден" }, { status: 404 });
      const pin = String(crypto.getRandomValues(new Uint32Array(1))[0] % 10_000).padStart(4, "0");
      const salt = makePinSalt();
      await DB.prepare(
        `UPDATE players
            SET pin_hash = ?, pin_salt = ?, pin_failed_attempts = 0,
                pin_locked_until = NULL, auth_version = auth_version + 1
          WHERE id = ? AND game_id = ?`,
      )
        .bind(await hashPin(pin, salt), salt, player.id, GAME_ID)
        .run();
      return Response.json({ ok: true, pin });
    }

    if (body.action === "draw") {
      if (game.status !== "draft") {
        return Response.json({ error: "Жеребьёвка уже проведена" }, { status: 409 });
      }
      const rows = await DB.prepare(
        "SELECT id FROM players WHERE game_id = ? AND status = 'active' AND profile_completed = 1",
      )
        .bind(GAME_ID)
        .all<{ id: string }>();
      if (rows.results.length < 3) {
        return Response.json({ error: "Для жеребьёвки нужно минимум три игрока" }, { status: 409 });
      }
      const order = drawCycle(rows.results.map((player) => player.id));
      const now = new Date().toISOString();
      const nextRevision = Number(game.revision) + 1;
      const statements = [mutationGuard(game.revision), ...order.map((player) =>
        DB.prepare("UPDATE players SET target_id = ? WHERE id = ? AND game_id = ? AND status = 'active'")
          .bind(player.targetId, player.id, GAME_ID),
      )];
      statements.push(
        DB.prepare(
          `UPDATE players
              SET status = 'removed', target_id = NULL, removed_at = ?
            WHERE game_id = ? AND profile_completed = 0 AND status != 'removed'`,
        ).bind(now, GAME_ID),
      );
      statements.push(
        DB.prepare(
          `UPDATE games
              SET status = 'running', started_at = ?, revision = ?, winner_id = NULL,
                  winner_ids_json = '[]', ended_at = NULL
            WHERE id = ? AND status = 'draft' AND revision = ?`,
        ).bind(now, nextRevision, GAME_ID, game.revision),
      );
      await DB.batch(statements);
      return Response.json({ ok: true });
    }

    if (body.action === "updateArticle") {
      const headline = body.articleHeadline?.trim().slice(0, 110) ?? "";
      const articleBody = body.articleBody?.trim().slice(0, 1600) ?? "";
      const quote = normalizeArticleQuote(body.articleQuote);
      if (!body.eventId || !headline || !articleBody) {
        return Response.json({ error: "Нужны заголовок и текст статьи" }, { status: 400 });
      }
      await DB.prepare(
        `UPDATE events
            SET article_headline = ?, article_body = ?, article_quote = ?,
                article_manual = 1, article_status = 'ready'
          WHERE id = ? AND game_id = ? AND undone_at IS NULL`,
      )
        .bind(headline, articleBody, quote, body.eventId, GAME_ID)
        .run();
      return Response.json({ ok: true });
    }

    if (body.action === "regenerateArticle") {
      if (!body.eventId) return Response.json({ error: "Статья не указана" }, { status: 400 });
      await generateEventArticle(body.eventId, { chooseNewFormat: Boolean(body.chooseNewFormat), force: true });
      return Response.json({ ok: true });
    }

    if (body.action === "publishArticle") {
      if (!body.eventId) return Response.json({ error: "Статья не указана" }, { status: 400 });
      const now = new Date().toISOString();
      const published = await DB.prepare(
        `UPDATE events SET publish_at = ?, approved_at = ?, article_suppressed = 0
          WHERE id = ? AND game_id = ? AND undone_at IS NULL
            AND article_status != 'pending' AND (approval_required = 0 OR approved_at IS NULL)`,
      )
        .bind(now, now, body.eventId, GAME_ID)
        .run();
      if (!published.meta.changes) return Response.json({ error: "Материал уже опубликован или ещё готовится" }, { status: 409 });
      return Response.json({ ok: true });
    }

    if (body.action === "suppressArticle") {
      if (!body.eventId) return Response.json({ error: "Статья не указана" }, { status: 400 });
      await DB.prepare(
        "UPDATE events SET article_suppressed = 1 WHERE id = ? AND game_id = ? AND undone_at IS NULL",
      )
        .bind(body.eventId, GAME_ID)
        .run();
      return Response.json({ ok: true });
    }

    if (body.action === "restoreArticle") {
      if (!body.eventId) return Response.json({ error: "Статья не указана" }, { status: 400 });
      await DB.prepare(
        "UPDATE events SET article_suppressed = 0 WHERE id = ? AND game_id = ? AND undone_at IS NULL",
      )
        .bind(body.eventId, GAME_ID)
        .run();
      return Response.json({ ok: true });
    }

    if (body.action === "undo") {
      const event = await DB.prepare(
        `SELECT e.id, e.eliminated_player_id, e.predecessor_id, e.inherited_target_id,
                p.status AS eliminated_status
           FROM events e
           JOIN players p ON p.id = e.eliminated_player_id
          WHERE e.game_id = ? AND e.undone_at IS NULL
          ORDER BY e.revision DESC
          LIMIT 1`,
      )
        .bind(GAME_ID)
        .first<{
          id: string;
          eliminated_player_id: string;
          predecessor_id: string;
          inherited_target_id: string;
          eliminated_status: string;
        }>();
      if (!event) return Response.json({ error: "Нет события для отмены" }, { status: 409 });
      if (event.eliminated_status !== "eliminated") {
        return Response.json(
          { error: "Последний выбывший уже исключён из состава. Для полного отката верните игру к регистрации." },
          { status: 409 },
        );
      }
      const now = new Date().toISOString();
      const nextRevision = Number(game?.revision ?? 0) + 1;
      await DB.batch([
        mutationGuard(game.revision),
        DB.prepare(
          `UPDATE players
              SET status = 'active', target_id = ?, eliminated_at = NULL, elimination_reason = NULL
            WHERE id = ? AND status = 'eliminated'`,
        ).bind(event.inherited_target_id, event.eliminated_player_id),
        DB.prepare(
          "UPDATE players SET target_id = ? WHERE id = ? AND status = 'active' AND target_id = ?",
        ).bind(event.eliminated_player_id, event.predecessor_id, event.inherited_target_id),
        DB.prepare("UPDATE events SET undone_at = ? WHERE id = ? AND undone_at IS NULL").bind(now, event.id),
        DB.prepare(
          `UPDATE games
              SET status = ?, winner_id = NULL, winner_ids_json = '[]', ended_at = NULL, revision = ?
            WHERE id = ? AND revision = ?`,
        ).bind(game.status === "paused" ? "paused" : "running", nextRevision, GAME_ID, game.revision),
      ]);
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (error) {
    return jsonError(error);
  }
}
