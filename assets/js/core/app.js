import { renderMinAI } from "../ai/minai.js";
import { calculateStats, gradeLabel, GRADE_LABELS } from "./stats.js";
import { loadState, saveState } from "./storage.js";
import {
  buildKeypad,
  buildPercentRows,
  renderGradeBlocks,
  renderGradeChart,
} from "../ui/chart.js";
import { closeInfoModal, openInfoModal } from "../ui/modal.js";
import { Toast } from "../ui/toast.js";
import {
  clean,
  clamp,
  qs,
  roundRect,
  setChecked,
  setInputValue,
  setText,
  toInt,
  uid,
  whenReady,
} from "../utils/helpers.js";

export const app = {
  grades: [],
  pct: { total: 0, counts: {} },
  settings: {},
  audioCtx: null,
  toast: new Toast(),
  updateFrame: null,
  shouldBump: false,
  initialized: false,

  init() {
    if (this.initialized) return;
    this.initialized = true;

    const state = loadState();
    this.grades = state.grades;
    this.pct = state.pct;
    this.settings = state.settings;

    this.bind(state.info);
    this.buildKeypad();
    this.buildPercentRows();
    this.applySettings();
    this.updateAll();

    setTimeout(() => qs("loader")?.classList.add("hide"), 250);
  },

  bind(info = {}) {
    setInputValue("modalPupilInput", info.pupil || "");
    setInputValue("modalSubjectInput", info.subject || "");

    document.addEventListener("click", (event) => {
      const actionButton = event.target.closest("[data-action]");
      if (actionButton) this.action(actionButton.dataset.action);

      const tabButton = event.target.closest("[data-tab]");
      if (tabButton) this.nav(tabButton.dataset.tab, tabButton);
    });

    qs("pupilCountInput")?.addEventListener("input", () =>
      this.setPupilTotal(),
    );
    document.addEventListener("keydown", (event) => this.keyboard(event));
  },

  action(name) {
    const actions = {
      deleteLast: () => this.deleteLast(),
      clearAll: () => this.clearAll(),
      downloadResult: () => this.ensureInfo(),
      closeModal: () => this.closeModal(),
      saveModalInfo: () => this.saveModalInfo(),
      toggleTheme: () => this.toggleTheme(),
      toggleSound: () => this.toggleSound(),
      toggleFS: () => this.toggleFS(),
      togglePerformance: () => this.togglePerformance(),
      toggleSimple: () => this.toggleSimple(),
    };

    actions[name]?.();
  },

  keyboard(event) {
    const isInput = ["INPUT", "TEXTAREA"].includes(
      document.activeElement?.tagName,
    );
    const key = event.key.toLowerCase();

    if (isInput && key !== "escape") return;

    if (/^[1-9]$/.test(key)) {
      event.preventDefault();
      this.add(Number(key));
    } else if (key === "0") {
      event.preventDefault();
      this.add(10);
    } else if (key === "backspace") {
      event.preventDefault();
      this.deleteLast();
    } else if (key === "c") {
      event.preventDefault();
      this.clearAll();
    } else if (key === "e") {
      event.preventDefault();
      this.toggleLast();
    } else if (key === "h") {
      this.nav("tab-home");
    } else if (key === "s") {
      this.nav("tab-more");
    } else if (!this.settings.simple && key === "p") {
      this.nav("tab-prosent");
    } else if (!this.settings.simple && key === "m") {
      this.nav("tab-ai");
    } else if (key === "escape") {
      this.closeModal();
    }
  },

  buildKeypad() {
    buildKeypad(qs("keypad"), {
      onAdd: (value) => this.add(value),
      onDelete: () => this.deleteLast(),
      onClear: () => this.clearAll(),
    });
  },

  buildPercentRows() {
    buildPercentRows(qs("percentRows"), GRADE_LABELS, (input) =>
      this.setGradeCount(input),
    );
  },

  add(value) {
    if (this.grades.length >= 50) {
      this.toast.show("Максимум 50 балл.");
      return;
    }

    this.grades.push({
      val: clamp(value, 1, 10),
      type: "regular",
      id: uid(),
    });

    this.tone(450 + value * 30);
    this.scheduleUpdate(true);
  },

  deleteLast() {
    if (!this.grades.length) {
      this.toast.show("Ҳоло ягон балл нест.");
      return;
    }

    this.grades.pop();
    this.scheduleUpdate(true);
  },

  clearAll() {
    if (!this.grades.length) {
      this.toast.show("Ҳоло ягон балл нест.");
      return;
    }

    this.grades = [];
    this.scheduleUpdate(true);
    this.toast.show("Ҳама баллҳо тоза шуданд.");
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
    this.toast.show(
      grade.type === "exam"
        ? "Навъи балл ба корҳои санҷишӣ тағйир ёфт."
        : "Навъи балл ба дарс тағйир ёфт.",
    );
  },

  scheduleUpdate(anim = false) {
    this.shouldBump = this.shouldBump || anim;

    if (this.updateFrame) return;

    this.updateFrame = requestAnimationFrame(() => {
      this.updateFrame = null;
      const shouldBump = this.shouldBump;
      this.shouldBump = false;
      this.updateAll(shouldBump);
    });
  },

  updateAll(anim = false) {
    this.save();

    const stats = calculateStats(this.grades);

    setText("countUI", this.grades.length);
    setText("regularAvgUI", stats.avgR.toFixed(2));
    setText("examAvgUI", stats.avgE.toFixed(2));
    setText("chartHint", `${stats.final.toFixed(1)} / 10`);

    const avgLarge = qs("avgLarge");
    if (avgLarge) {
      avgLarge.textContent = stats.final.toFixed(2);
      avgLarge.className = `large ${stats.final >= 9.5 ? "shine" : "gradient-text"}`;
      if (anim) this.bump(avgLarge);
    }

    setText(
      "avgDetail",
      this.grades.length
        ? `Сатҳ: ${gradeLabel(stats.final)}`
        : "Баллҳоро ворид кунед",
    );

    renderGradeBlocks(qs("blocksContainer"), this.grades, GRADE_LABELS, (id) =>
      this.toggleGrade(id),
    );
    renderGradeChart(qs("gradeChart"), this.grades);
    this.percentUpdate();

    renderMinAI({
      box: qs("aiAnalysisBox"),
      text: qs("aiText"),
      grades: this.grades,
    });
  },

  bump(element) {
    element.classList.add("bump");
    setTimeout(() => element.classList.remove("bump"), 220);
  },

  setPupilTotal() {
    const input = qs("pupilCountInput");
    let total = clamp(toInt(input?.value, 0), 0, 100);

    if (input && Number(input.value) > 100) {
      input.value = "100";
      this.toast.show("Максимум 100 хонанда.");
    }

    this.pct.total = total;
    this.validatePercentCounts();
    this.percentUpdate();
    this.save();
  },

  setGradeCount(input) {
    const grade = input.dataset.grade;
    let value = clamp(toInt(input.value, 0), 0, 100);
    const total = this.pct.total;
    const other = this.percentUsed(grade);

    if (total <= 0) {
      input.value = "";
      this.toast.show("Аввал шумораи умумии хонандагонро нависед.");
      return;
    }

    if (other + value > total) {
      value = Math.max(0, total - other);
      input.value = value || "";
      this.toast.show(
        "Шумораи баллҳо аз шумораи хонандагон зиёд шуда наметавонад.",
      );
    }

    this.pct.counts[grade] = value;
    this.percentUpdate();
    this.save();
  },

  percentUsed(except = null) {
    return Object.entries(this.pct.counts).reduce((sum, [grade, value]) => {
      return sum + (String(grade) === String(except) ? 0 : toInt(value, 0));
    }, 0);
  },

  validatePercentCounts() {
    const total = this.pct.total;
    let used = 0;

    for (let grade = 10; grade >= 1; grade -= 1) {
      let value = clamp(toInt(this.pct.counts[grade], 0), 0, 100);

      if (used + value > total) {
        value = Math.max(0, total - used);
      }

      this.pct.counts[grade] = value;
      used += value;

      const input = qs(`gradeCount${grade}`);
      if (input) input.value = value || "";
    }
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
      setText(
        `gradePct${grade}`,
        total ? `${((value / total) * 100).toFixed(0)}%` : "0%",
      );
    }

    const pct7 = total ? (range7to10 / total) * 100 : 0;
    const pct4 = total ? (range4to10 / total) * 100 : 0;
    const average = used ? weighted / used : 0;
    const left = Math.max(0, total - used);

    setText("range7to10UI", `${pct7.toFixed(0)}%`);
    setText("range4to10UI", `${pct4.toFixed(0)}%`);
    setText("percentAverageUI", average.toFixed(2));
    setText("percentUsedUI", used);
    setText("percentLeftUI", left);
  },

  ensureInfo() {
    if (this.settings.simple) {
      this.toast.show("Дар Ҳолати оддӣ экспорт хомӯш аст.");
      return;
    }

    if (!this.grades.length) {
      this.toast.show("Аввал балл ворид кунед.");
      return;
    }

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

    if (!pupil || !subject) {
      this.toast.show("Ном ва фанро пур кунед.");
      return;
    }

    this.closeModal();
    this.save();
    this.exportResult();
  },

  async exportResult() {
    const canvas = this.resultCanvas();
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

  resultCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = 1290;
    canvas.height = 1800;

    const ctx = canvas.getContext("2d");
    const stats = calculateStats(this.grades);
    const pupil = clean(qs("modalPupilInput")?.value || "");
    const subject = clean(qs("modalSubjectInput")?.value || "");

    const gradient = ctx.createLinearGradient(0, 0, 1290, 1800);
    gradient.addColorStop(0, "#312e81");
    gradient.addColorStop(0.46, "#7c3aed");
    gradient.addColorStop(1, "#0ea5e9");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1290, 1800);

    for (let index = 0; index < 34; index += 1) {
      ctx.globalAlpha = 0.075;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(
        (index * 121) % 1290,
        (index * 179) % 1800,
        70 + (index % 6) * 18,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    roundRect(ctx, 80, 80, 1130, 1640, 78);
    ctx.fillStyle = "rgba(255,255,255,.17)";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,.38)";
    ctx.stroke();

    roundRect(ctx, 135, 135, 126, 126, 38);
    ctx.fillStyle = "rgba(255,255,255,.20)";
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.font = "900 76px Arial";
    ctx.fillText("Ч", 173, 225);

    ctx.font = "900 62px Arial";
    ctx.fillText("Чоряк", 288, 190);
    ctx.font = "700 34px Arial";
    ctx.fillText("Натиҷа", 288, 242);

    ctx.font = "800 46px Arial";
    ctx.fillText(`Хонанда: ${pupil}`, 135, 360);
    ctx.fillText(`Фан: ${subject}`, 135, 428);

    ctx.font = "900 225px Arial";
    ctx.fillText(stats.final.toFixed(2), 135, 700);

    ctx.font = "900 58px Arial";
    ctx.fillText(gradeLabel(stats.final), 145, 790);

    [
      { title: "Баллҳои дарсӣ", value: stats.avgR.toFixed(2) },
      { title: "Корҳои санҷишӣ", value: stats.avgE.toFixed(2) },
    ].forEach((card, index) => {
      const x = 135 + index * 520;

      roundRect(ctx, x, 880, 470, 165, 42);
      ctx.fillStyle = "rgba(255,255,255,.20)";
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,.72)";
      ctx.font = "800 34px Arial";
      ctx.fillText(card.title, x + 40, 944);

      ctx.fillStyle = "#fff";
      ctx.font = "900 70px Arial";
      ctx.fillText(card.value, x + 40, 1034);
    });

    ctx.font = "800 38px Arial";
    ctx.fillStyle = "white";
    ctx.fillText("Баллҳо", 135, 1180);

    let x = 135;
    let y = 1240;

    this.grades.forEach((grade) => {
      roundRect(ctx, x, y, 82, 82, 24);
      ctx.fillStyle = "rgba(255,255,255,.22)";
      ctx.fill();

      ctx.fillStyle = "#fff";
      ctx.font = "900 40px Arial";
      ctx.fillText(String(grade.val), x + 24, y + 54);

      x += 96;
      if (x > 1060) {
        x = 135;
        y += 96;
      }
    });

    ctx.fillStyle = "rgba(255,255,255,.88)";
    ctx.font = "700 30px Arial";
    ctx.fillText(
      "Сохташуда тавассути барномаи Чоряк v4.0 · Developer: Abdughafur",
      135,
      1652,
    );

    return canvas;
  },

  nav(id, button) {
    if (this.settings.simple && (id === "tab-prosent" || id === "tab-ai")) {
      this.toast.show("Дар Ҳолати оддӣ танҳо Таҳои Асосӣ ва Бештар фаъол аст.");
      return;
    }

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

    this.tone(600, "sine", 0.04);
  },

  toggleTheme() {
    const toggle = qs("themeToggle");
    this.settings.theme = toggle
      ? toggle.checked
        ? "dark"
        : "light"
      : this.settings.theme === "dark"
        ? "light"
        : "dark";
    this.applySettings();
    this.save();
  },

  toggleSound() {
    const toggle = qs("soundToggle");
    this.settings.sound = toggle ? toggle.checked : !this.settings.sound;
    this.save();
    this.tone(680, "sine", 0.06, true);
  },

  togglePerformance() {
    const toggle = qs("performanceToggle");
    this.settings.performance = toggle
      ? toggle.checked
      : !this.settings.performance;
    this.applySettings();
    this.save();

    this.toast.show(
      this.settings.performance
        ? "Беҳтарин Performance фаъол шуд."
        : "Беҳтарин Performance хомӯш шуд.",
    );
  },

  toggleSimple() {
    const toggle = qs("simpleToggle");
    this.settings.simple = toggle ? toggle.checked : !this.settings.simple;
    this.applySettings();
    this.save();

    if (
      this.settings.simple &&
      (qs("tab-prosent")?.classList.contains("active") ||
        qs("tab-ai")?.classList.contains("active"))
    ) {
      this.nav("tab-home");
    }

    this.toast.show(
      this.settings.simple
        ? "Ҳолати оддӣ фаъол шуд."
        : "Ҳолати оддӣ хомӯш шуд.",
    );
  },

  toggleFS() {
    const toggle = qs("fsToggle");
    this.settings.fs = toggle ? toggle.checked : !this.settings.fs;
    this.save();

    const root = document.documentElement;

    if (this.settings.fs) {
      root.requestFullscreen?.().catch(() => {
        this.settings.fs = false;
        this.applySettings();
      });
    } else if (document.fullscreenElement) {
      document.exitFullscreen?.();
    }
  },

  applySettings() {
    if (document.body) {
      document.body.dataset.theme = this.settings.theme;
      document.body.dataset.performance = this.settings.performance
        ? "on"
        : "off";
      document.body.dataset.simple = this.settings.simple ? "on" : "off";
    }

    setChecked("themeToggle", this.settings.theme === "dark");
    setChecked("soundToggle", this.settings.sound);
    setChecked("fsToggle", this.settings.fs);
    setChecked("performanceToggle", this.settings.performance);
    setChecked("simpleToggle", this.settings.simple);

    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        "content",
        this.settings.theme === "dark" ? "#030712" : "#f8fafc",
      );
  },

  save() {
    saveState({
      grades: this.grades,
      settings: this.settings,
      pct: this.pct,
      info: {
        pupil: clean(qs("modalPupilInput")?.value || ""),
        subject: clean(qs("modalSubjectInput")?.value || ""),
      },
    });
  },

  tone(freq, type = "sine", duration = 0.08, force = false) {
    if (!this.settings.sound && !force) return;

    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;
      this.audioCtx = this.audioCtx || new AudioContextClass();

      const oscillator = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      oscillator.type = type;
      oscillator.frequency.value = freq;
      gain.gain.value = 0.045;
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        this.audioCtx.currentTime + duration,
      );

      oscillator.connect(gain);
      gain.connect(this.audioCtx.destination);
      oscillator.start();
      oscillator.stop(this.audioCtx.currentTime + duration);
    } catch {
     
    }
  },
};

whenReady(() => app.init());

/*
  Сopyright (c) 2026 Abdughafur Khujzoda. All rights reserved.
  :) 
*/