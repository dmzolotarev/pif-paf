import { bindings, currentPlayer, isAdmin, jsonError } from "@/lib/game";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const player = await currentPlayer(request);
    const admin = await isAdmin(request);
    const row = await bindings().DB.prepare(
      "SELECT photo_key, profile_completed, status FROM players WHERE id = ?",
    )
      .bind(id)
      .first<{ photo_key: string | null; profile_completed: number; status: string }>();
    const isPublicProfile = Boolean(row?.profile_completed) && row?.status !== "removed";
    const canSee = admin || Boolean(player) || isPublicProfile;
    if (!canSee) return new Response("Not found", { status: 404 });
    if (!row?.photo_key) return new Response("Not found", { status: 404 });

    const object = await bindings().PHOTOS.get(row.photo_key);
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "private, max-age=300");
    return new Response(object.body, { headers });
  } catch (error) {
    return jsonError(error);
  }
}
