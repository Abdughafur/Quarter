import { qs, setChecked, setText } from "../../../utils/helpers.js";

export const settingsFeature = {
  setTheme(theme) {
    if (!["light", "dark", "system"].includes(theme)) return;
    this.settings.theme = theme;
    this.applySettings();
    this.save();
  },

  toggleTheme(value) {
    this.setTheme(
      typeof value === "string"
        ? value
        : this.settings.theme === "dark"
          ? "light"
          : "dark",
    );
  },

  toggleSound(value) {
    if (typeof value === "boolean") {
      this.settings.sound = value;
    } else {
      const toggle = qs("soundToggle");
      this.settings.sound = toggle ? toggle.checked : !this.settings.sound;
    }
    this.save();
    if (this.settings.sound) this.tone(680, "sine", 0.06);
  },

  toggleVibration(value) {
    this.settings.vibration =
      typeof value === "boolean" ? value : !this.settings.vibration;
    this.save();
  },

  toggleDiagram(value) {
    if (typeof value === "boolean") {
      this.settings.diagram = value;
    } else {
      const toggle = qs("diagramToggle");
      this.settings.diagram = toggle ? toggle.checked : !this.settings.diagram;
    }
    this.applySettings();
    this.save();
  },

  setUiKit(value, { commit = true } = {}) {
    const levels = ["low", "medium", "perfect"];
    const normalizedValue = Math.max(0, Math.min(100, Number(value)));
    const level = levels[Math.round(normalizedValue / 50)];
    if (!level) return;

    this.settings.uiKit = level;
    this.applySettings({ preserveUiKitRange: !commit });
    if (commit) this.save();
  },

  toggleMinaiCalculator(value) {
    this.settings.minaiCalculator =
      typeof value === "boolean" ? value : !this.settings.minaiCalculator;
    this.applySettings();
    this.save();
  },

  toggleMinaiPercent(value) {
    this.settings.minaiPercent =
      typeof value === "boolean" ? value : !this.settings.minaiPercent;
    this.applySettings();
    this.save();
  },

  toggleFS(value) {
    if (typeof value === "boolean") {
      this.settings.fs = value;
    } else {
      const toggle = qs("fsToggle");
      this.settings.fs = toggle ? toggle.checked : !this.settings.fs;
    }
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

  applySettings({ preserveUiKitRange = false } = {}) {
    const root = document.documentElement;
    const body = document.body;
    const themeSetting = this.settings?.theme || "light";
    const theme =
      themeSetting === "system"
        ? this.systemThemeQuery?.matches
          ? "dark"
          : "light"
        : themeSetting;
    const diagram = this.settings?.diagram === false ? "off" : "on";

    if (body) {
      body.dataset.theme = theme;
      body.style.colorScheme = theme;
    }

    if (root) {
      root.dataset.theme = theme;
      root.dataset.diagram = diagram;
      root.dataset.uiKit = this.settings.uiKit || "medium";
      root.dataset.minaiCalculator = this.settings.minaiCalculator
        ? "on"
        : "off";
      root.dataset.minaiPercent = this.settings.minaiPercent ? "on" : "off";
      root.style.colorScheme = theme;
    }

    setChecked("soundToggle", this.settings.sound);
    setChecked("vibrationToggle", this.settings.vibration);
    setChecked("fsToggle", this.settings.fs);
    setChecked("diagramToggle", this.settings.diagram);
    setChecked("minaiCalculatorToggle", this.settings.minaiCalculator);
    setChecked("minaiPercentToggle", this.settings.minaiPercent);
    const uiKitIndex = ["low", "medium", "perfect"].indexOf(
      this.settings.uiKit,
    );
    const uiKitRange = qs("uiKitRange");
    if (uiKitRange && !preserveUiKitRange) {
      uiKitRange.value = String(Math.max(uiKitIndex, 0) * 50);
    }
    const rangeProgress = uiKitRange
      ? Number(uiKitRange.value)
      : Math.max(uiKitIndex, 0) * 50;
    uiKitRange?.style.setProperty("--range-progress", `${rangeProgress}%`);
    const rangeLevel = Math.round(rangeProgress / 50);
    setText("uiKitValue", ["Сабук", "Миёна", "Олӣ"][rangeLevel]);
    uiKitRange?.setAttribute(
      "aria-valuetext",
      ["Сабук", "Миёна", "Олӣ"][rangeLevel],
    );
    document.querySelectorAll(".theme-option").forEach((button) => {
      const selected = button.dataset.themeValue === themeSetting;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
      if (selected) {
        qs("themeOptions")?.style.setProperty(
          "--theme-offset",
          `${[...button.parentElement.children].indexOf(button) * 100}%`,
        );
      }
    });

    const themeColor = theme === "dark" ? "#000000" : "#06b6d4";
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", themeColor);
    document
      .querySelector('meta[name="msapplication-navbutton-color"]')
      ?.setAttribute("content", themeColor);
    document
      .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
      ?.setAttribute(
        "content",
        theme === "dark" ? "black-translucent" : "default",
      );
  },


};
