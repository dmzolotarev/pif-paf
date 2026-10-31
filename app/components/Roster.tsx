"use client";

import type { RosterPlayer } from "@/lib/contracts";
import type { GameSettings } from "@/lib/settings";
import { initials } from "@/lib/presentation";

export function CrewsScreen({ roster, activeCount, totalCount, fogOfWar, config }: { roster: RosterPlayer[]; activeCount: number | null; totalCount: number; fogOfWar: boolean; config: GameSettings }) {
  return (
    <section className={`screen crews-screen ${fogOfWar ? "fog-active" : ""}`}>
      <p className="chapter">Диспозиция сил</p>
      <h1>Участники</h1>
      <div className="crew-total"><strong>{fogOfWar ? "?" : activeCount}</strong><span>из {totalCount}<br />ещё в игре</span></div>
      <div className="group-list">
        {(config.groups.length ? config.groups : [""]).map((group_name) => {
          const members = roster.filter((member) => member.group_name === group_name);
          const alive = members.filter((member) => member.status === "active").length;
          return (
            <article className="group-card" key={group_name}>
              <header><div><span>{config.groups.length ? config.groupLabel : "Состав игры"}</span><h2>{group_name || "Все участники"}</h2></div><strong>{fogOfWar ? `${members.length} чел.` : `${alive}/${members.length}`}</strong></header>
              <div className="avatar-grid">
                {members.map((member) => (
                  <div className={`crew-member ${fogOfWar ? "fogged" : member.status} ${fogOfWar ? "" : (member.eliminationReason ?? "")}`} key={member.id}>
                    <div className="crew-avatar">{member.hasPhoto ? <img src={`/api/photo/${member.id}`} alt={member.name} /> : <span>{initials(member.name)}</span>}{!fogOfWar && member.eliminationReason === "killed" && <i className="mourning-ribbon" />}{!fogOfWar && member.eliminationReason === "exposed" && <i className="bars" />}</div>
                    <strong>{member.name}</strong>
                    <small>{fogOfWar ? (member.role || "статус засекречен") : member.eliminationReason === "killed" ? "выбыл" : member.eliminationReason === "exposed" ? "раскрыт" : (member.role || "в игре")}</small>
                  </div>
                ))}
              </div>
              {!members.length && <p className="group-empty">Участники пока не зарегистрированы.</p>}
            </article>
          );
        })}
      </div>
      {fogOfWar && (
        <div className="crews-fog-overlay" role="status">
          <p>Точное число оставшихся и статусы участников засекречены.</p>
        </div>
      )}
    </section>
  );
}
