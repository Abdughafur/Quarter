/* storage.js */
import { clamp, safeParseStorage, toInt, uid } from "../utils/helpers.js";

const DB_NAME = "ChoryakDB";
const DB_VERSION = 1;
const STORE_NAME = "state";
const FALLBACK_STORAGE_KEY = "chorak_state";
const LEGACY_PREFIXES = ["chorak_v4.1", "chorak_v4.0"];

export const DEFAULT_SETTINGS = Object.freeze({
  theme: "light",
  sound: true,
  fs: true,
  performance: true,
  simple: false,
  diagram: true,
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
    diagram:
      settings.diagram === undefined
        ? DEFAULT_SETTINGS.diagram
        : Boolean(settings.diagram),
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

function normalizeState(value) {
  const payload = value && typeof value === "object" ? value : {};

  return {
    grades: normalizeGrades(payload.grades ?? []),
    settings: normalizeSettings(payload.settings ?? null),
    pct: normalizePct(payload.pct ?? null),
    info: payload.info && typeof payload.info === "object" ? payload.info : {},
    profile: normalizeProfile(payload.profile ?? null),
  };
}

function readLegacyState() {
  for (const prefix of LEGACY_PREFIXES) {
    const candidate = {
      grades: safeParseStorage(`${prefix}_grades`, null),
      settings: safeParseStorage(`${prefix}_settings`, null),
      pct: safeParseStorage(`${prefix}_pct`, null),
      info: safeParseStorage(`${prefix}_info`, null),
      profile: safeParseStorage(`${prefix}_profile`, null),
    };

    const hasData = Object.values(candidate).some((value) => value != null);
    if (hasData) {
      return candidate;
    }
  }

  return null;
}

function readFallbackState() {
  const stored = safeParseStorage(FALLBACK_STORAGE_KEY, null);
  if (stored && typeof stored === "object") {
    return stored;
  }

  return readLegacyState();
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is not supported"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function loadFromIndexedDb() {
  return new Promise((resolve) => {
    openDb()
      .then((db) => {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get("state");

        request.onsuccess = () => {
          db.close();
          resolve(request.result || null);
        };

        request.onerror = () => {
          db.close();
          resolve(null);
        };
      })
      .catch(() => resolve(null));
  });
}

function saveToIndexedDb(payload) {
  return new Promise((resolve) => {
    openDb()
      .then((db) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put({ id: "state", ...payload });

        request.onsuccess = () => {
          db.close();
          resolve();
        };

        request.onerror = () => {
          db.close();
          resolve();
        };
      })
      .catch(() => resolve());
  });
}

export async function loadState() {
  const indexedState = await loadFromIndexedDb();
  if (indexedState && typeof indexedState === "object") {
    return normalizeState(indexedState);
  }

  const fallbackState = readFallbackState();
  const normalized = normalizeState(fallbackState ?? {});

  if (fallbackState) {
    await saveState(normalized);
  }

  return normalized;
}

export async function saveState({ grades, settings, pct, info, profile }) {
  const payload = normalizeState({ grades, settings, pct, info, profile });

  try {
    localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(payload));
  } catch {}

  await saveToIndexedDb(payload);
}
