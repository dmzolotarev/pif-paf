import { after } from "vinext/shims/server";
import { generateEventArticleSafely } from "@/lib/article-generation";
import { bindings, currentPlayer, GAME_ID, jsonError } from "@/lib/game";

export async function POST(request: Request) {
  try {
    const player = await currentPlayer(request);
    if (!player) return Response.json({ error: "Откройте персональную ссылку" }, { status: 401 });
    if (player.status !== "eliminated") {
      return Response.json({ error: "Редакция пока не ждёт ваших показаний" }, { status: 409 });
    }

    const body = (await request.json()) as { details?: string; finalWords?: string };
    const details = String(body.details ?? "").trim().slice(0, 800);
    const finalWords = String(body.finalWords ?? "").trim().slice(0, 300);
    const { DB } = bindings();
    const event = await DB.prepare(
      `SELECT id, type, article_format, press_submitted_at, approval_required, approved_at
         FROM events
        WHERE game_id = ? AND eliminated_player_id = ? AND undone_at IS NULL
        ORDER BY revision DESC
        LIMIT 1`,
    )
      .bind(GAME_ID, player.id)
      .first<{
        id: string;
        type: "killed" | "exposed";
        article_format: string | null;
        press_submitted_at: string | null;
        approval_required: number;
        approved_at: string | null;
      }>();
    if (!event) return Response.json({ error: "Редакционное дело не найдено" }, { status: 404 });
    if (event.press_submitted_at) {
      return Response.json({ error: "Ваш материал уже передан в редакцию" }, { status: 409 });
    }

    const now = new Date().toISOString();

    const updated = await DB.prepare(
      `UPDATE events
          SET press_details = ?, press_final_words = ?, press_submitted_at = ?,
              article_status = CASE WHEN article_manual = 0 AND approved_at IS NULL THEN 'pending' ELSE article_status END
        WHERE id = ? AND game_id = ? AND press_submitted_at IS NULL`,
    )
      .bind(details, finalWords, now, event.id, GAME_ID)
      .run();
    if (!updated.meta.changes) {
      return Response.json({ error: "Ваш материал уже передан в редакцию" }, { status: 409 });
    }

    if (!event.approval_required || !event.approved_at) after(() => generateEventArticleSafely(event.id));

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
