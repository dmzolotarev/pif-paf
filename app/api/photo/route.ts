import { bindings, currentPlayer, GAME_ID, jsonError } from "@/lib/game";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  try {
    const player = await currentPlayer(request);
    if (!player) return Response.json({ error: "Откройте персональную ссылку" }, { status: 401 });
    if (player.status === "removed") {
      return Response.json({ error: "Этот профиль исключён организатором" }, { status: 409 });
    }

    const { DB, PHOTOS } = bindings();
    const game = await DB.prepare("SELECT status FROM games WHERE id = ?")
      .bind(GAME_ID)
      .first<{ status: string }>();
    if (game?.status !== "draft") {
      return Response.json({ error: "После жеребьёвки фотографию уже нельзя изменить" }, { status: 409 });
    }

    const data = await request.formData();
    const photo = data.get("photo");
    if (!(photo instanceof File)) {
      return Response.json({ error: "Выберите фотографию" }, { status: 400 });
    }
    if (!allowedTypes.has(photo.type)) {
      return Response.json({ error: "Подойдёт JPG, PNG или WebP" }, { status: 400 });
    }
    if (photo.size > 6 * 1024 * 1024) {
      return Response.json({ error: "Фотография должна быть меньше 6 МБ" }, { status: 400 });
    }

    const old = await DB.prepare("SELECT photo_key FROM players WHERE id = ?")
      .bind(player.id)
      .first<{ photo_key: string | null }>();
    const key = `games/${GAME_ID}/players/${player.id}/${crypto.randomUUID()}`;
    await PHOTOS.put(key, photo.stream(), {
      httpMetadata: { contentType: photo.type, cacheControl: "private, max-age=300" },
    });
    await DB.prepare("UPDATE players SET photo_key = ?, photo_type = ? WHERE id = ?")
      .bind(key, photo.type, player.id)
      .run();
    if (old?.photo_key) await PHOTOS.delete(old.photo_key);

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
