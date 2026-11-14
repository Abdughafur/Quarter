import { promptInstallPwa } from "../../pwa.js";
import { clean, escapeHtml, qs, setText } from "../../../utils/helpers.js";
import { CALENDAR_MONTHS, CALENDAR_WEEKDAYS, CALENDAR_MIN_YEAR, CALENDAR_MAX_YEAR, SHARE_URL } from "../shared.js";

export const navigationFeature = {
  isPhoneLayout() {
    return window.matchMedia("(max-width: 520px)").matches;
  },

  toggleMobileMoreMenu() {
    const menu = qs("mobileMoreMenu");
    const trigger = document.querySelector(".mobile-more-trigger");
    if (!menu || !trigger || !this.isPhoneLayout()) return;

    if (!menu.hidden) {
      this.closeMobileMoreMenu(true);
      return;
    }

    this.openMobileMoreMenu();
    menu.querySelector(".mobile-more-menu-option")?.focus();
  },

  openMobileMoreMenu() {
    const menu = qs("mobileMoreMenu");
    const trigger = document.querySelector(".mobile-more-trigger");
    if (!menu || !trigger || !this.isPhoneLayout()) return;

    menu.hidden = false;
    qs("mobileMoreBackdrop").hidden = false;
    this.mobileMorePreviousTab = document.body.dataset.activeTab || "tab-home";
    document.body.classList.add("mobile-more-menu-open");
    trigger.setAttribute("aria-expanded", "true");
    this.updateMobileMoreMenuSelection();
    this.updateNavHighlight?.(trigger);
    trigger.removeAttribute("aria-current");
  },

  updateMobileMoreMenuSelection() {
    const menu = qs("mobileMoreMenu");
    if (!menu) return;
    menu.querySelectorAll(".mobile-more-menu-option").forEach((option) => {
      const selected =
        option.dataset.targetTab === document.body.dataset.activeTab;
      option.classList.toggle("active", selected);
      if (selected) option.setAttribute("aria-current", "page");
      else option.removeAttribute("aria-current");
    });
  },

  closeMobileMoreMenu(restoreFocus = false, restorePreviousTab = false) {
    const menu = qs("mobileMoreMenu");
    const trigger = document.querySelector(".mobile-more-trigger");
    const backdrop = qs("mobileMoreBackdrop");
    if (!menu || !trigger) return;

    menu.hidden = true;
    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove("mobile-more-menu-open");
    trigger.setAttribute("aria-expanded", "false");
    if (
      restorePreviousTab &&
      this.mobileMorePreviousTab &&
      document.body.dataset.activeTab !== this.mobileMorePreviousTab
    ) {
      const previousTab = this.mobileMorePreviousTab;
      const previousButton = document.querySelector(
        `.nav-btn[data-tab="${previousTab}"]`,
      );
      this.nav(previousTab, previousButton);
    }
    this.mobileMorePreviousTab = null;
    const activeTab = document.body.dataset.activeTab;
    const activeButton = document.querySelector(
      `.nav-btn[data-tab="${activeTab}"]`,
    );
    if (activeButton) this.updateNavHighlight?.(activeButton);
    if (restoreFocus) trigger.focus();
  },

  navigateFromMobileMore(tabId) {
    if (
      tabId !== "tab-calendar" &&
      tabId !== "tab-lessons" &&
      tabId !== "tab-more"
    )
      return;
    this.closeMobileMoreMenu();
    const tabButton = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);
    this.nav(tabId, tabButton);
  },

  nav(id, button) {
    if (id !== "tab-notes") this.flushNoteAutosave();
    if (
      document.body.dataset.activeTab === "tab-lessons" &&
      id !== "tab-lessons"
    ) {
      this.flushLessonsSave();
      void this.save();
    }
    this.closeMobileMoreMenu();
    document.body.dataset.activeTab = id;

    document
      .querySelectorAll(".tab")
      .forEach((tab) => tab.classList.remove("active"));
    document
      .querySelectorAll(".nav-btn")
      .forEach((navButton) => navButton.classList.remove("active"));

    qs(id)?.classList.add("active");
    (button || document.querySelector(`[data-tab="${id}"]`))?.classList.add(
      "active",
    );

    this.updateNavHighlight?.(
      button || document.querySelector(`[data-tab="${id}"]`),
    );
    this.updateMobileMoreMenuSelection();

    this.tone(600, "sine", 0.04);
  },

  formatCalendarDate(date, includeYear = true) {
    const weekday = CALENDAR_WEEKDAYS[date.getDay()];
    const month = CALENDAR_MONTHS[date.getMonth()];
    const dateText = `${weekday}, ${date.getDate()} ${month}`;
    return includeYear ? `${dateText} ${date.getFullYear()}` : dateText;
  },

  renderCalendar(direction = 0) {
    const monthLabel = qs("calendarMonthLabel");
    const selectedDateLabel = qs("calendarSelectedDate");
    const grid = qs("calendarGrid");
    if (!monthLabel || !selectedDateLabel || !grid) return;

    const year = this.calendarMonth.getFullYear();
    const month = this.calendarMonth.getMonth();
    const selected = this.calendarSelectedDate;
    const today = new Date();
    const dateKey = (date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

    const monthName = CALENDAR_MONTHS[month];
    monthLabel.textContent = `${monthName[0].toUpperCase()}${monthName.slice(1)}`;
    setText("calendarYearLabel", String(year));
    selectedDateLabel.textContent = this.formatCalendarDate(selected, false);
    const previousButton = qs("calendarPreviousMonth");
    const nextButton = qs("calendarNextMonth");
    if (previousButton)
      previousButton.disabled = year === CALENDAR_MIN_YEAR && month === 0;
    if (nextButton)
      nextButton.disabled = year === CALENDAR_MAX_YEAR && month === 11;

    const fragment = document.createDocumentFragment();
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let index = 0; index < firstWeekday; index += 1) {
      const emptyCell = document.createElement("span");
      emptyCell.className = "calendar-day-empty";
      emptyCell.setAttribute("role", "presentation");
      fragment.append(emptyCell);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      const key = dateKey(date);
      const cell = document.createElement("div");
      const button = document.createElement("button");
      cell.setAttribute("role", "gridcell");
      button.type = "button";
      button.className = "calendar-day-button";
      button.textContent = String(day);
      button.dataset.action = "selectCalendarDate";
      button.dataset.date = key;
      button.setAttribute("aria-pressed", String(key === dateKey(selected)));
      button.setAttribute("aria-label", this.formatCalendarDate(date));
      if (key === dateKey(today)) button.classList.add("is-today");
      if (key === dateKey(selected)) button.classList.add("is-selected");
      if ((firstWeekday + day - 1) % 7 >= 5) button.classList.add("is-weekend");
      cell.append(button);
      fragment.append(cell);
    }

    grid.replaceChildren(fragment);
    if (direction) {
      const animationClass =
        direction > 0 ? "calendar-slide-next" : "calendar-slide-previous";
      grid.classList.remove("calendar-slide-next", "calendar-slide-previous");
      void grid.offsetWidth;
      grid.classList.add(animationClass);
      grid.addEventListener(
        "animationend",
        () => grid.classList.remove(animationClass),
        { once: true },
      );
    }
    this.renderCalendarPicker();
    this.renderCalendarLessons();
  },

  renderCalendarLessons() {
    const weekdayLabel = qs("calendarLessonsWeekday");
    const list = qs("calendarLessonsList");
    if (!weekdayLabel || !list) return;

    const selectedDate = this.calendarSelectedDate;
    const weekday = ((selectedDate.getDay() + 6) % 7) + 1;
    const weekdayName = CALENDAR_WEEKDAYS[selectedDate.getDay()];
    setText("calendarLessonsWeekday", weekdayName);

    const lessons = Object.entries(this.lessons?.schools || {})
      .flatMap(([school, schedule]) =>
        Array.isArray(schedule)
          ? schedule
              .filter((lesson) => Number(lesson.day) === weekday)
              .map((lesson) => ({ ...lesson, school }))
          : [],
      )
      .sort(
        (first, second) =>
          String(first.start || "").localeCompare(String(second.start || "")) ||
          first.school.localeCompare(second.school),
      );

    if (!lessons.length) {
      list.innerHTML =
        '<p class="calendar-lessons-empty">Барои ин рӯз дарс сабт нашудааст.</p>';
      return;
    }

    list.innerHTML = lessons
      .map(
        (lesson) => `
          <article class="calendar-lesson-item">
            <div class="calendar-lesson-details">
              <strong>${escapeHtml(lesson.subject || "Дарси нав")}</strong>
              <span>Мактаб ${escapeHtml(lesson.school)}</span>
              <span>Синфхона ${escapeHtml(lesson.room || "нишон дода нашудааст")}</span>
            </div>
            <time class="calendar-lesson-time">
              ${escapeHtml(lesson.start || "--:--")}–${escapeHtml(lesson.end || "--:--")}
            </time>
          </article>`,
      )
      .join("");
  },

  renderCalendarPicker() {
    const panel = qs("calendarPickerModal");
    const title = qs("calendarPickerTitle");
    const yearList = qs("calendarYearList");
    const monthList = qs("calendarMonthList");
    const dateForm = qs("calendarDateForm");
    if (!panel || !title || !yearList || !monthList || !dateForm) return;

    let pickerBody = qs("calendarPickerBody");
    if (!pickerBody) {
      pickerBody = document.createElement("div");
      pickerBody.id = "calendarPickerBody";
      pickerBody.className = "calendar-picker-body";
      const insertBefore = yearList.parentNode;
      if (insertBefore) insertBefore.insertBefore(pickerBody, yearList);
      pickerBody.appendChild(yearList);
      pickerBody.appendChild(monthList);
      pickerBody.appendChild(dateForm);
    }

    panel.classList.toggle("open", this.calendarPickerOpen);
    if (!this.calendarPickerOpen) return;

    const isYearMode = this.calendarPickerMode === "years";
    const isDateMode = this.calendarPickerMode === "date";
    const activeYear =
      this.calendarPickerYear ?? this.calendarMonth.getFullYear();
    title.textContent =
      this.calendarPickerHeading ||
      (isDateMode
        ? "Гузариш ба сана"
        : isYearMode
          ? "Интихоби сол"
          : "Интихоби моҳ");

    yearList.hidden = !isYearMode;
    monthList.hidden = isYearMode || isDateMode;
    dateForm.hidden = !isDateMode;
    pickerBody.classList.toggle("is-year-mode", isYearMode);
    pickerBody.classList.toggle("is-month-mode", !isYearMode && !isDateMode);
    pickerBody.classList.toggle("is-date-mode", isDateMode);

    if (isYearMode) {
      const yearButtons = [];
      for (let year = CALENDAR_MIN_YEAR; year <= CALENDAR_MAX_YEAR; year += 1) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "calendar-picker-option calendar-year-option";
        button.textContent = String(year);
        button.dataset.action = "selectCalendarYear";
        button.dataset.year = String(year);
        button.setAttribute("aria-pressed", String(year === activeYear));
        yearButtons.push(button);
      }
      yearList.replaceChildren(...yearButtons);
      requestAnimationFrame(() => {
        yearList
          .querySelector('[aria-pressed="true"]')
          ?.scrollIntoView({ block: "center" });
      });
    } else {
      yearList.replaceChildren();
      const monthButtons = CALENDAR_MONTHS.map((month, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "calendar-picker-option";
        button.textContent = month;
        button.dataset.action = "selectCalendarMonth";
        button.dataset.month = String(index);
        button.setAttribute(
          "aria-pressed",
          String(
            this.calendarMonth.getFullYear() === activeYear &&
              this.calendarMonth.getMonth() === index,
          ),
        );
        return button;
      });
      monthList.replaceChildren(...monthButtons);
    }
  },

  bindCalendarSwipe() {
    const grid = qs("calendarGrid");
    if (!grid || grid.dataset.swipeBound === "true") return;

    grid.dataset.swipeBound = "true";
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let dragging = false;
    let suppressNextClick = false;

    grid.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      lastX = startX;
      dragging = false;
    });

    document.addEventListener(
      "pointermove",
      (event) => {
        if (event.pointerId !== pointerId) return;
        const deltaX = event.clientX - startX;
        const deltaY = event.clientY - startY;
        lastX = event.clientX;

        if (!dragging) {
          if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;
          if (Math.abs(deltaY) >= Math.abs(deltaX)) {
            pointerId = null;
            return;
          }
          dragging = true;
          grid.classList.add("is-dragging");
        }

        event.preventDefault();
        const travel = Math.max(
          -grid.clientWidth,
          Math.min(grid.clientWidth, deltaX),
        );
        grid.style.setProperty("--calendar-drag-x", `${travel}px`);
        grid.style.setProperty(
          "--calendar-drag-opacity",
          String(
            1 -
              Math.min(
                (Math.abs(travel) / Math.max(grid.clientWidth, 1)) * 0.35,
                0.35,
              ),
          ),
        );
      },
      { passive: false },
    );

    document.addEventListener("pointerup", (event) => {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      const deltaX = lastX - startX;
      const deltaY = event.clientY - startY;
      const horizontalSwipe =
        dragging &&
        Math.abs(deltaX) >= 48 &&
        Math.abs(deltaX) > Math.abs(deltaY);
      if (!dragging) return;

      if (horizontalSwipe) {
        suppressNextClick = true;
        setTimeout(() => {
          suppressNextClick = false;
        }, 0);
      }
      const direction = deltaX < 0 ? 1 : -1;
      if (!horizontalSwipe || !this.canChangeCalendarMonth(direction)) {
        grid.classList.remove("is-dragging");
        grid.classList.add("is-returning");
        grid.style.removeProperty("--calendar-drag-x");
        grid.style.removeProperty("--calendar-drag-opacity");
        setTimeout(() => grid.classList.remove("is-returning"), 240);
        return;
      }

      grid.classList.remove("is-dragging");
      grid.classList.add("is-committing");
      grid.style.setProperty(
        "--calendar-drag-x",
        `${direction > 0 ? -grid.clientWidth : grid.clientWidth}px`,
      );
      grid.style.setProperty("--calendar-drag-opacity", "0");

      let completed = false;
      const finishSwipe = () => {
        if (completed) return;
        completed = true;
        grid.classList.remove("is-committing");
        grid.style.removeProperty("--calendar-drag-x");
        grid.style.removeProperty("--calendar-drag-opacity");
        this.changeCalendarMonth(direction);
      };
      grid.addEventListener("transitionend", finishSwipe, { once: true });
      setTimeout(finishSwipe, 240);
    });

    document.addEventListener("pointercancel", (event) => {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      if (!dragging) return;
      grid.classList.remove("is-dragging");
      grid.classList.add("is-returning");
      grid.style.removeProperty("--calendar-drag-x");
      grid.style.removeProperty("--calendar-drag-opacity");
      setTimeout(() => grid.classList.remove("is-returning"), 240);
    });

    grid.addEventListener(
      "click",
      (event) => {
        if (!suppressNextClick) return;
        suppressNextClick = false;
        event.preventDefault();
        event.stopPropagation();
      },
      true,
    );
  },

  canChangeCalendarMonth(offset) {
    const date = new Date(
      this.calendarMonth.getFullYear(),
      this.calendarMonth.getMonth() + offset,
      1,
    );
    return (
      Number.isFinite(date.getTime()) &&
      date.getFullYear() >= CALENDAR_MIN_YEAR &&
      date.getFullYear() <= CALENDAR_MAX_YEAR
    );
  },

  changeCalendarMonth(offset) {
    if (!Number.isFinite(offset)) return;
    const nextMonth = new Date(
      this.calendarMonth.getFullYear(),
      this.calendarMonth.getMonth() + offset,
      1,
    );
    if (
      nextMonth.getFullYear() < CALENDAR_MIN_YEAR ||
      nextMonth.getFullYear() > CALENDAR_MAX_YEAR
    )
      return;
    this.calendarMonth = nextMonth;
    this.calendarPickerYear = nextMonth.getFullYear();
    this.renderCalendar(offset);
  },

  openCalendarPicker(mode = "months", heading = "Интихоби моҳ") {
    this.calendarPickerYear = this.calendarMonth.getFullYear();
    this.calendarPickerOpen = true;
    this.calendarPickerMode =
      mode === "years" || mode === "date" ? mode : "months";
    this.calendarPickerHeading = heading;
    if (this.calendarPickerMode === "date") {
      const date = this.calendarSelectedDate;
      setInputValue("calendarDateDay", String(date.getDate()));
      setInputValue("calendarDateMonth", String(date.getMonth() + 1));
      setInputValue("calendarDateYear", String(date.getFullYear()));
    }
    document
      .querySelectorAll('[aria-controls="calendarPickerModal"]')
      .forEach((button) => button.setAttribute("aria-expanded", "true"));
    this.renderCalendarPicker();
  },

  closeCalendarPicker() {
    this.calendarPickerOpen = false;
    document
      .querySelectorAll('[aria-controls="calendarPickerModal"]')
      .forEach((button) => button.setAttribute("aria-expanded", "false"));
    this.renderCalendarPicker();
  },

  selectCalendarYear(value) {
    const year = Number(value);
    if (
      !Number.isInteger(year) ||
      year < CALENDAR_MIN_YEAR ||
      year > CALENDAR_MAX_YEAR
    )
      return;
    this.calendarPickerYear = year;
    const month = this.calendarMonth.getMonth();
    const day = Math.min(
      this.calendarSelectedDate.getDate(),
      new Date(year, month + 1, 0).getDate(),
    );
    this.calendarMonth = new Date(year, month, 1);
    this.calendarSelectedDate = new Date(year, month, day);
    this.closeCalendarPicker();
    this.renderCalendar();
  },

  selectCalendarMonth(value) {
    const month = Number(value);
    if (
      !Number.isInteger(month) ||
      month < 0 ||
      month >= CALENDAR_MONTHS.length
    )
      return;
    const year = this.calendarPickerYear;
    const day = Math.min(
      this.calendarSelectedDate.getDate(),
      new Date(year, month + 1, 0).getDate(),
    );
    this.calendarMonth = new Date(year, month, 1);
    this.calendarSelectedDate = new Date(year, month, day);
    this.calendarPickerYear = year;
    this.closeCalendarPicker();
    this.renderCalendar();
  },

  showCalendarToday() {
    const today = new Date();
    if (
      today.getFullYear() < CALENDAR_MIN_YEAR ||
      today.getFullYear() > CALENDAR_MAX_YEAR
    )
      return;
    this.calendarSelectedDate = today;
    this.calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    this.calendarPickerYear = today.getFullYear();
    this.renderCalendar(1);
  },

  selectCalendarDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
    if (!match) return;
    const [, year, month, day] = match;
    this.calendarSelectedDate = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
    );
    this.renderCalendar();
  },

  goToCalendarDate() {
    const dayInput = qs("calendarDateDay");
    const monthInput = qs("calendarDateMonth");
    const yearInput = qs("calendarDateYear");
    const dayText = dayInput?.value.trim() || "";
    const monthText = monthInput?.value.trim() || "";
    const yearText = yearInput?.value.trim() || "";
    if (
      !/^\d{1,2}$/.test(dayText) ||
      !/^\d{1,2}$/.test(monthText) ||
      !/^\d{4}$/.test(yearText)
    ) {
      this.toast.show("Лутфан санаи дурустро интихоб кунед.");
      const invalidInput = !/^\d{1,2}$/.test(dayText)
        ? dayInput
        : !/^\d{1,2}$/.test(monthText)
          ? monthInput
          : yearInput;
      invalidInput?.focus();
      return;
    }

    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const date = new Date(year, month - 1, day);
    if (
      year < CALENDAR_MIN_YEAR ||
      year > CALENDAR_MAX_YEAR ||
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      this.toast.show(
        `Сана бояд дуруст ва аз ${CALENDAR_MIN_YEAR} то ${CALENDAR_MAX_YEAR} бошад.`,
      );
      dayInput?.focus();
      return;
    }

    this.calendarSelectedDate = date;
    this.calendarMonth = new Date(year, month - 1, 1);
    this.calendarPickerYear = year;
    this.closeCalendarPicker();
    this.renderCalendar();
  },

  showSubView(viewId) {
    this.setProfileMenuOpen(false);
    document.querySelectorAll(".more-subview").forEach((view) => {
      view.classList.remove("active");
    });
    qs(viewId)?.classList.add("active");
    document.body.classList.toggle(
      "more-subview-open",
      viewId !== "more-home-view",
    );
    this.tone(550, "sine", 0.05);
  },

  openMoreSettingsSection(sectionId) {
    this.showSubView("more-settings-view");
    setTimeout(() => {
      const element = qs(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 80);
  },

  shareApp() {
    qs("shareModal")?.classList.add("open");
  },

  closeShareModal() {
    qs("shareModal")?.classList.remove("open");
  },

  async copyShareLink() {
    try {
      await navigator.clipboard.writeText(SHARE_URL);
      this.toast.show("Пайванд нусхабардорӣ шуд!");
    } catch (error) {
      console.error("Could not copy the app link.", error);
      this.toast.show("Нусхабардории пайванд иҷро нашуд.");
    }
  },

  async sendShareLink() {
    const shareData = {
      title: "Чоряк - Ҳисобкунаки Чорякҳо",
      text: "Барномаи муосири Чоряк барои ҳисоб кардани натиҷаи баллҳои хонандагон.",
      url: SHARE_URL,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        this.closeShareModal();
        this.toast.show("Ба дигарон фиристода шуд!");
      } else {
        await this.copyShareLink();
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Could not share the app link.", error);
        this.toast.show("Ирсоли пайванд иҷро нашуд.");
      }
    }
  },

  async installPwa() {
    const installed = await promptInstallPwa();
    if (installed) {
      this.toast.show("Барнома насб шуд!");
      return;
    }
    this.toast.show("Насб дар ин браузер ё дар ин ҳолат дастрас нест.");
  },


};
