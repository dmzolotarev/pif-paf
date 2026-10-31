import { env } from "cloudflare:workers";
import { DEFAULT_SETTINGS } from "./settings";

export const GAME_ID = "default";
export const PLAYER_COOKIE = "pifpaf_player";
export const ADMIN_COOKIE = "pifpaf_admin";

export type GameStatus = "draft" | "running" | "paused" | "finished";
export type EliminationReason = "killed" | "exposed";
export type FogMode = "auto" | "on" | "off";
export type ExposureRule = "eliminate_killer" | "cancel_kill";

export function isExposureRule(value: unknown): value is ExposureRule {
  return value === "eliminate_killer" || value === "cancel_kill";
}

export function isFogMode(value: unknown): value is FogMode {
  return value === "auto" || value === "on" || value === "off";
}

export function isFogOfWarActive(mode: FogMode, status: GameStatus, activeCount: number, threshold = 5) {
  if (status === "finished") return false;
  if (mode === "on") return true;
  if (mode === "off") return false;
  return (status === "running" || status === "paused") && activeCount <= threshold;
}

type Bindings = {
  DB: D1Database;
  PHOTOS: R2Bucket;
  ORGANIZER_SECRET?: string;
  PLAYER_AUTH_SECRET?: string;
  OPENAI_API_KEY?: string;
};

export function bindings(): Bindings {
  return env as unknown as Bindings;
}

export function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function sessionCookie(name: string, value: string, request: Request, maxAge = 60 * 60 * 24 * 30) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function hashSecret(secret: string) {
  const bytes = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64Url(bytes: Uint8Array) {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function playerAuthSecrets() {
  const { PLAYER_AUTH_SECRET } = bindings();
  const primary = PLAYER_AUTH_SECRET;
  if (!primary) throw new Error("Вход игроков ещё не настроен");
  return [primary];
}

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

async function signPlayerSession(value: string) {
  return hmac(playerAuthSecrets()[0], value);
}

function secureEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

export function makePinSalt() {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(18)));
}

export async function hashPin(pin: string, salt: string) {
  return hmac(playerAuthSecrets()[0], `${salt}:${pin}`);
}

export async function verifyPinHash(pin: string, salt: string, storedHash: string) {
  const secrets = playerAuthSecrets();
  for (let index = 0; index < secrets.length; index += 1) {
    if (secureEqual(storedHash, await hmac(secrets[index], `${salt}:${pin}`))) {
      return { matches: true, needsUpgrade: index > 0 };
    }
  }
  return { matches: false, needsUpgrade: false };
}

export function validPin(pin: string) {
  return /^\d{4}$/.test(pin);
}

export async function makePlayerSession(playerId: string, authVersion: number) {
  const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 90;
  const payload = `v2.${playerId}.${authVersion}.${expires}`;
  return `${payload}.${await signPlayerSession(payload)}`;
}

async function parsePlayerSession(token: string) {
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== "v2") return null;
  const [version, playerId, authVersionRaw, expiresRaw, signature] = parts;
  const authVersion = Number(authVersionRaw);
  const expires = Number(expiresRaw);
  if (!playerId || !Number.isInteger(authVersion) || !Number.isInteger(expires) || expires <= Date.now() / 1000) return null;
  const payload = `${version}.${playerId}.${authVersion}.${expires}`;
  let validSignature = false;
  for (const secret of playerAuthSecrets()) {
    if (secureEqual(signature, await hmac(secret, payload))) {
      validSignature = true;
      break;
    }
  }
  if (!validSignature) return null;
  return { playerId, authVersion };
}

export function makeSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function ensureGame() {
  const { DB } = bindings();
  await DB.prepare(
    "INSERT OR IGNORE INTO games (id, title, access_code, settings_json, status, revision) VALUES (?, ?, ?, ?, 'draft', 0)",
  )
    .bind(GAME_ID, DEFAULT_SETTINGS.title, makeSecret().slice(0, 8).toUpperCase(), JSON.stringify(DEFAULT_SETTINGS))
    .run();
}

export async function isAdmin(request: Request) {
  const provided = cookieValue(request, ADMIN_COOKIE);
  const secret = organizerSecret();
  if (!provided || !secret) return false;
  return provided === (await hashSecret(secret));
}

export function organizerSecret() {
  return bindings().ORGANIZER_SECRET;
}

export async function requireAdmin(request: Request) {
  if (!(await isAdmin(request))) {
    return Response.json({ error: "Требуется доступ организатора" }, { status: 401 });
  }
  return null;
}

export type PlayerRow = {
  id: string;
  game_id: string;
  name: string;
  group_name: string;
  role_key: string;
  custom_role: string;
  feminine: number;
  profile_completed: number;
  pin_hash: string | null;
  pin_salt: string | null;
  auth_version: number;
  status: "active" | "eliminated" | "removed";
  target_id: string | null;
  photo_key: string | null;
  photo_type: string | null;
  eliminated_at: string | null;
  elimination_reason: EliminationReason | null;
  removed_at: string | null;
};

export async function currentPlayer(request: Request) {
  const token = cookieValue(request, PLAYER_COOKIE);
  if (!token) return null;
  const signedSession = token.startsWith("v2.") ? await parsePlayerSession(token) : null;
  const selection = `SELECT id, game_id, name, group_name, role_key, custom_role, feminine, profile_completed,
            pin_hash, pin_salt, auth_version, status, target_id, photo_key, photo_type,
            eliminated_at, elimination_reason, removed_at
       FROM players`;
  if (signedSession) {
    return bindings().DB.prepare(`${selection} WHERE game_id = ? AND id = ? AND auth_version = ?`)
      .bind(GAME_ID, signedSession.playerId, signedSession.authVersion)
      .first<PlayerRow>();
  }
  const tokenHash = await hashSecret(token);
  return bindings().DB.prepare(
    `${selection} WHERE game_id = ? AND secret_hash = ?`,
  )
    .bind(GAME_ID, tokenHash)
    .first<PlayerRow>();
}

export const killedEpitaphs = [
  "Отвлёкся на секунду и стал главным героем следующего выпуска.",
  "Последний тост оказался подозрительно своевременным.",
  "Обстановка была спокойной. Компания — не очень.",
  "Ушёл за перекусом и вошёл в историю.",
  "Поверил в дружбу и отсутствие свидетелей.",
  "К вечеринке был готов. К такому повороту — нет.",
  "Сделал роковую ошибку: расслабился раньше остальных.",
  "Подвела беспечность — и очень убедительное приглашение поговорить.",
  "В деле остались личные вещи и множество вопросов.",
  "Последнее, что он услышал: «Смотри, какой красивый вид».",
  "Помнил все правила, кроме необходимости оглядываться.",
  "Сошёл с дистанции при загадочных обстоятельствах.",
];

export const exposedEpitaphs = [
  "Идеальный план подвёл один внимательный свидетель.",
  "Слишком подозрительно изображал человека без тайных намерений.",
  "Был пойман с поличным и крайне невинным выражением лица.",
  "Переиграл всех, но забыл посмотреть по сторонам.",
  "Конспирация закончилась прямо у всех на глазах.",
  "План был безупречен. Свидетель — внимательнее.",
  "Маскировка продержалась ровно до первого жеста.",
  "Вёл себя естественно. Подозрительно естественно.",
];

export function randomEpitaph(reason: EliminationReason) {
  const list = reason === "killed" ? killedEpitaphs : exposedEpitaphs;
  return list[crypto.getRandomValues(new Uint32Array(1))[0] % list.length];
}

export function jsonError(error: unknown) {
  const message = error instanceof Error ? error.message : "Неожиданная ошибка";
  const status = message.includes("UNIQUE") || message.includes("constraint") ? 409 : 500;
  return Response.json(
    { error: status === 409 ? "Состояние игры уже изменилось. Обновите экран." : message },
    { status },
  );
}
