"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import type { Player } from "@/lib/contracts";
import type { CrewRole } from "@/lib/roles";
import type { GameSettings } from "@/lib/settings";
import { initials } from "@/lib/presentation";
import { compressPhoto } from "@/lib/photo";
import { EmptyHeader } from "./EmptyHeader";

type AccessProfile = {
  id: string;
  name: string;
  group_name: string;
  role: string;
  hasPhoto: boolean;
  hasPin: boolean;
};

export function AccessScreen({ config, registrationOpen, onRegister, onComplete }: { config: GameSettings; registrationOpen: boolean; onRegister: (access: { code?: string; invite?: string }) => void; onComplete: () => void }) {
  const [mode, setMode] = useState<"choice" | "new" | "returning">("choice");
  const [profiles, setProfiles] = useState<AccessProfile[]>([]);
  const [selected, setSelected] = useState<AccessProfile | null>(null);
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/access", { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as { profiles?: AccessProfile[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Не удалось открыть список");
        setProfiles(result.profiles ?? []);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Не удалось открыть список"));
  }, []);

  useEffect(() => {
    const invite = new URLSearchParams(window.location.search).get("invite");
    if (!invite) return;
    const timer = window.setTimeout(() => {
    if (!registrationOpen) {
      setError("Регистрация по этой ссылке уже закрыта");
      return;
    }
    setBusy(true);
    fetch("/api/access", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "verifyInvite", invite }),
    })
      .then(async (response) => {
        const result = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Ссылка регистрации недействительна");
        onRegister({ invite });
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Ссылка регистрации недействительна"))
      .finally(() => setBusy(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [onRegister, registrationOpen]);

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "verifyCode", code }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Неверный код игры");
      onRegister({ code });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Неверный код игры");
    } finally {
      setBusy(false);
    }
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "login", playerId: selected.id, pin }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Не удалось войти");
      onComplete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось войти");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell guest-shell">
      <EmptyHeader config={config} />
      <section className="access-card login-card">
        {mode === "choice" && (
          <>
            <span className="access-number">ВХОД В ИГРУ</span>
            <h2>Представьтесь редакции</h2>
            <p>На своём телефоне сайт запомнит вас. На другом устройстве понадобится только имя и личный PIN.</p>
            {busy && new URLSearchParams(window.location.search).has("invite") && <div className="notice">Проверяем ссылку регистрации…</div>}
            {error && <div className="notice error-notice">{error}</div>}
            <button className="button primary access-action" disabled={!registrationOpen} onClick={() => setMode("new")}>{registrationOpen ? "Впервые здесь" : "Регистрация закрыта"}</button>
            <button className="button secondary access-action" onClick={() => setMode("returning")}>Я уже зарегистрирован</button>
          </>
        )}

        {mode === "new" && (
          <form className="access-form" onSubmit={verifyCode}>
            <button type="button" className="access-back" onClick={() => { setMode("choice"); setError(""); }}>← Назад</button>
            <span className="access-number">ПЕРВЫЙ ВХОД</span>
            <h2>Код игры</h2>
            <p>Введите общий код игры, который прислал организатор.</p>
            <label className="field-label">Код<input value={code} onChange={(event) => setCode(event.target.value)} autoCapitalize="characters" autoComplete="off" maxLength={24} /></label>
            {error && <div className="notice error-notice">{error}</div>}
            <button className="button primary access-action" disabled={busy || code.trim().length < 4}>{busy ? "Проверяем…" : "Продолжить"}</button>
          </form>
        )}

        {mode === "returning" && !selected && (
          <>
            <button type="button" className="access-back" onClick={() => { setMode("choice"); setError(""); }}>← Назад</button>
            <span className="access-number">ПОВТОРНЫЙ ВХОД</span>
            <h2>Найдите себя</h2>
            <div className="login-profile-grid">
              {profiles.map((profile) => (
                <button type="button" key={profile.id} onClick={() => { setSelected(profile); setError(""); }}>
                  <span className="login-avatar">{profile.hasPhoto ? <img src={`/api/photo/${profile.id}`} alt="" /> : initials(profile.name)}</span>
                  <strong>{profile.name}</strong>
                  <small>{profile.group_name}{profile.role ? ` · ${profile.role}` : ""}</small>
                  {!profile.hasPin && <em>PIN ещё не задан</em>}
                </button>
              ))}
            </div>
            {!profiles.length && <p className="access-empty">Зарегистрированных профилей пока нет.</p>}
            {error && <div className="notice error-notice">{error}</div>}
          </>
        )}

        {mode === "returning" && selected && (
          <form className="access-form" onSubmit={login}>
            <button type="button" className="access-back" onClick={() => { setSelected(null); setPin(""); setError(""); }}>← Выбрать другой профиль</button>
            <div className="selected-login-profile">
              <span className="login-avatar">{selected.hasPhoto ? <img src={`/api/photo/${selected.id}`} alt="" /> : initials(selected.name)}</span>
              <div><h2>{selected.name}</h2><p>{selected.group_name}{selected.role ? ` · ${selected.role}` : ""}</p></div>
            </div>
            {selected.hasPin ? (
              <>
                <label className="field-label">Личный PIN<input className="pin-input" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="current-password" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" /></label>
                {error && <div className="notice error-notice">{error}</div>}
                <button className="button primary access-action" disabled={busy || pin.length !== 4}>{busy ? "Проверяем…" : "Войти"}</button>
                <small className="pin-help">Забыли PIN? Организатор может выдать новый.</small>
              </>
            ) : (
              <div className="notice">У этого профиля пока нет PIN. Откройте сайт на устройстве, где профиль уже сохранён, или попросите организатора сбросить PIN.</div>
            )}
          </form>
        )}
      </section>
      <footer className="guest-footer">Совершенно секретно</footer>
    </main>
  );
}

export function PinSetup({ onComplete }: { onComplete: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "setPin", pin }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Не удалось сохранить PIN");
      onComplete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить PIN");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="pin-setup" onSubmit={submit}>
      <div><span>Новый способ входа</span><strong>Придумайте личный PIN</strong><p>После этого вы сможете войти по имени с любого телефона.</p></div>
      <input aria-label="Личный PIN" className="pin-input" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="new-password" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" />
      <button className="button primary" disabled={busy || pin.length !== 4}>{busy ? "…" : "Сохранить PIN"}</button>
      {error && <div className="notice error-notice">{error}</div>}
    </form>
  );
}

export function RegistrationScreen({ player, roles, config, accessCode = "", inviteToken = "", canCancel, onCancel, onComplete }: { player: Player | null; roles: CrewRole[]; config: GameSettings; accessCode?: string; inviteToken?: string; canCancel: boolean; onCancel: () => void; onComplete: () => Promise<void> }) {
  const [name, setName] = useState(player?.name ?? "");
  const [group_name, setGroupName] = useState(player?.group_name ?? "");
  const [roleKey, setRoleKey] = useState(player?.customRole ? "__custom__" : (player?.roleKey ?? ""));
  const [customRole, setCustomRole] = useState(player?.customRole ?? "");
  const [feminine, setFeminine] = useState(player?.feminine ?? false);
  const [pin, setPin] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function choosePhoto(file?: File) {
    if (!file) return;
    setError("");
    try {
      const prepared = await compressPhoto(file);
      if (preview) URL.revokeObjectURL(preview);
      setPhoto(prepared);
      setPreview(URL.createObjectURL(prepared));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось открыть фото");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = new FormData();
      data.set("name", name);
      data.set("group_name", group_name);
      data.set("roleKey", roleKey === "__custom__" ? "" : roleKey);
      data.set("customRole", roleKey === "__custom__" ? customRole : "");
      data.set("feminine", feminine ? "1" : "0");
      if (!player) {
        data.set("code", accessCode);
        data.set("invite", inviteToken);
      }
      if (pin) data.set("pin", pin);
      if (photo) data.set("photo", photo);
      const response = await fetch(player ? "/api/profile" : "/api/access", { method: player ? "POST" : "PUT", body: data });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Не удалось сохранить профиль");
      await onComplete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить профиль");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell registration-shell">
      <header className="registration-header"><span className="eyebrow">Личное дело</span><h1>{canCancel ? "Ваш профиль" : "Добро пожаловать в игру"}</h1><p>Заполните карточку участника. Добавьте фото; роль — исключительно для репутации.</p></header>
      <form className="registration-form" onSubmit={submit}>
        <label className="field-label">Имя и фамилия<input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} autoComplete="name" placeholder="Как вас знают друзья" /></label>

        {config.groups.length > 0 && <fieldset className="group-picker"><legend>{config.groupLabel}</legend>{config.groups.map((item) => <label aria-label={item} className={group_name === item ? "selected" : ""} key={item}><input type="radio" name="group_name" value={item} checked={group_name === item} onChange={() => setGroupName(item)} /><span>{item}</span></label>)}</fieldset>}

        <label className="field-label">Роль или тег<select value={roleKey} onChange={(event) => setRoleKey(event.target.value)}><option value="">Без официальной должности</option>{roles.map((role) => <option key={role.key} value={role.key}>{feminine ? role.feminine : role.masculine}</option>)}<option value="__custom__">Своя роль…</option></select></label>
        {roleKey === "__custom__" && <label className="field-label custom-role-field">Своя роль<input value={customRole} maxLength={60} onChange={(event) => setCustomRole(event.target.value)} placeholder="Например, Министр внезапных исчезновений" /><small>Она будет показана именно так, как вы её напишете.</small></label>}
        <label className="feminine-toggle" htmlFor="feminine-preference" aria-label="Хочу использовать феминитивы"><input id="feminine-preference" type="checkbox" checked={feminine} onChange={(event) => setFeminine(event.target.checked)} /><span><strong>Хочу использовать феминитивы</strong><small>Роли из списка будут показаны в женском роде; свою роль вы формулируете сами</small></span></label>

        <section className="portrait-field">
          <div className="portrait-preview">{preview || player?.hasPhoto ? <img src={preview || `/api/photo/${player?.id}`} alt="Ваш портрет" /> : <span>{initials(name || "?")}</span>}</div>
          <div><strong>Ваш портрет</strong><p>Фото увидят участники в списке игры и человек, которому выпадете вы.</p></div>
          <div className="portrait-actions"><button type="button" className="button primary" onClick={() => cameraRef.current?.click()}>Сделать селфи</button><button type="button" className="button secondary" onClick={() => libraryRef.current?.click()}>Выбрать фото</button></div>
          <input ref={cameraRef} className="hidden-input" type="file" accept="image/*" capture="user" onChange={(event) => void choosePhoto(event.target.files?.[0])} />
          <input ref={libraryRef} className="hidden-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void choosePhoto(event.target.files?.[0])} />
        </section>

        {(!player || !player.hasPin) && <label className="field-label pin-registration-field">Личный PIN<input className="pin-input" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="new-password" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" /><small>Четыре цифры для входа с другого телефона. Организатор сможет сбросить забытый PIN.</small></label>}

        {error && <div className="notice error-notice">{error}</div>}
        <button className="button danger registration-submit" disabled={busy || !name.trim() || (config.groups.length > 0 && !group_name) || (roleKey === "__custom__" && !customRole.trim()) || (!photo && !player?.hasPhoto) || ((!player || !player.hasPin) && pin.length !== 4)}>{busy ? "Сохраняем дело…" : "Сохранить профиль"}</button>
        {canCancel && <button type="button" className="button text-button registration-cancel" onClick={onCancel}>Отмена</button>}
      </form>
    </main>
  );
}
