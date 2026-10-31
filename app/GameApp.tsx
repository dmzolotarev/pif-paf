"use client";

import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { formatArticleQuote } from "@/lib/article-quote";
import type { AppState } from "@/lib/contracts";
import { initials } from "@/lib/presentation";
import { EmptyHeader } from "./components/EmptyHeader";
import { AccessScreen, PinSetup, RegistrationScreen } from "./components/AccessScreens";
import { CrewsScreen } from "./components/Roster";
import { FinalLeaderboard, FinalTimeline } from "./components/GameResults";
import { PressDesk } from "./components/PressDesk";


type Tab = "feed" | "crews" | "target" | "rules";
type EasterEffect = { kind: "gun-rain" | "six-seven"; id: number };

const GUN_RAIN_PARTICLES = [
  { left: "3%", delay: "0ms", duration: "1900ms", drift: "22px", turn: "300deg" },
  { left: "10%", delay: "320ms", duration: "2100ms", drift: "-18px", turn: "-250deg" },
  { left: "17%", delay: "90ms", duration: "2250ms", drift: "34px", turn: "380deg" },
  { left: "24%", delay: "510ms", duration: "1850ms", drift: "-30px", turn: "-330deg" },
  { left: "31%", delay: "220ms", duration: "2050ms", drift: "16px", turn: "270deg" },
  { left: "38%", delay: "620ms", duration: "1950ms", drift: "-24px", turn: "-290deg" },
  { left: "45%", delay: "40ms", duration: "2150ms", drift: "28px", turn: "360deg" },
  { left: "52%", delay: "420ms", duration: "2250ms", drift: "-20px", turn: "-310deg" },
  { left: "59%", delay: "160ms", duration: "1900ms", drift: "32px", turn: "320deg" },
  { left: "66%", delay: "700ms", duration: "2050ms", drift: "-28px", turn: "-370deg" },
  { left: "73%", delay: "280ms", duration: "2200ms", drift: "18px", turn: "260deg" },
  { left: "80%", delay: "560ms", duration: "1900ms", drift: "-34px", turn: "-300deg" },
  { left: "87%", delay: "110ms", duration: "2100ms", drift: "26px", turn: "350deg" },
  { left: "94%", delay: "460ms", duration: "2000ms", drift: "-22px", turn: "-280deg" },
] as const;

function dayLabel(value: string | null) {
  if (!value) return "Недавно";
  const date = new Date(value);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const eventDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((start - eventDay) / 86_400_000);
  if (days === 0) return "Сегодня";
  if (days === 1) return "Вчера";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(date);
}



export function GameApp() {
  const [state, setState] = useState<AppState | null>(null);
  const [tab, setTab] = useState<Tab>("feed");
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [reason, setReason] = useState<"killed" | "exposed">("killed");
  const [submitting, setSubmitting] = useState(false);
  const [signupAccess, setSignupAccess] = useState<{ code?: string; invite?: string } | null>(null);
  const [easterEffect, setEasterEffect] = useState<EasterEffect | null>(null);
  const easterTapRef = useRef({
    guns: { count: 0, lastTap: 0 },
    sixSeven: { count: 0, lastTap: 0 },
  });
  const easterEffectTimerRef = useRef<number | null>(null);
  const easterEffectIdRef = useRef(0);
  const crewFogLocked = tab === "crews" && Boolean(state?.player) && Boolean(state?.game.fogOfWar);

  const load = useCallback(async (quiet = false) => {
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      const data = (await response.json()) as AppState & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось загрузить игру");
      setState(data);
      setError("");
    } catch (caught) {
      if (!quiet) setError(caught instanceof Error ? caught.message : "Не удалось загрузить игру");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(true), 12_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [load]);

  useEffect(() => {
    document.documentElement.classList.toggle("crew-fog-open", crewFogLocked);
    if (crewFogLocked) window.scrollTo(0, 0);
    return () => document.documentElement.classList.remove("crew-fog-open");
  }, [crewFogLocked]);

  useEffect(() => () => {
    if (easterEffectTimerRef.current !== null) window.clearTimeout(easterEffectTimerRef.current);
  }, []);

  function registerEasterTap(kind: "guns" | "sixSeven", threshold: number) {
    if (!state?.config.easterEggs) return;
    const now = Date.now();
    const counter = easterTapRef.current[kind];
    counter.count = now - counter.lastTap <= 1_000 ? counter.count + 1 : 1;
    counter.lastTap = now;
    if (counter.count < threshold) return;

    counter.count = 0;
    counter.lastTap = 0;
    easterEffectIdRef.current += 1;
    if (easterEffectTimerRef.current !== null) window.clearTimeout(easterEffectTimerRef.current);
    setEasterEffect({ kind: kind === "guns" ? "gun-rain" : "six-seven", id: easterEffectIdRef.current });
    easterEffectTimerRef.current = window.setTimeout(() => setEasterEffect(null), 3_000);
  }

  async function confirmElimination() {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/eliminate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: state?.game.exposureRule === "cancel_kill" ? "killed" : reason }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Не удалось подтвердить выбытие");
      setModalOpen(false);
      setRevealed(false);
      setTab("target");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось подтвердить выбытие");
    } finally {
      setSubmitting(false);
    }
  }

  async function logoutPlayer() {
    await fetch("/api/session", { method: "DELETE" });
    window.location.assign("/");
  }

  if (loading) {
    return <main className="app-shell loading-screen"><span className="loader-mark">†</span><p>Открываем игру…</p></main>;
  }

  if (!state) {
    return <main className="app-shell"><EmptyHeader /><div className="notice error-notice">{error || "Игра временно недоступна"}</div></main>;
  }

  if (!state.player) {
    if (signupAccess) {
      return (
        <RegistrationScreen
          player={null}
          roles={state.crewRoles}
          config={state.config}
          accessCode={signupAccess.code}
          inviteToken={signupAccess.invite}
          canCancel
          onCancel={() => { setSignupAccess(null); window.history.replaceState({}, "", "/"); }}
          onComplete={async () => { setSignupAccess(null); window.history.replaceState({}, "", "/"); await load(); }}
        />
      );
    }
    return <AccessScreen config={state.config} registrationOpen={state.game.status === "draft"} onRegister={setSignupAccess} onComplete={() => load()} />;
  }

  if (state.player.status === "removed") {
    return (
      <main className="app-shell guest-shell">
        <EmptyHeader config={state.config} />
        <section className="access-card">
          <span className="access-number">ДЕЛО ЗАКРЫТО</span>
          <h2>Вы исключены из игры</h2>
          <p>Организатор убрал этот профиль из текущего состава. Если это ошибка, напишите ему — в режиме регистрации игрока можно вернуть.</p>
          <button className="button secondary access-action" onClick={() => void logoutPlayer()}>Выйти из профиля</button>
        </section>
      </main>
    );
  }

  if (!state.player.profileComplete && state.game.status !== "draft") {
    return (
      <main className="app-shell guest-shell">
        <EmptyHeader config={state.config} />
        <section className="access-card">
          <span className="access-number">РЕГИСТРАЦИЯ ЗАКРЫТА</span>
          <h2>Профиль не успел попасть в круг</h2>
          <p>Попросите организатора вернуть игру к регистрации или выйдите, чтобы открыть другой профиль.</p>
          <button className="button secondary access-action" onClick={() => void logoutPlayer()}>Выйти из профиля</button>
        </section>
      </main>
    );
  }

  if (!state.player.profileComplete || editingProfile) {
    return (
      <RegistrationScreen
        player={state.player}
        roles={state.crewRoles}
        config={state.config}
        canCancel={state.player.profileComplete}
        onCancel={() => setEditingProfile(false)}
        onComplete={async () => { setEditingProfile(false); await load(); }}
      />
    );
  }

  const { player, game } = state;
  const canEliminate = player.status === "active" && Boolean(state.target) && game.status === "running";
  const exposureEliminatesKiller = game.exposureRule === "eliminate_killer";

  return (
    <main className="app-shell">
      <header className="compact-header">
        <div>
          <span className="eyebrow">{state.config.title}</span>
          <strong>{player.name}</strong>
          <small>{[player.group_name, player.role].filter(Boolean).join(" · ")}</small>
        </div>
        <div className="player-seal" aria-label={`Портрет: ${player.name}`}>{player.hasPhoto ? <img src={`/api/photo/${player.id}`} alt="" /> : initials(player.name)}</div>
      </header>

      {error && <div className="notice error-notice">{error}</div>}

      {tab === "feed" && (
        <section className="screen feed-screen">
          <div className="hero-copy">
            <p className="chapter">{state.config.newspaperTitle} · Спецвыпуск</p>
            <h1>Последние<br />вести</h1>
            <p>{state.config.tagline}</p>
          </div>

          <div className="game-status" aria-label="Статус игры">
            <div><span className="status-dot" /><span>{game.status === "draft" ? "Сбор участников" : game.status === "paused" ? "Игра на паузе" : game.status === "finished" ? "Дело закрыто" : "Игра идёт"}</span></div>
            <strong>{game.status === "finished" ? `${game.winners.length} победител${game.winners.length === 1 ? "ь" : "ей"}` : game.fogOfWar ? "Туман войны" : `${game.activeCount} в игре`}</strong>
          </div>

          {!player.hasPin && <PinSetup onComplete={() => void load()} />}

          {game.status === "draft" && (
            <button className="profile-edit-link" onClick={() => setEditingProfile(true)}>Изменить мой профиль</button>
          )}

          {game.status === "finished" && game.winners.length > 0 && (
            <article className="winner-card">
              <span>{game.winners.length === 1 ? "Единственный победитель" : "Победители игры"}</span>
              <div className="winner-list">{game.winners.map((winner) => (
                <div key={winner.id}>
                  <div className="winner-avatar">{winner.hasPhoto ? <img src={`/api/photo/${winner.id}`} alt={`Портрет: ${winner.name}`} /> : <span>{initials(winner.name)}</span>}</div>
                  <h2>{winner.name}</h2><p>{winner.group_name}</p>
                </div>
              ))}</div>
              <p>Дело закрыто. Все улики раскрыты.</p>
            </article>
          )}

          {game.status === "finished" && state.finalStats && <FinalLeaderboard stats={state.finalStats} config={state.config} />}
          {game.status === "finished" && state.finalTimeline.length > 0 && <FinalTimeline events={state.finalTimeline} config={state.config} />}

          <div className="section-heading"><h2>Свежий номер</h2><span>{state.events.length}</span></div>
          <div className="event-list newspaper-list">
            {state.events.length ? state.events.map((event) => (
              <article className="news-article" key={event.id}>
                <div className="news-meta">
                  <span>{event.article_suppressed ? (event.type === "exposed" ? "Рассекречено" : "Происшествия") : (event.article_section || "Хроника")}</span>
                  <time>{dayLabel(event.publish_at)}</time>
                </div>
                <div className={`news-portrait ${event.type}`}>
                  <div>{event.has_photo ? <img src={`/api/photo/${event.player_id}`} alt={`Портрет: ${event.name}`} /> : <span>{initials(event.name)}</span>}{event.type === "killed" ? <i className="mourning-ribbon" /> : <i className="bars" />}</div>
                  <p><strong>{event.type === "killed" ? (event.feminine ? "Убита" : "Убит") : (event.feminine ? "Раскрыта" : "Раскрыт")}</strong><span>{event.name}</span></p>
                </div>
                <h3>{event.article_suppressed ? `${event.name} ${event.type === "exposed" ? (event.feminine ? "раскрыта" : "раскрыт") : (event.feminine ? "была убита" : "был убит")}` : (event.article_headline || `${event.name} ${event.type === "exposed" ? (event.feminine ? "раскрыта" : "раскрыт") : (event.feminine ? "была убита" : "был убит")}`)}</h3>
                <p>{event.article_suppressed ? event.epitaph : (event.article_body || event.epitaph)}</p>
                {!event.article_suppressed && event.article_quote && <blockquote>{formatArticleQuote(event.article_quote)}</blockquote>}
                <footer><span>†</span> {state.config.newspaperTitle}</footer>
              </article>
            )) : (
              <div className="empty-log"><span>Спокойное море</span><p>Редакция пока не получила ни одного тревожного сообщения.</p></div>
            )}
          </div>
        </section>
      )}

      {tab === "crews" && <CrewsScreen config={state.config} roster={state.roster} activeCount={game.activeCount} totalCount={game.totalCount} fogOfWar={game.fogOfWar} />}

      {tab === "target" && (
        <section className="screen target-screen">
          <p className="chapter">Персональное досье</p>
          <h1>{player.status === "eliminated" ? "Ваше дело" : "Ваша цель"}</h1>

          {player.status === "eliminated" ? (
            state.press && !state.press.submitted ? (
              <PressDesk newspaperTitle={state.config.newspaperTitle} reason={state.press.type} onComplete={() => {
                setState((current) => current?.press ? { ...current, press: { ...current.press, submitted: true } } : current);
                setTab("feed");
                void load(true);
              }} />
            ) : (
              <article className="closed-case">
                <span className="large-mark">†</span>
                <h2>Материал принят</h2>
                <p>Ваша цель уже передана дальше. Редакция выпустит заметку без точного времени происшествия.</p>
              </article>
            )
          ) : game.status === "draft" ? (
            <article className="closed-case"><span className="large-mark">⌛</span><h2>Жеребьёвка ещё впереди</h2><p>Организатор проверяет участников. После старта здесь появится секретное досье.</p></article>
          ) : game.status === "paused" ? (
            <article className="closed-case"><span className="large-mark">Ⅱ</span><h2>Игра на паузе</h2><p>Организатор временно остановил игру. Ваша цель сохранена и снова появится после продолжения.</p></article>
          ) : game.status === "finished" ? (
            <article className="closed-case"><span className="large-mark">✦</span><h2>{game.winners.some((winner) => winner.id === player.id) ? "Вы среди победителей" : "Игра окончена"}</h2><p>{game.winners.some((winner) => winner.id === player.id) ? "Вы сохранили свои тайны до конца." : `Победители названы в газете «${state.config.newspaperTitle}».`}</p></article>
          ) : state.target ? (
            <>
              <article className={`target-dossier ${revealed ? "revealed" : ""}`}>
                {!revealed ? (
                  <button className="reveal-cover" onClick={() => setRevealed(true)}><span className="large-mark">⌁</span><strong>Показать секретное досье</strong><small>Убедитесь, что никто не смотрит в экран</small></button>
                ) : (
                  <>
                    <div className="target-photo">{state.target.hasPhoto ? <img src={`/api/photo/${state.target.id}`} alt={`Фотография: ${state.target.name}`} /> : <span>{initials(state.target.name)}</span>}</div>
                    <span className="dossier-label">Объект наблюдения</span>
                    <h2>{state.target.name}</h2>
                    <p>{[state.target.group_name, state.target.role].filter(Boolean).join(" · ")}</p>
                    <button className="hide-target" onClick={() => setRevealed(false)}>Скрыть досье</button>
                  </>
                )}
              </article>
              {canEliminate && <button className="eliminate-button" onClick={() => setModalOpen(true)}>{exposureEliminatesKiller ? "Я выбыл" : "Меня убили"}</button>}
              <p className="danger-hint">{exposureEliminatesKiller ? "Нажимайте только если вас убили или вашу попытку заметил свидетель." : "Нажимайте только после успешного убийства. Если попытку заметили, оба игрока остаются в игре."}</p>
            </>
          ) : null}
        </section>
      )}

      {tab === "rules" && (
        <section className="screen rules-screen">
          <p className="chapter">Памятка участника</p>
          <h1>Правила дела</h1>
          <ol className="rules-list">
            <li><span>01</span><div><h2>Найдите цель</h2><p>После жеребьёвки вы увидите только одного человека — свою текущую цель.</p></div></li>
            <li className="easter-tap-target">
              <button type="button" className="rule-easter-button" onClick={() => registerEasterTap("guns", 3)}>
                <span>02</span><div><h2>Скажите «пиф-паф»</h2><p>Останьтесь с целью один на один, покажите жест «пистолетик» и скажите «пиф-паф» — только тогда убийство засчитывается.</p></div>
              </button>
            </li>
            <li><span>03</span><div><h2>Дождитесь безопасного момента</h2><p>{state.config.safetyRules.join(" ") || "Играйте только в безопасной обстановке."}</p></div></li>
            <li><span>04</span><div><h2>Не попадитесь свидетелю</h2><p>{exposureEliminatesKiller ? "Если момент убийства заметил кто-то из свидетелей, убийство не засчитывается, а убийца выбывает из игры." : "Если момент убийства заметил кто-то из свидетелей, убийство не засчитывается. Киллер и цель остаются в игре."}</p></div></li>
            <li><span>05</span><div><h2>Подтвердите честно</h2><p>{exposureEliminatesKiller ? "Нажмите «Я выбыл», выберите причину и подтвердите." : "Если вас успешно убили, нажмите «Меня убили» и подтвердите."}</p></div></li>
            <li className="easter-tap-target">
              <button type="button" className="rule-easter-button" onClick={() => registerEasterTap("sixSeven", 7)}>
                <span>06</span><div><h2>Дайте комментарий</h2><p>Расскажите редакции свою версию. Публикация появится позже и не выдаст точное время.</p></div>
              </button>
            </li>
          </ol>
          <button className="session-exit-link" onClick={() => void logoutPlayer()}>Выйти из профиля на этом устройстве</button>
        </section>
      )}

      <nav className="bottom-nav" aria-label="Основная навигация">
        <button className={tab === "feed" ? "active" : ""} onClick={() => setTab("feed")}><span aria-hidden="true">◉</span>Вестник</button>
        <button className={tab === "crews" ? "active" : ""} onClick={() => setTab("crews")}><span aria-hidden="true">≋</span>Участники</button>
        <button className={tab === "target" ? "active" : ""} onClick={() => { setTab("target"); setRevealed(false); }}><span aria-hidden="true">◎</span>Цель</button>
        <button className={tab === "rules" ? "active" : ""} onClick={() => setTab("rules")}><span aria-hidden="true">§</span>Правила</button>
      </nav>

      {modalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
          <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <button className="modal-close" aria-label="Закрыть" onClick={() => setModalOpen(false)}>×</button>
            <span className="modal-kicker">{exposureEliminatesKiller ? "Необратимое действие" : "Подтверждение события"}</span>
            <h2 id="confirm-title">{exposureEliminatesKiller ? "Что произошло?" : "Вас убили?"}</h2>
            <p>После подтверждения ваша цель немедленно перейдёт вашему киллеру.</p>
            {exposureEliminatesKiller && (
              <fieldset className="reason-picker">
                <legend>Выберите один вариант</legend>
                <label className={reason === "killed" ? "selected" : ""}><input type="radio" name="reason" checked={reason === "killed"} onChange={() => setReason("killed")} /><span>Меня убили</span></label>
                <label className={reason === "exposed" ? "selected" : ""}><input type="radio" name="reason" checked={reason === "exposed"} onChange={() => setReason("exposed")} /><span>Меня рассекретили</span></label>
              </fieldset>
            )}
            <button className="button danger" disabled={submitting} onClick={() => void confirmElimination()}>{submitting ? "Подтверждаем…" : exposureEliminatesKiller ? "Подтвердить выбытие" : "Подтвердить убийство"}</button>
            <button className="button text-button" disabled={submitting} onClick={() => setModalOpen(false)}>Отмена</button>
          </section>
        </div>
      )}

      {easterEffect?.kind === "gun-rain" && (
        <div key={easterEffect.id} className="easter-overlay gun-rain" aria-hidden="true">
          <div className="easter-static">🔫 🔫 🔫</div>
          {GUN_RAIN_PARTICLES.map((particle, index) => (
            <span
              key={index}
              className="gun-rain-particle"
              style={{
                "--easter-left": particle.left,
                "--easter-delay": particle.delay,
                "--easter-duration": particle.duration,
                "--easter-drift": particle.drift,
                "--easter-turn": particle.turn,
              } as CSSProperties}
            >🔫</span>
          ))}
        </div>
      )}

      {easterEffect?.kind === "six-seven" && (
        <div key={easterEffect.id} className="easter-overlay six-seven-overlay" aria-hidden="true">
          <div className="six-seven-burst">
            <span className="six-seven-token six-seven-left">6️⃣</span>
            <span className="six-seven-token six-seven-center">🤷</span>
            <span className="six-seven-token six-seven-right">7️⃣</span>
          </div>
        </div>
      )}
    </main>
  );
}
