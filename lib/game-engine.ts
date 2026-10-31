// Pure game mechanics. Storage and HTTP handlers live outside this module.
export type CyclePlayer = { id: string; targetId: string | null };

export function randomInteger(maxExclusive: number) {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 0x1_0000_0000) throw new Error("Invalid random range");
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
  let value: number;
  do { value = crypto.getRandomValues(new Uint32Array(1))[0]; } while (value >= limit);
  return value % maxExclusive;
}

export function drawCycle(ids: string[], random = randomInteger): CyclePlayer[] {
  if (ids.length < 3 || new Set(ids).size !== ids.length) throw new Error("Нужно минимум три разных игрока");
  const order = [...ids];
  for (let index = order.length - 1; index > 0; index -= 1) {
    const next = random(index + 1);
    [order[index], order[next]] = [order[next], order[index]];
  }
  return order.map((id, index) => ({ id, targetId: order[(index + 1) % order.length] }));
}

export function assertCycle(players: CyclePlayer[]) {
  if (!players.length || new Set(players.map((player) => player.id)).size !== players.length) throw new Error("Повтор или отсутствие игроков в цикле");
  if (players.length === 1) {
    if (players[0].targetId !== null) throw new Error("У победителя не должно быть цели");
    return;
  }
  const byId = new Map(players.map((player) => [player.id, player]));
  const visited = new Set<string>();
  let next: string | null = players[0].id;
  while (next && !visited.has(next)) {
    const player = byId.get(next);
    if (!player || player.targetId === player.id) throw new Error("Некорректная цель");
    visited.add(next);
    next = player.targetId;
  }
  if (visited.size !== players.length || next !== players[0].id) throw new Error("Игроки должны образовывать один цикл");
}

export function eliminateFromCycle(players: CyclePlayer[], eliminatedId: string): CyclePlayer[] {
  assertCycle(players);
  if (players.length < 2) throw new Error("Игра уже окончена");
  const eliminated = players.find((player) => player.id === eliminatedId);
  if (!eliminated) throw new Error("Игрока нет в цикле");
  const remaining = players.filter((player) => player.id !== eliminatedId).map((player) => ({
    id: player.id,
    targetId: players.length === 2 ? null : player.targetId === eliminatedId ? eliminated.targetId : player.targetId,
  }));
  assertCycle(remaining);
  return remaining;
}
