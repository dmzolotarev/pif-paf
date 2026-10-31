export type CrewRole = {
  key: string;
  masculine: string;
  feminine: string;
};

export const CREW_ROLES: CrewRole[] = [
  { key: "organizer", masculine: "Организатор", feminine: "Организаторка" },
  { key: "bartender", masculine: "Бармен", feminine: "Барменка" },
  { key: "photographer", masculine: "Фотограф", feminine: "Фотографка" },
  { key: "sleep_officer", masculine: "Дежурный по сну", feminine: "Дежурная по сну" },
  { key: "playlist_keeper", masculine: "Хранитель плейлиста", feminine: "Хранительница плейлиста" },
  { key: "chief_taster", masculine: "Главный дегустатор", feminine: "Главная дегустаторка" },
  { key: "head_of_vibes", masculine: "Head of Vibes", feminine: "Head of Vibes" },
];

function cloneRoles(roles: CrewRole[]) {
  return roles.map((role) => ({ ...role }));
}

export function crewRoles(value?: string | CrewRole[] | null) {
  let parsed: CrewRole[] = [];
  if (Array.isArray(value)) parsed = value;
  else if (value) {
    try {
      const candidate = JSON.parse(value) as unknown;
      if (Array.isArray(candidate)) parsed = candidate as CrewRole[];
    } catch {
      return cloneRoles(CREW_ROLES);
    }
  }
  if (!value) return cloneRoles(CREW_ROLES);
  if (parsed.length > 60 || new Set(parsed.map((item) => item?.key)).size !== parsed.length) throw new Error("Роли: до 60 уникальных вариантов");
  return parsed.map((item) => {
    if (!item || !/^[a-z0-9_-]{1,60}$/.test(item.key) || !item.masculine?.trim() || !item.feminine?.trim()) throw new Error("Проверьте ключ и обе формы роли");
    return { key: item.key, masculine: item.masculine.trim().slice(0, 80), feminine: item.feminine.trim().slice(0, 80) };
  });
}

export function isRole(value: string, roles = CREW_ROLES) {
  return value === "" || roles.some((role) => role.key === value);
}

export function roleLabel(key: string | null | undefined, feminine = false, customRole = "", roles = CREW_ROLES) {
  const custom = customRole.trim();
  if (custom) return custom;
  const role = roles.find((item) => item.key === key);
  return role ? (feminine ? role.feminine : role.masculine) : "";
}
