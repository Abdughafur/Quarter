import { clamp, safeParseStorage, toInt, uid } from "../utils/helpers.js";

const CURRENT = "chorak_v4.0";
const LEGACY = "chorak_v3.3";

export const DEFAULT_SETTINGS = Object.freeze({
  theme: "light",
  sound: true,
  fs: false,
  performance: false,
  simple: false,
});

export const DEFAULT_PCT = Object.freeze({
  total: 0,
  counts: {},
});

function key(version, name) {
  return `${version}_${name}`;
}

function loadWithFallback(name, fallback) {
  return safeParseStorage(key(CURRENT, name), safeParseStorage(key(LEGACY, name), fallback));
}

function normalizeGrades(value) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((grade) => grade && Number.isFinite(Number(grade.val)))
    .map((grade) => ({
      val: clamp(Number(grade.val), 1, 10),
      type: grade.type === "exam" ? "exam" : "regular",
      id: grade.id || uid(),
    }))
    .slice(0, 50);
}

function normalizeSettings(value) {
  const settings = value && typeof value === "object" ? value : {};

  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    theme: settings.theme === "dark" ? "dark" : "light",
    sound: settings.sound !== false,
    fs: Boolean(settings.fs),
    performance: Boolean(settings.performance),
    simple: Boolean(settings.simple),
  };
}

function normalizePct(value) {
  const pct = value && typeof value === "object" ? value : DEFAULT_PCT;
  const counts = pct.counts && typeof pct.counts === "object" ? pct.counts : {};

  return {
    total: clamp(toInt(pct.total, 0), 0, 100),
    counts: Object.fromEntries(
      Object.entries(counts).map(([grade, count]) => [grade, clamp(toInt(count, 0), 0, 100)]),
    ),
  };
}

export function loadState() {
  return {
    grades: normalizeGrades(loadWithFallback("grades", [])),
    settings: normalizeSettings(loadWithFallback("settings", null)),
    pct: normalizePct(loadWithFallback("pct", null)),
    info: loadWithFallback("info", {}),
  };
}

export function saveState({ grades, settings, pct, info }) {
  try {
    localStorage.setItem(key(CURRENT, "grades"), JSON.stringify(grades));
    localStorage.setItem(key(CURRENT, "settings"), JSON.stringify(settings));
    localStorage.setItem(key(CURRENT, "pct"), JSON.stringify(pct));
    localStorage.setItem(key(CURRENT, "info"), JSON.stringify(info));
  } catch {
   
  }
}
