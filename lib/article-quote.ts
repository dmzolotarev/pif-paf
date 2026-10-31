const QUOTE_PAIRS = new Map([
  ["«", "»"],
  ["“", "”"],
  ["„", "“"],
  ["‹", "›"],
  ['"', '"'],
]);

export function normalizeArticleQuote(value: unknown, maxLength = 220) {
  if (typeof value !== "string") return "";
  let quote = value.trim();

  for (let pass = 0; pass < 3 && quote.length >= 2; pass += 1) {
    const closingPunctuation = quote.match(/[.!?…]+$/u)?.[0] ?? "";
    const candidate = closingPunctuation ? quote.slice(0, -closingPunctuation.length).trimEnd() : quote;
    const expectedClosing = QUOTE_PAIRS.get(candidate[0]);
    if (!expectedClosing || candidate.at(-1) !== expectedClosing) break;
    quote = `${candidate.slice(1, -1).trim()}${closingPunctuation}`;
  }

  return quote.slice(0, maxLength).trim();
}

export function formatArticleQuote(value: unknown) {
  const quote = normalizeArticleQuote(value);
  if (!quote) return "";
  const outsidePunctuation = quote.match(/[.,:;]+$/u)?.[0] ?? "";
  const content = outsidePunctuation ? quote.slice(0, -outsidePunctuation.length).trimEnd() : quote;
  return `«${content}»${outsidePunctuation}`;
}
