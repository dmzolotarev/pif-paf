import { bindings, ensureGame, GAME_ID } from "./game";
import { readSettings } from "./settings";

export async function getSettings() {
  await ensureGame();
  const row = await bindings().DB.prepare("SELECT settings_json FROM games WHERE id = ?")
    .bind(GAME_ID).first<{ settings_json: string }>();
  return readSettings(row?.settings_json);
}
