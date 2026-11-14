import { calculateStats, getTrend, gradeLabel, GRADE_LABELS } from "../../stats.js";
import { buildKeypad, buildPercentRows, renderGradeBlocks, renderGradeChart } from "../../../ui/chart.js";
import { closeInfoModal, openInfoModal } from "../../../ui/modal.js";
import { clean, clamp, escapeHtml, qs, roundRect, setChecked, setInputValue, setText, toInt, uid } from "../../../utils/helpers.js";
import { canvasToPngBlob } from "../shared.js";

export const calculatorFeature = {
  toggleResultDetails() {
    const toggle = document.querySelector(".result-details-toggle");
    const modal = document.querySelector("#resultDetailsModal");
    if (!this.grades.length || !toggle || !modal)
      return;

    if (modal.classList.contains("open")) {
      this.closeResultDetailsModal();
      return;
    }

    modal.classList.add("open");
    toggle.setAttribute("aria-expanded", "true");
    modal.querySelector(".result-details-modal-close")?.focus();
  },

  renderResultCalculation(stats) {
    const container = document.querySelector("#resultCalculationDetails");
    if (!container) return;

    const lines = [];
    const formatGrades = (items) => items.map((grade) => grade.val).join(" + ");

    if (stats.regular.length) {
      lines.push([
        "Баллҳои дарсӣ",
        `(${formatGrades(stats.regular)}) ÷ ${stats.regular.length} = ${stats.avgR.toFixed(2)}`,
      ]);
    }

    if (stats.exam.length) {
      lines.push([
        "Корҳои санҷишӣ",
        `(${formatGrades(stats.exam)}) ÷ ${stats.exam.length} = ${stats.avgE.toFixed(2)}`,
      ]);
    }

    if (stats.regular.length && stats.exam.length) {
      lines.push([
        "Натиҷаи ниҳоӣ",
        `(${stats.avgR.toFixed(2)} + ${stats.avgE.toFixed(2)}) ÷ 2 = ${stats.final.toFixed(2)}`,
      ]);
    } else if (stats.regular.length || stats.exam.length) {
      lines.push([
        "Натиҷаи ниҳоӣ",
        `${stats.final.toFixed(2)} (миёнаи баллҳои воридшуда)`,
      ]);
    } else {
      lines.push(["Натиҷаи ниҳоӣ", "Балл ворид нашудааст"]);
    }

    if (stats.regular.length || stats.exam.length) {
      const rounded = Math.round(stats.final);
      lines.push([
        "Баҳои яклухт",
        `${stats.final.toFixed(2)} = ${rounded} (${gradeLabel(rounded)})`,
      ]);
    }

    container.replaceChildren(
      ...lines.map(([label, formula]) => {
        const row = document.createElement("div");
        row.className = "result-calculation-line";
        if (label === "Баҳои яклухт") {
          row.classList.add("result-calculation-rounded");
        }

        const title = document.createElement("strong");
        title.textContent = label;
        const expression = document.createElement("span");
        expression.textContent = formula;

        row.append(title, expression);
        return row;
      }),
    );
  },

  closeResultDetailsModal() {
    const modal = document.querySelector("#resultDetailsModal");
    const toggle = document.querySelector(".result-details-toggle");
    if (!modal?.classList.contains("open")) return;

    modal.classList.remove("open");
    toggle?.setAttribute("aria-expanded", "false");
    toggle?.focus();
  },

  keyboard(event) {
    const isInput = ["INPUT", "TEXTAREA"].includes(
      document.activeElement?.tagName,
    );
    const physicalCode = event.code || "";
    const physicalMatch = /^(?:Key([A-Z])|Digit([0-9])|Numpad([0-9]))$/.exec(
      physicalCode,
    );
    const key = physicalMatch
      ? (physicalMatch[1] || physicalMatch[2] || physicalMatch[3]).toLowerCase()
      : physicalCode === "Backspace"
        ? "backspace"
        : physicalCode === "Escape"
          ? "escape"
          : event.key.toLowerCase();
    const activeTab = document.querySelector(".tab.active")?.id;
    const homeActive = activeTab === "tab-home";
    const percentActive = activeTab === "tab-prosent";
    const notesActive = activeTab === "tab-notes";
    const calendarActive = activeTab === "tab-calendar";

    if (
      event.isComposing ||
      event.keyCode === 229 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey
    )
      return;
    if (isInput && key !== "escape") return;

    if (
      homeActive &&
      (key === "arrowleft" || key === "arrowright") &&
      !document.querySelector(
        ".modal-backdrop.open, .note-modal-backdrop.open, .avatar-picker-backdrop.open",
      )
    ) {
      const chartViewport = qs("gradeChart")?.querySelector(".chart-viewport");
      if (chartViewport && chartViewport.scrollWidth > chartViewport.clientWidth + 1) {
        event.preventDefault();
        const direction = key === "arrowleft" ? -1 : 1;
        const reducedMotion = window.matchMedia?.(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        chartViewport.scrollBy({
          left: direction * chartViewport.clientWidth * 0.72,
          behavior: reducedMotion ? "auto" : "smooth",
        });
      }
    } else if (calendarActive && key === "arrowleft") {
      event.preventDefault();
      this.changeCalendarMonth(-1);
    } else if (calendarActive && key === "arrowright") {
      event.preventDefault();
      this.changeCalendarMonth(1);
    } else if (
      (key === "/" || physicalCode === "Slash") &&
      notesActive &&
      !this.editingNoteId &&
      !this.creatingNoteInline &&
      !qs("noteModal")?.classList.contains("open")
    ) {
      event.preventDefault();
      qs("noteSearchInput")?.focus();
    } else if (homeActive && /^[1-9]$/.test(key)) {
      event.preventDefault();
      this.add(Number(key));
    } else if (homeActive && key === "0") {
      event.preventDefault();
      this.add(10);
    } else if (homeActive && key === "backspace") {
      event.preventDefault();
      this.deleteLast();
      /* English */
    } else if (key === "c" && (homeActive || percentActive)) {
      event.preventDefault();
      if (percentActive) this.clearAllPercentages();
      else this.clearAll();
    } else if (homeActive && key === "e") {
      event.preventDefault();
      this.toggleLast();
    } else if (key === "h") {
      this.nav("tab-home");
    } else if (key === "s") {
      if (percentActive) {
        event.preventDefault();
        this.clearPupilCount();
      } else {
        this.nav("tab-more");
      }
    } else if (key === "p") {
      this.nav("tab-prosent");
    } else if (key === "z") {
      this.nav("tab-calendar");
    } else if (
      key === "l" &&
      !qs("lessonsModal")?.classList.contains("open")
    ) {
      event.preventDefault();
      this.nav("tab-lessons");
    } else if (key === "n") {
      if (notesActive) {
        if (
          !this.editingNoteId &&
          !this.creatingNoteInline &&
          !qs("noteModal")?.classList.contains("open")
        ) {
          event.preventDefault();
          this.openNoteEntry();
        }
      } else {
        this.nav("tab-notes");
      }
      /* Русский */
    } else if (key === "с" && (homeActive || percentActive)) {
      event.preventDefault();
      if (percentActive) this.clearAllPercentages();
      else this.clearAll();
    } else if (homeActive && key === "у") {
      event.preventDefault();
      this.toggleLast();
    } else if (key === "р") {
      this.nav("tab-home");
    } else if (key === "ы") {
      if (percentActive) {
        event.preventDefault();
        this.clearPupilCount();
      } else {
        this.nav("tab-more");
      }
    } else if (key === "з") {
      this.nav("tab-prosent");
      /* Тоҷикӣ */
    } else if (key === "р") {
      this.nav("tab-home");
    } else if (key === "ҷ") {
      this.nav("tab-more");
    } else if (key === "н") {
      if (notesActive) {
        if (
          !this.editingNoteId &&
          !this.creatingNoteInline &&
          !qs("noteModal")?.classList.contains("open")
        ) {
          event.preventDefault();
          this.openNoteEntry();
        }
      } else {
        this.nav("tab-notes");
      }
    } else if (key === "escape") {
      if (calendarActive && this.calendarPickerOpen) this.closeCalendarPicker();
      else this.closeModal();
    }
  },

  buildKeypad() {
    buildKeypad(qs("keypad"), {
      onAdd: (value) => this.add(value),
      onDelete: () => {
        this.vibrate?.(26);
        this.deleteLast(true);
      },
      onClear: () => {
        this.vibrate?.(26);
        this.clearAll(true);
      },
    });
  },

  buildPercentRows() {
    buildPercentRows(qs("percentRows"), GRADE_LABELS, (input) =>
      this.setGradeCount(input),
    );
  },

  add(value) {
    if (this.grades.length >= 100) {
      this.toast.show("Максимум 100 балл.");
      return;
    }

    this.grades.push({
      val: clamp(value, 1, 10),
      type: "regular",
      id: uid(),
    });

    this.tone(450 + value * 30);
    this.scheduleUpdate(true, true);
  },

  toggleGradesView() {
    const container = qs("blocksContainer");
    const toggle = document.querySelector(".grades-toggle");
    if (!container || !toggle) return;

    const hasOverflow = container.scrollHeight > container.clientHeight + 1;
    const isCompactView = window.innerWidth <= 520;
    const expandedBeforeToggle =
      container.classList.contains("grades-expanded");
    const shouldShowToggle =
      isCompactView &&
      this.grades.length > 0 &&
      (hasOverflow || expandedBeforeToggle);

    if (!shouldShowToggle) {
      toggle.classList.remove("is-visible");
      toggle.setAttribute("aria-hidden", "true");
      toggle.style.opacity = "0";
      toggle.style.visibility = "hidden";
      toggle.style.pointerEvents = "none";
      toggle.setAttribute("aria-expanded", "false");
      container.classList.remove("grades-expanded");
      container.style.height = "168px";
      return;
    }

    const expanded = container.classList.toggle("grades-expanded");
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute(
      "aria-label",
      expanded ? "Пинҳон кардани баъзе баллҳо" : "Намоиши ҳамаи баллҳо",
    );

    if (expanded) {
      container.style.height = `${Math.min(container.scrollHeight, 520)}px`;
    } else {
      container.style.height = "168px";
    }

    if (!expanded) {
      requestAnimationFrame(() => {
        container.scrollTo({
          top: container.scrollHeight - container.clientHeight,
          behavior: "smooth",
        });
      });
    }
  },

  deleteLast(silent = false) {
    if (!this.grades.length) {
      if (!silent) this.toast.show("Ҳоло ягон балл нест.");
      return;
    }

    this.grades.pop();
    this.scheduleUpdate(true);
  },

  clearAll(silent = false) {
    if (!this.grades.length) {
      if (!silent) this.toast.show("Ҳоло ягон балл нест.");
      return;
    }

    this.grades = [];
    this.scheduleUpdate(true);
    if (!silent) this.toast.show("Ҳама баллҳо тоза шуд.");
  },

  clearAllPercentages(silent = false) {
    // Clear only percentage distribution inputs; preserve pupil total and recorded grades
    this.pct.counts = {};

    for (let grade = 10; grade >= 1; grade -= 1) {
      const input = qs(`gradeCount${grade}`);
      if (input) input.value = "";
    }

    // update UI and persist
    this.percentUpdate();
    this.save();
    if (!silent) this.toast.show("Ҳама фоизҳо тоза шуданд.");
  },

  clearPupilCount() {
    this.pct.total = 0;
    this.pct.counts = {};
    const pupilInput = qs("pupilCountInput");
    if (pupilInput) pupilInput.value = "";
    for (let grade = 10; grade >= 1; grade -= 1) {
      const input = qs(`gradeCount${grade}`);
      if (input) input.value = "";
    }
    this.percentUpdate();
    this.save();
    this.toast.show("Шумораи хонандагон тоза шуд.");
  },

  toggleLast() {
    if (!this.grades.length) {
      this.toast.show("Аввал балл илова кунед.");
      return;
    }

    this.toggleGrade(this.grades[this.grades.length - 1].id);
  },

  toggleGrade(id) {
    const grade = this.grades.find((item) => item.id === id);
    if (!grade) return;

    grade.type = grade.type === "exam" ? "regular" : "exam";
    this.scheduleUpdate(true);
  },

  scheduleUpdate(anim = false, scrollGrades = false) {
    this.shouldBump = this.shouldBump || anim;
    this.shouldScrollGrades = this.shouldScrollGrades || scrollGrades;

    if (this.updateFrame) return;

    this.updateFrame = requestAnimationFrame(() => {
      this.updateFrame = null;
      const shouldBump = this.shouldBump;
      const shouldScrollGrades = this.shouldScrollGrades;
      this.shouldBump = false;
      this.shouldScrollGrades = false;
      this.updateAll(shouldBump, shouldScrollGrades);
    });
  },

  updateAll(anim = false, scrollGrades = false) {
    this.save();

    const stats = calculateStats(this.grades);

    setText("regularAvgUI", stats.avgR.toFixed(2));
    setText("examAvgUI", stats.avgE.toFixed(2));
    setText("preciseAvgUI", stats.final.toFixed(2));
    this.renderResultCalculation(stats);
    // countUI and chartHint removed — keep UI minimal

    const hasGrades = this.grades.length > 0;
    const resultToggle = document.querySelector(".result-details-toggle");
    const exportButton = document.querySelector(".export-action");
    const emptyResultIllustration = qs("emptyResultIllustration");
    if (resultToggle) {
      resultToggle.disabled = !hasGrades;
      resultToggle.setAttribute("aria-disabled", String(!hasGrades));
    }
    if (exportButton) {
      exportButton.disabled = !hasGrades;
      exportButton.setAttribute("aria-disabled", String(!hasGrades));
    }

    const avgLarge = qs("avgLarge");
    if (avgLarge) avgLarge.hidden = !hasGrades;
    if (emptyResultIllustration) emptyResultIllustration.hidden = hasGrades;
    if (avgLarge) {
      const num = avgLarge.querySelector?.(".large-number");
      if (num)
        num.textContent = hasGrades ? String(Math.round(stats.final)) : "";
      else
        avgLarge.textContent = hasGrades ? String(Math.round(stats.final)) : "";
      const labelEl = avgLarge.querySelector?.(".label-small");
      if (labelEl)
        labelEl.textContent = hasGrades ? gradeLabel(stats.final) : "";
      avgLarge.className = "large";
      if (anim && hasGrades) this.bump(avgLarge);
    }

    setText(
      "avgDetail",
      this.grades.length
        ? `Сатҳ: ${gradeLabel(stats.final)}`
        : "Баллҳоро ворид кунед",
    );

    setText(
      "minaiQuarterResult",
      this.grades.length ? stats.final.toFixed(2) : "—",
    );
    setText(
      "minaiStudentLevel",
      this.grades.length ? gradeLabel(stats.final) : "—",
    );
    const trend = getTrend(this.grades);
    const progressMessage =
      trend === "беҳтар шуда истодааст"
        ? "Аз рӯйи баллҳои воридшуда хонанда пешравӣ карда истодааст."
        : trend === "паст шуда истодааст"
          ? "Аз рӯйи баллҳои воридшуда сатҳи таҳсили хонанда паст шуда истодааст."
          : trend === "устувор аст"
            ? "Аз рӯйи баллҳои воридшуда дар хонанда ягон тағйирот дида нашудааст."
            : "Барои хулоса баровардани сатҳи пешравии хонанда маълумоти воридшуда кам аст.";
    setText("minaiProgress", progressMessage);

    const blocksContainer = qs("blocksContainer");
    renderGradeBlocks(blocksContainer, this.grades, GRADE_LABELS, (id) =>
      this.toggleGrade(id),
    );
    if (scrollGrades && blocksContainer) {
      requestAnimationFrame(() => {
        blocksContainer.scrollTo({
          top: blocksContainer.scrollHeight - blocksContainer.clientHeight,
          behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        });
      });
    }
    const gradesToggle = document.querySelector(".grades-toggle");
    if (gradesToggle) {
      const hasOverflow = Boolean(
        blocksContainer &&
        blocksContainer.scrollHeight > blocksContainer.clientHeight + 1,
      );
      const isCompactView = window.innerWidth <= 520;
      const expandedState = Boolean(
        blocksContainer &&
        blocksContainer.classList.contains("grades-expanded"),
      );
      const shouldShowToggle =
        isCompactView &&
        this.grades.length > 0 &&
        (hasOverflow || expandedState);

      gradesToggle.classList.toggle("is-visible", shouldShowToggle);
      gradesToggle.disabled = !shouldShowToggle;
      gradesToggle.setAttribute("aria-hidden", String(!shouldShowToggle));
      gradesToggle.style.opacity = shouldShowToggle ? "1" : "0";
      gradesToggle.style.visibility = shouldShowToggle ? "visible" : "hidden";
      gradesToggle.style.pointerEvents = shouldShowToggle ? "auto" : "none";

      if (!shouldShowToggle) {
        gradesToggle.setAttribute("aria-expanded", "false");
        if (blocksContainer) {
          blocksContainer.classList.remove("grades-expanded");
          blocksContainer.style.height = this.grades.length ? "168px" : "100%";
        }
      }
    }
    renderGradeChart(qs("gradeChart"), this.grades);
    this.percentUpdate();
  },

  bump(element) {
    const number = element.querySelector?.(".large-number");
    if (number) {
      number.classList.add("scrolling");
      setTimeout(() => number.classList.remove("scrolling"), 100);
      return;
    }

    element.classList.add("bump");
    setTimeout(() => element.classList.remove("bump"), 220);
  },

  setPupilTotal() {
    const input = qs("pupilCountInput");
    let total = clamp(toInt(input?.value, 0), 0, 100);

    if (input && Number(input.value) > 100) {
      input.value = "100";
      this.toast.show("Шумораи хонандагон максимум 100 хонанда.");
    }

    const previousTotal = this.pct.total;
    this.pct.total = total;

    if (total < previousTotal) {
      let used = 0;
      for (let g = 1; g <= 10; g += 1) {
        used += toInt(this.pct.counts[g], 0);
      }

      if (used > total) {
        let excess = used - total;
        for (let g = 10; g >= 1 && excess > 0; g -= 1) {
          const current = toInt(this.pct.counts[g], 0);
          const reduce = Math.min(current, excess);
          this.pct.counts[g] = current - reduce;
          excess -= reduce;
        }
        this.toast.show(
          "Шумораи баллҳо бояд баробар ё камтар аз шумораи хонандагон бошад.",
        );
      }
    }

    this.percentUpdate();
    this.save();
  },

  setGradeCount(input) {
    const grade = Number(input.dataset.grade);
    const total = this.pct.total;

    if (total <= 0) {
      input.value = "";
      this.toast.show("Аввал шумораи умумии хонандагонро нависед.");
      return;
    }

    let otherSum = 0;
    for (let g = 1; g <= 10; g += 1) {
      if (g === grade) continue;
      otherSum += toInt(this.pct.counts[g], 0);
    }

    const maxValue = Math.max(0, total - otherSum);
    let value = clamp(toInt(input.value, 0), 0, maxValue);

    if (Number(input.value) > maxValue) {
      input.value = String(value);
      this.toast.show(
        "Шумораи баллҳо наметавонад аз шумораи умумии хонандагон зиёд бошад.",
      );
    }

    this.pct.counts[grade] = value;
    this.percentUpdate();
    this.save();
  },

  buildPercentDistribution(total) {
    const distribution = [];
    let floorSum = 0;

    for (let grade = 10; grade >= 1; grade -= 1) {
      const count = toInt(this.pct.counts[grade], 0);
      const exactPct = total ? (count / total) * 100 : 0;
      const floorPct = Math.floor(exactPct);
      distribution.push({
        grade,
        count,
        exactPct,
        floorPct,
        remainder: exactPct - floorPct,
      });
      floorSum += floorPct;
    }

    let remainder = 100 - floorSum;
    const byRemainder = distribution
      .slice()
      .filter((item) => item.count > 0)
      .sort((a, b) => {
        if (b.remainder !== a.remainder) return b.remainder - a.remainder;
        if (b.count !== a.count) return b.count - a.count;
        return b.grade - a.grade;
      });

    const percentMap = {};
    for (const item of distribution) {
      percentMap[item.grade] = item.floorPct;
    }

    for (const item of byRemainder) {
      if (remainder <= 0) break;
      percentMap[item.grade] += 1;
      remainder -= 1;
    }

    return percentMap;
  },

  percentUpdate() {
    const total = this.pct.total || 0;
    setInputValue("pupilCountInput", total || "");

    let used = 0;
    let range7to10 = 0;
    let range4to10 = 0;
    let weighted = 0;

    for (let grade = 10; grade >= 1; grade -= 1) {
      const value = toInt(this.pct.counts[grade], 0);
      used += value;
      if (grade >= 7) range7to10 += value;
      if (grade >= 4) range4to10 += value;
      weighted += grade * value;
      setInputValue(`gradeCount${grade}`, value || "");
    }

    const percentMap =
      total && used === total ? this.buildPercentDistribution(total) : null;
    const average = total && used === total ? weighted / used : 0;
    const left = Math.max(0, total - used);

    for (let grade = 10; grade >= 1; grade -= 1) {
      setText(`gradePct${grade}`, percentMap ? `${percentMap[grade]}%` : "-");
    }

    setText(
      "range7to10UI",
      percentMap ? `${Math.round((range7to10 / total) * 100)}%` : "-",
    );
    setText(
      "range4to10UI",
      percentMap ? `${Math.round((range4to10 / total) * 100)}%` : "-",
    );
    setText("percentAverageUI", percentMap ? average.toFixed(2) : "-");
    setText("percentUsedUI", used);
    setText("percentLeftUI", left);
    setText("percentMinaiStatus", this.getPercentClassStatus().message);
  },

  getPercentClassStatus() {
    const total = toInt(this.pct.total, 0);
    const counts = Array.from({ length: 10 }, (_, index) => ({
      grade: index + 1,
      count: toInt(this.pct.counts[index + 1], 0),
    }));
    const used = counts.reduce((sum, item) => sum + item.count, 0);

    if (total <= 0) {
      return {
        complete: false,
        missing: null,
        level: "",
        message:
          "Шумораи умумии хонандагонро ворид кунед, баъд шумораи баллҳоро пур намоед.",
      };
    }

    const missing = Math.max(0, total - used);
    if (used < total) {
      return {
        complete: false,
        missing,
        level: "",
        message: `Барои он ки сатҳи синфро барои шумо муайян кунам, лутфан шумораи ҳамаи баллҳоро дуруст ва пурра ворид кунед. Шумораи баллҳои вориднашуда: ${missing}.`,
      };
    }

    if (used > total) {
      return {
        complete: false,
        missing: 0,
        level: "",
        message:
          "Шумораи баллҳои воридшуда аз шумораи умумии хонандагон зиёд аст. Маълумотро санҷед.",
      };
    }

    const groups = [
      {
        level: "аъло",
        count: counts
          .filter((item) => item.grade >= 8)
          .reduce((sum, item) => sum + item.count, 0),
      },
      {
        level: "миёна",
        count: counts
          .filter((item) => item.grade >= 6 && item.grade <= 7)
          .reduce((sum, item) => sum + item.count, 0),
      },
      {
        level: "паст",
        count: counts
          .filter((item) => item.grade <= 5)
          .reduce((sum, item) => sum + item.count, 0),
      },
    ];
    const highestCount = Math.max(...groups.map((group) => group.count));
    const leaders = groups.filter((group) => group.count === highestCount);

    if (leaders.length !== 1) {
      return {
        complete: true,
        missing: 0,
        level: "",
        message:
          "Шумораи баллҳои гурӯҳҳо баробар аст; сатҳи ягонаи синфро муайян кардан имкон надорад.",
      };
    }

    const level = leaders[0].level;
    return {
      complete: true,
      missing: 0,
      level,
      message: `Сатҳи таҳсили синф дар ин фан ${level} аст.`,
    };
  },

  openPercentExport() {
    const status = this.getPercentClassStatus();
    if (!status.complete) {
      this.showIncompletePercentExportToast(status);
      return;
    }

    const modal = qs("percentExportModal");
    modal?.classList.add("open");
    setTimeout(() => qs("percentExportClass")?.focus(), 80);
  },

  closePercentExport() {
    qs("percentExportModal")?.classList.remove("open");
  },

  showIncompletePercentExportToast(status = this.getPercentClassStatus()) {
    const total = toInt(this.pct.total, 0);
    const used = Object.values(this.pct.counts || {}).reduce(
      (sum, value) => sum + toInt(value, 0),
      0,
    );
    const missing = status.missing ?? Math.max(0, total - used);
    this.toast.show(
      `Барои натиҷаро эскорт гирифтан, шумо бояд шумораи баллҳоро пурра ворид кунед, баллҳои вориднашуда: ${missing}.`,
    );
  },

  async exportPercentCanvas() {
    const status = this.getPercentClassStatus();
    if (!status.complete) {
      this.showIncompletePercentExportToast(status);
      return;
    }

    const classValue = clean(qs("percentExportClass")?.value || "", 2);
    const teacher = clean(qs("percentExportTeacher")?.value || "");
    const schoolValue = clean(qs("percentExportSchool")?.value || "");
    const subject = clean(qs("percentExportSubject")?.value || "");
    const classNumber = Number(classValue);
    const schoolNumber = Number(schoolValue);

    if (!classValue || !teacher || !schoolValue || !subject) {
      this.toast.show("Лутфан ҳамаи маълумоти экспортро пур кунед.");
      return;
    }

    if (!Number.isInteger(classNumber) || classNumber < 1 || classNumber > 11) {
      this.toast.show("Синф бояд байни 1 ва 11 бошад.");
      return;
    }

    if (!Number.isInteger(schoolNumber) || schoolNumber < 1) {
      this.toast.show("Рақами мактабро дуруст ворид кунед.");
      return;
    }

    let canvas;
    let blob;
    try {
      canvas = await this.percentCanvas({
        classNumber,
        teacher,
        schoolNumber,
        subject,
      });
      if (canvas) blob = await canvasToPngBlob(canvas);
    } catch (error) {
      console.error("Percentage export failed:", error);
      this.toast.show("Экспорт иҷро нашуд. Бори дигар кӯшиш кунед.");
      return;
    }

    if (!canvas) {
      this.toast.show("Сохтани расми экспортшуда иҷро нашуд.");
      return;
    }

    if (!blob) {
      this.toast.show("Экспорт иҷро нашуд. Бори дигар кӯшиш кунед.");
      return;
    }

    const link = document.createElement("a");
    const fileName = `Фоизҳои-синфи-${classNumber}.png`;
    const canUseFileShare =
      typeof File === "function" &&
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function";

    if (!("download" in link)) {
      if (!canUseFileShare) {
        this.toast.show("Ин браузер файлро экспорт карда наметавонад.");
        return;
      }

      const file = new File([blob], fileName, { type: "image/png" });
      if (!navigator.canShare({ files: [file] })) {
        this.toast.show("Ин браузер файлро экспорт карда наметавонад.");
        return;
      }

      try {
        await navigator.share({ files: [file], title: fileName });
      } catch (error) {
        if (error.name === "AbortError") return;
        console.error("Percentage export sharing failed:", error);
        this.toast.show("Экспорт иҷро нашуд. Бори дигар кӯшиш кунед.");
        return;
      }
      this.closePercentExport();
      this.toast.show("Фоизҳои синф экспорт шуданд.");
      return;
    }

    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    setTimeout(() => {
      link.remove();
      URL.revokeObjectURL(url);
    }, 60000);
    this.closePercentExport();
    this.toast.show("Фоизҳои синф экспорт шуданд.");
  },

  ensureInfo() {
    if (!this.grades.length) return;

    openInfoModal(
      qs("infoModal"),
      qs("modalPupilInput"),
      qs("modalSubjectInput"),
    );
  },

  closeModal() {
    closeInfoModal(qs("infoModal"));
  },

  saveModalInfo() {
    const pupil = clean(qs("modalPupilInput")?.value || "");
    const subject = clean(qs("modalSubjectInput")?.value || "");
    const gradeValue = clean(qs("modalGradeInput")?.value || "");
    const grade = Number(gradeValue);

    if (!pupil || !subject || !gradeValue) {
      this.toast.show("Ном, фан ва синфро пур кунед.");
      return;
    }

    if (!Number.isInteger(grade) || grade < 1 || grade > 11) {
      this.toast.show("Синф бояд байни 1 ва 11 бошад.");
      return;
    }

    this.closeModal();
    this.save();
    this.exportResult();
  },

  async exportResult() {
    const canvas = await this.resultCanvas();
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png", 0.96),
    );

    if (!blob) {
      this.toast.show("Экспорт иҷро нашуд. Бори дигар кӯшиш кунед.");
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "Чоряк-by-Abdughafur.png";
    document.body.append(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.toast.show("Натиҷа экспорт шуд.");
  },

  async resultCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;

    const ctx = canvas.getContext("2d");
    const stats = calculateStats(this.grades);
    const pupil = clean(qs("modalPupilInput")?.value || "");
    const subject = clean(qs("modalSubjectInput")?.value || "");
    const gradeValue = clean(qs("modalGradeInput")?.value || "");
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    const exportStamp = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const ink = "#102a43";
    const muted = "#6b7f8c";
    const primary = "#0a84ff";
    const line = "#dce8ee";
    const canvasBg = "#f4f8fb";
    const centerText = (text, x, y) => {
      ctx.textAlign = "center";
      ctx.fillText(text, x, y);
      ctx.textAlign = "left";
    };

    ctx.fillStyle = canvasBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = ink;
    ctx.font = "900 58px Arial";

    const appIcon = new Image();
    appIcon.src = "assets/images/pics/logo.png";
    await new Promise((resolve) => {
      appIcon.onload = resolve;
      appIcon.onerror = resolve;
    });
    if (appIcon.complete && appIcon.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      roundRect(ctx, 100, 35, 96, 96, 22);
      ctx.clip();
      ctx.drawImage(appIcon, 100, 35, 96, 96);
      ctx.restore();
    }

    ctx.fillText("Чоряк", 225, 108);

    ctx.fillStyle = muted;
    ctx.font = "700 22px Arial";
    ctx.textAlign = "right";
    ctx.fillText(`Экспорт: ${exportStamp}`, 980, 105);
    ctx.textAlign = "left";

    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(80, 150);
    ctx.lineTo(1000, 150);
    ctx.stroke();

    roundRect(ctx, 80, 180, 920, 300, 30);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = muted;
    ctx.font = "900 20px Arial";
    centerText("МАЪЛУМОТИ ХОНАНДА", 540, 235);

    ctx.fillStyle = ink;
    ctx.font = "700 30px Arial";
    centerText(`Ному насаб: ${pupil || "—"}`, 540, 315);
    centerText(`Фан: ${subject || "—"}`, 540, 370);
    centerText(`Синф: ${gradeValue || "—"}`, 540, 425);

    roundRect(ctx, 80, 520, 920, 400, 30);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = primary;
    ctx.font = "900 24px Arial";
    centerText("НАТИҶАИ ЧОРЯК", 540, 610);

    ctx.fillStyle = ink;
    ctx.font = "900 170px Arial";
    centerText(String(Math.round(stats.final)), 540, 765);

    ctx.fillStyle = muted;
    ctx.font = "700 28px Arial";
    centerText(`Сатҳ: ${gradeLabel(stats.final)}`, 540, 835);

    roundRect(ctx, 80, 960, 920, 800, 30);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = muted;
    ctx.font = "900 21px Arial";
    centerText("МИҚДОРИ БАЛЛҲОИ ГИРИФТАШУДА", 540, 1050);

    const gradeCounts = {};
    for (let g = 1; g <= 10; g++) gradeCounts[g] = 0;
    this.grades.forEach((g) => {
      if (gradeCounts[g.val] !== undefined) {
        gradeCounts[g.val]++;
      }
    });

    for (let r = 0; r < 5; r++) {
      const yStart = 1120 + r * 105;

      const grade1 = 10 - r;
      const count1 = gradeCounts[grade1] || 0;

      roundRect(ctx, 270, yStart, 72, 42, 11);
      ctx.fillStyle = "#e8f5f9";
      ctx.fill();
      ctx.strokeStyle = "#cfe3eb";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = ink;
      ctx.font = "900 23px Arial";
      centerText(String(grade1), 306, yStart + 29);

      ctx.fillStyle = muted;
      ctx.font = "700 25px Arial";
      centerText(`${count1} то`, 405, yStart + 29);

      const grade2 = 5 - r;
      const count2 = gradeCounts[grade2] || 0;

      roundRect(ctx, 650, yStart, 72, 42, 11);
      ctx.fillStyle = "#e8f5f9";
      ctx.fill();
      ctx.strokeStyle = "#cfe3eb";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = ink;
      ctx.font = "900 23px Arial";
      centerText(String(grade2), 686, yStart + 29);

      ctx.fillStyle = muted;
      ctx.font = "700 25px Arial";
      centerText(`${count2} то`, 785, yStart + 29);
    }

    return canvas;
  },

  async percentCanvas({ classNumber, teacher, schoolNumber, subject }) {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1620;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const ink = "#102a43";
    const muted = "#6b7f8c";
    const primary = "#0a84ff";
    const line = "#dce8ee";
    const background = "#f4f8fb";
    const total = toInt(this.pct.total, 0);
    const percentageMap = this.buildPercentDistribution(total);
    const date = new Date().toLocaleDateString("tg-TJ");
    const drawWrappedText = (text, x, y, maxWidth, lineHeight) => {
      const words = String(text).split(/\s+/);
      let lineText = "";
      let lineY = y;

      words.forEach((word) => {
        const nextLine = lineText ? `${lineText} ${word}` : word;
        if (lineText && ctx.measureText(nextLine).width > maxWidth) {
          ctx.fillText(lineText, x, lineY);
          lineText = word;
          lineY += lineHeight;
        } else {
          lineText = nextLine;
        }
      });

      if (lineText) ctx.fillText(lineText, x, lineY);
      return lineY;
    };
    const drawCard = (x, y, width, height) => {
      roundRect(ctx, x, y, width, height, 28);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = line;
      ctx.lineWidth = 2;
      ctx.stroke();
    };

    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const appIcon = new Image();
    const appIconLoaded = new Promise((resolve) => {
      appIcon.onload = resolve;
      appIcon.onerror = resolve;
    });
    appIcon.src = "assets/images/pics/logo.png";
    if (!appIcon.complete) await appIconLoaded;
    if (appIcon.complete && appIcon.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      roundRect(ctx, 80, 42, 88, 88, 20);
      ctx.clip();
      ctx.drawImage(appIcon, 80, 42, 88, 88);
      ctx.restore();
    }

    ctx.fillStyle = ink;
    ctx.font = "900 52px Arial";
    ctx.fillText("Фоизҳои синф", 195, 106);
    ctx.fillStyle = muted;
    ctx.font = "700 22px Arial";
    ctx.textAlign = "right";
    ctx.fillText(`Сана: ${date}`, 990, 101);
    ctx.textAlign = "left";
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(70, 145);
    ctx.lineTo(1010, 145);
    ctx.stroke();

    drawCard(70, 175, 940, 510);
    ctx.fillStyle = primary;
    ctx.font = "900 24px Arial";
    ctx.fillText("МАЪЛУМОТИ СИНФ", 115, 225);

    ctx.strokeStyle = line;
    ctx.beginPath();
    ctx.moveTo(690, 225);
    ctx.lineTo(690, 635);
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.font = "700 18px Arial";
    ctx.fillText("ШУМОРАИ ХОНАНДАГОН", 730, 275);
    ctx.fillStyle = ink;
    ctx.font = "900 76px Arial";
    ctx.fillText(String(total), 730, 370);

    let infoY = 260;
    const drawInfoField = (label, value) => {
      ctx.fillStyle = muted;
      ctx.font = "700 18px Arial";
      ctx.fillText(label, 115, infoY);
      ctx.fillStyle = ink;
      ctx.font = "700 26px Arial";
      infoY = drawWrappedText(String(value), 115, infoY + 36, 520, 32) + 38;
    };
    drawInfoField("СИНФ", classNumber);
    drawInfoField("РОҲБАРИ СИНФ", teacher);
    drawInfoField("РАҚАМИ МАКТАБ", schoolNumber);
    drawInfoField("ФАН", subject);

    drawCard(70, 715, 940, 660);
    ctx.fillStyle = primary;
    ctx.font = "900 24px Arial";
    ctx.fillText("ТАҚСИМОТИ БАЛЛҲО", 115, 765);
    ctx.fillStyle = muted;
    ctx.font = "900 20px Arial";
    ctx.fillText("БАЛЛ", 150, 815);
    ctx.fillText("ШУМОРА", 480, 815);
    ctx.fillText("ФОИЗ", 790, 815);
    ctx.strokeStyle = line;
    ctx.beginPath();
    ctx.moveTo(115, 835);
    ctx.lineTo(965, 835);
    ctx.stroke();

    for (let grade = 10; grade >= 1; grade -= 1) {
      const y = 875 + (10 - grade) * 50;
      if (grade % 2 === 0) {
        roundRect(ctx, 115, y - 29, 850, 42, 10);
        ctx.fillStyle = "#f1f7fa";
        ctx.fill();
      }
      ctx.fillStyle = ink;
      ctx.font = "900 23px Arial";
      ctx.fillText(String(grade), 160, y);
      ctx.font = "700 23px Arial";
      ctx.fillText(String(toInt(this.pct.counts[grade], 0)), 500, y);
      ctx.fillText(percentageMap ? `${percentageMap[grade]}%` : "—", 810, y);
    }

    const range7to10 = [7, 8, 9, 10].reduce(
      (sum, grade) => sum + toInt(this.pct.counts[grade], 0),
      0,
    );
    const range4to10 = [4, 5, 6, 7, 8, 9, 10].reduce(
      (sum, grade) => sum + toInt(this.pct.counts[grade], 0),
      0,
    );
    const summaryY = 1400;
    drawCard(70, summaryY, 940, 170);
    ctx.fillStyle = primary;
    ctx.font = "900 24px Arial";
    ctx.strokeStyle = line;
    ctx.beginPath();
    ctx.moveTo(540, summaryY + 65);
    ctx.lineTo(540, summaryY + 145);
    ctx.stroke();

    [
      { label: "7–10", count: range7to10, x: 305 },
      { label: "4–10", count: range4to10, x: 775 },
    ].forEach(({ label, count, x }) => {
      ctx.textAlign = "center";
      ctx.fillStyle = muted;
      ctx.font = "900 20px Arial";
      ctx.fillText(`БАЛЛҲОИ ${label}`, x, summaryY + 86);
      ctx.fillStyle = ink;
      ctx.font = "900 34px Arial";
      ctx.fillText(`${Math.round((count / total) * 100)}%`, x, summaryY + 128);
      ctx.fillStyle = muted;
      ctx.font = "700 17px Arial";
      ctx.fillText(`${count} хонанда`, x, summaryY + 153);
    });
    ctx.textAlign = "left";

    return canvas;
  },


};
