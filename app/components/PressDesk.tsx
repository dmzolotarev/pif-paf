"use client";

import { useState } from "react";

export function PressDesk({ reason, newspaperTitle, onComplete }: { reason: "killed" | "exposed"; newspaperTitle: string; onComplete: () => void }) {
  const [details, setDetails] = useState("");
  const [finalWords, setFinalWords] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(noComment = false) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/press", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ details: noComment ? "" : details, finalWords: noComment ? "" : finalWords }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Редакция не приняла материал");
      onComplete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Редакция не приняла материал");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="press-desk">
      <span className="press-stamp">{newspaperTitle}</span>
      <h2>{reason === "killed" ? "Редакция ждёт вашу версию" : "Дайте показания прессе"}</h2>
      <p>Вы уже выбыли, а ваша цель передана дальше. Теперь можно спокойно оставить материал для будущей заметки.</p>
      <label>{reason === "killed" ? "Что произошло?" : "Как вас рассекретили?"}<textarea value={details} onChange={(event) => setDetails(event.target.value)} rows={5} maxLength={800} placeholder="Расскажите подробности своими словами…" /></label>
      <label>{reason === "killed" ? "Последние слова" : "Слово в свою защиту"}<textarea value={finalWords} onChange={(event) => setFinalWords(event.target.value)} rows={3} maxLength={300} placeholder="Короткая цитата для печати…" /></label>
      <small>Текст обработает AI-журналист. Не указывайте имя убийцы или других игроков.</small>
      {error && <div className="notice error-notice">{error}</div>}
      <button className="button danger" disabled={busy} onClick={() => void submit()}>{busy ? "Передаём в редакцию…" : "Отправить в редакцию"}</button>
      <button className="button text-button" disabled={busy} onClick={() => void submit(true)}>Без комментариев</button>
    </article>
  );
}
