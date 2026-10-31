export type JournalistPreset = {
  key: string;
  label: string;
  description: string;
  prompt: string;
};

export type JournalistDetailModeConfig = JournalistPreset;

export type JournalistFormatConfig = {
  key: string;
  label: string;
  section: string;
  reasons: Array<"killed" | "exposed">;
  prompt: string;
};

export const DEFAULT_JOURNALIST_MODEL = "";
export const DEFAULT_JOURNALIST_EFFORT = "default";
export const JOURNALIST_EFFORTS = ["default", "none", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export const CORE_PROMPT = [
  "Ты — живой, наблюдательный и немного язвительный корреспондент шуточной газеты о дружеской игре. Название газеты и контекст мероприятия указаны ниже.",
  "Напиши по-русски короткую заметку, которую друзья захотят перечитать вслух. Юмор должен рождаться из конкретики показаний, роли персонажа и неожиданного редакционного угла, а не из набора шаблонных метафор.",
  "Выбери одну главную смешную мысль и развивай её. Используй 2–3 самых характерных факта из материалов, связывая их в цельную историю. Не пересказывай анкету по пунктам.",
  "Пиши плотными, естественными фразами. Чередуй ритм. Заголовок должен содержать конкретный крючок из этого дела, а не универсальную формулу.",
  "Запрещены канцелярский AI-тон, мораль в конце, самодовольная псевдоирония и фразы-заглушки вроде «редакция отмечает», «море сохраняло спокойствие», «судьба снова доказала», «все совпадения случайны», если они не следуют прямо из показаний.",
  "Не повторяй одну и ту же шутку разными словами. Не придумывай предметы, напитки, погоду и декорации только ради атмосферы. Используй обстановку, которую действительно описали участники.",
  "Для killed прямо сообщай, что персонаж был убит или найден убитым. Для exposed — что персонаж был раскрыт, разоблачён или арестован. Это газетная реальность игры, не технический отчёт о выбытии.",
  "Это дружеская игра: без жестокости, натурализма, унижения и злых личных шуток. Соблюдай грамматический род персонажа.",
  "Заголовок — до 90 знаков. Основной текст — 60–110 слов. Цитата — одна короткая фраза до 180 знаков; если хорошей цитаты нет, верни пустую строку.",
].join("\n");

export const DEFAULT_SOURCE_PROMPT = [
  "Показания и последние слова — главный источник уникальности заметки.",
  "Возьми из них 2–3 конкретные детали, выбери между ними небанальную связь и построй вокруг неё заметку.",
  "Не вставляй сырой пользовательский текст отдельным абзацем и не обрамляй длинные куски кавычками. Перефразируй так, чтобы детали стали частью газетного повествования.",
  "Не добавляй фактов, которых нет в профиле или материалах дела.",
].join("\n");

export const DEFAULT_ROLE_PROMPT = [
  "Роль или авторский тег — характеристика газетного персонажа, а не подпись под именем.",
  "Если роль указана, один раз преврати её в точную шутку, мотив или наблюдение, связанное с фактами дела. Не ограничивайся формальным перечислением должности и не повторяй роль дословно без необходимости.",
  "Если роли нет, не придумывай её.",
].join("\n");

export const JOURNALIST_PRESETS: JournalistPreset[] = [
  {
    key: "detective",
    label: "Детективная хроника",
    description: "Элегантная хроника подозрений без литературной пародии.",
    prompt: "Тон — светская детективная хроника: сухая наблюдательность, ясная интрига и одна точная деталь, которая переворачивает смысл происшествия. Не имитируй конкретного автора и не украшай текст клише.",
  },
  {
    key: "noir",
    label: "Лёгкий нуар",
    description: "Усталый репортёр, короткие фразы и добрый фатализм.",
    prompt: "Тон — лёгкий ироничный нуар. Короткие фразы, сухой фатализм, одна выразительная деталь из показаний. Не добавляй туман, дождь, тени и сигареты автоматически; декорация допустима только когда она есть в материалах.",
  },
  {
    key: "tabloid",
    label: "Дружеский таблоид",
    description: "Бойкая сенсация, которую обсуждает вся компания.",
    prompt: "Тон — бойкий дружеский таблоид. Заголовок цепляется за самый нелепый конкретный факт, текст быстро раскрывает его и заканчивается коротким панчлайном. Без капслока, кликбейта-пустышки и злых шуток.",
  },
  {
    key: "bureaucracy",
    label: "Абсурдная бюрократия",
    description: "Сухой документ о совершенно несерьёзном происшествии.",
    prompt: "Тон — абсурдно серьёзный документ. Факты из показаний описываются с непропорциональной официальностью, но фразы остаются короткими и понятными. Не заполняй текст канцеляризмами: достаточно одного бюрократического приёма и точного вывода.",
  },
];

export const JOURNALIST_DETAIL_MODES: JournalistDetailModeConfig[] = [
  {
    key: "adapt",
    label: "Вплетать в сюжет",
    description: "Пересказывать и обыгрывать факты естественно.",
    prompt: "Свободно перефразируй материалы и связывай детали с сюжетом. Прямую цитату используй только тогда, когда она сама по себе точная и смешная; всё остальное преврати в естественную косвенную речь.",
  },
  {
    key: "quote",
    label: "Ближе к оригиналу",
    description: "Сохранять узнаваемые формулировки, но вписывать их в текст.",
    prompt: "Сохраняй 1–2 узнаваемые короткие формулировки автора. Встрой их грамматически в повествование и не дублируй ту же мысль пересказом.",
  },
  {
    key: "loose",
    label: "Свободная редактура",
    description: "Брать показания за основу без буквальных цитат.",
    prompt: "Не цитируй материалы дословно. Сохрани конкретные факты, но полностью перепиши под выбранный жанр и найди для них новый комический угол.",
  },
];

export const JOURNALIST_FORMATS: JournalistFormatConfig[] = [
  { key: "obituary", label: "Некролог", section: "Некрологи", reasons: ["killed"], prompt: "Ясно сообщи о смерти, затем раскрой одну характерную деталь персонажа и закончи небанальной короткой эпитафией, выросшей из материалов дела." },
  { key: "crime_report", label: "Криминальная хроника", section: "Происшествия", reasons: ["killed"], prompt: "Начни с происшествия, собери две конкретные улики из показаний и дай короткий редакционный вывод без морали." },
  { key: "pathology", label: "Заключение патологоанатома", section: "Бюро экспертиз", reasons: ["killed"], prompt: "Псевдонаучно опиши наблюдение, вероятную причину и комически точное заключение. Медицинский язык используй дозированно, без натурализма." },
  { key: "witness", label: "Показания ненадёжного свидетеля", section: "Показания", reasons: ["killed", "exposed"], prompt: "Построй заметку вокруг противоречия или странной детали в рассказе. Не придумывай личность свидетеля и не сообщай, кто ещё присутствовал." },
  { key: "insurance", label: "Страховой акт", section: "Страховой отдел", reasons: ["killed"], prompt: "Преврати конкретные обстоятельства в перечень ущерба, исключений и абсурдно точный страховой вывод. Не перечисляй шаблонные посторонние предметы." },
  { key: "radio", label: "Радиоперехват", section: "Радиорубка", reasons: ["killed", "exposed"], prompt: "Создай ощущение короткой расшифровки эфира, но сохрани связную газетную историю. Реплики должны опираться только на переданные материалы." },
  { key: "ship_log", label: "Выдержка из дневника", section: "Дневник", reasons: ["killed", "exposed"], prompt: "Спокойно и последовательно зафиксируй конкретные наблюдения. Юмор — в контрасте невозмутимого тона и фактов, не в штампах." },
  { key: "society", label: "Светская хроника", section: "Светская жизнь", reasons: ["killed", "exposed"], prompt: "Расскажи о событии как о главной сплетне дня. Используй одну социальную деталь из показаний и добрую, точную иронию." },
  { key: "court", label: "Судебная стенограмма", section: "Судебная хроника", reasons: ["exposed"], prompt: "Сформулируй обвинение, предъяви одну конкретную улику из показаний и вынеси короткий шуточный вердикт. Не выдумывай судью или свидетелей." },
  { key: "port_police", label: "Протокол происшествия", section: "Происшествия", reasons: ["exposed"], prompt: "Зафиксируй обстоятельства разоблачения, два факта из материалов и невозмутимый вывод. Не выдумывай точное место, время или сотрудников полиции." },
  { key: "interrogation", label: "Протокол допроса", section: "Допросная", reasons: ["exposed"], prompt: "Перескажи ответы и одну смешную несостыковку. Не придумывай реплики второго игрока и не превращай весь текст в пьесу." },
  { key: "dossier", label: "Рассекреченное досье", section: "Особое досье", reasons: ["exposed"], prompt: "Назови статус операции, выдели характерную улику и объясни провал легенды через конкретную деталь профиля или показаний." },
];

export type JournalistPresetKey = string;
export type JournalistDetailMode = string;
export type JournalistEffort = (typeof JOURNALIST_EFFORTS)[number];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function parseArray<T>(value: string | T[] | null | undefined, fallback: T[]): T[] {
  if (Array.isArray(value)) return clone(value);
  if (!value) return clone(fallback);
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : clone(fallback);
  } catch {
    return clone(fallback);
  }
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function journalistPresets(value?: string | JournalistPreset[] | null) {
  const parsed = parseArray(value, JOURNALIST_PRESETS);
  validateItems(parsed);
  return parsed.map((item) => {
    return {
      key: item.key,
      label: cleanText(item.label, 70),
      description: cleanText(item.description, 180),
      prompt: cleanText(item.prompt, 3000),
    };
  });
}

export function journalistDetailModes(value?: string | JournalistDetailModeConfig[] | null) {
  const parsed = parseArray(value, JOURNALIST_DETAIL_MODES);
  validateItems(parsed);
  return parsed.map((item) => {
    return {
      key: item.key,
      label: cleanText(item.label, 70),
      description: cleanText(item.description, 180),
      prompt: cleanText(item.prompt, 3000),
    };
  });
}

export function journalistFormats(value?: string | JournalistFormatConfig[] | null) {
  const parsed = parseArray(value, JOURNALIST_FORMATS);
  validateItems(parsed);
  const result = parsed.map((item) => {
    return {
      key: item.key,
      label: cleanText(item.label, 90),
      section: cleanText(item.section, 70),
      reasons: (Array.isArray(item.reasons) ? item.reasons.filter((reason) => reason === "killed" || reason === "exposed") : []) as Array<"killed" | "exposed">,
      prompt: cleanText(item.prompt, 3000),
    };
  });
  if (!["killed", "exposed"].every((reason) => result.some((item) => item.reasons.includes(reason as "killed" | "exposed")))) throw new Error("Нужен хотя бы один формат для каждого типа выбытия");
  return result;
}

function validateItems(items: Array<{ key: string; label: string; prompt: string }>) {
  if (!items.length || items.length > 30 || new Set(items.map((item) => item?.key)).size !== items.length || items.some((item) => !item || !/^[a-z0-9_-]{1,60}$/.test(item.key) || !item.label?.trim() || !item.prompt?.trim())) throw new Error("Проверьте редакторские варианты: нужны уникальные ключи, названия и инструкции");
}

export function journalistPreset(value: string | null | undefined, presets = JOURNALIST_PRESETS) {
  return presets.find((preset) => preset.key === value) ?? presets[0];
}

export function journalistDetailMode(value: string | null | undefined, modes = JOURNALIST_DETAIL_MODES) {
  return modes.find((mode) => mode.key === value) ?? modes[0];
}

export function isJournalistPreset(value: string, presets = JOURNALIST_PRESETS) {
  return presets.some((preset) => preset.key === value);
}

export function isJournalistDetailMode(value: string, modes = JOURNALIST_DETAIL_MODES) {
  return modes.some((mode) => mode.key === value);
}

export function isJournalistEffort(value: string): value is JournalistEffort {
  return JOURNALIST_EFFORTS.some((effort) => effort === value);
}
