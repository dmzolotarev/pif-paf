export type GameSettings = {
  title: string;
  newspaperTitle: string;
  tagline: string;
  setting: string;
  timezone: string;
  groupLabel: string;
  groups: string[];
  safetyRules: string[];
  publicationDelayMin: number;
  publicationDelayMax: number;
  fogThreshold: number;
  approveDuringFog: boolean;
  easterEggs: boolean;
};

export const DEFAULT_SETTINGS: GameSettings = {
  title: "Pif-Paf",
  newspaperTitle: "Вестник игры",
  tagline: "Все под подозрением. Никому не доверяй.",
  setting: "Дружеская игра в компании знакомых людей.",
  timezone: "UTC",
  groupLabel: "Группа",
  groups: [],
  safetyRules: ["Нельзя убивать человека, пока он спит.", "Не играйте в ситуациях, где требуется внимание к безопасности."],
  publicationDelayMin: 30,
  publicationDelayMax: 60,
  fogThreshold: 5,
  approveDuringFog: true,
  easterEggs: true,
};

export function validateSettings(value: unknown): GameSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Нужен объект настроек");
  const raw = { ...DEFAULT_SETTINGS, ...value } as Record<string, unknown>;
  function text(key: string, max: number) {
    if (typeof raw[key] !== "string") throw new Error(`Некорректное поле: ${key}`);
    const value = raw[key].trim();
    if (!value || value.length > max) throw new Error(`Проверьте поле ${key}: от 1 до ${max} символов`);
    return value;
  }
  function lines(key: string, max: number, maxLength: number) {
    const value = raw[key];
    if (!Array.isArray(value) || value.length > max || value.some((item) => typeof item !== "string" || !item.trim() || item.trim().length > maxLength)) {
      throw new Error(`Проверьте список ${key}: до ${max} непустых строк по ${maxLength} символов`);
    }
    const result = value.map((item: string) => item.trim());
    if (new Set(result.map((item) => item.toLocaleLowerCase("ru-RU"))).size !== result.length) throw new Error(`В списке ${key} есть повторы`);
    return result;
  }
  function integer(key: string, min: number, max: number) {
    const value = raw[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new Error(`Поле ${key}: целое число от ${min} до ${max}`);
    return value;
  }
  const timezone = text("timezone", 80);
  try { new Intl.DateTimeFormat("ru-RU", { timeZone: timezone }); } catch { throw new Error("Укажите часовой пояс IANA, например UTC или Europe/Paris"); }
  const publicationDelayMin = integer("publicationDelayMin", 0, 1440);
  const publicationDelayMax = integer("publicationDelayMax", 0, 1440);
  if (publicationDelayMax < publicationDelayMin) throw new Error("Максимальная задержка меньше минимальной");
  for (const key of ["approveDuringFog", "easterEggs"]) if (typeof raw[key] !== "boolean") throw new Error(`Некорректный переключатель: ${key}`);
  return {
    title: text("title", 80), newspaperTitle: text("newspaperTitle", 80),
    tagline: text("tagline", 240), setting: text("setting", 800), timezone,
    groupLabel: text("groupLabel", 40), groups: lines("groups", 30, 60), safetyRules: lines("safetyRules", 12, 300),
    publicationDelayMin, publicationDelayMax, fogThreshold: integer("fogThreshold", 2, 100),
    approveDuringFog: raw.approveDuringFog as boolean, easterEggs: raw.easterEggs as boolean,
  };
}

export function readSettings(json: string | null | undefined): GameSettings {
  if (!json) return structuredClone(DEFAULT_SETTINGS);
  return validateSettings(JSON.parse(json));
}

export function validGroup(value: string, settings: GameSettings) {
  return settings.groups.length ? settings.groups.includes(value) : value === "";
}
