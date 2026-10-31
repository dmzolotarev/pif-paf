import { bindings, ensureGame, GAME_ID, hashSecret, PLAYER_COOKIE, sessionCookie } from "@/lib/game";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  await ensureGame();
  const { token } = await context.params;
  const tokenHash = await hashSecret(token);
  const player = await bindings().DB.prepare(
    "SELECT id FROM players WHERE game_id = ? AND secret_hash = ?",
  )
    .bind(GAME_ID, tokenHash)
    .first<{ id: string }>();

  const headers = new Headers({ location: new URL(player ? "/" : "/?join=invalid", request.url).toString() });
  if (player) headers.append("Set-Cookie", sessionCookie(PLAYER_COOKIE, token, request));
  return new Response(null, { status: 303, headers });
}
