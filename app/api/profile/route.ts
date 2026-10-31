import {
  bindings,
  currentPlayer,
  GAME_ID,
  hashPin,
  jsonError,
  makePinSalt,
  makePlayerSession,
  PLAYER_COOKIE,
  sessionCookie,
  validPin,
} from "@/lib/game";
import { crewRoles, isRole } from "@/lib/roles";
import { getSettings } from "@/lib/settings-store";
import { validGroup } from "@/lib/settings";
import { mutationGuard } from "@/lib/mutation";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  try {
    const player = await currentPlayer(request);
    if (!player) return Response.json({ error: "Откройте персональную ссылку" }, { status: 401 });
    if (player.status === "removed") {
      return Response.json({ error: "Этот профиль исключён организатором" }, { status: 409 });
    }

    const { DB, PHOTOS } = bindings();
    const game = await DB.prepare("SELECT status, revision, crew_roles_json FROM games WHERE id = ?")
      .bind(GAME_ID)
      .first<{ status: string; revision: number; crew_roles_json: string }>();
    if (game?.status !== "draft") {
      return Response.json({ error: "После жеребьёвки профиль уже нельзя изменить" }, { status: 409 });
    }

    const data = await request.formData();
    const name = String(data.get("name") ?? "").trim().replace(/\s+/g, " ");
    const group_name = String(data.get("group_name") ?? "").trim();
    const roleKey = String(data.get("roleKey") ?? "").trim();
    const customRole = String(data.get("customRole") ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
    const feminine = data.get("feminine") === "1" ? 1 : 0;
    const pin = String(data.get("pin") ?? "");
    const photo = data.get("photo");

    if (name.length < 2 || name.length > 60) {
      return Response.json({ error: "Укажите имя длиной от 2 до 60 символов" }, { status: 400 });
    }
    if (!validGroup(group_name, await getSettings())) return Response.json({ error: "Выберите доступную группу" }, { status: 400 });
    if (!customRole && !isRole(roleKey, crewRoles(game.crew_roles_json))) return Response.json({ error: "Выберите роль или напишите свою" }, { status: 400 });
    if (!player.pin_hash && !validPin(pin)) {
      return Response.json({ error: "Придумайте PIN из четырёх цифр" }, { status: 400 });
    }
    if (pin && !validPin(pin)) {
      return Response.json({ error: "PIN должен состоять из четырёх цифр" }, { status: 400 });
    }

    let photoKey = player.photo_key;
    let photoType = player.photo_type;
    if (photo instanceof File && photo.size > 0) {
      if (!allowedTypes.has(photo.type)) {
        return Response.json({ error: "Подойдёт JPG, PNG или WebP" }, { status: 400 });
      }
      if (photo.size > 6 * 1024 * 1024) {
        return Response.json({ error: "Фотография должна быть меньше 6 МБ" }, { status: 400 });
      }
      photoKey = `games/${GAME_ID}/players/${player.id}/${crypto.randomUUID()}`;
      photoType = photo.type;
      await PHOTOS.put(photoKey, photo.stream(), {
        httpMetadata: { contentType: photo.type, cacheControl: "private, max-age=300" },
      });
    }

    if (!photoKey) return Response.json({ error: "Добавьте фотографию" }, { status: 400 });

    const pinSalt = pin ? makePinSalt() : player.pin_salt;
    const pinHash = pin && pinSalt ? await hashPin(pin, pinSalt) : player.pin_hash;
    const nextAuthVersion = pin ? Number(player.auth_version) + 1 : Number(player.auth_version);
    await DB.batch([mutationGuard(game.revision), DB.prepare(
      `UPDATE players
          SET name = ?, group_name = ?, role_key = ?, custom_role = ?, feminine = ?, profile_completed = 1,
              photo_key = ?, photo_type = ?, pin_hash = ?, pin_salt = ?,
              pin_failed_attempts = 0, pin_locked_until = NULL, auth_version = ?
        WHERE id = ? AND game_id = ?`,
    )
      .bind(name, group_name, customRole ? "" : roleKey, customRole, feminine, photoKey, photoType, pinHash, pinSalt, nextAuthVersion, player.id, GAME_ID),
      DB.prepare("UPDATE games SET revision = revision + 1 WHERE id = ? AND status = 'draft'").bind(GAME_ID),
    ]);

    if (photoKey !== player.photo_key && player.photo_key) await PHOTOS.delete(player.photo_key);
    const response = Response.json({ ok: true });
    if (pin) {
      response.headers.append(
        "Set-Cookie",
        sessionCookie(
          PLAYER_COOKIE,
          await makePlayerSession(player.id, nextAuthVersion),
          request,
          60 * 60 * 24 * 90,
        ),
      );
    }
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
