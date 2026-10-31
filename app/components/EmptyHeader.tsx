import { DEFAULT_SETTINGS, type GameSettings } from "@/lib/settings";

export function EmptyHeader({ config = DEFAULT_SETTINGS }: { config?: GameSettings }) {
  return (
    <header className="masthead">
      <div className="eyebrow">Совершенно секретно</div>
      <h1>{config.title}</h1>
      <p className="tagline">{config.tagline}</p>
    </header>
  );
}
