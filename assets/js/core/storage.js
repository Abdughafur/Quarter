/* storage.js */
import { clamp, safeParseStorage, toInt, uid } from "../utils/helpers.js";

const DB_NAME = "ChoryakDB";
const DB_VERSION = 2;
const STORE_NAME = "state";
const FALLBACK_STORAGE_KEY = "chorak_state";
const LEGACY_PREFIXES = ["chorak_v4.2", "chorak_v4.1", "chorak_v4.0"];
const STATE_FORMAT_VERSION = 1;
const STORAGE_WARNING_EVENT = "choryak-storage-warning";
let lastSavedAt = 0;
let saveQueue = Promise.resolve();

export const DEFAULT_SETTINGS = Object.freeze({
  theme: "light",
  sound: true,
  vibration: true,
  fs: true,
  diagram: true,
  uiKit: "medium",
  minaiCalculator: true,
  minaiPercent: true,
});

export const DEFAULT_PCT = Object.freeze({
  total: 0,
  counts: {},
});

export const DEFAULT_PROFILE = Object.freeze({
  name: "",
  surname: "",
  school: "",
  school2: "",
  school3: "",
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
    .slice(0, 100);
}

function normalizeSettings(value) {
  const settings = value && typeof value === "object" ? value : {};

  return {
    theme: ["light", "dark", "system"].includes(settings.theme)
      ? settings.theme
      : DEFAULT_SETTINGS.theme,
    sound: settings.sound !== false,
    vibration: settings.vibration !== false,
    fs: Boolean(settings.fs),
    diagram:
      settings.diagram === undefined
        ? DEFAULT_SETTINGS.diagram
        : Boolean(settings.diagram),
    uiKit: ["low", "medium", "perfect"].includes(settings.uiKit)
      ? settings.uiKit
      : DEFAULT_SETTINGS.uiKit,
    minaiCalculator: settings.minaiCalculator !== false,
    minaiPercent: settings.minaiPercent !== false,
  };
}

function normalizeProfile(value) {
  const profile = value && typeof value === "object" ? value : {};
  const schools = Array.isArray(profile.schools)
    ? profile.schools
    : [profile.school, profile.school2, profile.school3];
  const normalizedSchools = [...new Set(
    schools
      .map((school) => String(school || "").replace(/\D/g, "").slice(0, 4))
      .filter((school) => school && Number(school) > 0),
  )].slice(0, 5);

  return {
    name: String(profile.name || "").slice(0, 64),
    surname: String(profile.surname || "").slice(0, 64),
    school: normalizedSchools[0] || "",
    schools: normalizedSchools,
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

function normalizeNotes(value) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((note) => note && typeof note === "object")
    .map((note) => ({
      id: String(note.id || uid()),
      title: String(note.title || "").slice(0, 128),
      body: String(note.body || "").slice(0, 1024),
      important: Boolean(note.important),
      createdAt: Number(note.createdAt) || Date.now(),
      updatedAt: Number(note.updatedAt) || Date.now(),
    }))
    .slice(0, 200);
}

function normalizeState(value) {
  const payload = value && typeof value === "object" ? value : {};

  return {
    grades: normalizeGrades(payload.grades ?? []),
    settings: normalizeSettings(payload.settings ?? null),
    pct: normalizePct(payload.pct ?? null),
    info: payload.info && typeof payload.info === "object" ? payload.info : {},
    profile: normalizeProfile(payload.profile ?? null),
    notes: normalizeNotes(payload.notes ?? []),
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
  let state = null;
  let error = null;

  try {
    const raw = localStorage.getItem(FALLBACK_STORAGE_KEY);
    if (raw !== null) {
      state = JSON.parse(raw);
      if (!state || typeof state !== "object" || Array.isArray(state)) {
        state = null;
        error = new Error("The local state backup has an invalid format.");
      }
    }
  } catch (readError) {
    error = readError;
  }

  return { state: state || readLegacyState(), error };
}

function stateTimestamp(state) {
  const timestamp = Number(state?._savedAt);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
}

function hasUserData(state) {
  return Boolean(
    state &&
      ((Array.isArray(state.grades) && state.grades.length > 0) ||
        (Array.isArray(state.notes) && state.notes.length > 0) ||
        Object.values(state.profile || {}).some(Boolean) ||
        Number(state.pct?.total) > 0 ||
        Object.values(state.info || {}).some(Boolean)),
  );
}

function reportStorageWarning(message, error) {
  console.error(message, error);
  if (typeof window !== "undefined" && typeof CustomEvent !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(STORAGE_WARNING_EVENT, { detail: { message } }),
    );
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB is not supported"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    let settled = false;

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(new Error("The saved data database upgrade is blocked."));
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      if (settled) {
        db.close();
        return;
      }
      settled = true;
      resolve(db);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      reject(request.error || new Error("Could not open the saved data database."));
    };
  });
}

async function loadFromIndexedDb() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    let result = null;
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      db.close();
      if (error) reject(error);
      else resolve(result);
    };

    try {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get("state");

      request.onsuccess = () => {
        result = request.result || null;
      };
      request.onerror = () => {
        finish(request.error || new Error("Could not read the saved data database."));
      };
      transaction.oncomplete = () => finish();
      transaction.onerror = () => {
        finish(transaction.error || new Error("Reading saved data failed."));
      };
      transaction.onabort = () => {
        finish(transaction.error || new Error("Reading saved data was interrupted."));
      };
    } catch (error) {
      finish(error);
    }
  });
}

async function saveToIndexedDb(payload) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      db.close();
      if (error) reject(error);
      else resolve();
    };

    try {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put({ id: "state", ...payload });
      transaction.oncomplete = () => finish();
      transaction.onerror = () => {
        finish(transaction.error || new Error("Saving to the data database failed."));
      };
      transaction.onabort = () => {
        finish(transaction.error || new Error("Saving to the data database was interrupted."));
      };
    } catch (error) {
      finish(error);
    }
  });
}

function storedPayload(state) {
  const normalized = normalizeState(state);
  const savedAt = Math.max(
    Date.now(),
    lastSavedAt + 1,
    stateTimestamp(state) + 1,
  );
  lastSavedAt = savedAt;
  return {
    ...normalized,
    _formatVersion: STATE_FORMAT_VERSION,
    _savedAt: savedAt,
  };
}

async function persistState(state) {
  const payload = storedPayload(state);
  let localStorageError = null;
  let indexedDbError = null;

  try {
    localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    localStorageError = error;
  }

  try {
    await saveToIndexedDb(payload);
  } catch (error) {
    indexedDbError = error;
  }

  if (localStorageError && indexedDbError) {
    const error = new Error(
      "Could not save data to either local storage or the database.",
      { cause: indexedDbError },
    );
    reportStorageWarning(error.message, localStorageError);
    throw error;
  }

  if (indexedDbError) {
    reportStorageWarning(
      "Data was saved to the local backup, but IndexedDB could not be updated.",
      indexedDbError,
    );
  } else if (localStorageError) {
    reportStorageWarning(
      "Data was saved to IndexedDB, but the local backup could not be updated.",
      localStorageError,
    );
  }

  return {
    indexedDbSaved: !indexedDbError,
    localBackupSaved: !localStorageError,
  };
}

async function migrateStoredState(state) {
  try {
    await saveState(state);
  } catch (error) {
    reportStorageWarning(
      "Saved data was loaded, but its compatibility migration could not be saved.",
      error,
    );
  }
}

export async function loadState() {
  const fallback = readFallbackState();
  let indexedState = null;
  let indexedDbError = null;

  try {
    indexedState = await loadFromIndexedDb();
  } catch (error) {
    indexedDbError = error;
    reportStorageWarning(
      "IndexedDB could not be read. The saved database was left untouched.",
      error,
    );
  }

  if (indexedState && typeof indexedState === "object") {
    const fallbackState = fallback.state;
    const fallbackIsNewer =
      fallbackState &&
      hasUserData(fallbackState) &&
      (!hasUserData(indexedState) ||
        stateTimestamp(fallbackState) > stateTimestamp(indexedState));
    if (fallbackIsNewer) {
      const normalized = normalizeState(fallbackState);
      await migrateStoredState(normalized);
      return normalized;
    }

    const normalized = normalizeState(indexedState);
    const hasOldTaskData =
      Object.prototype.hasOwnProperty.call(indexedState, "tasks") ||
      Object.prototype.hasOwnProperty.call(fallbackState || {}, "tasks");
    if (hasOldTaskData || fallback.error) {
      await migrateStoredState(normalized);
    }
    return normalized;
  }

  if (fallback.state) {
    const normalized = normalizeState(fallback.state);
    if (indexedDbError) {
      reportStorageWarning(
        "Using the local backup because IndexedDB is unavailable. The database was not overwritten.",
        indexedDbError,
      );
    } else {
      await migrateStoredState(normalized);
    }
    return normalized;
  }

  if (indexedDbError || fallback.error) {
    throw new Error(
      "Saved data could not be read. Existing data was not reset; reload or restore browser storage access and try again.",
      { cause: indexedDbError || fallback.error },
    );
  }

  return normalizeState({});
}

export function saveState(state) {
  const operation = saveQueue.then(() => persistState(state));
  saveQueue = operation.catch(() => {});
  return operation;
}

async function clearIndexedDbState() {
  if (!window.indexedDB) return;

  const db = await openDb();
  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      db.close();
      if (error) reject(error);
      else resolve();
    };

    try {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).clear();
      transaction.oncomplete = () => finish();
      transaction.onerror = () => {
        finish(transaction.error || new Error("Could not clear saved data."));
      };
      transaction.onabort = () => {
        finish(transaction.error || new Error("Clearing saved data was interrupted."));
      };
    } catch (error) {
      finish(error);
    }
  });
}

export async function clearState() {
  await saveQueue;

  localStorage.removeItem(FALLBACK_STORAGE_KEY);
  for (const prefix of LEGACY_PREFIXES) {
    localStorage.removeItem(`${prefix}_grades`);
    localStorage.removeItem(`${prefix}_settings`);
    localStorage.removeItem(`${prefix}_pct`);
    localStorage.removeItem(`${prefix}_info`);
    localStorage.removeItem(`${prefix}_profile`);
  }
  await clearIndexedDbState();
}
// Created by Abdughafur - Believe GOD
