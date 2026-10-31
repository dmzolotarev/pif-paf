"use client";

import { useState, type FormEvent } from "react";
import { validateSettings, type GameSettings } from "@/lib/settings";

export function GameSettingsEditor({ initial, locked, onSave }: {
  initial: GameSettings; locked: boolean; onSave: (config: GameSettings) => Promise<void>;
}) {
  const [config, setConfig] = useState(initial);
  const [groups, setGroups] = useState(initial.groups.join("\n"));
  const [rules, setRules] = useState(initial.safetyRules.join("\n"));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  function field<K extends keyof GameSettings>(key: K, value: GameSettings[K]) {
    setConfig((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(""); setBusy(true); setSaved(false);
    try {
      const value = validateSettings({ ...config, groups: groups.split("\n").map((line) => line.trim()).filter(Boolean), safetyRules: rules.split("\n").map((line) => line.trim()).filter(Boolean) });
      await onSave(value);
      setSaved(true);
    } catch (error) { setError(error instanceof Error ? error.message : "Не удалось сохранить настройки"); }
    finally { setBusy(false); }
  }
  return (
    <section className="admin-card settings-card">
      <div className="admin-card-heading"><span>⚙</span><div><h2>Ваше мероприятие</h2><p>Название, состав групп и правила задаются до жеребьёвки. Все группы участвуют в одном цикле.</p></div></div>
      <form onSubmit={submit}>
        <fieldset disabled={locked || busy} className="settings-fields">
          <label className="admin-field">Название игры<input value={config.title} maxLength={80} onChange={(event) => field("title", event.target.value)} /></label>
          <label className="admin-field">Название газеты<input value={config.newspaperTitle} maxLength={80} onChange={(event) => field("newspaperTitle", event.target.value)} /></label>
          <label className="admin-field">Слоган<input value={config.tagline} maxLength={240} onChange={(event) => field("tagline", event.target.value)} /></label>
          <label className="admin-field">Контекст для журналиста<textarea value={config.setting} maxLength={800} rows={3} onChange={(event) => field("setting", event.target.value)} /></label>
          <label className="admin-field">Часовой пояс<input value={config.timezone} maxLength={80} onChange={(event) => field("timezone", event.target.value)} /><small>Часовой пояс IANA для итогов игры, например UTC или Europe/Paris.</small></label>
          <label className="admin-field">Как называется группа<input value={config.groupLabel} maxLength={40} onChange={(event) => field("groupLabel", event.target.value)} /><small>Например: Группа, Лодка, Домик.</small></label>
          <label className="admin-field">Группы — по одной на строку<textarea value={groups} rows={4} onChange={(event) => { setGroups(event.target.value); setSaved(false); }} /><small>Пустой список отключает группы. Добавляйте их до регистрации участников.</small></label>
          <label className="admin-field">Правила безопасности — по одному на строку<textarea value={rules} rows={4} onChange={(event) => { setRules(event.target.value); setSaved(false); }} /><small>Появятся внутри пункта «Дождитесь безопасного момента».</small></label>
          <div className="journalist-engine-grid">
            <label className="admin-field">Задержка от, минут<input type="number" min={0} max={1440} value={config.publicationDelayMin} onChange={(event) => field("publicationDelayMin", Number(event.target.value))} /></label>
            <label className="admin-field">Задержка до, минут<input type="number" min={0} max={1440} value={config.publicationDelayMax} onChange={(event) => field("publicationDelayMax", Number(event.target.value))} /></label>
          </div>
          <label className="admin-field">Порог автоматического тумана войны<input type="number" min={2} max={100} value={config.fogThreshold} onChange={(event) => field("fogThreshold", Number(event.target.value))} /></label>
          <label className="settings-toggle"><input type="checkbox" checked={config.approveDuringFog} onChange={(event) => field("approveDuringFog", event.target.checked)} />Одобрять новые статьи вручную при тумане войны</label>
          <label className="settings-toggle"><input type="checkbox" checked={config.easterEggs} onChange={(event) => field("easterEggs", event.target.checked)} />Включить пасхалки в правилах</label>
          <label className="admin-field">Импорт настроек из JSON<input type="file" accept="application/json,.json" onChange={async (event) => {
            const file = event.target.files?.[0]; if (!file) return;
            try { const value = validateSettings(JSON.parse(await file.text())); setConfig(value); setGroups(value.groups.join("\n")); setRules(value.safetyRules.join("\n")); setError(""); setSaved(false); }
            catch (error) { setError(error instanceof Error ? error.message : "Неверный файл настроек"); }
          }} /></label>
          <button className="button primary" disabled={busy}>{busy ? "Сохраняем…" : "Сохранить настройки мероприятия"}</button>
        </fieldset>
      </form>
      {locked && <p className="admin-locked-note">Чтобы изменить мероприятие, верните игру к регистрации.</p>}
      {error && <div className="notice error-notice">{error}</div>}
      {saved && <div className="notice">Настройки сохранены.</div>}
    </section>
  );
}
