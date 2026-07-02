/* storage.js */
import { clamp, safeParseStorage, toInt, uid } from "../utils/helpers.js";

const CURRENT = "chorak_v4.1";
const LEGACY = "chorak_v4.0";

export const DEFAULT_SETTINGS = Object.freeze({
  theme: "light",
  sound: true,
  fs: true,
  performance: true,
  simple: false,
});

export const DEFAULT_PCT = Object.freeze({
  total: 0,
  counts: {},
});

export const DEFAULT_PROFILE = Object.freeze({
  name: "",
  surname: "",
  school: "",
  avatar: "",
});

function key(version, name) {
  return `${version}_${name}`;
}

function loadWithFallback(name, fallback) {
  return safeParseStorage(
    key(CURRENT, name),
    safeParseStorage(key(LEGACY, name), fallback),
  );
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
    performance:
      settings.performance === undefined
        ? DEFAULT_SETTINGS.performance
        : Boolean(settings.performance),
    simple:
      settings.simple === undefined
        ? DEFAULT_SETTINGS.simple
        : Boolean(settings.simple),
  };
}

function normalizeProfile(value) {
  const profile = value && typeof value === "object" ? value : {};
  return {
    name: String(profile.name || "").slice(0, 64),
    surname: String(profile.surname || "").slice(0, 64),
    school: String(profile.school || "").slice(0, 64),
    avatar: String(profile.avatar || ""),
  };
}

function normalizePct(value) {
  const pct = value && typeof value === "object" ? value : DEFAULT_PCT;
  const counts = pct.counts && typeof pct.counts === "object" ? pct.counts : {};

  return {
    total: clamp(toInt(pct.total, 0), 0, 100),
    counts: Object.fromEntries(
      Object.entries(counts).map(([grade, count]) => [
        grade,
        clamp(toInt(count, 0), 0, 100),
      ]),
    ),
  };
}

export function loadState() {
  return {
    grades: normalizeGrades(loadWithFallback("grades", [])),
    settings: normalizeSettings(loadWithFallback("settings", null)),
    pct: normalizePct(loadWithFallback("pct", null)),
    info: loadWithFallback("info", {}),
    profile: normalizeProfile(loadWithFallback("profile", null)),
  };
}

export function saveState({ grades, settings, pct, info, profile }) {
  try {
    localStorage.setItem(key(CURRENT, "grades"), JSON.stringify(grades));
    localStorage.setItem(key(CURRENT, "settings"), JSON.stringify(settings));
    localStorage.setItem(key(CURRENT, "pct"), JSON.stringify(pct));
    localStorage.setItem(key(CURRENT, "info"), JSON.stringify(info));
    localStorage.setItem(key(CURRENT, "profile"), JSON.stringify(profile));
  } catch {}
}
