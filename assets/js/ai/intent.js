const INTENTS = Object.freeze({
  overview: ["натиҷа", "чӣ гуна", "ҳолат", "анализ", "таҳлил"],
  cause: ["чаро", "сабаб", "паст", "баланд", "таъсир"],
  action: ["чӣ кор", "чи кор", "тавсия", "маслиҳат", "диққат"],
  progress: ["пеш", "коҳиш", "тамоюл", "беҳтар", "паст шуда"],
  goal: [
    "ҳадаф",
    "расидан",
    "лозим",
    "чанд балл",
    "барои 4",
    "барои 5",
    "барои 6",
    "барои 7",
    "барои 8",
    "барои 9",
    "барои 10",
  ],
  weak: ["заиф", "пасттарин", "баллҳои паст", "мавзӯъ"],
});

const DOMAIN_TERMS = Object.freeze([
  "балл",
  "натиҷа",
  "баҳо",
  "хонанда",
  "мактаб",
  "дарс",
  "фан",
  "омӯз",
  "таҳсил",
  "пешрафт",
  "ҳадаф",
  "мавзӯъ",
  "кор",
  "санҷиш",
  "миёна",
  "баҳогузорӣ",
]);

export function normalizeQuestion(question = "") {
  return String(question)
    .toLowerCase()
    .replace(/[?!.,:;]+/g, " ")
    .replace(/салм|салом+/g, "салом")
    .replace(/чи кор/g, "чӣ кор")
    .replace(/пойтахи/g, "пойтахти")
    .replace(/\s+/g, " ")
    .trim();
}

export function isMinAIDomainQuestion(question = "") {
  const normalized = normalizeQuestion(question);
  if (!normalized) return true;
  if (/^(салом|hello|hi|привет|hey)$/.test(normalized)) return true;
  if (/^[\d\s()+\-*/.]+$/.test(normalized)) return true;
  return DOMAIN_TERMS.some((term) => normalized.includes(term));
}

export function detectIntent(question = "") {
  const normalized = normalizeQuestion(question);
  if (!normalized) return { type: "overview", target: null };

  const targetMatch = normalized.match(
    /(?:барои|ба|ҳадаф(?:и)?)[^\d]{0,12}(10|[1-9])/u,
  );
  const target = targetMatch ? Number(targetMatch[1]) : null;
  const ranked = Object.entries(INTENTS)
    .map(([type, words]) => ({
      type,
      score: words.reduce(
        (score, word) => score + (normalized.includes(word) ? 1 : 0),
        0,
      ),
    }))
    .sort((left, right) => right.score - left.score);

  return { type: ranked[0]?.score ? ranked[0].type : "overview", target };
}
