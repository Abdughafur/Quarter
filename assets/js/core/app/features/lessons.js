import { escapeHtml, qs, uid } from "../../../utils/helpers.js";

const LESSON_DAYS = [
  { id: 1, label: "Душанбе" },
  { id: 2, label: "Сешанбе" },
  { id: 3, label: "Чоршанбе" },
  { id: 4, label: "Панҷшанбе" },
  { id: 5, label: "Ҷумъа" },
  { id: 6, label: "Шанбе" },
  { id: 7, label: "Якшанбе" },
];

function currentWeekday() {
  return ((new Date().getDay() + 6) % 7) + 1;
}

function compareLessons(first, second) {
  return String(first.start || "").localeCompare(String(second.start || ""));
}

function findLessonConflict(schools, currentSchool, lesson) {
  for (const [school, schedule] of Object.entries(schools || {})) {
    if (!Array.isArray(schedule)) continue;
    const conflict = schedule.find(
      (existing) =>
        !(school === currentSchool && existing.id === lesson.id) &&
        Number(existing.day) === lesson.day &&
        lesson.start < String(existing.end || "") &&
        lesson.end > String(existing.start || ""),
    );
    if (conflict) return { school, lesson: conflict };
  }
  return null;
}

export const lessonsFeature = {
  getLessonsSchools() {
    const profileSchools = Array.isArray(this.profile?.schools)
      ? this.profile.schools
      : [this.profile?.school];
    const savedSchools = Object.keys(this.lessons?.schools || {});
    return Array.from(
      new Set(
        [...profileSchools, ...savedSchools]
          .map((school) => String(school || "").trim())
          .filter(Boolean),
      ),
    ).slice(0, 50);
  },

  getSelectedLessonsSchool() {
    const schools = this.getLessonsSchools();
    const selected = String(this.lessons?.selectedSchool || "");
    return schools.includes(selected) ? selected : schools[0] || "";
  },

  renderLessons() {
    const tabs = qs("lessonsSchoolTabs");
    const grid = qs("lessonsWeekGrid");
    if (!tabs || !grid) return;

    if (!this.lessons || typeof this.lessons !== "object") {
      this.lessons = { selectedSchool: "", schools: {} };
    }
    if (!this.lessons.schools || typeof this.lessons.schools !== "object") {
      this.lessons.schools = {};
    }
    this.renderCalendarLessons();

    const schools = this.getLessonsSchools();
    const selectedSchool = this.getSelectedLessonsSchool();
    this.lessons.selectedSchool = selectedSchool;
    const addButton = document.querySelector(".lessons-add-button");
    if (addButton) addButton.hidden = !selectedSchool;

    tabs.innerHTML = schools
      .map(
        (school) => `
          <button class="lessons-school-tab${school === selectedSchool ? " is-active" : ""}"
            type="button" role="tab" aria-selected="${school === selectedSchool}"
            data-action="selectLessonsSchool" data-school="${escapeHtml(school)}">
            Мактаб ${escapeHtml(school)}
          </button>`,
      )
      .join("");

    if (!selectedSchool) {
      grid.innerHTML = `
        <div class="lessons-empty-state">
          <span class="lessons-empty-icon" aria-hidden="true">▤</span>
          <h3>Аввал мактабро илова кунед</h3>
          <p>Барои сохтани ҷадвал рақами мактабро дар профил ворид намоед.</p>
          <button class="btn" type="button" data-action="showMoreProfile" data-tab="tab-more">
            Танзими профил
          </button>
        </div>`;
      return;
    }

    const schedule = this.lessons.schools[selectedSchool] || [];
    grid.innerHTML = LESSON_DAYS.map((day) => {
      const dayLessons = schedule
        .filter((lesson) => Number(lesson.day) === day.id)
        .slice()
        .sort(compareLessons);
      const rows = dayLessons.length
        ? dayLessons
            .map(
              (lesson) => `
                <article class="lesson-row">
                  <div class="lesson-time">
                    <span>${escapeHtml(lesson.start || "--:--")}</span>
                    <span>${escapeHtml(lesson.end || "--:--")}</span>
                  </div>
                  <div class="lesson-details">
                    <strong>${escapeHtml(lesson.subject || "Дарси нав")}</strong>
                    ${lesson.room ? `<span>Синфхона ${escapeHtml(lesson.room)}</span>` : ""}
                  </div>
                  <button class="lesson-edit-button" type="button" data-action="editLesson"
                    data-id="${escapeHtml(lesson.id)}" data-day="${day.id}"
                    aria-label="Таҳрири ${escapeHtml(lesson.subject || "дарс")}">Таҳрир</button>
                </article>`,
            )
            .join("")
        : '<p class="lessons-day-empty">Барои ин рӯз дарс сабт нашудааст.</p>';

      return `
        <section class="lessons-day-card" aria-labelledby="lessonsDay${day.id}">
          <div class="lessons-day-header">
            <h3 id="lessonsDay${day.id}">${day.label}</h3>
            <button class="lesson-add-day-button" type="button" data-action="openLessonsEditor"
              data-day="${day.id}" aria-label="Иловаи дарс ба рӯзи ${day.label}">+</button>
          </div>
          <div class="lessons-day-list">${rows}</div>
        </section>`;
    }).join("");
  },

  bindLessons() {
    const form = qs("lessonsForm");
    if (!form || form.dataset.bound === "true") return;
    form.dataset.bound = "true";
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.saveLesson();
    });
  },

  selectLessonsSchool(school) {
    const selected = String(school || "");
    if (!this.getLessonsSchools().includes(selected)) return;
    this.lessons.selectedSchool = selected;
    this.renderLessons();
    this.queueLessonsSave();
  },

  openLessonsEditor(payload = {}) {
    const school = this.getSelectedLessonsSchool();
    if (!school) {
      this.toast.show("Аввал рақами мактабро дар профил илова кунед.");
      return;
    }

    const form = qs("lessonsForm");
    const modal = qs("lessonsModal");
    const title = qs("lessonsEditorTitle");
    if (!form || !modal || !title) return;

    const id = String(payload.id || "");
    const lesson = (this.lessons.schools[school] || []).find(
      (entry) => entry.id === id,
    );
    form.reset();
    qs("lessonIdInput").value = lesson?.id || "";
    qs("lessonSubjectInput").value = lesson?.subject || "";
    qs("lessonDayInput").value = String(
      lesson?.day || Number(payload.day) || currentWeekday(),
    );
    qs("lessonStartInput").value = lesson?.start || "";
    qs("lessonEndInput").value = lesson?.end || "";
    qs("lessonRoomInput").value = lesson?.room || "";
    title.textContent = lesson ? "Таҳрири дарс" : "Дарси нав";

    const deleteButton = qs("lessonDeleteButton");
    if (deleteButton) {
      deleteButton.hidden = !lesson;
      if (lesson) deleteButton.dataset.id = lesson.id;
      else delete deleteButton.dataset.id;
    }

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    setTimeout(() => qs("lessonSubjectInput")?.focus(), 80);
  },

  closeLessonsEditor() {
    const modal = qs("lessonsModal");
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    qs("lessonsForm")?.reset();
    const deleteButton = qs("lessonDeleteButton");
    if (deleteButton) {
      deleteButton.hidden = true;
      delete deleteButton.dataset.id;
    }
  },

  saveLesson() {
    const form = qs("lessonsForm");
    if (!form?.reportValidity()) return;

    const school = this.getSelectedLessonsSchool();
    const subject = String(qs("lessonSubjectInput")?.value || "").trim();
    const day = Number(qs("lessonDayInput")?.value);
    const start = String(qs("lessonStartInput")?.value || "");
    const end = String(qs("lessonEndInput")?.value || "");
    const room = String(qs("lessonRoomInput")?.value || "").trim();
    if (!school || !subject || day < 1 || day > 7 || start >= end) {
      this.toast.show("Маълумоти дарс ё вақти онро дуруст ворид кунед.");
      return;
    }

    const id = String(qs("lessonIdInput")?.value || "") || uid();
    const lesson = { id, day, subject, start, end, room };
    const schedule = this.lessons.schools[school] || [];
    const index = schedule.findIndex((entry) => entry.id === id);
    const conflict = findLessonConflict(
      this.lessons.schools,
      school,
      lesson,
    );
    if (conflict) {
      this.toast.show(
        `Дарси «${conflict.lesson.subject || "бе ном"}» дар Мактаб ${conflict.school} аз ${conflict.lesson.start} то ${conflict.lesson.end} аллакай сабт шудааст. Вақти дигарро интихоб кунед.`,
      );
      return;
    }

    if (index === -1) schedule.push(lesson);
    else schedule[index] = lesson;
    this.lessons.schools[school] = schedule.sort(compareLessons);

    this.closeLessonsEditor();
    this.renderLessons();
    this.queueLessonsSave();
    this.toast.show(index === -1 ? "Дарс илова шуд." : "Тағйирот сабт шуд.");
  },

  deleteLesson(id) {
    const school = this.getSelectedLessonsSchool();
    const lessonId = String(id || qs("lessonIdInput")?.value || "");
    const schedule = this.lessons.schools[school] || [];
    const lesson = schedule.find((entry) => entry.id === lessonId);
    if (!lesson || !window.confirm(`Дарси «${lesson.subject}»-ро нест мекунед?`)) {
      return;
    }

    this.lessons.schools[school] = schedule.filter(
      (entry) => entry.id !== lessonId,
    );
    this.closeLessonsEditor();
    this.renderLessons();
    this.queueLessonsSave();
    this.toast.show("Дарс нест карда шуд.");
  },

  queueLessonsSave() {
    clearTimeout(this.lessonsSaveTimer);
    this.lessonsSaveTimer = setTimeout(() => {
      this.lessonsSaveTimer = null;
      void this.save();
    }, 350);
  },

  flushLessonsSave() {
    clearTimeout(this.lessonsSaveTimer);
    this.lessonsSaveTimer = null;
  },

  closeLessonsTimePicker() {
    document.querySelectorAll("[data-time-popover]").forEach((popover) => {
      popover.hidden = true;
    });
  },

  closeLessonsSchoolMenu(restoreFocus = false) {
    const menu = qs("lessonsSchoolMenu");
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    if (restoreFocus) qs("lessonsSchoolMenuButton")?.focus();
  },
};