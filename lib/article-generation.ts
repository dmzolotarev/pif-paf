import { bindings, GAME_ID } from "./game";
import { chooseArticleFormat, formatByKey, generateArticle } from "./journalist";
import { crewRoles, roleLabel } from "./roles";
import { getSettings } from "./settings-store";

type GenerateOptions = {
  chooseNewFormat?: boolean;
  force?: boolean;
};

export async function generateEventArticle(eventId: string, options: GenerateOptions = {}) {
  const { DB, OPENAI_API_KEY } = bindings();
  const event = await DB.prepare(
    `SELECT e.id, e.type, e.article_format, e.press_details, e.press_final_words,
            p.id AS player_id, p.name, p.group_name, p.role_key, p.custom_role, p.feminine,
            g.journalist_preset, g.journalist_detail_mode, g.journalist_notes,
            g.journalist_model, g.journalist_effort, g.journalist_core_prompt,
            g.journalist_source_prompt, g.journalist_role_prompt,
            g.journalist_presets_json, g.journalist_detail_modes_json,
            g.journalist_formats_json, g.crew_roles_json
       FROM events e
       JOIN players p ON p.id = e.eliminated_player_id
       JOIN games g ON g.id = e.game_id
      WHERE e.id = ? AND e.game_id = ? AND e.undone_at IS NULL`,
  )
    .bind(eventId, GAME_ID)
    .first<{
      id: string;
      type: "killed" | "exposed";
      article_format: string | null;
      press_details: string | null;
      press_final_words: string | null;
      player_id: string;
      name: string;
      group_name: string;
      role_key: string;
      custom_role: string;
      feminine: number;
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
    }>();
  if (!event) throw new Error("Редакционное дело не найдено");

  let format = formatByKey(event.type, event.article_format, event.journalist_formats_json);
  if (options.chooseNewFormat) {
    const recent = await DB.prepare(
      `SELECT article_format
         FROM events
        WHERE game_id = ? AND undone_at IS NULL AND article_format IS NOT NULL
        ORDER BY revision DESC
        LIMIT 4`,
    )
      .bind(GAME_ID)
      .all<{ article_format: string }>();
    format = chooseArticleFormat(event.type, [
      event.article_format ?? "",
      ...recent.results.map((item) => item.article_format),
    ], event.journalist_formats_json);
  }

  const names = await DB.prepare(
    "SELECT name FROM players WHERE game_id = ? AND profile_completed = 1 AND id != ?",
  )
    .bind(GAME_ID, event.player_id)
    .all<{ name: string }>();
  const config = await getSettings();
  const generation = await generateArticle(
    OPENAI_API_KEY,
    {
      name: event.name,
      group_name: event.group_name,
      role: roleLabel(event.role_key, Boolean(event.feminine), event.custom_role, crewRoles(event.crew_roles_json)),
      feminine: Boolean(event.feminine),
      reason: event.type,
      format,
      details: event.press_details ?? "",
      finalWords: event.press_final_words ?? "",
    },
    names.results.map((item) => item.name),
    {
      newspaperTitle: config.newspaperTitle,
      setting: config.setting,
      model: event.journalist_model,
      effort: event.journalist_effort,
      corePrompt: event.journalist_core_prompt,
      sourcePrompt: event.journalist_source_prompt,
      rolePrompt: event.journalist_role_prompt,
      presets: event.journalist_presets_json,
      detailModes: event.journalist_detail_modes_json,
      formats: event.journalist_formats_json,
      preset: event.journalist_preset,
      detailMode: event.journalist_detail_mode,
      notes: event.journalist_notes,
    },
  );
  const article = generation.article;
  const generatedAt = new Date().toISOString();

  await DB.batch([
    DB.prepare(
      `INSERT INTO article_generations (
          id, game_id, event_id, model, effort, request_json, response_body,
          output_text, parsed_article_json, http_status, openai_request_id,
          response_id, outcome, fallback_reason, error_message, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      GAME_ID,
      event.id,
      generation.diagnostics.model,
      generation.diagnostics.effort,
      JSON.stringify(generation.diagnostics.request),
      generation.diagnostics.responseBody,
      generation.diagnostics.outputText,
      generation.diagnostics.parsedArticle ? JSON.stringify(generation.diagnostics.parsedArticle) : "",
      generation.diagnostics.httpStatus,
      generation.diagnostics.openaiRequestId,
      generation.diagnostics.responseId,
      generation.diagnostics.outcome,
      generation.diagnostics.fallbackReason,
      generation.diagnostics.errorMessage,
      generatedAt,
    ),
    DB.prepare(
      `UPDATE events
          SET article_format = ?, article_section = ?, article_headline = ?,
              article_body = ?, article_quote = ?, article_generated_at = ?,
              article_manual = 0, article_status = 'ready'
        WHERE id = ? AND game_id = ? AND undone_at IS NULL
          AND (article_manual = 0 OR ? = 1)`,
    ).bind(
      format.key,
      article.section,
      article.headline,
      article.body,
      article.quote,
      generatedAt,
      event.id,
      GAME_ID,
      options.force ? 1 : 0,
    ),
  ]);
}

export async function generateEventArticleSafely(eventId: string) {
  try {
    await generateEventArticle(eventId);
  } catch {
    await bindings().DB.prepare(
      "UPDATE events SET article_status = 'failed' WHERE id = ? AND game_id = ? AND article_manual = 0",
    )
      .bind(eventId, GAME_ID)
      .run();
  }
}
