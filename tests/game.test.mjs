import assert from "node:assert/strict";
import test from "node:test";
import { drawCycle, eliminateFromCycle, assertCycle } from "../lib/game-engine.ts";
import { buildFinalStats } from "../lib/final-stats.ts";

test("draws one cycle; every elimination preserves it until exactly one winner", () => {
  for (const size of [3, 4, 5, 12, 40, 100]) {
    for (let attempt = 0; attempt < 15; attempt++) {
      const ids = Array.from({ length: size }, (_, index) => `player-${index}`);
      let cycle = drawCycle(ids);
      assertCycle(cycle);
      assert.equal(new Set(cycle.map((player) => player.targetId)).size, size);
      while (cycle.length > 1) {
        const eliminated = cycle[attempt % cycle.length];
        const killer = cycle.find((player) => player.targetId === eliminated.id);
        const oldTarget = eliminated.targetId;
        cycle = eliminateFromCycle(cycle, eliminated.id);
        assert.equal(cycle.find((player) => player.id === killer.id).targetId, cycle.length === 1 ? null : oldTarget);
      }
      assert.equal(cycle.length, 1);
      assert.equal(cycle[0].targetId, null);
    }
  }
});

test("rejects duplicate players, self-targets, separate cycles and absent victims", () => {
  assert.throws(() => drawCycle(["a", "b"]));
  assert.throws(() => drawCycle(["a", "a", "b"]));
  assert.throws(() => assertCycle([{ id: "a", targetId: "a" }, { id: "b", targetId: "b" }]));
  assert.throws(() => assertCycle([{ id: "a", targetId: "b" }, { id: "b", targetId: "a" }, { id: "c", targetId: "d" }, { id: "d", targetId: "c" }]));
  assert.throws(() => eliminateFromCycle(drawCycle(["a", "b", "c"]), "missing"));
});

test("final statistics count kills, not exposures, and handle ties", () => {
  const person = (id, group_name) => ({ id, name: id, group_name, hasPhoto: false });
  const a = person("a", "one"), b = person("b", "two"), c = person("c", "one");
  const stats = buildFinalStats([
    { id: "1", type: "killed", occurredAt: "2026-01-01T00:00:00Z", killer: a, victim: b },
    { id: "2", type: "exposed", occurredAt: "2026-01-01T00:01:00Z", killer: c, victim: a },
    { id: "3", type: "killed", occurredAt: "2026-01-01T00:02:00Z", killer: a, victim: c },
  ]);
  assert.equal(stats.totalKills, 2);
  assert.equal(stats.totalExposures, 1);
  assert.equal(stats.ranking[0].kills, 2);
  assert.equal(stats.ranking[0].crossGroupKills, 1);
  assert.equal(stats.fastestPair.durationMs, 120_000);
  assert.equal(buildFinalStats([]).firstBlood, null);
});
