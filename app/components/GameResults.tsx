"use client";

import type { TimelinePerson, FinalTimelineItem } from "@/lib/contracts";
import type { FinalStats } from "@/lib/final-stats";
import type { GameSettings } from "@/lib/settings";
import { initials } from "@/lib/presentation";

function TimelinePortrait({ person, eliminated, exposed }: { person: TimelinePerson; eliminated: boolean; exposed?: boolean }) {
  return (
    <div className={`timeline-person ${eliminated ? "eliminated" : ""}`}>
      <div className="timeline-avatar">
        {person.hasPhoto ? <img src={`/api/photo/${person.id}`} alt={person.name} /> : <span>{initials(person.name)}</span>}
        {eliminated && (exposed ? <i className="bars" /> : <i className="mourning-ribbon" />)}
      </div>
      <strong>{person.name}</strong>
      <small>{person.group_name}</small>
    </div>
  );
}

function elapsedLabel(milliseconds: number) {
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return seconds === 0 ? "менее секунды" : `${seconds} сек`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} мин ${seconds % 60} сек`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч ${minutes % 60} мин`;
  return `${Math.floor(hours / 24)} д ${hours % 24} ч`;
}

export function FinalLeaderboard({ stats, config }: { stats: FinalStats; config: GameSettings }) {
  const recordedAt = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: config.timezone,
  });
  return (
    <section className="final-leaderboard">
      <div className="section-heading"><h2>Лидерборд</h2><span>Итоги охоты</span></div>
      <p className="leaderboard-intro">Подтверждено убийств: <strong>{stats.totalKills}</strong> · разоблачений: <strong>{stats.totalExposures}</strong>. Время — момент сообщения на сайте, часовой пояс {config.timezone}.</p>
      <div className="leaderboard-awards">
        {stats.firstBlood && <article><span>First blood</span><strong>{stats.firstBlood.killer.name}</strong><p>Первая жертва — {stats.firstBlood.victim.name} · {recordedAt.format(new Date(stats.firstBlood.occurredAt))}</p></article>}
        {stats.ranking.length > 0 && <article><span>Больше всего убийств</span><strong>{stats.ranking.filter((player) => player.kills === stats.ranking[0].kills).map((player) => player.name).join(", ")}</strong><p>{stats.ranking[0].kills} подтверждённых убийств</p></article>}
        {stats.lastBlood && <article><span>Последний выстрел</span><strong>{stats.lastBlood.killer.name}</strong><p>Последняя жертва — {stats.lastBlood.victim.name}</p></article>}
        {stats.fastestPair && <article><span>Самый быстрый дубль</span><strong>{elapsedLabel(stats.fastestPair.durationMs)}</strong><p>{stats.fastestPair.player.name} · между двумя своими убийствами</p></article>}
        {stats.crossGroupRecord > 0 && <article><span>Рейд по другим группам</span><strong>{stats.crossGroupLeaders.map((player) => player.name).join(", ")}</strong><p>{stats.crossGroupRecord} убийств в других группах</p></article>}
        {config.groups.length > 0 && stats.topGroups.length > 0 && <article><span>Самая опасная группа</span><strong>{stats.topGroups.map((group_name) => group_name.group_name).join(", ")}</strong><p>{stats.topGroups[0].kills} подтверждённых убийств группой</p></article>}
      </div>
      <div className="leaderboard-ranking">
        <h3>Личный зачёт</h3>
        {stats.ranking.length ? stats.ranking.map((player) => (
          <div key={player.id}>
            <b>{String(1 + stats.ranking.findIndex((entry) => entry.kills === player.kills)).padStart(2, "0")}</b>
            <span>{player.name}<small>{player.group_name || "Без группы"}</small></span>
            <strong>{player.kills}<small>убийств</small></strong>
          </div>
        )) : <p>Подтверждённых убийств не было.</p>}
      </div>
    </section>
  );
}

export function FinalTimeline({ events, config }: { events: FinalTimelineItem[]; config: GameSettings }) {
  const timeFormatter = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: config.timezone,
  });
  return (
    <section className="final-timeline">
      <div className="section-heading"><h2>Как всё было</h2><span>{events.length}</span></div>
      <p className="timeline-intro">Полное дело рассекречено: события идут от первого к последнему. Часовой пояс: {config.timezone}.</p>
      <div className="timeline-list">
        {events.map((event, index) => (
          <article key={event.id} className={`timeline-event ${event.type}`}>
            <b className="timeline-index">{String(index + 1).padStart(2, "0")}</b>
            <time className="timeline-time" dateTime={event.occurredAt}>{timeFormatter.format(new Date(event.occurredAt))}</time>
            <div className="timeline-pair">
              <div><em>Киллер</em><TimelinePortrait person={event.killer} eliminated={event.type === "exposed"} exposed={event.type === "exposed"} /></div>
              <div className="timeline-action"><span>{event.type === "killed" ? "пиф-паф" : "раскрыт"}</span><i>{event.type === "killed" ? "→" : "←"}</i></div>
              <div><em>Жертва</em><TimelinePortrait person={event.victim} eliminated={event.type === "killed"} /></div>
            </div>
            <p>{event.type === "killed" ? `${event.killer.name} → ${event.victim.name}: убийство` : `${event.killer.name} ← ${event.victim.name}: разоблачение`}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
