export type FinalPerson = { id: string; name: string; group_name: string; hasPhoto: boolean };

export type FinalTimelineRecord = {
  id: string;
  type: "killed" | "exposed";
  occurredAt: string;
  killer: FinalPerson;
  victim: FinalPerson;
};

export type FinalStats = {
  totalKills: number;
  totalExposures: number;
  ranking: Array<FinalPerson & { kills: number; crossGroupKills: number }>;
  firstBlood: FinalTimelineRecord | null;
  lastBlood: FinalTimelineRecord | null;
  fastestPair: { player: FinalPerson; durationMs: number } | null;
  topGroups: Array<{ group_name: string; kills: number }>;
  crossGroupLeaders: FinalPerson[];
  crossGroupRecord: number;
};

// The timeline is ordered by the game's revision. Only successful kills count:
// an exposed killer was eliminated, and did not kill the target in that event.
export function buildFinalStats(timeline: FinalTimelineRecord[]): FinalStats {
  const kills = timeline.filter((event) => event.type === "killed");
  const ranking = new Map<string, FinalStats["ranking"][number]>();
  const lastKillAt = new Map<string, number>();
  const groupKills = new Map<string, number>();
  let fastestPair: FinalStats["fastestPair"] = null;

  for (const event of kills) {
    const { killer, victim } = event;
    const entry = ranking.get(killer.id) ?? { ...killer, kills: 0, crossGroupKills: 0 };
    entry.kills += 1;
    if (killer.group_name && victim.group_name && killer.group_name !== victim.group_name) entry.crossGroupKills += 1;
    ranking.set(killer.id, entry);
    const group_name = killer.group_name || "Без группы";
    groupKills.set(group_name, (groupKills.get(group_name) ?? 0) + 1);

    const at = Date.parse(event.occurredAt);
    if (!Number.isFinite(at)) continue;
    const previous = lastKillAt.get(killer.id);
    if (previous !== undefined && at >= previous) {
      const durationMs = at - previous;
      if (!fastestPair || durationMs < fastestPair.durationMs) fastestPair = { player: killer, durationMs };
    }
    lastKillAt.set(killer.id, at);
  }

  const ordered = [...ranking.values()].sort((a, b) => b.kills - a.kills || b.crossGroupKills - a.crossGroupKills || a.name.localeCompare(b.name, "ru-RU"));
  const topGroupCount = Math.max(0, ...groupKills.values());
  const crossGroupRecord = Math.max(0, ...ordered.map((player) => player.crossGroupKills));
  return {
    totalKills: kills.length,
    totalExposures: timeline.length - kills.length,
    ranking: ordered,
    firstBlood: kills[0] ?? null,
    lastBlood: kills.length > 1 ? kills[kills.length - 1] : null,
    fastestPair,
    topGroups: [...groupKills].filter(([, count]) => count === topGroupCount).map(([group_name, count]) => ({ group_name, kills: count })),
    crossGroupLeaders: crossGroupRecord ? ordered.filter((player) => player.crossGroupKills === crossGroupRecord) : [],
    crossGroupRecord,
  };
}
