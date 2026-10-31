"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatArticleQuote, normalizeArticleQuote } from "@/lib/article-quote";
import {
  type JournalistDetailModeConfig,
  type JournalistFormatConfig,
  type JournalistPreset,
} from "@/lib/journalist-config";
import { roleLabel, type CrewRole } from "@/lib/roles";
import type { GameSettings } from "@/lib/settings";
import { GameSettingsEditor } from "./GameSettingsEditor";
import { JournalistEditor } from "./JournalistEditor";

type Player = {
  id: string;
  name: string;
  group_name: string;
  role_key: string;
  custom_role: string;
  feminine: number;
  profile_completed: number;
  status: "active" | "eliminated" | "removed";
  has_photo: number;
  target_id: string | null;
  eliminated_at: string | null;
  elimination_reason: "killed" | "exposed" | null;
  removed_at: string | null;
  has_pin: number;
};

type Article = {
  id: string;
  type: "killed" | "exposed";
  article_format: string | null;
  article_section: string | null;
  article_headline: string | null;
  article_body: string | null;
  article_quote: string | null;
  publish_at: string | null;
  approval_required: number;
  approved_at: string | null;
  press_submitted_at: string | null;
  article_manual: number;
  article_suppressed: number;
  article_status: "ready" | "pending" | "failed";
  undone_at: string | null;
  generation_count: number;
  latest_generation_outcome: "ai" | "fallback" | null;
  latest_fallback_reason: string | null;
  player_name: string;
  group_name: string;
};

type ArticleGeneration = {
  id: string;
  event_id: string;
  model: string;
  effort: string;
  request_json: string;
  response_body: string;
  output_text: string;
  parsed_article_json: string;
  http_status: number | null;
  openai_request_id: string;
  response_id: string;
  outcome: "ai" | "fallback";
  fallback_reason: string | null;
  error_message: string | null;
  created_at: string;
};

type HistoryItem = {
  id: string;
  type: "killed" | "exposed";
  epitaph: string;
  created_at: string;
  undone_at: string | null;
  player_name: string;
  predecessor_name: string;
  inherited_name: string;
};


type AdminState = {
  config: GameSettings;
  game: {
    status: "draft" | "running" | "paused" | "finished";
    revision: number;
    winner_ids: string[];
    access_code: string;
    has_registration_invite: number;
    fog_mode: "auto" | "on" | "off";
    fog_of_war: boolean;
    exposure_rule: "eliminate_killer" | "cancel_kill";
    journalist_preset: string;
    journalist_detail_mode: string;
    journalist_notes: string;
    journalist_model: string;
    journalist_effort: string;
    journalist_core_prompt: string;
    journalist_source_prompt: string;
    journalist_role_prompt: string;
    journalist_presets: JournalistPreset[];
    journalist_detail_modes: JournalistDetailModeConfig[];
    journalist_formats: JournalistFormatConfig[];
    crew_roles: CrewRole[];
  };
  players: Player[];
  articles: Article[];
  history: HistoryItem[];
};

function prettyJson(value: string) {
  if (!value) return "Нет данных";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function fallbackReasonLabel(reason: string | null) {
  const labels: Record<string, string> = {
    api_key_missing: "API-ключ не настроен",
    model_missing: "Модель не выбрана",
    response_body_not_json: "ответ OpenAI не является JSON",
    openai_http_error: "OpenAI вернул HTTP-ошибку",
    output_text_missing: "в ответе нет output text",
    structured_output_not_json: "текст модели не разобрался как JSON статьи",
    required_article_text_missing: "в статье нет заголовка или основного текста",
    disallowed_game_wording: "сработал фильтр неиммерсивной формулировки",
    other_player_name_detected: "сработала защита от раскрытия другого игрока",
    request_exception: "запрос завершился исключением",
  };
  return reason ? labels[reason] ?? reason : "—";
}

export function AdminApp() {
  const [state, setState] = useState<AdminState | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [secret, setSecret] = useState("");
  const [bulk, setBulk] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [registrationLink, setRegistrationLink] = useState("");
  const [fogMode, setFogMode] = useState<"auto" | "on" | "off">("auto");
  const [exposureRule, setExposureRule] = useState<"eliminate_killer" | "cancel_kill">("eliminate_killer");
  const [pinNotice, setPinNotice] = useState<{ name: string; pin: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [selectedWinnerIds, setSelectedWinnerIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [editor, setEditor] = useState<{ id: string; headline: string; body: string; quote: string } | null>(null);
  const [diagnostics, setDiagnostics] = useState<{ eventId: string; generations: ArticleGeneration[] } | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin", { cache: "no-store" });
    if (response.status === 401) {
      setAuthorized(false);
      setState(null);
      return;
    }
    const result = (await response.json()) as AdminState & { error?: string };
    if (!response.ok) throw new Error(result.error ?? "Не удалось загрузить данные");
    setState(result);
    setSelectedWinnerIds(result.game.status === "finished" ? result.game.winner_ids :
      result.players.filter((player) => player.status === "active" && player.profile_completed).map((player) => player.id));
    setAccessCode(result.game.access_code);
    setFogMode(result.game.fog_mode);
    setExposureRule(result.game.exposure_rule);
    setAuthorized(true);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load().catch((caught) => setError(caught instanceof Error ? caught.message : "Ошибка")), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function action<T extends Record<string, unknown>>(payload: T) {
    const response = await fetch("/api/admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as { error?: string; token?: string; pin?: string; httpStatus?: number };
    if (!response.ok) throw new Error(result.error ?? "Действие не выполнено");
    return result;
  }

  async function fetchDiagnostics(eventId: string) {
    const response = await fetch(`/api/admin?eventId=${encodeURIComponent(eventId)}`, { cache: "no-store" });
    const result = (await response.json()) as { generations?: ArticleGeneration[]; error?: string };
    if (!response.ok) throw new Error(result.error ?? "Не удалось загрузить диагностику");
    setDiagnostics({ eventId, generations: result.generations ?? [] });
  }

  async function toggleDiagnostics(eventId: string) {
    if (diagnostics?.eventId === eventId) {
      setDiagnostics(null);
      return;
    }
    setBusy(`diagnostics-${eventId}`);
    setError("");
    try {
      await fetchDiagnostics(eventId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить диагностику");
    } finally {
      setBusy("");
    }
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy("login");
    setError("");
    try {
      await action({ action: "login", secret });
      setSecret("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка входа");
    } finally {
      setBusy("");
    }
  }

  async function addPlayers() {
    const players = bulk.split("\n").map((line) => {
      const [name, group_name = ""] = line.split("|");
      return { name: name.trim(), group_name: group_name.trim() };
    }).filter((player) => player.name);
    setBusy("add");
    setError("");
    try {
      await action({ action: "addPlayers", players });
      setBulk("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось добавить игроков");
    } finally {
      setBusy("");
    }
  }

  async function runAction(name: string, payload: Record<string, unknown> = {}) {
    setBusy(name);
    setError("");
    try {
      await action({ action: name, ...payload });
      await load();
      if (typeof payload.eventId === "string" && diagnostics?.eventId === payload.eventId) {
        await fetchDiagnostics(payload.eventId);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Действие не выполнено");
    } finally {
      setBusy("");
    }
  }

  async function saveArticle() {
    if (!editor) return;
    setBusy(`article-${editor.id}`);
    setError("");
    try {
      await action({
        action: "updateArticle",
        eventId: editor.id,
        articleHeadline: editor.headline,
        articleBody: editor.body,
        articleQuote: editor.quote,
      });
      setEditor(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить статью");
    } finally {
      setBusy("");
    }
  }

  async function resetPin(player: Player) {
    setBusy(`pin-${player.id}`);
    setError("");
    try {
      const result = await action({ action: "resetPin", playerId: player.id });
      if (result.pin) setPinNotice({ name: player.name, pin: result.pin });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сбросить PIN");
    } finally {
      setBusy("");
    }
  }

  async function createRegistrationLink() {
    setBusy("createRegistrationInvite");
    setError("");
    try {
      const result = await action({ action: "createRegistrationInvite" });
      if (!result.token) throw new Error("Не удалось создать ссылку");
      setRegistrationLink(`${window.location.origin}/?invite=${encodeURIComponent(result.token)}`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось создать ссылку");
    } finally {
      setBusy("");
    }
  }


  async function copyValue(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(""), 1600);
  }

  if (authorized === null) {
    return <main className="admin-shell loading-screen"><span className="loader-mark">†</span><p>Открываем кабинет…</p></main>;
  }

  if (!authorized) {
    return (
      <main className="admin-login">
        <section>
          <span className="eyebrow">Pif-Paf · Доступ организатора</span>
          <h1>Кабинет<br />организатора</h1>
          <p>Введите секрет, известный только ведущему игры.</p>
          <form onSubmit={login}>
            <label>Секрет организатора<input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} autoComplete="current-password" /></label>
            {error && <div className="notice error-notice">{error}</div>}
            <button className="button primary" disabled={!secret || busy === "login"}>{busy === "login" ? "Проверяем…" : "Войти"}</button>
          </form>
          <Link href="/">Вернуться к игре</Link>
        </section>
      </main>
    );
  }

  if (!state) return null;
  const availablePlayers = state.players.filter((player) => player.status !== "removed");
  const activeCount = availablePlayers.filter((player) => player.status === "active" && player.profile_completed).length;
  const registeredCount = availablePlayers.filter((player) => player.profile_completed).length;
  const contenders = availablePlayers.filter((player) => player.status === "active" && player.profile_completed);
  const contenderGroups = [...new Set(contenders.map((player) => player.group_name || "Без группы"))];
  const latestActiveEvent = state.history.find((event) => !event.undone_at);

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div><span className="eyebrow">{state.config.title}</span><h1>Организатор</h1></div>
        <Link href="/">Открыть игру</Link>
      </header>

      {error && <div className="notice error-notice">{error}</div>}

      <section className="admin-stats">
        <div><span>Статус</span><strong>{state.game.status === "draft" ? "Регистрация" : state.game.status === "running" ? "Игра идёт" : state.game.status === "paused" ? "На паузе" : "Завершена"}</strong></div>
        <div><span>{state.game.status === "draft" ? "Готовы" : "В игре"}</span><strong>{state.game.status === "draft" ? `${registeredCount} / ${availablePlayers.length}` : `${activeCount} / ${registeredCount}`}</strong></div>
        <div><span>События</span><strong>{state.history.filter((event) => !event.undone_at).length}</strong></div>
      </section>

      <GameSettingsEditor key={JSON.stringify(state.config)} initial={state.config} locked={state.game.status !== "draft"} onSave={async (config) => {
        await action({ action: "updateGameSettings", config }); await load();
      }} />

      <section className="admin-card phase-card">
        <div className="admin-card-heading"><span>00</span><div><h2>Управление игрой</h2><p>{state.game.status === "draft" ? "Регистрация открыта: участники могут заполнять и менять профили." : state.game.status === "paused" ? "Игра остановлена: цели скрыты, подтверждать выбытия нельзя." : state.game.status === "running" ? "Круг активен. Пауза временно остановит игру, не меняя целей." : "Победители объявлены. Можно сохранить состав и провести новую жеребьёвку."}</p></div></div>
        <div className="phase-actions">
          {state.game.status === "running" && <button className="button secondary" disabled={Boolean(busy)} onClick={() => { if (window.confirm("Поставить игру на паузу? Цели сохранятся, но выбытия будут временно недоступны.")) void runAction("pause"); }}>{busy === "pause" ? "Останавливаем…" : "Поставить на паузу"}</button>}
          {state.game.status === "paused" && <button className="button primary" disabled={Boolean(busy)} onClick={() => void runAction("resume")}>{busy === "resume" ? "Возобновляем…" : "Продолжить игру"}</button>}
          {state.game.status !== "draft" && <button className="button secondary" disabled={Boolean(busy)} onClick={() => { if (window.confirm("Вернуть игру к регистрации? Все цели и история тестовой игры будут удалены, а профили и фотографии сохранятся.")) void runAction("returnToRegistration"); }}>{busy === "returnToRegistration" ? "Возвращаем…" : "Вернуть к регистрации"}</button>}
          {state.game.status !== "draft" && <button className="button danger" disabled={registeredCount < 3 || Boolean(busy)} onClick={() => { if (window.confirm("Пережеребить круг и начать заново? Текущие цели и вся история событий будут удалены.")) void runAction("restart"); }}>{busy === "restart" ? "Пережеребьёвка…" : `Пережеребить и начать · ${registeredCount}`}</button>}
        </div>
        {state.game.status !== "draft" && (
          <div className="finish-game-control">
            <h3>{state.game.status === "finished" ? "Исправить список победителей" : "Завершить игру и выбрать победителей"}</h3>
            <p>{state.game.status === "finished" ? "Можно изменить список действующих игроков, объявленных победителями." : "Отметьте выживших, которых объявляем победителями. Завершение откроет все статьи и итоги игры."}</p>
            <div className="finish-game-boats">
              {contenderGroups.map((group_name) => (
                <fieldset key={group_name}>
                  <legend>{group_name}</legend>
                  {contenders.filter((player) => (player.group_name || "Без группы") === group_name).map((player) => (
                    <label key={player.id}>
                      <input type="checkbox" checked={selectedWinnerIds.includes(player.id)} disabled={Boolean(busy)}
                        onChange={() => setSelectedWinnerIds((selected) => selected.includes(player.id) ? selected.filter((id) => id !== player.id) : [...selected, player.id])} />
                      <span>{player.name}</span>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
            <button className={state.game.status === "finished" ? "button secondary" : "button danger"}
              disabled={Boolean(busy) || selectedWinnerIds.length === 0 ||
                (state.game.status === "finished" && selectedWinnerIds.length === state.game.winner_ids.length && selectedWinnerIds.every((id) => state.game.winner_ids.includes(id)))}
              onClick={() => {
                const names = contenders.filter((player) => selectedWinnerIds.includes(player.id)).map((player) => `${player.name} (${player.group_name || "без группы"})`);
                const editing = state.game.status === "finished";
                if (window.confirm(editing ? `Назначить победителями:\n${names.join("\n")}?` :
                  `Завершить игру и объявить победителями:\n${names.join("\n")}?\nВсе статьи станут видны, музыкальный сайт получит финальный сигнал.`)) {
                  void runAction(editing ? "updateWinners" : "finishGame", { winnerIds: selectedWinnerIds });
                }
              }}>{busy === "finishGame" || busy === "updateWinners" ? "Сохраняем…" : state.game.status === "finished" ? "Сохранить победителей" : `Завершить игру · победителей: ${selectedWinnerIds.length}`}</button>
          </div>
        )}
        {state.game.status === "finished" && (
          <p className="finished-winner-note">Победители: {state.players.filter((player) => state.game.winner_ids.includes(player.id)).map((player) => player.name).join(", ") || "не указаны"}.</p>
        )}
        <div className="fog-control game-rule-control">
          <div className="fog-control-heading">
            <div><strong>Режим игры</strong><span>Определяет, что происходит, если свидетель заметил попытку убийства.</span></div>
            <b>{state.game.status === "draft" ? "До жеребьёвки" : "Зафиксирован"}</b>
          </div>
          <label className="admin-field">Правило рассекречивания
            <select
              value={exposureRule}
              disabled={state.game.status !== "draft" || Boolean(busy)}
              onChange={(event) => setExposureRule(event.target.value as "eliminate_killer" | "cancel_kill")}
            >
              <option value="eliminate_killer">Киллер выбывает</option>
              <option value="cancel_kill">Убийство только отменяется</option>
            </select>
            <small>{exposureRule === "eliminate_killer" ? "Свидетель спасает жертву, а раскрывшийся киллер нажимает «Меня рассекретили» и выбывает." : "Свидетель спасает жертву, но киллер тоже остаётся в игре. На сайте отмечаются только успешные убийства."}</small>
          </label>
          {state.game.status === "draft" ? (
            <button className="button secondary" disabled={Boolean(busy) || exposureRule === state.game.exposure_rule} onClick={() => void runAction("updateExposureRule", { exposureRule })}>{busy === "updateExposureRule" ? "Сохраняем…" : "Сохранить режим игры"}</button>
          ) : (
            <p className="admin-locked-note">Чтобы выбрать другой режим, сначала верните игру к регистрации.</p>
          )}
        </div>
        <div className="fog-control">
          <div className="fog-control-heading">
            <div><strong>Туман войны</strong><span>Скрывает точное число живых и отметки выбывших в «Экипажах». Новые статьи ждут твоего одобрения.</span></div>
            <b className={state.game.fog_of_war ? "active" : ""}>{state.game.fog_of_war ? "Сейчас включён" : "Сейчас выключен"}</b>
          </div>
          <label className="admin-field">Режим
            <select value={fogMode} onChange={(event) => setFogMode(event.target.value as "auto" | "on" | "off")}>
              <option value="auto">Авто — при {state.config.fogThreshold} оставшихся</option>
              <option value="on">Всегда включён</option>
              <option value="off">Всегда выключен</option>
            </select>
            <small>После завершения игры полное дело откроется независимо от этой настройки.</small>
          </label>
          <button className="button secondary" disabled={Boolean(busy) || fogMode === state.game.fog_mode} onClick={() => void runAction("updateFogMode", { fogMode })}>{busy === "updateFogMode" ? "Сохраняем…" : "Сохранить режим"}</button>
        </div>
      </section>


      {state.game.status === "draft" && (
        <section className="admin-card access-code-card">
          <div className="admin-card-heading"><span>01</span><div><h2>Общий вход</h2><p>Отправьте всем одну и ту же ссылку и код игры. Участники зарегистрируются сами и придумают личный PIN.</p></div></div>
          <label className="admin-field">Код игры<input value={accessCode} maxLength={24} onChange={(event) => setAccessCode(event.target.value)} /></label>
          <div className="admin-inline-actions">
            <button className="button primary" disabled={accessCode.trim().length < 4 || Boolean(busy)} onClick={() => void runAction("updateAccessCode", { accessCode })}>{busy === "updateAccessCode" ? "Сохраняем…" : "Сохранить код"}</button>
            <button className="button secondary" onClick={() => void copyValue(window.location.origin, "main-link")}>{copied === "main-link" ? "Скопировано" : "Скопировать ссылку"}</button>
          </div>
          <div className="registration-link-panel">
            <strong>Ссылка без кода</strong>
            <p>По ней новый участник сразу попадёт к анкете. Новая ссылка автоматически отменяет предыдущую.</p>
            {registrationLink ? (
              <button className="registration-link-value" onClick={() => void copyValue(registrationLink, "registration-link")}>
                <span>{registrationLink}</span><b>{copied === "registration-link" ? "Скопировано" : "Копировать"}</b>
              </button>
            ) : state.game.has_registration_invite ? (
              <div className="notice">Ссылка уже выпускалась. Сам секрет не хранится открыто — создайте новую, если нужно скопировать её ещё раз.</div>
            ) : null}
            <button className="button secondary" disabled={Boolean(busy)} onClick={() => void createRegistrationLink()}>{busy === "createRegistrationInvite" ? "Создаём…" : registrationLink || state.game.has_registration_invite ? "Создать новую ссылку" : "Создать ссылку без кода"}</button>
          </div>
        </section>
      )}

      {state.game.status === "draft" && (
        <section className="admin-card">
          <div className="admin-card-heading"><span>02</span><div><h2>Предзагрузка имён</h2><p>Необязательно. Можно заранее вставить список — при регистрации человек займёт строку со своим именем. Если оставить пустым, профили будут создаваться автоматически.</p></div></div>
          <textarea value={bulk} onChange={(event) => setBulk(event.target.value)} placeholder={"Анна Смирнова\nМихаил Волков\nСаша Орлова"} rows={7} />
          <button className="button primary" disabled={!bulk.trim() || busy === "add"} onClick={() => void addPlayers()}>{busy === "add" ? "Добавляем…" : "Добавить имена"}</button>
        </section>
      )}

      {pinNotice && (
        <section className="admin-card invite-card">
          <div className="admin-card-heading"><span>PIN</span><div><h2>Новый PIN для {pinNotice.name}</h2><p>Старый PIN и сохранённые входы больше не действуют. Передайте игроку эти четыре цифры.</p></div></div>
          <button className="pin-display" onClick={() => void copyValue(pinNotice.pin, "pin")}>{pinNotice.pin}<small>{copied === "pin" ? "Скопировано" : "Нажмите, чтобы скопировать"}</small></button>
          <button className="button secondary" onClick={() => setPinNotice(null)}>Готово</button>
        </section>
      )}

      <section className="admin-card">
        <div className="admin-card-heading"><span>03</span><div><h2>Участники</h2><p>Видно, кто заполнил профиль и настроил вход. PIN организатор не видит, но может выпустить новый.</p></div></div>
        <div className="admin-player-list">
          {state.players.map((player) => (
            <article key={player.id}>
              <div className={`mini-status ${player.status}`} />
              <div><strong>{player.name}</strong><span>{player.status === "removed" ? "исключён организатором" : player.profile_completed ? `${player.group_name} · ${roleLabel(player.role_key, Boolean(player.feminine), player.custom_role, state.game.crew_roles) || "без роли"} · ${player.status === "eliminated" ? "выбыл" : "профиль готов"} · ${player.has_pin ? "PIN настроен" : "без PIN"}` : "ожидаем регистрацию"}</span></div>
              <div className="player-admin-actions">
                {player.status !== "removed" && Boolean(player.profile_completed) && <button disabled={busy === `pin-${player.id}`} onClick={() => void resetPin(player)}>{busy === `pin-${player.id}` ? "…" : "Сбросить PIN"}</button>}
                {player.status === "removed" && state.game.status === "draft" && <button onClick={() => void runAction("restorePlayer", { playerId: player.id })}>Вернуть</button>}
                {state.game.status !== "finished" && (player.status !== "removed" || state.game.status === "draft") && <button className="delete-link" onClick={() => { const verb = state.game.status === "draft" ? "Удалить" : "Исключить из текущей игры"; if (window.confirm(`${verb} ${player.name}?${state.game.status === "draft" ? " Профиль и фотография будут удалены." : " Круг автоматически перестроится."}`)) void runAction("deletePlayer", { playerId: player.id }); }}>{state.game.status === "draft" ? "Удалить" : "Исключить"}</button>}
              </div>
            </article>
          ))}
          {!state.players.length && <p className="admin-empty">Список пока пуст.</p>}
        </div>
      </section>

      {state.game.status === "draft" ? (
        <section className="admin-card draw-card">
          <div className="admin-card-heading"><span>04</span><div><h2>Жеребьёвка</h2><p>Будет создан единый случайный круг из зарегистрированных участников.</p></div></div>
          <button className="button danger" disabled={registeredCount < 3 || busy === "draw"} onClick={() => { if (window.confirm("Начать игру? Незарегистрированные приглашения будут исключены.")) void runAction("draw"); }}>{busy === "draw" ? "Проводим жеребьёвку…" : `Провести жеребьёвку · ${registeredCount}`}</button>
        </section>
      ) : (
        <section className="admin-card">
          <div className="admin-card-heading"><span>↶</span><div><h2>Исправление ошибки</h2><p>Отменить можно только последнее действующее выбытие — цикл восстановится автоматически.</p></div></div>
          <button className="button secondary" disabled={!latestActiveEvent || busy === "undo"} onClick={() => { if (window.confirm("Отменить последнее выбытие и вернуть игрока в цикл?")) void runAction("undo"); }}>{busy === "undo" ? "Восстанавливаем…" : latestActiveEvent ? `Вернуть: ${latestActiveEvent.player_name}` : "Нет события для отмены"}</button>
        </section>
      )}

      <JournalistEditor key={JSON.stringify(state.game)} initial={state.game} onAction={async (name, payload) => { await action({ action: name, ...payload }); await load(); }} />

      {state.game.status !== "draft" && (
        <section className="admin-card newsroom-card">
          <div className="admin-card-heading"><span>†</span><div><h2>Редакция «{state.config.newspaperTitle}»</h2><p>Статьи с отметкой одобрения ждут организатора. Остальные выходят автоматически; до публикации их можно исправить или снять.</p></div></div>
          <div className="article-admin-list">
            {state.articles.filter((article) => !article.undone_at).map((article) => {
              const waitingApproval = Boolean(article.approval_required && !article.approved_at);
              const published = !waitingApproval && Boolean(!article.publish_at || new Date(article.publish_at) <= new Date());
              return (
                <article key={article.id} className={article.article_suppressed ? "suppressed" : ""}>
                  <div className="article-admin-meta">
                    <span>{article.article_section || "Хроника"} · {state.game.journalist_formats.find((format) => format.key === article.article_format)?.label || "Редакционный материал"}</span>
                    <time>{article.article_suppressed ? "Снято с публикации" : waitingApproval ? (article.article_status === "pending" ? "AI пишет заметку · ждёт одобрения" : "Ждёт одобрения") : article.article_status === "pending" ? "AI пишет заметку" : article.article_status === "failed" ? "AI не ответил — доступен черновик" : published ? "Опубликовано" : `Выйдет ${article.publish_at ? new Date(article.publish_at).toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) : "позже"}`}</time>
                  </div>
                  <h3>{article.article_headline || `${article.player_name}: материал готовится`}</h3>
                  <p>{article.article_body || "Участник ещё не передал комментарий редакции."}</p>
                  {article.article_quote && <blockquote>{formatArticleQuote(article.article_quote)}</blockquote>}
                  <small>{article.player_name} · {article.group_name} · {article.press_submitted_at ? "комментарий получен" : "без комментария"}{article.article_manual ? " · отредактировано вручную" : ""}</small>
                  {article.latest_generation_outcome && (
                    <small className={`generation-result ${article.latest_generation_outcome}`}>
                      Последняя генерация: {article.latest_generation_outcome === "ai" ? "принят ответ AI" : `использован запасной текст · ${fallbackReasonLabel(article.latest_fallback_reason)}`}
                    </small>
                  )}
                  <div className="article-admin-actions">
                    <button onClick={() => setEditor({ id: article.id, headline: article.article_headline ?? "", body: article.article_body ?? "", quote: normalizeArticleQuote(article.article_quote) })}>Редактировать</button>
                    <button disabled={Boolean(busy)} onClick={() => void runAction(`regenerate-${article.id}`, { action: "regenerateArticle", eventId: article.id })}>{busy === `regenerate-${article.id}` ? "Переписываем…" : "Переписать AI"}</button>
                    <button disabled={Boolean(busy)} onClick={() => void runAction(`reformat-${article.id}`, { action: "regenerateArticle", eventId: article.id, chooseNewFormat: true })}>{busy === `reformat-${article.id}` ? "Меняем жанр…" : "Новый формат + AI"}</button>
                    <button disabled={busy === `diagnostics-${article.id}`} onClick={() => void toggleDiagnostics(article.id)}>{busy === `diagnostics-${article.id}` ? "Загружаем…" : diagnostics?.eventId === article.id ? "Закрыть диагностику" : `Диагностика AI${article.generation_count ? ` · ${article.generation_count}` : ""}`}</button>
                    {!published && !article.article_suppressed && <button disabled={Boolean(busy) || article.article_status === "pending"} onClick={() => void runAction("publishArticle", { eventId: article.id })}>{waitingApproval ? "Одобрить и опубликовать" : "Опубликовать сейчас"}</button>}
                    <button onClick={() => void runAction(article.article_suppressed ? "restoreArticle" : "suppressArticle", { eventId: article.id })}>{article.article_suppressed ? "Вернуть" : "Не публиковать"}</button>
                  </div>
                  {diagnostics?.eventId === article.id && (
                    <section className="generation-diagnostics">
                      <div className="generation-diagnostics-heading">
                        <strong>Протокол генераций</strong>
                        <span>API-ключ и заголовок Authorization не сохраняются</span>
                      </div>
                      {!diagnostics.generations.length && <p className="admin-empty">Для этой статьи ещё нет записанных генераций. Они появятся после следующей перегенерации.</p>}
                      {diagnostics.generations.map((generation, index) => (
                        <details className={`generation-attempt ${generation.outcome}`} open={index === 0} key={generation.id}>
                          <summary>
                            <span>{new Date(generation.created_at).toLocaleString("ru-RU")} · {generation.model} · {generation.effort}</span>
                            <b>{generation.outcome === "ai" ? "Ответ принят" : "Запасной текст"}</b>
                          </summary>
                          <dl>
                            <div><dt>HTTP</dt><dd>{generation.http_status ?? "запрос не отправлен"}</dd></div>
                            <div><dt>Причина fallback</dt><dd>{fallbackReasonLabel(generation.fallback_reason)}</dd></div>
                            {generation.response_id && <div><dt>Response ID</dt><dd>{generation.response_id}</dd></div>}
                            {generation.openai_request_id && <div><dt>Request ID</dt><dd>{generation.openai_request_id}</dd></div>}
                            {generation.error_message && <div><dt>Ошибка</dt><dd>{generation.error_message}</dd></div>}
                          </dl>
                          <details className="generation-json" open>
                            <summary>Полный JSON запроса к модели</summary>
                            <pre>{prettyJson(generation.request_json)}</pre>
                          </details>
                          <details className="generation-json">
                            <summary>Полный ответ OpenAI</summary>
                            <pre>{prettyJson(generation.response_body)}</pre>
                          </details>
                          <details className="generation-json">
                            <summary>Извлечённый output text</summary>
                            <pre>{prettyJson(generation.output_text)}</pre>
                          </details>
                          <details className="generation-json">
                            <summary>Разобранная статья до защитных проверок</summary>
                            <pre>{prettyJson(generation.parsed_article_json)}</pre>
                          </details>
                        </details>
                      ))}
                    </section>
                  )}
                </article>
              );
            })}
            {!state.articles.some((article) => !article.undone_at) && <p className="admin-empty">Редакция пока скучает без происшествий.</p>}
          </div>

          {editor && (
            <div className="article-editor">
              <span className="eyebrow">Ручная правка</span>
              <label>Заголовок<input value={editor.headline} maxLength={110} onChange={(event) => setEditor({ ...editor, headline: event.target.value })} /></label>
              <label>Текст<textarea value={editor.body} rows={8} maxLength={1600} onChange={(event) => setEditor({ ...editor, body: event.target.value })} /></label>
              <label>Цитата<textarea value={editor.quote} rows={3} maxLength={220} onChange={(event) => setEditor({ ...editor, quote: event.target.value })} /></label>
              <div><button className="button primary" disabled={busy === `article-${editor.id}`} onClick={() => void saveArticle()}>{busy === `article-${editor.id}` ? "Сохраняем…" : "Сохранить статью"}</button><button className="button text-button" onClick={() => setEditor(null)}>Отмена</button></div>
            </div>
          )}
        </section>
      )}

      <section className="admin-card">
        <div className="admin-card-heading"><span>04</span><div><h2>Полная история</h2><p>Эта часть видна только организатору и показывает переназначение целей.</p></div></div>
        <div className="admin-history">
          {state.history.map((event) => (
            <article className={event.undone_at ? "undone" : ""} key={event.id}>
              <time>{new Date(event.created_at).toLocaleString("ru-RU")}</time>
              <p><strong>{event.player_name}</strong> {event.type === "exposed" ? "рассекречён" : "убит"}</p>
              <span>{event.predecessor_name} получил новую цель: {event.inherited_name}</span>
              {event.undone_at && <em>Отменено</em>}
            </article>
          ))}
          {!state.history.length && <p className="admin-empty">Событий пока нет.</p>}
        </div>
      </section>
    </main>
  );
}
