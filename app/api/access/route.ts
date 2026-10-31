import {
  bindings,
  currentPlayer,
  ensureGame,
  GAME_ID,
  hashPin,
  hashSecret,
  jsonError,
  makePinSalt,
  makePlayerSession,
  makeSecret,
  PLAYER_COOKIE,
  sessionCookie,
  validPin,
  verifyPinHash,
} from "@/lib/game";
import { crewRoles, isRole, roleLabel } from "@/lib/roles";
import { getSettings } from "@/lib/settings-store";
import { validGroup } from "@/lib/settings";
import { mutationGuard } from "@/lib/mutation";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function normalized(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
}

function playerCookie(token: string, request: Request) {
  return sessionCookie(PLAYER_COOKIE, token, request, 60 * 60 * 24 * 90);
}

export async function GET() {
  try {
    await ensureGame();
    const { DB } = bindings();
    const game = await DB.prepare("SELECT status, crew_roles_json FROM games WHERE id = ?")
      .bind(GAME_ID)
      .first<{ status: "draft" | "running" | "paused" | "finished"; crew_roles_json: string }>();
    const configuredRoles = crewRoles(game?.crew_roles_json);
    const rows = await DB.prepare(
      `SELECT id, name, group_name, role_key, custom_role, feminine, photo_key, pin_hash
         FROM players
        WHERE game_id = ? AND profile_completed = 1 AND status != 'removed'
        ORDER BY name COLLATE NOCASE ASC`,
    )
      .bind(GAME_ID)
      .all<{
        id: string;
        name: string;
        group_name: string;
        role_key: string;
        custom_role: string;
        feminine: number;
        photo_key: string | null;
        pin_hash: string | null;
      }>();
    return Response.json({
      registrationOpen: game?.status === "draft",
      profiles: rows.results.map((player) => ({
        id: player.id,
        name: player.name,
        group_name: player.group_name,
        role: roleLabel(player.role_key, Boolean(player.feminine), player.custom_role, configuredRoles),
        hasPhoto: Boolean(player.photo_key),
        hasPin: Boolean(player.pin_hash),
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureGame();
    const body = (await request.json()) as { action?: string; code?: string; invite?: string; playerId?: string; pin?: string };
    const { DB } = bindings();

    if (body.action === "verifyCode") {
      const game = await DB.prepare("SELECT status, access_code FROM games WHERE id = ?")
        .bind(GAME_ID)
        .first<{ status: string; access_code: string }>();
      if (game?.status !== "draft") {
        return Response.json({ error: "Регистрация уже закрыта" }, { status: 409 });
      }
      if (normalized(body.code ?? "") !== normalized(game.access_code)) {
        return Response.json({ error: "Неверный код игры" }, { status: 401 });
      }
      return Response.json({ ok: true });
    }

    if (body.action === "verifyInvite") {
      const game = await DB.prepare("SELECT status, registration_invite_hash FROM games WHERE id = ?")
        .bind(GAME_ID)
        .first<{ status: string; registration_invite_hash: string | null }>();
      if (game?.status !== "draft") {
        return Response.json({ error: "Регистрация уже закрыта" }, { status: 409 });
      }
      if (!body.invite || !game.registration_invite_hash || (await hashSecret(body.invite)) !== game.registration_invite_hash) {
        return Response.json({ error: "Ссылка регистрации недействительна или уже заменена" }, { status: 401 });
      }
      return Response.json({ ok: true });
    }

    if (body.action === "setPin") {
      const player = await currentPlayer(request);
      if (!player || player.status === "removed") {
        return Response.json({ error: "Сначала войдите в свой профиль" }, { status: 401 });
      }
      const pin = String(body.pin ?? "");
      if (!validPin(pin)) return Response.json({ error: "PIN должен состоять из четырёх цифр" }, { status: 400 });
      const salt = makePinSalt();
      const nextVersion = Number(player.auth_version) + 1;
      await DB.prepare(
        `UPDATE players
            SET pin_hash = ?, pin_salt = ?, pin_failed_attempts = 0,
                pin_locked_until = NULL, auth_version = ?
          WHERE id = ? AND game_id = ?`,
      )
        .bind(await hashPin(pin, salt), salt, nextVersion, player.id, GAME_ID)
        .run();
      const response = Response.json({ ok: true });
      response.headers.append("Set-Cookie", playerCookie(await makePlayerSession(player.id, nextVersion), request));
      return response;
    }

    if (body.action !== "login") return Response.json({ error: "Неизвестное действие" }, { status: 400 });
    const pin = String(body.pin ?? "");
    if (!body.playerId || !validPin(pin)) {
      return Response.json({ error: "Выберите профиль и введите четырёхзначный PIN" }, { status: 400 });
    }
    const player = await DB.prepare(
      `SELECT id, status, pin_hash, pin_salt, pin_failed_attempts,
              pin_locked_until, auth_version
         FROM players
        WHERE id = ? AND game_id = ? AND profile_completed = 1`,
    )
      .bind(body.playerId, GAME_ID)
      .first<{
        id: string;
        status: string;
        pin_hash: string | null;
        pin_salt: string | null;
        pin_failed_attempts: number;
        pin_locked_until: string | null;
        auth_version: number;
      }>();
    if (!player || player.status === "removed") {
      return Response.json({ error: "Профиль недоступен" }, { status: 404 });
    }
    if (!player.pin_hash || !player.pin_salt) {
      return Response.json({ error: "Для этого профиля PIN ещё не задан. Обратитесь к организатору." }, { status: 409 });
    }
    if (player.pin_locked_until && new Date(player.pin_locked_until) > new Date()) {
      return Response.json({ error: "Слишком много попыток. Попробуйте снова через 15 минут." }, { status: 429 });
    }

    const verification = await verifyPinHash(pin, player.pin_salt, player.pin_hash);
    if (!verification.matches) {
      const attempts = (player.pin_locked_until ? 0 : Number(player.pin_failed_attempts)) + 1;
      const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
      await DB.prepare("UPDATE players SET pin_failed_attempts = ?, pin_locked_until = ? WHERE id = ?")
        .bind(attempts, lockedUntil, player.id)
        .run();
      return Response.json(
        { error: lockedUntil ? "Слишком много попыток. Вход заблокирован на 15 минут." : "Неверный PIN" },
        { status: lockedUntil ? 429 : 401 },
      );
    }

    await DB.prepare(
      `UPDATE players
          SET pin_hash = ?, pin_failed_attempts = 0, pin_locked_until = NULL
        WHERE id = ?`,
    )
      .bind(verification.needsUpgrade ? await hashPin(pin, player.pin_salt) : player.pin_hash, player.id)
      .run();
    const response = Response.json({ ok: true });
    response.headers.append(
      "Set-Cookie",
      playerCookie(await makePlayerSession(player.id, Number(player.auth_version)), request),
    );
    return response;
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  let uploadedPhotoKey: string | null = null;
  try {
    await ensureGame();
    const data = await request.formData();
    const code = String(data.get("code") ?? "");
    const invite = String(data.get("invite") ?? "");
    const name = String(data.get("name") ?? "").trim().replace(/\s+/g, " ");
    const group_name = String(data.get("group_name") ?? "").trim();
    const roleKey = String(data.get("roleKey") ?? "").trim();
    const customRole = String(data.get("customRole") ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
    const feminine = data.get("feminine") === "1" ? 1 : 0;
    const pin = String(data.get("pin") ?? "");
    const photo = data.get("photo");
    const { DB, PHOTOS } = bindings();
    const game = await DB.prepare("SELECT status, revision, access_code, registration_invite_hash, crew_roles_json FROM games WHERE id = ?")
      .bind(GAME_ID)
      .first<{ status: string; revision: number; access_code: string; registration_invite_hash: string | null; crew_roles_json: string }>();

    if (game?.status !== "draft") return Response.json({ error: "Регистрация уже закрыта" }, { status: 409 });
    const validInvite = Boolean(invite && game.registration_invite_hash && (await hashSecret(invite)) === game.registration_invite_hash);
    if (!validInvite && normalized(code) !== normalized(game.access_code)) {
      return Response.json({ error: "Неверный код игры" }, { status: 401 });
    }
    if (name.length < 2 || name.length > 60) {
      return Response.json({ error: "Укажите имя длиной от 2 до 60 символов" }, { status: 400 });
    }
    if (!validGroup(group_name, await getSettings())) return Response.json({ error: "Выберите доступную группу" }, { status: 400 });
    if (!customRole && !isRole(roleKey, crewRoles(game.crew_roles_json))) return Response.json({ error: "Выберите роль или напишите свою" }, { status: 400 });
    if (!validPin(pin)) return Response.json({ error: "Придумайте PIN из четырёх цифр" }, { status: 400 });
    if (!(photo instanceof File) || photo.size === 0) {
      return Response.json({ error: "Добавьте фотографию" }, { status: 400 });
    }
    if (!allowedTypes.has(photo.type)) return Response.json({ error: "Подойдёт JPG, PNG или WebP" }, { status: 400 });
    if (photo.size > 6 * 1024 * 1024) {
      return Response.json({ error: "Фотография должна быть меньше 6 МБ" }, { status: 400 });
    }

    const existing = await DB.prepare(
      "SELECT id, name, profile_completed FROM players WHERE game_id = ? AND status != 'removed'",
    )
      .bind(GAME_ID)
      .all<{ id: string; name: string; profile_completed: number }>();
    const sameName = existing.results.filter((player) => normalized(player.name) === normalized(name));
    if (sameName.some((player) => player.profile_completed)) {
      return Response.json({ error: "Профиль с таким именем уже существует. Выберите его на экране входа." }, { status: 409 });
    }
    const placeholder = sameName.find((player) => !player.profile_completed);
    const playerId = placeholder?.id ?? crypto.randomUUID();
    uploadedPhotoKey = `games/${GAME_ID}/players/${playerId}/${crypto.randomUUID()}`;
    await PHOTOS.put(uploadedPhotoKey, photo.stream(), {
      httpMetadata: { contentType: photo.type, cacheControl: "private, max-age=300" },
    });
    const salt = makePinSalt();
    const pinHash = await hashPin(pin, salt);
    const authVersion = 1;

    const statements = [mutationGuard(game.revision)];
    if (placeholder) {
      statements.push(DB.prepare(
        `UPDATE players
            SET name = ?, group_name = ?, role_key = ?, custom_role = ?, feminine = ?, profile_completed = 1,
                photo_key = ?, photo_type = ?, pin_hash = ?, pin_salt = ?,
                pin_failed_attempts = 0, pin_locked_until = NULL, auth_version = ?
          WHERE id = ? AND game_id = ? AND profile_completed = 0 AND status = 'active'`,
      )
        .bind(name, group_name, customRole ? "" : roleKey, customRole, feminine, uploadedPhotoKey, photo.type, pinHash, salt, authVersion, playerId, GAME_ID));
    } else {
      statements.push(DB.prepare(
        `INSERT INTO players
          (id, game_id, name, group_name, role_key, custom_role, feminine, profile_completed,
           secret_hash, photo_key, photo_type, pin_hash, pin_salt, auth_version, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 'active')`,
      )
        .bind(
          playerId,
          GAME_ID,
          name,
          group_name,
          customRole ? "" : roleKey,
          customRole,
          feminine,
          await hashSecret(makeSecret()),
          uploadedPhotoKey,
          photo.type,
          pinHash,
          salt,
          authVersion,
        ));
    }
    statements.push(DB.prepare("UPDATE games SET revision = revision + 1 WHERE id = ? AND status = 'draft'").bind(GAME_ID));
    await DB.batch(statements);

    const response = Response.json({ ok: true });
    response.headers.append(
      "Set-Cookie",
      playerCookie(await makePlayerSession(playerId, authVersion), request),
    );
    uploadedPhotoKey = null;
    return response;
  } catch (error) {
    if (uploadedPhotoKey) await bindings().PHOTOS.delete(uploadedPhotoKey);
    return jsonError(error);
  }
}
