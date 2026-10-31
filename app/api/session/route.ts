import { PLAYER_COOKIE, sessionCookie } from "@/lib/game";

export async function DELETE(request: Request) {
  const response = Response.json({ ok: true });
  response.headers.append("Set-Cookie", sessionCookie(PLAYER_COOKIE, "", request, 0));
  return response;
}
