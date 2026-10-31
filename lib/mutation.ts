import { bindings, GAME_ID } from "./game";

// First statement of every cycle-changing D1 batch. A stale revision fails the
// unique constraint, rolling back the whole batch before any targets change.
export function mutationGuard(revision: number) {
  return bindings().DB.prepare("INSERT INTO game_mutations (game_id, revision) VALUES (?, ?)")
    .bind(GAME_ID, revision + 1);
}
