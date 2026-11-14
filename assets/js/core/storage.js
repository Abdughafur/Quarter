/* storage.js */
import { clamp, safeParseStorage, toInt, uid } from "../utils/helpers.js";

const DB_NAME = "ChoryakDB";
const DB_VERSION = 2;
const STORE_NAME = "state";
const FALLBACK_STORAGE_KEY = "chorak_state";
const LEGACY_PREFIXES = ["chorak_v4.2", "chorak_v4.1", "chorak_v4.0"];
const STATE_FORMAT_VERSION = 1;
const BACKUP_FORMAT = "choryak-backup";
const BACKUP_FORMAT_VERSION = 2;
const MAX_LESSONS = 2000;
const STORAGE_WARNING_EVENT = "choryak-storage-warning";
const LOGOUT_CHANNEL_NAME = "choryak-storage";
const LOGOUT_SIGNAL_KEY = "choryak:logout-event";
let lastSavedAt = 0;
let saveQueue = Promise.resolve();
let loggingOut = false;
const logoutChannel =
  typeof BroadcastChannel === "function"
    ? new BroadcastChannel(LOGOUT_CHANNEL_NAME)
    : null;

function handleLogoutSignal(type) {
  if (type === "logout-start") {
    loggingOut = true;
  } else if (type === "logout-complete") {
    loggingOut = true;
    window.location.reload();
  } else if (type === "logout-failed") {
    loggingOut = false;
  }
}

logoutChannel?.addEventListener("message", (event) => {
  handleLogoutSignal(event.data?.type);
});
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== LOGOUT_SIGNAL_KEY || !event.newValue) return;
    handleLogoutSignal(event.newValue.split(":", 1)[0]);
  });
}

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
    .map((grade) => {
      if (!grade || typeof grade !== "object") return null;
      const value = grade.val ?? grade.value ?? grade.grade ?? grade.mark;
      if (value == null || value === "" || !Number.isFinite(Number(value))) {
        return null;
      }
      return {
        val: clamp(Number(value), 1, 10),
        type: grade.type === "exam" ? "exam" : "regular",
        id: grade.id || uid(),
      };
    })
    .filter(Boolean)
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
  const schools = Array.isArray(profile.schools) && profile.schools.length
    ? profile.schools
    : [
        profile.school,
        profile.school2,
        profile.school3,
        profile.school4,
        profile.school5,
      ];
  const schoolNumbers = new Set();
  const normalizedSchools = schools
    .map((school) => String(school || "").replace(/\D/g, "").slice(0, 4))
    .filter((school) => {
      const number = Number(school);
      if (!school || number <= 0 || schoolNumbers.has(number)) return false;
      schoolNumbers.add(number);
      return true;
    })
    .slice(0, 5);

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
      body: String(note.body ?? note.content ?? note.text ?? "").slice(0, 1024),
      important: Boolean(note.important),
      createdAt: Number(note.createdAt) || Date.now(),
      updatedAt: Number(note.updatedAt) || Date.now(),
    }))
    .slice(0, 200);
}

function normalizeLessonDay(value, fallbackDay = 1) {
  if (value == null || value === "") return fallbackDay;
  const numericDay = Number(value);
  if (Number.isInteger(numericDay) && numericDay >= 1 && numericDay <= 7) {
    return numericDay;
  }
  if (numericDay === 0) return 7;

  const dayNames = {
    mon: 1,
    monday: 1,
    "душанбе": 1,
    "дш": 1,
    tue: 2,
    tuesday: 2,
    "сешанбе": 2,
    "сш": 2,
    wed: 3,
    wednesday: 3,
    "чоршанбе": 3,
    "чш": 3,
    thu: 4,
    thursday: 4,
    "панҷшанбе": 4,
    "пш": 4,
    fri: 5,
    friday: 5,
    "ҷумъа": 5,
    "ҷм": 5,
    sat: 6,
    saturday: 6,
    "шанбе": 6,
    "шн": 6,
    sun: 7,
    sunday: 7,
    "якшанбе": 7,
    "яш": 7,
  };
  return dayNames[String(value).trim().toLowerCase()] || fallbackDay;
}

function normalizeLessonTime(value) {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(String(value ?? "").trim());
  if (!match) return "";
  const hour = Number(match[1]);
  if (hour < 0 || hour > 23) return "";
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

function extractLessonRows(value) {
  if (Array.isArray(value)) {
    return value.map((item) => ({ item, fallbackDay: 1 }));
  }
  if (!isPlainRecord(value)) return [];

  for (const key of ["lessons", "entries", "items"]) {
    if (Array.isArray(value[key])) {
      return value[key].map((item) => ({ item, fallbackDay: 1 }));
    }
  }

  const days = isPlainRecord(value.days)
    ? value.days
    : isPlainRecord(value.week)
      ? value.week
      : isPlainRecord(value.schedule)
        ? value.schedule
        : value;
  return Object.entries(days).flatMap(([dayKey, items]) =>
    Array.isArray(items)
      ? items.map((item) => ({
          item,
          fallbackDay: normalizeLessonDay(dayKey),
        }))
      : [],
  );
}

function normalizeLessonSchedule(value) {
  return extractLessonRows(value)
    .slice(0, MAX_LESSONS)
    .map(({ item, fallbackDay }) => {
      const lesson = isPlainRecord(item)
        ? item
        : { subject: String(item ?? "") };
      return {
        ...lesson,
        id: String(lesson.id || uid()).slice(0, 128),
        day: normalizeLessonDay(
          lesson.day ?? lesson.weekday ?? lesson.dayOfWeek,
          fallbackDay,
        ),
        subject: String(
          lesson.subject ?? lesson.title ?? lesson.name ?? lesson.lesson ?? "",
        ).slice(0, 120),
        start: normalizeLessonTime(
          lesson.start ?? lesson.startTime ?? lesson.from,
        ),
        end: normalizeLessonTime(lesson.end ?? lesson.endTime ?? lesson.to),
        room: String(lesson.room ?? lesson.classroom ?? "").slice(0, 64),
      };
    });
}

function normalizeLessons(value) {
  const source = isPlainRecord(value) ? value : {};
  const sourceSchools =
    source.schools ?? source.bySchool ?? source.schoolSchedules;
  const schoolEntries = isPlainRecord(sourceSchools)
    ? Object.entries(sourceSchools)
    : Object.entries(source).filter(
        ([key, schedule]) =>
          !["selectedSchool", "activeSchool"].includes(key) &&
          (Array.isArray(schedule) || isPlainRecord(schedule)),
      );
  const schools = {};
  let totalLessons = 0;

  for (const [rawSchool, schedule] of schoolEntries.slice(0, 50)) {
    const school = String(rawSchool).trim().slice(0, 64);
    if (!school) continue;
    const remaining = MAX_LESSONS - totalLessons;
    if (remaining <= 0) break;
    const lessons = normalizeLessonSchedule(schedule).slice(0, remaining);
    schools[school] = lessons;
    totalLessons += lessons.length;
  }

  return {
    selectedSchool: String(
      source.selectedSchool ?? source.activeSchool ?? "",
    )
      .trim()
      .slice(0, 64),
    schools,
  };
}

function mergeLessons(currentValue, incomingValue) {
  const current = normalizeLessons(currentValue);
  const incoming = normalizeLessons(incomingValue);
  const schools = { ...current.schools };

  for (const [school, lessons] of Object.entries(incoming.schools)) {
    const byId = new Map((schools[school] || []).map((lesson) => [lesson.id, lesson]));
    lessons.forEach((lesson) => byId.set(lesson.id, lesson));
    schools[school] = Array.from(byId.values());
  }

  return normalizeLessons({
    selectedSchool: incoming.selectedSchool || current.selectedSchool,
    schools,
  });
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
    lessons: normalizeLessons(payload.lessons ?? null),
  };
}

function parseBackupSection(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error("The backup contains a section with invalid JSON.", {
      cause: error,
    });
  }
}

function isPlainRecord(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (Object.getPrototypeOf(value) === Object.prototype ||
        Object.getPrototypeOf(value) === null),
  );
}

function requireIntegerInRange(value, section, field, minimum, maximum) {
  const isNumeric =
    typeof value === "number" ||
    (typeof value === "string" && value.trim().length > 0);
  const numericValue = Number(value);
  if (
    !isNumeric ||
    !Number.isInteger(numericValue) ||
    numericValue < minimum ||
    numericValue > maximum
  ) {
    throw new Error(
      `The backup contains an invalid ${section}.${field} value.`,
    );
  }
}

function validateBackupSections(mapped, present) {
  if (!["grades", "profile", "notes"].some((section) => present.has(section))) {
    throw new Error("The backup contains no valid user data.");
  }

  if (present.has("grades")) {
    if (!Array.isArray(mapped.grades) || mapped.grades.length > 100) {
      throw new Error("The backup contains invalid grades data.");
    }
    const gradeIds = new Set();
    mapped.grades.forEach((grade, index) => {
      if (!isPlainRecord(grade)) {
        throw new Error(`The backup contains an invalid grade at row ${index + 1}.`);
      }
      const value = grade.val ?? grade.value ?? grade.grade ?? grade.mark;
      if (
        (typeof value !== "number" &&
          (typeof value !== "string" || value.trim() === "")) ||
        !Number.isFinite(Number(value))
      ) {
        throw new Error(`The backup contains an invalid grade at row ${index + 1}.`);
      }
      if (Number(value) < 1 || Number(value) > 10) {
        throw new Error(`A grade in the backup is outside the 1–10 range.`);
      }
      if (grade.type != null && !["regular", "exam"].includes(grade.type)) {
        throw new Error(`The backup contains an invalid grade type at row ${index + 1}.`);
      }
      if (
        grade.id != null &&
        (!["string", "number"].includes(typeof grade.id) ||
          String(grade.id).length === 0 ||
          String(grade.id).length > 128)
      ) {
        throw new Error(`The backup contains an invalid grade identifier at row ${index + 1}.`);
      }
      if (grade.id != null && gradeIds.has(String(grade.id))) {
        throw new Error("The backup contains duplicate grade identifiers.");
      }
      if (grade.id != null) gradeIds.add(String(grade.id));
    });
  }

  if (present.has("notes")) {
    if (!Array.isArray(mapped.notes) || mapped.notes.length > 200) {
      throw new Error("The backup contains invalid notes data.");
    }
    const noteIds = new Set();
    mapped.notes.forEach((note, index) => {
      if (!isPlainRecord(note)) {
        throw new Error(`The backup contains an invalid note at row ${index + 1}.`);
      }
      const title = note.title ?? "";
      const body = note.body ?? note.content ?? note.text ?? "";
      if (
        typeof title !== "string" ||
        title.length > 128 ||
        typeof body !== "string" ||
        body.length > 1024 ||
        (note.important != null && typeof note.important !== "boolean") ||
        (note.id != null &&
          (!["string", "number"].includes(typeof note.id) ||
            String(note.id).length === 0 ||
            String(note.id).length > 128)) ||
        [note.createdAt, note.updatedAt].some(
          (timestamp) =>
            timestamp != null &&
            (!Number.isFinite(Number(timestamp)) || Number(timestamp) <= 0),
        )
      ) {
        throw new Error(`The backup contains invalid note content at row ${index + 1}.`);
      }
      if (note.id != null && noteIds.has(String(note.id))) {
        throw new Error("The backup contains duplicate note identifiers.");
      }
      if (note.id != null) noteIds.add(String(note.id));
    });
  }

  if (present.has("lessons")) {
    const lessons = mapped.lessons;
    if (!isPlainRecord(lessons)) {
      throw new Error("The backup contains invalid lessons data.");
    }
    if (
      lessons.selectedSchool != null &&
      (typeof lessons.selectedSchool !== "string" &&
        typeof lessons.selectedSchool !== "number")
    ) {
      throw new Error("The backup contains an invalid selected school.");
    }
    const schools =
      lessons.schools ??
      lessons.bySchool ??
      lessons.schoolSchedules ??
      {};
    if (!isPlainRecord(schools)) {
      throw new Error("The backup contains invalid lesson school data.");
    }
    let lessonCount = 0;
    for (const [school, schedule] of Object.entries(schools)) {
      if (
        !school ||
        school.length > 64 ||
        (!isPlainRecord(schedule) && !Array.isArray(schedule))
      ) {
        throw new Error("The backup contains an invalid lesson schedule.");
      }
      const rows = extractLessonRows(schedule);
      lessonCount += rows.length;
      if (lessonCount > MAX_LESSONS) {
        throw new Error("The backup contains too many lessons.");
      }
      rows.forEach(({ item }, index) => {
        if (!isPlainRecord(item)) {
          throw new Error(`The backup contains an invalid lesson at row ${index + 1}.`);
        }
        const subject = item.subject ?? item.title ?? item.name ?? item.lesson;
        const room = item.room ?? item.classroom;
        const start = item.start ?? item.startTime ?? item.from;
        const end = item.end ?? item.endTime ?? item.to;
        if (
          (subject != null &&
            (typeof subject !== "string" || subject.length > 120)) ||
          (room != null && (typeof room !== "string" || room.length > 64)) ||
          (start != null && start !== "" && !normalizeLessonTime(start)) ||
          (end != null && end !== "" && !normalizeLessonTime(end))
        ) {
          throw new Error(`The backup contains invalid lesson content at row ${index + 1}.`);
        }
      });
    }
    mapped.lessons = normalizeLessons(lessons);
  }

  if (present.has("profile")) {
    const profile = mapped.profile;
    if (!isPlainRecord(profile)) {
      throw new Error("The backup contains invalid profile data.");
    }
    for (const field of ["name", "surname", "firstName", "lastName", "avatar"]) {
      if (profile[field] != null && typeof profile[field] !== "string") {
        throw new Error(`The backup contains invalid profile.${field} data.`);
      }
    }
    if (
      (profile.name?.length ?? profile.firstName?.length ?? 0) > 64 ||
      (profile.surname?.length ?? profile.lastName?.length ?? 0) > 64
    ) {
      throw new Error("The profile name in this backup is too long.");
    }
    if (profile.avatar?.length > 16 * 1024 * 1024) {
      throw new Error("The profile image in this backup is too large.");
    }
    const schools = Array.isArray(profile.schools)
      ? profile.schools
      : [
          profile.school,
          profile.school2,
          profile.school3,
          profile.school4,
          profile.school5,
          profile.schoolNumber,
        ];
    const schoolNumbers = new Set();
    if (
      schools.some(
        (school) => {
          if (school == null || school === "") return false;
          if (
            (typeof school !== "string" && typeof school !== "number") ||
            !/^\d{1,4}$/.test(String(school)) ||
            Number(school) <= 0
          ) {
            return true;
          }
          const number = Number(school);
          if (schoolNumbers.has(number)) return true;
          schoolNumbers.add(number);
          return false;
        },
      )
    ) {
      throw new Error("The backup contains invalid school number data.");
    }
  }

  if (present.has("settings")) {
    const settings = mapped.settings;
    if (!isPlainRecord(settings)) {
      throw new Error("The backup contains invalid settings data.");
    }
    const booleanSettings = [
      "sound",
      "vibration",
      "fs",
      "diagram",
      "minaiCalculator",
      "minaiPercent",
    ];
    if (
      booleanSettings.some(
        (field) =>
          settings[field] != null && typeof settings[field] !== "boolean",
      ) ||
      (settings.theme != null &&
        !["light", "dark", "system"].includes(settings.theme)) ||
      (settings.uiKit != null &&
        !["low", "medium", "perfect"].includes(settings.uiKit))
    ) {
      throw new Error("The backup contains unsupported settings values.");
    }
  }

  if (present.has("pct")) {
    const pct = mapped.pct;
    if (!isPlainRecord(pct)) {
      throw new Error("The backup contains invalid percentage data.");
    }
    if (pct.total != null) {
      requireIntegerInRange(pct.total, "pct", "total", 0, 100);
    }
    if (pct.counts != null) {
      if (!isPlainRecord(pct.counts)) {
        throw new Error("The backup contains invalid percentage counts.");
      }
      for (const [grade, count] of Object.entries(pct.counts)) {
        if (!/^(?:[1-9]|10)$/.test(grade)) {
          throw new Error("The backup contains an invalid percentage grade.");
        }
        requireIntegerInRange(count, "pct.counts", grade, 0, 100);
      }
      const countTotal = Object.values(pct.counts).reduce(
        (sum, count) => sum + Number(count),
        0,
      );
      if (pct.total != null && countTotal > Number(pct.total)) {
        throw new Error(
          "The number of grade entries exceeds the class total in this backup.",
        );
      }
    }
  }

  if (present.has("info")) {
    const info = mapped.info;
    if (!isPlainRecord(info)) {
      throw new Error("The backup contains invalid student information.");
    }
    for (const field of ["pupil", "subject", "grade"]) {
      if (
        info[field] != null &&
        (typeof info[field] !== "string" || info[field].length > 512)
      ) {
        throw new Error(`The backup contains invalid info.${field} data.`);
      }
    }
    mapped.info = Object.fromEntries(
      ["pupil", "subject", "grade"]
        .filter((field) => Object.prototype.hasOwnProperty.call(info, field))
        .map((field) => [field, info[field]]),
    );
  }
}

function getBackupSource(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The backup file must contain a JSON object.");
  }

  if (value.format != null && value.format !== BACKUP_FORMAT) {
    throw new Error("This file is not a Чоряк application backup.");
  }
  if (value.format === BACKUP_FORMAT) {
    if (
      !Number.isInteger(Number(value.formatVersion)) ||
      Number(value.formatVersion) < 1 ||
      Number(value.formatVersion) > BACKUP_FORMAT_VERSION
    ) {
      throw new Error("This backup was created by an unsupported format version.");
    }
  }

  let source =
    value.data ?? value.state ?? value.payload ?? value.appData ?? value;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("The backup file does not contain application data.");
  }
  if (source.id === "state") {
    const { id, ...state } = source;
    source = state;
  }

  const aliases = {
    grades: ["grades", "marks", "gradeList"],
    settings: ["settings", "preferences"],
    pct: ["pct", "percentages", "percentage"],
    info: ["info", "information", "details"],
    profile: ["profile", "user", "teacher"],
    notes: ["notes", "noteList"],
    lessons: ["lessons", "lessonSchedule"],
  };
  const mapped = {};
  const present = new Set();

  for (const [section, keys] of Object.entries(aliases)) {
    const matches = keys.filter((candidate) =>
      Object.prototype.hasOwnProperty.call(source, candidate),
    );
    if (matches.length > 1) {
      throw new Error(`The backup contains conflicting ${section} sections.`);
    }
    if (matches.length === 1) {
      mapped[section] = source[matches[0]];
      present.add(section);
    }
  }

  if (
    !present.has("profile") &&
    [
      "name",
      "surname",
      "school",
      "school2",
      "school3",
      "school4",
      "school5",
      "schoolNumber",
      "schools",
      "avatar",
      "firstName",
      "lastName",
    ].some((key) =>
      Object.prototype.hasOwnProperty.call(source, key),
    )
  ) {
    mapped.profile = source;
    present.add("profile");
  }
  if (!present.size && typeof source.chorak_state === "string") {
    return getBackupSource(parseBackupSection(source.chorak_state));
  }

  if (!present.size) {
    for (const prefix of LEGACY_PREFIXES) {
      for (const section of ["grades", "settings", "pct", "info", "profile"]) {
        const key = `${prefix}_${section}`;
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          mapped[section] = parseBackupSection(source[key]);
          present.add(section);
        }
      }
      if (present.size) break;
    }
  }

  if (
    present.has("profile") &&
    mapped.profile &&
    typeof mapped.profile === "object" &&
    !Array.isArray(mapped.profile)
  ) {
    const profile = { ...mapped.profile };
    if (
      !Object.prototype.hasOwnProperty.call(profile, "name") &&
      ("firstName" in profile || "teacherName" in profile)
    ) {
      profile.name = profile.firstName ?? profile.teacherName;
    }
    if (
      !Object.prototype.hasOwnProperty.call(profile, "surname") &&
      ("lastName" in profile || "teacherSurname" in profile)
    ) {
      profile.surname = profile.lastName ?? profile.teacherSurname;
    }
    if (
      !Object.prototype.hasOwnProperty.call(profile, "school") &&
      Object.prototype.hasOwnProperty.call(profile, "schoolNumber")
    ) {
      profile.school = profile.schoolNumber;
    }
    mapped.profile = profile;
  }

  validateBackupSections(mapped, present);
  if (
    value.format === BACKUP_FORMAT &&
    Number(value.formatVersion) >= 2 &&
    ["grades", "settings", "pct", "info", "profile", "notes"].some(
      (section) => !present.has(section),
    )
  ) {
    throw new Error("The new-format backup is missing required application data.");
  }

  return { mapped, present };
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value
      .map((item) =>
        item === undefined || typeof item === "function" ? "null" : canonicalJson(item),
      )
      .join(",")}]`;
  }
  if (isPlainRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined && typeof value[key] !== "function")
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function backupDigest(data) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure backup verification is unavailable in this browser.");
  }
  const bytes = new TextEncoder().encode(canonicalJson(data));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function verifyBackupIntegrity(value) {
  if (value?.format !== BACKUP_FORMAT) return;
  const version = Number(value.formatVersion);
  if (version < 2) return;
  if (
    value.integrity?.algorithm !== "SHA-256" ||
    typeof value.integrity.digest !== "string" ||
    !/^[a-f0-9]{64}$/i.test(value.integrity.digest) ||
    !value.data ||
    typeof value.data !== "object" ||
    Array.isArray(value.data)
  ) {
    throw new Error("The backup is incomplete or has an invalid integrity record.");
  }
  const actual = await backupDigest(value.data);
  if (actual !== value.integrity.digest.toLowerCase()) {
    throw new Error(
      "Backup integrity check failed. The file may be damaged or modified.",
    );
  }
}

export function inspectBackupData(value) {
  const { mapped } = getBackupSource(value);
  const state = normalizeState(mapped);
  return {
    grades: state.grades.length,
    notes: state.notes.length,
    lessons: Object.values(state.lessons.schools).reduce(
      (total, schedule) => total + schedule.length,
      0,
    ),
    schools: state.profile.schools.length,
    hasProfile: Boolean(
      state.profile.name && state.profile.surname && state.profile.school,
    ),
    hasSettings: Boolean(mapped.settings),
  };
}

export async function createBackupData() {
  const backup = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: "4.5.3B16",
    exportedAt: new Date().toISOString(),
    data: await loadState(),
  };
  backup.integrity = {
    algorithm: "SHA-256",
    digest: await backupDigest(backup.data),
  };
  return backup;
}

export async function restoreBackupData(value, mode = "merge") {
  if (!["merge", "replace"].includes(mode)) {
    throw new Error("Choose whether to merge or replace the saved data.");
  }

  await verifyBackupIntegrity(value);
  const { mapped, present } = getBackupSource(value);
  const imported = normalizeState(mapped);
  if (
    mode === "replace" &&
    (!present.has("grades") ||
      !present.has("profile") ||
      !imported.profile.name ||
      !imported.profile.surname ||
      !imported.profile.school)
  ) {
    throw new Error(
      "A complete backup with a valid profile is required to replace application data.",
    );
  }
  let result = imported;

  if (mode === "merge") {
    const current = await loadState();
    const incomingSettings = mapped.settings || {};
    const incomingPct = mapped.pct || {};
    const incomingInfo = mapped.info || {};
    const rawProfile = mapped.profile || {};
    const profileHasSchools = [
      "schools",
      "school",
      "school2",
      "school3",
      "school4",
      "school5",
      "schoolNumber",
    ].some((key) => Object.prototype.hasOwnProperty.call(rawProfile, key));
    const incomingProfile = {
      ...rawProfile,
      ...(profileHasSchools
        ? {
            school: imported.profile.school,
            schools: imported.profile.schools,
          }
        : {}),
    };
    const gradeById = new Map(current.grades.map((grade) => [grade.id, grade]));
    for (const grade of imported.grades) gradeById.set(grade.id, grade);

    const noteById = new Map(current.notes.map((note) => [note.id, note]));
    for (const note of imported.notes) noteById.set(note.id, note);

    result = normalizeState({
      grades: present.has("grades")
        ? Array.from(gradeById.values())
        : current.grades,
      notes: present.has("notes")
        ? Array.from(noteById.values())
        : current.notes,
      settings: present.has("settings")
        ? { ...current.settings, ...incomingSettings }
        : current.settings,
      pct: present.has("pct")
        ? {
            ...current.pct,
            ...incomingPct,
            counts: {
              ...current.pct.counts,
              ...(incomingPct.counts || {}),
            },
          }
        : current.pct,
      info: present.has("info")
        ? { ...current.info, ...incomingInfo }
        : current.info,
      profile: present.has("profile")
        ? { ...current.profile, ...incomingProfile }
        : current.profile,
      lessons: present.has("lessons")
        ? mergeLessons(current.lessons, imported.lessons)
        : current.lessons,
    });
  }

  return saveState(result);
}

function readLegacyState() {
  for (const prefix of LEGACY_PREFIXES) {
    const candidate = {
      grades: safeParseStorage(`${prefix}_grades`, null),
      settings: safeParseStorage(`${prefix}_settings`, null),
      pct: safeParseStorage(`${prefix}_pct`, null),
      info: safeParseStorage(`${prefix}_info`, null),
      profile: safeParseStorage(`${prefix}_profile`, null),
      lessons: safeParseStorage(`${prefix}_lessons`, null),
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
        Object.keys(state.lessons?.schools || {}).length > 0 ||
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

async function persistState(payload, localStorageError) {
  let indexedDbError = null;

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
  if (loggingOut) {
    return Promise.reject(new Error("Saving is disabled while user data is being cleared."));
  }

  const payload = storedPayload(state);
  let localStorageError = null;
  try {
    localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    localStorageError = error;
  }

  const operation = saveQueue.then(() =>
    persistState(payload, localStorageError),
  );
  saveQueue = operation.catch(() => {});
  return operation;
}

async function clearIndexedDbState() {
  if (!window.indexedDB) return;

  await new Promise((resolve, reject) => {
    let settled = false;
    const request = indexedDB.deleteDatabase(DB_NAME);
    const timeout = setTimeout(() => {
      finish(
        new Error(
          "The saved data database is still open in another tab. Close other app tabs and retry logout.",
        ),
      );
    }, 5000);
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    };
    request.onsuccess = () => finish();
    request.onerror = () =>
      finish(request.error || new Error("Could not delete the saved data database."));
  });
}

export async function clearState() {
  loggingOut = true;
  logoutChannel?.postMessage({ type: "logout-start" });
  let logoutSignalError = null;
  try {
    localStorage.setItem(
      LOGOUT_SIGNAL_KEY,
      `logout-start:${Date.now()}:${Math.random()}`,
    );
  } catch (error) {
    logoutSignalError = error;
  }

  await saveQueue;
  const errors = [];
  if (logoutSignalError && !logoutChannel) errors.push(logoutSignalError);
  else if (logoutSignalError) {
    reportStorageWarning("Could not send the cross-tab logout signal.", logoutSignalError);
  }

  try {
    await clearIndexedDbState();
  } catch (error) {
    errors.push(error);
  }

  if (errors.length) {
    loggingOut = false;
    logoutChannel?.postMessage({ type: "logout-failed" });
    try {
      localStorage.setItem(
        LOGOUT_SIGNAL_KEY,
        `logout-failed:${Date.now()}:${Math.random()}`,
      );
      localStorage.removeItem(LOGOUT_SIGNAL_KEY);
    } catch (error) {
      reportStorageWarning("Could not notify other tabs that logout failed.", error);
    }
    const error = new Error(
      "Logout could not verify that all saved application data was deleted. Close other app tabs and retry.",
      { cause: errors[0] },
    );
    reportStorageWarning(error.message, error);
    throw error;
  }

  for (const storageName of ["localStorage", "sessionStorage"]) {
    try {
      const storage = window[storageName];
      const keys = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (
          key &&
          (key === FALLBACK_STORAGE_KEY ||
            LEGACY_PREFIXES.some((prefix) => key.startsWith(`${prefix}_`)) ||
            /^chorak(?:[_-]|$)/i.test(key) ||
            /^choryak(?:[_-]|$)/i.test(key))
        ) {
          keys.push(key);
        }
      }
      for (const key of keys) {
        try {
          storage.removeItem(key);
        } catch (error) {
          errors.push(error);
        }
      }
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length) {
    const error = new Error(
      "Logout could not verify that all saved application data was deleted. Close other app tabs and retry.",
      { cause: errors[0] },
    );
    reportStorageWarning(error.message, error);
    throw error;
  }

  logoutChannel?.postMessage({ type: "logout-complete" });
  try {
    localStorage.setItem(
      LOGOUT_SIGNAL_KEY,
      `logout-complete:${Date.now()}:${Math.random()}`,
    );
    localStorage.removeItem(LOGOUT_SIGNAL_KEY);
  } catch (error) {
    reportStorageWarning(
      "Data was deleted, but other open tabs could not be notified to reload.",
      error,
    );
  }
}
// Created by Abdughafur - Believe GOD
