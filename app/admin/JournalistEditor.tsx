"use client";

import { useState } from "react";
import { JOURNALIST_EFFORTS, type JournalistPreset, type JournalistDetailModeConfig, type JournalistFormatConfig } from "@/lib/journalist-config";
import type { CrewRole } from "@/lib/roles";

export type JournalistConfiguration = {
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

export function JournalistEditor({ initial, onAction }: { initial: JournalistConfiguration; onAction: (name: string, payload: Record<string, unknown>) => Promise<void> }) {
  const [journalistPreset, setJournalistPreset] = useState(initial.journalist_preset);
  const [journalistDetailMode, setJournalistDetailMode] = useState(initial.journalist_detail_mode);
  const [journalistNotes, setJournalistNotes] = useState(initial.journalist_notes);
  const [journalistModel, setJournalistModel] = useState(initial.journalist_model);
  const [journalistEffort, setJournalistEffort] = useState(initial.journalist_effort);
  const [journalistCorePrompt, setJournalistCorePrompt] = useState(initial.journalist_core_prompt);
  const [journalistSourcePrompt, setJournalistSourcePrompt] = useState(initial.journalist_source_prompt);
  const [journalistRolePrompt, setJournalistRolePrompt] = useState(initial.journalist_role_prompt);
  const [journalistPresets, setJournalistPresets] = useState<JournalistPreset[]>(initial.journalist_presets);
  const [journalistDetailModes, setJournalistDetailModes] = useState<JournalistDetailModeConfig[]>(initial.journalist_detail_modes);
  const [journalistFormats, setJournalistFormats] = useState<JournalistFormatConfig[]>(initial.journalist_formats);
  const [crewRoles, setCrewRoles] = useState<CrewRole[]>(initial.crew_roles);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function runAction(name: string, payload: Record<string, unknown> = {}) {
    setBusy(name); setError("");
    try { await onAction(name, payload); }
    catch (error) { setError(error instanceof Error ? error.message : "Не удалось сохранить настройки"); }
    finally { setBusy(""); }
  }
  return <>
      <section className="admin-card journalist-settings-card">
        <div className="admin-card-heading"><span>AI</span><div><h2>Редактор журналиста</h2><p>Здесь можно менять модель и все творческие части промпта. Скрытым остаётся только короткий фильтр, который не даёт статье раскрыть других игроков.</p></div></div>
        <div className="journalist-engine-grid">
          <label className="admin-field">Модель
            <input value={journalistModel} placeholder="ID модели OpenAI" maxLength={80} onChange={(event) => setJournalistModel(event.target.value)} />
            <small>Укажите модель с поддержкой Responses API и Structured Outputs, доступную вашему API-проекту. Пустое поле или отсутствие API-ключа включает шаблонные заметки.</small>
          </label>
          <label className="admin-field">Уровень размышления
            <select value={journalistEffort} onChange={(event) => setJournalistEffort(event.target.value)}>
              {JOURNALIST_EFFORTS.map((effort) => <option key={effort} value={effort}>{effort === "default" ? "По умолчанию у модели" : effort}</option>)}
            </select>
            <small>Допустимые значения зависят от модели. Default не передаёт reasoning.effort.</small>
          </label>
        </div>
        <label className="admin-field">Основная инструкция
          <textarea value={journalistCorePrompt} rows={12} maxLength={12000} onChange={(event) => setJournalistCorePrompt(event.target.value)} />
          <small>Главные правила голоса, юмора, длины и запрещённых штампов. Теперь эта часть полностью редактируется.</small>
        </label>
        <label className="admin-field">Тематика
          <select value={journalistPreset} onChange={(event) => setJournalistPreset(event.target.value)}>
            {journalistPresets.map((preset) => <option key={preset.key} value={preset.key}>{preset.label}</option>)}
          </select>
          <small>{journalistPresets.find((preset) => preset.key === journalistPreset)?.description}</small>
        </label>
        <label className="admin-field">Как использовать показания
          <select value={journalistDetailMode} onChange={(event) => setJournalistDetailMode(event.target.value)}>
            {journalistDetailModes.map((mode) => <option key={mode.key} value={mode.key}>{mode.label}</option>)}
          </select>
          <small>{journalistDetailModes.find((mode) => mode.key === journalistDetailMode)?.description}</small>
        </label>
        <details className="prompt-module-editor" open>
          <summary>Как работать с показаниями и ролью</summary>
          <label className="admin-field">Общая инструкция для показаний
            <textarea value={journalistSourcePrompt} rows={6} maxLength={6000} onChange={(event) => setJournalistSourcePrompt(event.target.value)} />
          </label>
          <label className="admin-field">Как использовать роль или авторский тег
            <textarea value={journalistRolePrompt} rows={6} maxLength={6000} onChange={(event) => setJournalistRolePrompt(event.target.value)} />
          </label>
          {journalistDetailModes.map((mode, index) => (
            <article className="prompt-module" key={mode.key}>
              <strong>{mode.key}</strong>
              <button type="button" className="module-remove" onClick={() => { const remaining = journalistDetailModes.filter((item) => item.key !== mode.key); setJournalistDetailModes(remaining); if (journalistDetailMode === mode.key) setJournalistDetailMode(remaining[0]?.key ?? ""); }}>Удалить</button>
              <div className="prompt-module-fields">
                <label>Название<input value={mode.label} maxLength={70} onChange={(event) => setJournalistDetailModes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} /></label>
                <label>Пояснение<input value={mode.description} maxLength={180} onChange={(event) => setJournalistDetailModes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} /></label>
                <label>Инструкция<textarea value={mode.prompt} rows={4} maxLength={3000} onChange={(event) => setJournalistDetailModes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, prompt: event.target.value } : item))} /></label>
              </div>
            </article>
          ))}
          <button type="button" className="button secondary" onClick={() => setJournalistDetailModes((current) => [...current, { key: `mode_${Date.now()}`, label: "Новый режим", description: "", prompt: "Используйте конкретные детали показаний без дословного пересказа." }])}>Добавить режим показаний</button>
        </details>
        <details className="prompt-module-editor">
          <summary>Редактировать тематики · {journalistPresets.length}</summary>
          {journalistPresets.map((preset, index) => (
            <article className="prompt-module" key={preset.key}>
              <strong>{preset.key}</strong>
              <button type="button" className="module-remove" onClick={() => { const remaining = journalistPresets.filter((item) => item.key !== preset.key); setJournalistPresets(remaining); if (journalistPreset === preset.key) setJournalistPreset(remaining[0]?.key ?? ""); }}>Удалить</button>
              <div className="prompt-module-fields">
                <label>Название<input value={preset.label} maxLength={70} onChange={(event) => setJournalistPresets((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} /></label>
                <label>Пояснение<input value={preset.description} maxLength={180} onChange={(event) => setJournalistPresets((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} /></label>
                <label>Промпт тематики<textarea value={preset.prompt} rows={5} maxLength={3000} onChange={(event) => setJournalistPresets((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, prompt: event.target.value } : item))} /></label>
              </div>
            </article>
          ))}
          <button type="button" className="button secondary" onClick={() => setJournalistPresets((current) => [...current, { key: `preset_${Date.now()}`, label: "Новая тематика", description: "", prompt: "Пишите короткую дружескую газетную заметку с добрым юмором." }])}>Добавить тематику</button>
        </details>
        <details className="prompt-module-editor">
          <summary>Редактировать форматы статей · {journalistFormats.length}</summary>
          {journalistFormats.map((format, index) => (
            <article className="prompt-module" key={format.key}>
              <strong>{format.key} · {format.reasons.map((reason) => reason === "killed" ? "убийство" : "раскрытие").join(" / ")}</strong>
              <button type="button" className="module-remove" onClick={() => setJournalistFormats((current) => current.filter((item) => item.key !== format.key))}>Удалить</button>
              <div className="format-reasons">{(["killed", "exposed"] as const).map((reason) => <label key={reason}><input type="checkbox" checked={format.reasons.includes(reason)} onChange={(event) => setJournalistFormats((current) => current.map((item) => item.key === format.key ? { ...item, reasons: event.target.checked ? [...item.reasons, reason] : item.reasons.filter((value) => value !== reason) } : item))} />{reason === "killed" ? "Убийство" : "Раскрытие"}</label>)}</div>
              <div className="prompt-module-fields two-columns">
                <label>Название<input value={format.label} maxLength={90} onChange={(event) => setJournalistFormats((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} /></label>
                <label>Рубрика<input value={format.section} maxLength={70} onChange={(event) => setJournalistFormats((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, section: event.target.value } : item))} /></label>
                <label>Инструкция формата<textarea value={format.prompt} rows={5} maxLength={3000} onChange={(event) => setJournalistFormats((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, prompt: event.target.value } : item))} /></label>
              </div>
            </article>
          ))}
          <button type="button" className="button secondary" onClick={() => setJournalistFormats((current) => [...current, { key: `format_${Date.now()}`, label: "Новый формат", section: "Происшествия", reasons: ["killed", "exposed"], prompt: "Постройте короткую заметку вокруг одной необычной детали из показаний." }])}>Добавить формат</button>
        </details>
        <details className="prompt-module-editor">
          <summary>Редактировать роли участников · {crewRoles.length}</summary>
          <p className="module-note">Эти варианты сразу появятся в анкете и будут использоваться в профилях, целях и статьях. Авторские роли игроков сохраняются как есть.</p>
          {crewRoles.map((role, index) => (
            <article className="prompt-module" key={role.key}>
              <strong>{role.key}</strong>
              <button type="button" className="module-remove" onClick={() => setCrewRoles((current) => current.filter((item) => item.key !== role.key))}>Удалить</button>
              <div className="prompt-module-fields two-columns">
                <label>Обычный вариант<input value={role.masculine} maxLength={80} onChange={(event) => setCrewRoles((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, masculine: event.target.value } : item))} /></label>
                <label>С феминитивами<input value={role.feminine} maxLength={80} onChange={(event) => setCrewRoles((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, feminine: event.target.value } : item))} /></label>
              </div>
            </article>
          ))}
          <button type="button" className="button secondary" onClick={() => setCrewRoles((current) => [...current, { key: `role_${Date.now()}`, masculine: "Новая роль", feminine: "Новая роль" }])}>Добавить роль</button>
        </details>
        <label className="admin-field">Дополнительная редакторская установка
          <textarea value={journalistNotes} rows={4} maxLength={1000} onChange={(event) => setJournalistNotes(event.target.value)} placeholder="Например: меньше шаблонных метафор, больше сухого абсурда." />
          <small>Быстрая установка для текущего выпуска. Она не отменяет скрытый фильтр приватности.</small>
        </label>
        <div className="journalist-settings-actions">
          <button className="button primary" disabled={Boolean(busy)} onClick={() => void runAction("updateJournalistSettings", { journalistPreset, journalistDetailMode, journalistNotes, journalistModel, journalistEffort, journalistCorePrompt, journalistSourcePrompt, journalistRolePrompt, journalistPresets, journalistDetailModes, journalistFormats, crewRoles })}>{busy === "updateJournalistSettings" ? "Сохраняем…" : "Сохранить все настройки"}</button>
          <button className="button secondary" disabled={Boolean(busy)} onClick={() => { if (window.confirm("Вернуть все настройки журналиста к рекомендуемым? Ваши промпты будут заменены.")) void runAction("resetJournalistSettings"); }}>{busy === "resetJournalistSettings" ? "Возвращаем…" : "Вернуть рекомендуемые"}</button>
        </div>
      </section>
    {error && <div className="notice error-notice">{error}</div>}
  </>;
}
