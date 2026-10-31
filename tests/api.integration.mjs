import assert from "node:assert/strict";
import test from "node:test";
import { assertCycle } from "../lib/game-engine.ts";

const base = process.env.TEST_BASE_URL;
if (!base || new URL(base).hostname !== "127.0.0.1") throw new Error("Use npm run test:integration; these tests only run against their isolated localhost server.");
const avatar = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfYQAAAAASUVORK5CYII=", "base64");
async function request(path, { cookie, method = "GET", body, form } = {}) {
  const response = await fetch(base + path, {
    method, headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  const data = await response.json();
  return { status: response.status, data, cookie: response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ") };
}

test("registration, sessions, both rule variants, cycle changes and final publication", { timeout: 120_000 }, async () => {
  assert.equal((await request("/api/admin")).status, 401);
  const login = await request("/api/admin", { method: "POST", body: { action: "login", secret: process.env.TEST_ADMIN_SECRET } });
  assert.equal(login.status, 200);
  const adminCookie = login.cookie;
  const admin = (body) => request("/api/admin", { cookie: adminCookie, method: "POST", body });
  const getAdmin = async () => (await request("/api/admin", { cookie: adminCookie })).data;
  let state = await getAdmin();
  assert.deepEqual(state.config.groups, []);
  const config = { ...state.config, title: "Test event", groups: ["One", "Two", "Three", "Four"], publicationDelayMin: 0, publicationDelayMax: 0, fogThreshold: 3 };
  assert.equal((await admin({ action: "updateGameSettings", config })).status, 200);
  assert.equal((await admin({ action: "updateGameSettings", config: { ...config, groups: ["A", "a"] } })).status, 400);
  const code = state.game.access_code;
  const editorial = {
    action: "updateJournalistSettings",
    journalistPreset: "custom", journalistDetailMode: state.game.journalist_detail_mode,
    journalistNotes: "", journalistModel: "", journalistEffort: "default",
    journalistCorePrompt: state.game.journalist_core_prompt,
    journalistSourcePrompt: state.game.journalist_source_prompt,
    journalistRolePrompt: state.game.journalist_role_prompt,
    journalistPresets: [{ key: "custom", label: "Custom", description: "Test", prompt: "Use the submitted details." }],
    journalistDetailModes: state.game.journalist_detail_modes,
    journalistFormats: [{ key: "custom", label: "Custom", section: "News", reasons: ["killed", "exposed"], prompt: "Use the submitted details." }],
    crewRoles: [],
  };
  assert.equal((await admin(editorial)).status, 200);
  assert.equal((await admin({ ...editorial, journalistFormats: [] })).status, 400);
  assert.deepEqual((await getAdmin()).game.crew_roles, []);
  assert.equal((await admin({ action: "draw" })).status, 409);
  assert.equal((await admin({ action: "addPlayers", players: [{ name: "Test Player 0" }, { name: "Unused invitation" }] })).status, 200);
  const unused = (await getAdmin()).players.find((player) => player.name === "Unused invitation");
  assert.equal((await admin({ action: "deletePlayer", playerId: unused.id })).status, 200);
  const users = [];
  for (let index = 0; index < 6; index++) {
    const form = new FormData();
    for (const [key, value] of Object.entries({ name: `Test Player ${index}`, group_name: config.groups[index % 4], code, pin: "1234", roleKey: "", customRole: "", feminine: "0" })) form.set(key, value);
    form.set("photo", new Blob([avatar], { type: "image/png" }), "avatar.png");
    const result = await request("/api/access", { method: "PUT", form });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    const personal = (await request("/api/state", { cookie: result.cookie })).data;
    users.push({ id: personal.player.id, cookie: result.cookie });
  }
  const anonymous = (await request("/api/state")).data;
  assert.equal(anonymous.target, null);
  assert.equal(anonymous.player, null);
  assert.equal(anonymous.config.title, "Test event");
  assert.equal((await admin({ action: "draw" })).status, 200);
  assert.equal((await admin({ action: "updateGameSettings", config })).status, 409);
  async function checkCycle() {
    const state = await getAdmin();
    const active = state.players.filter((player) => player.status === "active" && player.profile_completed);
    assertCycle(active.map((player) => ({ id: player.id, targetId: player.target_id })));
    return state;
  }
  await checkCycle();
  assert.equal((await admin({ action: "pause" })).status, 200);
  assert.equal((await request("/api/eliminate", { cookie: users[0].cookie, method: "POST", body: { reason: "killed" } })).status, 409);
  assert.equal((await admin({ action: "resume" })).status, 200);
  // One profile cannot be eliminated twice, even when both requests overlap.
  const duplicate = await Promise.all([0, 1].map(() => request("/api/eliminate", { cookie: users[0].cookie, method: "POST", body: { reason: "killed" } })));
  assert.deepEqual(duplicate.map((result) => result.status).sort(), [200, 409]);
  await checkCycle();
  assert.equal((await admin({ action: "undo" })).status, 200);
  await checkCycle();
  const killed = await request("/api/eliminate", { cookie: users[0].cookie, method: "POST", body: { reason: "killed" } });
  assert.equal(killed.status, 200);
  const press = await request("/api/press", { cookie: users[0].cookie, method: "POST", body: { details: "Проверял печенье на кухне.", finalWords: "Берегите печенье!" } });
  assert.equal(press.status, 200);
  let generations = [];
  for (let attempt = 0; attempt < 20 && !generations.length; attempt++) {
    generations = (await request(`/api/admin?eventId=${killed.data.eventId}`, { cookie: adminCookie })).data.generations;
    if (!generations.length) await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(generations[0].outcome, "fallback");
  assert.match(generations[0].request_json, /печенье/);
  assert.doesNotMatch(generations[0].request_json, /Authorization|api_key/i);
  assert.equal((await request("/api/press", { cookie: users[0].cookie, method: "POST", body: { details: "Повтор" } })).status, 409);
  let current = await checkCycle();
  const nextVictim = users.find((user) => current.players.some((player) => player.id === user.id && player.status === "active"));
  assert.equal((await request("/api/eliminate", { cookie: nextVictim.cookie, method: "POST", body: { reason: "exposed" } })).status, 200);
  current = await checkCycle();
  // PIN lockout and reset invalidate the old signed session.
  const pinUser = users.find((user) => current.players.some((player) => player.id === user.id && player.status === "active"));
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await request("/api/access", { method: "POST", body: { action: "login", playerId: pinUser.id, pin: "9999" } });
    assert.equal(result.status, attempt === 4 ? 429 : 401);
  }
  const reset = await admin({ action: "resetPin", playerId: pinUser.id });
  assert.equal(reset.status, 200);
  assert.equal((await request("/api/state", { cookie: pinUser.cookie })).data.player, null);
  const newSession = await request("/api/access", { method: "POST", body: { action: "login", playerId: pinUser.id, pin: reset.data.pin } });
  assert.equal(newSession.status, 200);
  pinUser.cookie = newSession.cookie;
  while (current.players.filter((player) => player.status === "active" && player.profile_completed).length > 1) {
    const remaining = current.players.filter((player) => player.status === "active" && player.profile_completed);
    const user = users.find((user) => user.id === remaining[0].id);
    assert.equal((await request("/api/eliminate", { cookie: user.cookie, method: "POST", body: { reason: "killed" } })).status, 200);
    current = await checkCycle();
    if (current.game.status !== "finished" && current.game.fog_of_war) {
      const publicState = (await request("/api/state", { cookie: user.cookie })).data;
      assert.equal(publicState.game.activeCount, null);
      assert.equal(publicState.roster.some((player) => player.eliminationReason !== null), false);
    }
  }
  const final = (await request("/api/state")).data;
  assert.equal(final.game.status, "finished");
  assert.equal(final.game.winners.length, 1);
  assert.equal(final.finalTimeline.length, 5);
  assert.equal(final.events.length, 5);
  assert.equal(final.finalStats.totalKills + final.finalStats.totalExposures, 5);
  // A second round changes only the exposure rule; surviving profiles remain usable.
  assert.equal((await admin({ action: "returnToRegistration" })).status, 200);
  assert.equal((await admin({ action: "updateExposureRule", exposureRule: "cancel_kill" })).status, 200);
  assert.equal((await admin({ action: "draw" })).status, 200);
  const user = users[1];
  assert.equal((await request("/api/eliminate", { cookie: user.cookie, method: "POST", body: { reason: "exposed" } })).status, 409);
  assert.equal((await admin({ action: "finishGame", winnerIds: [users[1].id, users[2].id] })).status, 200);
  assert.equal((await request("/api/state")).data.game.winners.length, 2);
  assert.equal((await admin({ action: "returnToRegistration" })).status, 200);
  assert.equal((await admin({ action: "updateGameSettings", config: { ...config, groups: [] } })).status, 200);
  assert.equal((await getAdmin()).players.every((player) => player.group_name === ""), true);
  const invitation = await admin({ action: "createRegistrationInvite" });
  const form = new FormData();
  for (const [key, value] of Object.entries({ name: "No group", group_name: "", invite: invitation.data.token, pin: "4321", roleKey: "", customRole: "" })) form.set(key, value);
  form.set("photo", new Blob([avatar], { type: "image/png" }), "avatar.png");
  const noGroup = await request("/api/access", { method: "PUT", form });
  assert.equal(noGroup.status, 200, JSON.stringify(noGroup.data));
  assert.equal((await request("/api/state", { cookie: noGroup.cookie })).data.player.group_name, "");
  // Registration overlapping the draw must either join the full cycle or fail.
  const concurrentForm = new FormData();
  for (const [key, value] of Object.entries({ name: "Concurrent signup", group_name: "", invite: invitation.data.token, pin: "2468", roleKey: "", customRole: "" })) concurrentForm.set(key, value);
  concurrentForm.set("photo", new Blob([avatar], { type: "image/png" }), "avatar.png");
  const overlap = await Promise.all([admin({ action: "draw" }), request("/api/access", { method: "PUT", form: concurrentForm })]);
  assert.equal(overlap.every((result) => [200, 409].includes(result.status)), true, JSON.stringify(overlap));
  if ((await getAdmin()).game.status === "draft") assert.equal((await admin({ action: "draw" })).status, 200);
  await checkCycle();
});
