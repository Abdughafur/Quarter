/* app.js */
import {
  calculateStats,
  getTrend,
  gradeLabel,
  GRADE_LABELS,
} from "./stats.js";
import {
  loadState,
  saveState,
  clearState,
} from "./storage.js";
import { promptInstallPwa } from "./pwa.js";
import {
  buildKeypad,
  buildPercentRows,
  renderGradeBlocks,
  renderGradeChart,
} from "../ui/chart.js";
import { closeInfoModal, openInfoModal } from "../ui/modal.js";
import { Toast } from "../ui/toast.js";
import { bindAvatarPicker } from "../ui/avatar-picker.js";
import {
  clean,
  clamp,
  escapeHtml,
  qs,
  roundRect,
  setChecked,
  setInputValue,
  setText,
  toInt,
  uid,
  whenReady,
} from "../utils/helpers.js";

const SHARE_URL = "https://abdughafur.github.io/Quarter/";

const setStretchState = (element, offsetX, offsetY, angle, scale) => {
  element.style.setProperty("--stretch-x", `${offsetX}px`);
  element.style.setProperty("--stretch-y", `${offsetY}px`);
  element.style.setProperty("--stretch-angle", `${angle}deg`);
  element.style.setProperty("--stretch-scale", String(scale));
  element.style.setProperty("--release-x", `${-offsetX * 0.34}px`);
  element.style.setProperty("--release-y", `${-offsetY * 0.34}px`);
  element.style.setProperty("--release-angle", `${-angle * 0.38}deg`);
  element.style.setProperty("--return-x", `${offsetX * 0.12}px`);
  element.style.setProperty("--return-y", `${offsetY * 0.12}px`);
  element.style.setProperty("--return-angle", `${angle * 0.12}deg`);
};

const clearStretchState = (element) => {
  [
    "--stretch-x",
    "--stretch-y",
    "--stretch-angle",
    "--stretch-scale",
    "--release-x",
    "--release-y",
    "--release-angle",
    "--return-x",
    "--return-y",
    "--return-angle",
  ].forEach((property) => element.style.removeProperty(property));
};

const canvasToPngBlob = (canvas) =>
  new Promise((resolve, reject) => {
    try {
      if (typeof canvas.toBlob === "function") {
        canvas.toBlob(resolve, "image/png");
        return;
      }

      const data = canvas.toDataURL("image/png").split(",", 2)[1];
      const binary = atob(data);
      const bytes = Uint8Array.from(binary, (character) =>
        character.charCodeAt(0),
      );
      resolve(new Blob([bytes], { type: "image/png" }));
    } catch (error) {
      reject(error);
    }
  });

export const app = {
  grades: [],
  pct: { total: 0, counts: {} },
  settings: {},
  audioCtx: null,
  toast: new Toast(),
  updateFrame: null,
  shouldBump: false,
  initialized: false,
  notes: [],
  tasks: [],
  selectedNoteId: null,
  editingNoteId: null,
  creatingNoteInline: false,
  noteAutosaveTimer: null,
  activeNoteId: null,
  noteHistory: [],
  noteHistoryIndex: -1,
  info: {},
  profile: {
    name: "",
    surname: "",
    school: "",
    avatar: "",
  },

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    const state = await loadState();
    this.grades = state.grades;
    this.pct = state.pct;
    this.settings = state.settings;
    this.notes = Array.isArray(state.notes) ? state.notes : [];
    this.tasks = Array.isArray(state.tasks) ? state.tasks : [];
    this.activeNoteId = null;

    document.addEventListener(
      "pointerdown",
      (event) => {
        if (
          this.settings.uiKit !== "perfect" &&
          !event.target.closest(
            ".theme-options, #uiKitRange, #profileMenu, .block",
          )
        ) {
          event.stopImmediatePropagation();
        }
      },
      true,
    );
    this.systemThemeQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;
    const handleSystemThemeChange = () => {
      if (this.settings.theme === "system") this.applySettings();
    };
    if (this.systemThemeQuery?.addEventListener) {
      this.systemThemeQuery.addEventListener("change", handleSystemThemeChange);
    } else if (this.systemThemeQuery?.addListener) {
      this.systemThemeQuery.addListener(handleSystemThemeChange);
    }

    this.bindResultDetailsToggle();
    this.bindGradesToggle();
    this.bindExportActionStretch();

    const splash = qs("splash");
    if (splash) {
      requestAnimationFrame(() => splash.classList.add("showing"));
      setTimeout(() => {
        splash.classList.add("fading");
        setTimeout(() => splash.classList.add("hide"), 420);
      }, 3000);
    }

    this.bind(state.info);
    this.info = state.info || {};
    this.profile = state.profile || this.profile;
    if (this.checkFirstRun()) return;
    this.bindProfile();
    this.updateProfileUI(this.profile);
    this.buildKeypad();
    this.buildPercentRows();
    this.applySettings();
    this.updateAll();
    this.renderNotes();

    // initialize nav highlight and draggable behavior
    this.setupNavDrag();
  },

  setupNavDrag() {
    const nav = document.querySelector("nav");
    if (!nav) return;

    const buttons = Array.from(nav.querySelectorAll(".nav-btn"));
    if (!buttons.length) return;

    const indicator = nav.querySelector(".nav-active-indicator");
    const isMobile = () =>
      (typeof window.matchMedia === "function" &&
        window.matchMedia("(max-width: 760px)").matches) ||
      window.innerWidth <= 760;
    const updateIndicator = (button) => {
      if (!indicator || !button) return;
      const navRect = nav.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      const paddingLeft = Number.parseFloat(getComputedStyle(nav).paddingLeft) || 0;
      const indicatorOrigin = navRect.left + nav.clientLeft + paddingLeft;

      indicator.style.setProperty(
        "--nav-indicator-x",
        `${buttonRect.left - indicatorOrigin}px`,
      );
      indicator.style.setProperty(
        "--nav-indicator-width",
        `${buttonRect.width}px`,
      );
    };
    const updatePosition = (button) => {
      buttons.forEach((item) => {
        const selected = item === button;
        item.classList.toggle("active", selected);
        if (selected) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
      });
      updateIndicator(button);
    };
    const active = nav.querySelector(".nav-btn.active") || buttons[0];
    updatePosition(active);
    document.body.dataset.activeTab =
      document.querySelector(".tab.active")?.id || active.dataset.tab || "";

    this.updateNavHighlight = (button) => {
      updatePosition(
        button || nav.querySelector(".nav-btn.active") || buttons[0],
      );
    };

    let pointerId = null;
    let dragging = false;
    let pendingFrame = false;
    let currentX = 0;
    let startX = 0;
    let startY = 0;
    let navRect = null;
    let buttonCenters = [];
    let suppressNextClick = false;

    const refreshButtonData = () => {
      navRect = nav.getBoundingClientRect();
      buttonCenters = buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          btn: button,
          center: rect.left - navRect.left + rect.width / 2,
        };
      });
    };
    const nearestButton = (clientX) => {
      const x = clientX - navRect.left;
      return buttonCenters.reduce((nearest, item) =>
        Math.abs(item.center - x) < Math.abs(nearest.center - x)
          ? item
          : nearest,
      );
    };
    const moveIndicator = (clientX) => {
      if (!indicator || !navRect || !buttonCenters.length) return;
      const firstButton = buttons[0].getBoundingClientRect();
      const lastButton = buttons[buttons.length - 1].getBoundingClientRect();
      const navStyle = getComputedStyle(nav);
      const paddingLeft = Number.parseFloat(navStyle.paddingLeft) || 0;
      const origin = navRect.left + nav.clientLeft + paddingLeft;
      const width = firstButton.width;
      const minX = firstButton.left - origin;
      const maxX = Math.max(minX, lastButton.right - origin - width);
      const x = Math.max(
        minX,
        Math.min(maxX, clientX - origin - width / 2),
      );
      indicator.style.setProperty("--nav-indicator-x", `${x}px`);
    };
    const canDrag = () =>
      isMobile() &&
      this.settings.uiKit === "perfect" &&
      !document.body.classList.contains("more-subview-open") &&
      !document.querySelector(
        ".modal-backdrop.open, .note-modal-backdrop.open, .avatar-picker-backdrop.open",
      );
    const startDragging = (event) => {
      dragging = true;
      nav.classList.add("is-dragging");
      refreshButtonData();
      try {
        nav.setPointerCapture(event.pointerId);
      } catch (error) {
        console.warn("Navigation drag pointer capture failed.", error);
      }
    };
    const updateDrag = () => {
      pendingFrame = false;
      if (!dragging) return;
      moveIndicator(currentX);
    };
    const onPointerDown = (event) => {
      if (!canDrag()) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (!event.target.closest(".nav-btn")) return;
      pointerId = event.pointerId;
      startX = currentX = event.clientX;
      startY = event.clientY;
      dragging = false;
      refreshButtonData();
    };
    const onPointerMove = (event) => {
      if (event.pointerId !== pointerId) return;
      if (!canDrag()) {
        pointerId = null;
        dragging = false;
        nav.classList.remove("is-dragging");
        updatePosition(
          nav.querySelector(".nav-btn.active") || buttons[0],
        );
        return;
      }
      currentX = event.clientX;
      if (!dragging) {
        const deltaX = Math.abs(currentX - startX);
        const deltaY = Math.abs(event.clientY - startY);
        if (deltaX < 8 || deltaX <= deltaY) return;
        startDragging(event);
      }
      if (!pendingFrame) {
        pendingFrame = true;
        requestAnimationFrame(updateDrag);
      }
    };
    const onPointerUp = (event) => {
      if (event.pointerId !== pointerId) return;
      const wasDragging = dragging;
      pointerId = null;
      dragging = false;
      nav.classList.remove("is-dragging");
      if (!wasDragging) return;

      try {
        if (nav.hasPointerCapture?.(event.pointerId)) {
          nav.releasePointerCapture?.(event.pointerId);
        }
      } catch (error) {
        console.warn("Navigation drag pointer release failed.", error);
      }

      if (event.type === "pointercancel" || !canDrag()) {
        updatePosition(
          nav.querySelector(".nav-btn.active") || buttons[0],
        );
        return;
      }

      refreshButtonData();
      const nearest = nearestButton(event.clientX);
      suppressNextClick = true;
      setTimeout(() => {
        suppressNextClick = false;
      }, 0);
      if (nearest.btn.dataset.tab) {
        this.nav(nearest.btn.dataset.tab, nearest.btn);
      }
    };

    nav.addEventListener("pointerdown", onPointerDown);
    nav.addEventListener(
      "click",
      (event) => {
        if (!suppressNextClick) return;
        suppressNextClick = false;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      true,
    );
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("resize", () => {
      const selected = nav.querySelector(".nav-btn.active") || buttons[0];
      updateIndicator(selected);
    });
  },

  bindResultDetailsToggle() {
    const toggle = document.querySelector(".result-details-toggle");
    if (!toggle || toggle.dataset.bound === "true") return;

    toggle.dataset.bound = "true";
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let dragged = false;

    toggle.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;

      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      dragged = false;
      toggle.classList.add("is-stretching");
      document.documentElement.classList.add("button-stretching");
      document.body.classList.add("button-stretching");
      toggle.style.transformOrigin = "center";
      toggle.style.transition =
        "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";
      toggle.style.transform = "scale(0.975)";
      try {
        toggle.setPointerCapture?.(pointerId);
      } catch (error) {}
    });

    toggle.addEventListener("pointermove", (event) => {
      if (event.pointerId !== pointerId) return;

      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      const distance = Math.hypot(deltaX, deltaY);
      if (distance > 8) dragged = true;

      const offsetX = Math.max(-3, Math.min(3, deltaX * 0.035));
      const offsetY = Math.max(-2, Math.min(2, deltaY * 0.025));
      const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
      const scale = 1 + Math.min(distance * 0.0025, 0.075);

      toggle.style.transformOrigin = "center";
      toggle.style.transition =
        "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)";
      toggle.style.transform = `translate(${offsetX}px, ${offsetY}px) rotate(${angle}deg) scaleX(${scale}) rotate(${-angle}deg)`;
      setStretchState(toggle, offsetX, offsetY, angle, scale);
    });

    const resetToggle = (event) => {
      if (event.pointerId !== pointerId) return;

      try {
        toggle.releasePointerCapture?.(pointerId);
      } catch (error) {}
      toggle.classList.remove("is-stretching");
      toggle.classList.add("is-releasing");
      document.documentElement.classList.remove("button-stretching");
      document.body.classList.remove("button-stretching");

      if (dragged) {
        toggle.dataset.dragged = "true";
        setTimeout(() => delete toggle.dataset.dragged, 0);
      }

      pointerId = null;
      setTimeout(() => {
        toggle.classList.remove("is-releasing");
        toggle.style.removeProperty("transform");
        toggle.style.removeProperty("transition");
        toggle.style.removeProperty("transform-origin");
        clearStretchState(toggle);
      }, 600);
    };

    toggle.addEventListener("pointerup", resetToggle);
    toggle.addEventListener("pointercancel", resetToggle);
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (toggle.dataset.dragged) {
        delete toggle.dataset.dragged;
        return;
      }
      this.toggleResultDetails();
    });
  },

  bindGradesToggle() {
    const toggle = document.querySelector(".grades-toggle");
    if (!toggle || toggle.dataset.bound === "true") return;

    toggle.dataset.bound = "true";
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let dragged = false;

    toggle.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;

      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      dragged = false;
      toggle.classList.add("is-stretching");
      document.documentElement.classList.add("button-stretching");
      document.body.classList.add("button-stretching");
      toggle.style.transformOrigin = "center";
      toggle.style.transition =
        "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";
      toggle.style.transform = "scale(0.98)";
      try {
        toggle.setPointerCapture?.(pointerId);
      } catch (error) {}
    });

    toggle.addEventListener("pointermove", (event) => {
      if (event.pointerId !== pointerId) return;

      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      const distance = Math.hypot(deltaX, deltaY);
      if (distance > 8) dragged = true;

      const offsetX = Math.max(-3, Math.min(3, deltaX * 0.04));
      const offsetY = Math.max(-2, Math.min(2, deltaY * 0.025));
      const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
      const scale = 1 + Math.min(distance * 0.0025, 0.075);

      toggle.style.transformOrigin = "center";
      toggle.style.transition =
        "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)";
      toggle.style.transform = `translate(${offsetX}px, ${offsetY}px) rotate(${angle}deg) scaleX(${scale}) rotate(${-angle}deg)`;
      setStretchState(toggle, offsetX, offsetY, angle, scale);
    });

    const resetToggle = (event) => {
      if (event.pointerId !== pointerId) return;

      try {
        toggle.releasePointerCapture?.(pointerId);
      } catch (error) {}
      toggle.classList.remove("is-stretching");
      toggle.classList.add("is-releasing");
      document.documentElement.classList.remove("button-stretching");
      document.body.classList.remove("button-stretching");

      if (dragged) {
        toggle.dataset.dragged = "true";
        setTimeout(() => delete toggle.dataset.dragged, 0);
      }

      pointerId = null;
      setTimeout(() => {
        toggle.classList.remove("is-releasing");
        toggle.style.removeProperty("transform");
        toggle.style.removeProperty("transition");
        toggle.style.removeProperty("transform-origin");
        clearStretchState(toggle);
      }, 600);
    };

    toggle.addEventListener("pointerup", resetToggle);
    toggle.addEventListener("pointercancel", resetToggle);
  },

  bindExportActionStretch() {
    document
      .querySelectorAll(".export-action, .percent-export-btn")
      .forEach((button) => {
        if (button.dataset.stretchBound === "true") return;

        button.dataset.stretchBound = "true";
        let pointerId = null;
        let startX = 0;
        let startY = 0;
        let dragged = false;

        button.addEventListener("pointerdown", (event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;

          pointerId = event.pointerId;
          startX = event.clientX;
          startY = event.clientY;
          dragged = false;
          button.classList.add("is-stretching");
          document.documentElement.classList.add("button-stretching");
          document.body.classList.add("button-stretching");
          button.style.transformOrigin = "center";
          button.style.transition =
            "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";
          button.style.transform = "scale(0.985)";
          try {
            button.setPointerCapture?.(pointerId);
          } catch (error) {}
        });

        button.addEventListener("pointermove", (event) => {
          if (event.pointerId !== pointerId) return;

          const deltaX = event.clientX - startX;
          const deltaY = event.clientY - startY;
          const distance = Math.hypot(deltaX, deltaY);
          if (distance > 8) dragged = true;

          const offsetX = Math.max(-4, Math.min(4, deltaX * 0.035));
          const offsetY = Math.max(-2, Math.min(2, deltaY * 0.02));
          const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
          const scale = 1 + Math.min(distance * 0.0018, 0.085);

          button.style.transformOrigin = "center";
          button.style.transition =
            "transform 120ms cubic-bezier(0.22, 1, 0.36, 1), background 180ms ease, box-shadow 180ms ease";
          button.style.transform = `translate(${offsetX}px, ${offsetY}px) rotate(${angle}deg) scaleX(${scale}) rotate(${-angle}deg)`;
          setStretchState(button, offsetX, offsetY, angle, scale);
        });

        const resetButton = (event) => {
          if (event.pointerId !== pointerId) return;

          try {
            button.releasePointerCapture?.(pointerId);
          } catch (error) {}
          button.classList.remove("is-stretching");
          button.classList.add("is-releasing");
          document.documentElement.classList.remove("button-stretching");
          document.body.classList.remove("button-stretching");

          if (dragged) {
            button.dataset.dragged = "true";
            setTimeout(() => delete button.dataset.dragged, 0);
          }

          pointerId = null;
          setTimeout(() => {
            button.classList.remove("is-releasing");
            button.style.removeProperty("transform");
            button.style.removeProperty("transition");
            button.style.removeProperty("transform-origin");
            clearStretchState(button);
          }, 600);
        };

        button.addEventListener("pointerup", resetButton);
        button.addEventListener("pointercancel", resetButton);
      });
  },

  bindChartScrollButtonStretch() {
    document.querySelectorAll(".chart-scroll-button").forEach((button) => {
      if (button.dataset.stretchBound === "true") return;
      button.dataset.stretchBound = "true";

      let pointerId = null;
      let startX = 0;
      let startY = 0;
      let moved = false;

      button.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        pointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        moved = false;
        button.classList.add("is-stretching");
        button.setPointerCapture?.(pointerId);
      });

      button.addEventListener("pointermove", (event) => {
        if (event.pointerId !== pointerId) return;
        const deltaX = event.clientX - startX;
        const deltaY = event.clientY - startY;
        const distance = Math.hypot(deltaX, deltaY);
        if (distance > 5) moved = true;
        setStretchState(
          button,
          Math.max(-5, Math.min(5, deltaX * 0.08)),
          Math.max(-3, Math.min(3, deltaY * 0.06)),
          Math.atan2(deltaY, deltaX) * (180 / Math.PI),
          1 + Math.min(distance * 0.002, 0.075),
        );
      });

      const finish = (event) => {
        if (event.pointerId !== pointerId) return;
        button.releasePointerCapture?.(pointerId);
        button.classList.remove("is-stretching");
        button.classList.add("is-releasing");
        if (moved) {
          button.dataset.dragged = "true";
          setTimeout(() => delete button.dataset.dragged, 260);
        }
        pointerId = null;
        setTimeout(() => {
          button.classList.remove("is-releasing");
          clearStretchState(button);
        }, 360);
      };

      button.addEventListener("pointerup", finish);
      button.addEventListener("pointercancel", finish);
    });
  },

  bind(info = {}) {
    setInputValue("modalPupilInput", info.pupil || "");
    setInputValue("modalSubjectInput", info.subject || "");
    setInputValue("modalGradeInput", info.grade || "");

    ["modalPupilInput", "modalSubjectInput"].forEach((fieldId) => {
      qs(fieldId)?.addEventListener("input", (event) =>
        this.sanitizeTextInput(event),
      );
    });

    qs("modalGradeInput")?.addEventListener("input", (event) => {
      const input = event.target;
      const value = String(input.value || "")
        .replace(/\D/g, "")
        .replace(/^0+(?=\d)/, "");

      if (!value) {
        input.value = "";
        return;
      }

      if (Number(value) > 11) {
        input.value = "";
        return;
      }

      input.value = value;
    });

    qs("percentExportClass")?.addEventListener("input", (event) => {
      const input = event.target;
      const value = String(input.value || "")
        .replace(/\D/g, "")
        .replace(/^0+(?=\d)/, "");
      input.value =
        value && Number(value) >= 1 && Number(value) <= 11 ? value : "";
    });

    ["percentExportTeacher", "percentExportSubject"].forEach((fieldId) => {
      qs(fieldId)?.addEventListener("input", (event) => {
        const input = event.target;
        input.value = String(input.value || "")
          .replace(/[^\p{L}\p{M}\s]/gu, "")
          .replace(/\s{2,}/g, " ")
          .trimStart();
      });
    });

    document.addEventListener("click", (event) => {
      const actionButton = event.target.closest("[data-action]");
      if (actionButton?.dataset.dragged) {
        delete actionButton.dataset.dragged;
        return;
      }
      if (actionButton)
        this.action(actionButton.dataset.action, actionButton.dataset);
      if (event.target.id === "shareModal") this.closeShareModal();

      const tabButton = event.target.closest("[data-tab]");
      if (tabButton) this.nav(tabButton.dataset.tab, tabButton);
    });

    const shareQrCode = qs("shareQrCode");
    const shareQrFallback = qs("shareQrFallback");
    shareQrCode?.addEventListener("load", () => {
      shareQrCode.hidden = false;
      if (shareQrFallback) shareQrFallback.hidden = true;
    });
    shareQrCode?.addEventListener("error", () => {
      shareQrCode.hidden = true;
      if (shareQrFallback) shareQrFallback.hidden = false;
    });

    this.bindNotesSwitcherGesture();

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.closeShareModal();
    });

    document
      .querySelectorAll(".mobile-subview-header .btn-back")
      .forEach((headerControl) => {
        let startX = 0;
        let startY = 0;
        let dragged = false;

        headerControl.addEventListener("pointerdown", (event) => {
          startX = event.clientX;
          startY = event.clientY;
          dragged = false;
          document.documentElement.classList.add("button-stretching");
          document.body.classList.add("button-stretching");
          try {
            headerControl.setPointerCapture?.(event.pointerId);
          } catch (error) {}
          headerControl.classList.add("is-dragging");
          headerControl.style.transformOrigin = "center";
          headerControl.style.transition =
            "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";
          headerControl.style.transform = "scale(0.97)";
        });

        headerControl.addEventListener("pointermove", (event) => {
          if (!headerControl.classList.contains("is-dragging")) return;

          const deltaX = event.clientX - startX;
          const deltaY = event.clientY - startY;
          const distance = Math.hypot(deltaX, deltaY);
          if (distance > 8) dragged = true;

          const angle = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;
          const offsetX = Math.max(-3, Math.min(3, deltaX * 0.035));
          const offsetY = Math.max(-3, Math.min(3, deltaY * 0.02));
          const scale = 1 + Math.min(distance * 0.0025, 0.075);
          headerControl.style.transformOrigin = "center";
          headerControl.style.transition =
            "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)";
          headerControl.style.transform = `translate(${offsetX}px, ${offsetY}px) rotate(${angle}deg) scaleX(${scale}) rotate(${-angle}deg)`;
          setStretchState(headerControl, offsetX, offsetY, angle, scale);
        });

        const resetDrag = (event) => {
          if (!headerControl.classList.contains("is-dragging")) return;
          try {
            headerControl.releasePointerCapture?.(event.pointerId);
          } catch (error) {}
          headerControl.classList.remove("is-dragging");
          headerControl.classList.add("is-releasing");
          document.documentElement.classList.remove("button-stretching");
          document.body.classList.remove("button-stretching");
          setTimeout(() => {
            headerControl.classList.remove("is-releasing");
            headerControl.style.removeProperty("transition");
            headerControl.style.removeProperty("transform");
            headerControl.style.removeProperty("transform-origin");
            clearStretchState(headerControl);
          }, 600);
          if (dragged) {
            headerControl.dataset.dragged = "true";
            setTimeout(() => delete headerControl.dataset.dragged, 0);
          }
        };

        headerControl.addEventListener("pointerup", resetDrag);
        headerControl.addEventListener("pointercancel", resetDrag);
      });

    const clearBackButtonDrags = () => {
      document
        .querySelectorAll(".mobile-subview-header .btn-back.is-dragging")
        .forEach((headerControl) => {
          headerControl.classList.remove("is-dragging");
          headerControl.classList.add("is-releasing");
          setTimeout(() => {
            headerControl.classList.remove("is-releasing");
            headerControl.style.removeProperty("transition");
            headerControl.style.removeProperty("transform");
            headerControl.style.removeProperty("transform-origin");
            clearStretchState(headerControl);
          }, 600);
        });
      document.documentElement.classList.remove("button-stretching");
      document.body.classList.remove("button-stretching");
    };

    document.addEventListener("pointerup", clearBackButtonDrags);
    document.addEventListener("pointercancel", clearBackButtonDrags);

    const clearPercentButtons = document.querySelectorAll(".clear-percent-btn");

    clearPercentButtons.forEach((clearButton) => {
      let startX = 0;
      let startY = 0;
      let pointerId = null;
      let dragged = false;

      clearButton.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        event.preventDefault();

        startX = event.clientX;
        startY = event.clientY;
        pointerId = event.pointerId;
        dragged = false;
        clearButton.classList.add("is-pressing");
        document.documentElement.classList.add("button-stretching");
        document.body.classList.add("button-stretching");
        clearButton.style.transformOrigin = "center";
        clearButton.style.transition =
          "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";
        clearButton.style.transform = "translateY(-1px) scaleX(1.015)";
        clearButton.setPointerCapture?.(pointerId);
      });

      clearButton.addEventListener("pointermove", (event) => {
        if (event.pointerId !== pointerId) return;

        const deltaX = event.clientX - startX;
        const deltaY = event.clientY - startY;
        const distance = Math.hypot(deltaX, deltaY);
        if (distance > 8) dragged = true;

        const offsetX = Math.max(-4, Math.min(4, deltaX * 0.04));
        const offsetY = Math.max(-2, Math.min(2, deltaY * 0.02));
        const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
        const scale = 1 + Math.min(distance * 0.0025, 0.075);

        clearButton.style.transformOrigin = "center";
        clearButton.style.transition =
          "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)";
        clearButton.style.transform = `translate(${offsetX}px, ${offsetY - 1}px) rotate(${angle}deg) scaleX(${scale}) rotate(${-angle}deg)`;
        setStretchState(clearButton, offsetX, offsetY - 1, angle, scale);
      });

      const resetClearButton = (event) => {
        if (event.pointerId !== pointerId) return;

        clearButton.releasePointerCapture?.(pointerId);
        clearButton.classList.remove("is-pressing");
        clearButton.classList.add("is-releasing");
        document.documentElement.classList.remove("button-stretching");
        document.body.classList.remove("button-stretching");

        if (dragged) {
          clearButton.dataset.dragged = "true";
          setTimeout(() => delete clearButton.dataset.dragged, 0);
        }

        pointerId = null;
        setTimeout(() => {
          clearButton.classList.remove("is-releasing");
          clearButton.style.removeProperty("transform");
          clearButton.style.removeProperty("transition");
          clearButton.style.removeProperty("transform-origin");
          clearStretchState(clearButton);
        }, 600);
      };

      clearButton.addEventListener("pointerup", resetClearButton);
      clearButton.addEventListener("pointercancel", resetClearButton);
    });

    document
      .querySelectorAll(
        ".journal-floating-btn, .floating-add-note, .more-actions-row .capsule-btn",
      )
      .forEach((floatingButton) => {
        let pointerId = null;
        let startX = 0;
        let startY = 0;
        let dragged = false;

        floatingButton.addEventListener("pointerdown", (event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;

          pointerId = event.pointerId;
          startX = event.clientX;
          startY = event.clientY;
          dragged = false;
          floatingButton.classList.add("is-stretching");
          document.documentElement.classList.add("button-stretching");
          document.body.classList.add("button-stretching");
          floatingButton.style.transformOrigin = "center";
          floatingButton.style.transition =
            "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";
          floatingButton.style.transform = "scale(0.98)";
          try {
            floatingButton.setPointerCapture?.(pointerId);
          } catch (error) {}
        });

        floatingButton.addEventListener("pointermove", (event) => {
          if (event.pointerId !== pointerId) return;

          const deltaX = event.clientX - startX;
          const deltaY = event.clientY - startY;
          const distance = Math.hypot(deltaX, deltaY);
          if (distance > 8) dragged = true;

          const offsetX = Math.max(-4, Math.min(4, deltaX * 0.035));
          const offsetY = Math.max(-4, Math.min(4, deltaY * 0.035));
          const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
          const scale = 1 + Math.min(distance * 0.0025, 0.075);

          floatingButton.style.transformOrigin = "center";
          floatingButton.style.transition =
            "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)";
          floatingButton.style.transform = `translate(${offsetX}px, ${offsetY}px) rotate(${angle}deg) scaleX(${scale}) rotate(${-angle}deg)`;
          setStretchState(floatingButton, offsetX, offsetY, angle, scale);
        });

        const resetFloatingButton = (event) => {
          if (event.pointerId !== pointerId) return;

          try {
            floatingButton.releasePointerCapture?.(pointerId);
          } catch (error) {}
          floatingButton.classList.remove("is-stretching");
          floatingButton.classList.add("is-releasing");
          document.documentElement.classList.remove("button-stretching");
          document.body.classList.remove("button-stretching");

          if (dragged) {
            floatingButton.dataset.dragged = "true";
            setTimeout(
              () => delete floatingButton.dataset.dragged,
              floatingButton.classList.contains("journal-floating-btn")
                ? 260
                : 0,
            );
          }

          pointerId = null;
          setTimeout(() => {
            floatingButton.classList.remove("is-releasing");
            floatingButton.style.removeProperty("transform");
            floatingButton.style.removeProperty("transition");
            floatingButton.style.removeProperty("transform-origin");
            clearStretchState(floatingButton);
          }, 600);
        };

        floatingButton.addEventListener("pointerup", resetFloatingButton);
        floatingButton.addEventListener("pointercancel", resetFloatingButton);
      });

    qs("notesList")?.addEventListener("click", (event) => {
      const noteCard = event.target.closest(".note-item");
      if (!noteCard) return;
      const noteId = noteCard.dataset.noteId;
      if (!noteId) return;
      this.selectNote(noteId);
    });

    qs("noteSearchInput")?.addEventListener("input", () => this.renderNotes());

    if (this.settings.fs) {
      document.addEventListener(
        "pointerdown",
        () => {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.().catch(() => {
              this.settings.fs = false;
              this.applySettings();
            });
          }
        },
        { once: true },
      );
    }

    document.addEventListener("fullscreenchange", () => {
      if (!document.fullscreenElement && this.settings.fs) {
        this.settings.fs = false;
        this.applySettings();
        this.save();
      }
    });

    qs("pupilCountInput")?.addEventListener("input", () =>
      this.setPupilTotal(),
    );
    document.addEventListener("keydown", (event) => this.keyboard(event));
    window.addEventListener("pagehide", () => this.flushNoteAutosave());
    this.bindSwitches();
    this.bindThemeSelector();
    const uiKitRange = qs("uiKitRange");
    uiKitRange?.addEventListener("input", () => {
      this.setUiKit(Number(uiKitRange.value), { commit: false });
    });
    uiKitRange?.addEventListener("change", () => {
      this.setUiKit(Number(uiKitRange.value));
    });
  },

  bindThemeSelector() {
    const group = qs("themeOptions");
    if (!group) return;

    let pointerId = null;
    let startX = 0;
    let dragged = false;
    let selectedIndex = 0;
    const options = [...group.querySelectorAll(".theme-option")];

    const selectAt = (clientX) => {
      const rect = group.getBoundingClientRect();
      const position = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      selectedIndex = Math.round(position * (options.length - 1));
      options.forEach((option, index) => {
        const selected = index === selectedIndex;
        option.classList.toggle("is-active", selected);
        option.setAttribute("aria-pressed", String(selected));
      });
      group.style.setProperty("--theme-offset", `${selectedIndex * 100}%`);
      const theme = options[selectedIndex]?.dataset.themeValue;
      if (theme) {
        this.settings.theme = theme;
        this.applySettings({ preserveUiKitRange: true });
      }
    };

    group.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      pointerId = event.pointerId;
      startX = event.clientX;
      dragged = false;
      group.dataset.dragging = "true";
      try {
        group.setPointerCapture?.(pointerId);
      } catch (error) {}
      selectAt(event.clientX);
    });

    group.addEventListener("pointermove", (event) => {
      if (event.pointerId !== pointerId) return;
      if (Math.abs(event.clientX - startX) > 5) dragged = true;
      if (dragged) {
        event.preventDefault();
        selectAt(event.clientX);
      }
    });

    const finishDrag = (event) => {
      if (event.pointerId !== pointerId) return;
      try {
        group.releasePointerCapture?.(pointerId);
      } catch (error) {}
      pointerId = null;
      delete group.dataset.dragging;
      if (!dragged) return;

      const theme = options[selectedIndex]?.dataset.themeValue;
      if (theme) this.setTheme(theme);
      group.dataset.dragged = "true";
      setTimeout(() => delete group.dataset.dragged, 0);
    };

    group.addEventListener("pointerup", finishDrag);
    group.addEventListener("pointercancel", finishDrag);
    group.addEventListener(
      "click",
      (event) => {
        if (!group.dataset.dragged) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        delete group.dataset.dragged;
      },
      true,
    );
  },

  bindSwitches() {
    const switches = Array.from(
      document.querySelectorAll(
        "#soundToggle, #vibrationToggle, #fsToggle, #diagramToggle, #minaiCalculatorToggle, #minaiPercentToggle",
      ),
    );

    switches.forEach((input) => {
      let dragging = false;
      let pointerId = null;
      let startX = 0;
      let startChecked = false;
      let moved = false;
      let ignoreChange = false;
      let suppressClick = false;

      const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
      const updateThumb = (x) => {
        input.style.setProperty("--switch-thumb-x", `${clamp(x, 0, 26)}px`);
      };

      const onPointerDown = (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        dragging = true;
        pointerId = event.pointerId;
        startX = event.clientX;
        startChecked = input.checked;
        moved = false;
        suppressClick = false;
        ignoreChange = false;
        input.setPointerCapture?.(pointerId);
      };

      let lastThumbX = 0;

      const onPointerMove = (event) => {
        if (!dragging || event.pointerId !== pointerId) return;
        const delta = event.clientX - startX;
        if (Math.abs(delta) < 10) return;
        moved = true;
        suppressClick = true;
        const base = startChecked ? 26 : 0;
        lastThumbX = clamp(base + delta, 0, 26);
        updateThumb(lastThumbX);
      };

      const onPointerUp = (event) => {
        if (!dragging || event.pointerId !== pointerId) return;
        dragging = false;
        input.releasePointerCapture?.(pointerId);
        input.style.removeProperty("--switch-thumb-x");

        if (!moved) {
          suppressClick = false;
          return;
        }

        event.preventDefault();
        moved = false;

        const trackMidpoint = 13; // half of the thumb movement range (0..26)
        const nextChecked = lastThumbX >= trackMidpoint;

        if (nextChecked !== input.checked) {
          ignoreChange = true;
          input.checked = nextChecked;
          const actionName = input.dataset.action;
          if (actionName) this.action(actionName, nextChecked);
        }
      };

      input.addEventListener("click", (event) => {
        if (suppressClick) {
          event.preventDefault();
          event.stopPropagation();
          suppressClick = false;
        }
      });

      input.addEventListener("change", () => {
        if (dragging || moved || ignoreChange) {
          moved = false;
          ignoreChange = false;
          return;
        }
        const actionName = input.dataset.action;
        if (actionName) this.action(actionName, input.checked);
      });

      input.addEventListener("pointerdown", onPointerDown);
      input.addEventListener("pointermove", onPointerMove);
      input.addEventListener("pointerup", onPointerUp);
      input.addEventListener("pointercancel", onPointerUp);
      input.addEventListener("lostpointercapture", onPointerUp);
    });
  },

  showLogoutConfirm() {
    this.setProfileMenuOpen(false);
    qs("logoutModal")?.classList.add("open");
    this.tone(450, "sine", 0.06);
  },

  showLogoutFinalConfirm() {
    qs("logoutModal")?.classList.remove("open");
    qs("logoutFinalModal")?.classList.add("open");
    this.tone(450, "sine", 0.06);
  },

  closeLogoutModal() {
    qs("logoutModal")?.classList.remove("open");
    this.tone(300, "sine", 0.04);
  },

  closeLogoutFinalModal() {
    qs("logoutFinalModal")?.classList.remove("open");
    this.tone(300, "sine", 0.04);
  },

  async confirmLogoutFinal() {
    this.toast.show("Баромадан ва тоза кардани маълумот...", {
      duration: 1800,
    });
    await clearState();
    window.location.reload();
  },

  bindProfile() {
    ["profileEditNameInput", "profileEditSurnameInput"].forEach((fieldId) => {
      qs(fieldId)?.addEventListener("input", (event) =>
        this.sanitizeLettersOnly(event),
      );
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest("#profileMenu")) {
        this.setProfileMenuOpen(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (!qs("profileMenuPanel")?.hidden) {
        this.setProfileMenuOpen(false);
        qs("profileMenuToggle")?.focus();
      }
      qs("profileNameModal")?.classList.remove("open");
    });

    qs("profileAvatarInput")?.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        this.toast.show("Лутфан як Акс интихоб кунед.");
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        this.profile.avatar = reader.result || "";
        this.updateProfileUI(this.profile);
        this.save();
      };
      reader.readAsDataURL(file);
    });

    bindAvatarPicker({
      inputId: "profileAvatarInput",
      triggerSelector: "[data-avatar-picker-trigger]",
      onSelect: (avatar) => {
        this.profile.avatar = avatar;
        this.updateProfileUI(this.profile);
        this.save();
      },
    });
  },

  setProfileMenuOpen(open) {
    const panel = qs("profileMenuPanel");
    const toggle = qs("profileMenuToggle");
    if (!panel || !toggle) return;

    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  },

  openProfileNameModal() {
    this.setProfileMenuOpen(false);
    setInputValue("profileEditNameInput", this.profile.name || "");
    setInputValue("profileEditSurnameInput", this.profile.surname || "");
    qs("profileNameModal")?.classList.add("open");
    setTimeout(() => qs("profileEditNameInput")?.focus(), 80);
  },

  closeProfileNameModal() {
    qs("profileNameModal")?.classList.remove("open");
  },

  saveProfileName() {
    const name = clean(qs("profileEditNameInput")?.value || "");
    const surname = clean(qs("profileEditSurnameInput")?.value || "");

    if (!name || !surname) {
      this.toast.show("Лутфан ному насабро пурра ворид кунед.");
      return;
    }

    this.profile = {
      ...this.profile,
      name,
      surname,
    };
    this.save();
    this.updateProfileUI(this.profile);
    this.closeProfileNameModal();
    this.toast.show("Ном сабт шуд.");
  },

  bindSetupOverlay() {
    ["setupNameInput", "setupSurnameInput"].forEach((fieldId) => {
      qs(fieldId)?.addEventListener("input", (event) =>
        this.sanitizeLettersOnly(event),
      );
    });

    qs("setupAvatarInput")?.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        this.toast.show("Лутфан як Акс интихоб кунед.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const img = qs("setupAvatarImg");
        const fallback = qs("setupAvatarFallback");
        if (img) {
          img.src = reader.result || "";
          img.style.display = "block";
        }
        if (fallback) fallback.style.display = "none";
        this._setupAvatarData = reader.result || "";
      };
      reader.readAsDataURL(file);
    });
  },

  checkFirstRun() {
    const { name, surname, school } = this.profile;
    if (!name || !surname || !school) {
      if (window.location.protocol !== "file:") {
        window.location.assign("landing.html");
        return true;
      }
    }
    return false;
  },

  sanitizeLettersOnly(event) {
    const input = event.target;
    if (!input) return;
    const value = String(input.value || "")
      .replace(/[^\p{L}\p{M}\s'\-]/gu, "")
      .replace(/\s{2,}/g, " ")
      .trimStart();
    input.value = value;
  },

  sanitizeTextInput(event) {
    const input = event.target;
    if (!input) return;

    const value = String(input.value || "")
      .replace(/[^\p{L}\p{M}\s'-]/gu, "")
      .replace(/\s{2,}/g, " ")
      .trimStart();

    input.value = value;
  },

  action(name, payload) {
    const actions = {
      deleteLast: () => this.deleteLast(),
      clearAll: () => this.clearAll(),
      toggleGradesView: () => this.toggleGradesView(),
      clearAllPercentages: () => {
        this.vibrate?.(26);
        this.clearAllPercentages(true);
      },
      clearPupilCount: () => this.clearPupilCount(),
      openPercentExport: () => this.openPercentExport(),
      closePercentExport: () => this.closePercentExport(),
      exportPercentCanvas: () => this.exportPercentCanvas(),
      downloadResult: () => this.ensureInfo(),
      closeModal: () => this.closeModal(),
      saveModalInfo: () => this.saveModalInfo(),
      toggleTheme: () => this.toggleTheme(payload),
      toggleSound: () => this.toggleSound(payload),
      toggleFS: () => this.toggleFS(payload),
      toggleDiagram: () => this.toggleDiagram(payload),
      setTheme: () => this.setTheme(payload.themeValue),
      toggleVibration: () => this.toggleVibration(payload),
      toggleMinaiCalculator: () => this.toggleMinaiCalculator(payload),
      toggleMinaiPercent: () => this.toggleMinaiPercent(payload),
      toggleResultDetails: () => this.toggleResultDetails(),
      editProfile: () => this.showSubView("more-profile-view"),
      goToProfile: () => this.showSubView("more-profile-view"),
      saveSetupProfile: () => this.saveSetupProfile(),
      showSettings: () => this.showSubView("more-settings-view"),
      showDeveloper: () => this.showSubView("more-developer-view"),
      showMoreProfile: () => this.showSubView("more-profile-view"),
      showMoreShortcuts: () => this.showSubView("more-shortcuts-view"),
      showMoreAbout: () => this.showSubView("more-about-view"),
      showInstallPwa: () => this.showSubView("more-install-view"),
      hideSubviews: () => this.showSubView("more-home-view"),
      showLogoutConfirm: () => this.showLogoutConfirm(),
      toggleProfileMenu: () => this.setProfileMenuOpen(
        qs("profileMenuPanel")?.hidden ?? true,
      ),
      closeProfileMenu: () => this.setProfileMenuOpen(false),
      openProfileNameModal: () => this.openProfileNameModal(),
      closeProfileNameModal: () => this.closeProfileNameModal(),
      saveProfileName: () => this.saveProfileName(),
      showLogoutFinalConfirm: () => this.showLogoutFinalConfirm(),
      cancelLogout: () => this.closeLogoutModal(),
      cancelLogoutFinal: () => this.closeLogoutFinalModal(),
      confirmLogout: () => this.confirmLogoutFinal(),
      scrollToShortcuts: () => this.showSubView("more-shortcuts-view"),
      shareApp: () => this.shareApp(),
      closeShareModal: () => this.closeShareModal(),
      copyShareLink: () => this.copyShareLink(),
      sendShareLink: () => this.sendShareLink(),
      installPwa: () => this.installPwa(),
      installPwaNow: () => this.installPwa(),
      openNoteModal: (payload) => this.openNoteEntry(payload?.noteId),
      closeNoteModal: () => this.closeNoteModal(),
      saveNote: () => this.saveNote(),
      deleteNote: () => this.deleteNote(),
      showDeleteConfirm: () => this.showDeleteConfirm(),
      cancelDeleteNote: () => this.cancelDeleteNote(),
      confirmDeleteNote: () => this.confirmDeleteNote(),
      editSelectedNote: () => this.startInlineNoteEdit(),
      saveSelectedNoteEdit: () => this.saveSelectedNoteEdit(),
      cancelSelectedNoteEdit: () => this.cancelSelectedNoteEdit(),
      clearSelectedNote: () => this.requestClearSelectedNote(),
      deleteSelectedNote: () => {
        this.activeNoteId = this.selectedNoteId;
        this.showDeleteConfirm();
      },
      toggleNotesSwitcher: () => this.toggleNotesSwitcher(),
      selectNotesWorkspace: (payload) =>
        this.selectNotesWorkspace(payload?.view),
      addNoteTask: () => this.addNoteTask(),
      toggleNoteTask: (payload) => this.toggleNoteTask(payload?.taskId),
      deleteNoteTask: (payload) => this.deleteNoteTask(payload?.taskId),
    };

    actions[name]?.(payload);
  },

  toggleResultDetails() {
    const hero = document.querySelector(".hero");
    const toggle = document.querySelector(".result-details-toggle");
    if (!hero || !toggle) return;

    const isOpen = hero.classList.toggle("result-details-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  },

  keyboard(event) {
    const isInput = ["INPUT", "TEXTAREA"].includes(
      document.activeElement?.tagName,
    );
    const key = event.key.toLowerCase();
    const activeTab = document.querySelector(".tab.active")?.id;
    const homeActive = activeTab === "tab-home";
    const percentActive = activeTab === "tab-prosent";
    const notesActive = activeTab === "tab-notes";

    if (isInput && key !== "escape") return;

    if (
      key === "/" &&
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
      this.nav("tab-more");
    } else if (key === "p") {
      if (percentActive) {
        event.preventDefault();
        this.clearPupilCount();
      } else {
        this.nav("tab-prosent");
      }
    } else if (key === "j") {
      // navigate to journal tab
      event.preventDefault();
      this.nav("tab-journal");
    } else if (key === "n") {
      this.nav("tab-notes");
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
      this.nav("tab-more");
    } else if (key === "з") {
      if (percentActive) {
        event.preventDefault();
        this.clearPupilCount();
      } else {
        this.nav("tab-prosent");
      }
      /* Тоҷикӣ */
    } else if (key === "р") {
      this.nav("tab-home");
    } else if (key === "ҷ") {
      this.nav("tab-more");
    } else if (key === "н") {
      this.nav("tab-notes");
    } else if (key === "escape") {
      this.closeModal();
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
    this.scheduleUpdate(true);
  },

  toggleGradesView() {
    const container = qs("blocksContainer");
    const toggle = document.querySelector(".grades-toggle");
    if (!container || !toggle) return;

    const hasOverflow = container.scrollHeight > container.clientHeight + 1;
    const isCompactView = window.innerWidth <= 520;
    const expandedBeforeToggle = container.classList.contains("grades-expanded");
    const shouldShowToggle =
      isCompactView && this.grades.length > 0 && (hasOverflow || expandedBeforeToggle);

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

    setText("regularAvgUI", stats.avgR.toFixed(2));
    setText("examAvgUI", stats.avgE.toFixed(2));
    setText("preciseAvgUI", stats.final.toFixed(2));
    // countUI and chartHint removed — keep UI minimal

    const avgLarge = qs("avgLarge");
    if (avgLarge) {
      const num = avgLarge.querySelector?.(".large-number");
      if (num) num.textContent = String(Math.round(stats.final));
      else avgLarge.textContent = String(Math.round(stats.final));
      const labelEl = avgLarge.querySelector?.(".label-small");
      if (labelEl)
        labelEl.textContent = this.grades.length ? gradeLabel(stats.final) : "";
      avgLarge.className = "large";
      if (anim) this.bump(avgLarge);
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
    const gradesToggle = document.querySelector(".grades-toggle");
    if (gradesToggle) {
      const hasOverflow = Boolean(
        blocksContainer &&
          blocksContainer.scrollHeight > blocksContainer.clientHeight + 1,
      );
      const isCompactView = window.innerWidth <= 520;
      const expandedState = Boolean(
        blocksContainer && blocksContainer.classList.contains("grades-expanded"),
      );
      const shouldShowToggle =
        isCompactView && this.grades.length > 0 && (hasOverflow || expandedState);

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
          blocksContainer.style.height = "168px";
        }
      }
    }
    renderGradeChart(qs("gradeChart"), this.grades);
    this.bindChartScrollButtonStretch();
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

    if (
      !Number.isInteger(classNumber) ||
      classNumber < 1 ||
      classNumber > 11
    ) {
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

  saveSetupProfile() {
    const name = clean(qs("setupNameInput")?.value || "");
    const surname = clean(qs("setupSurnameInput")?.value || "");
    const school = clean(qs("setupSchoolInput")?.value || "");

    if (!name || !surname || !school) {
      this.toast.show(
        "Лутфан ному насаб ва рақами мактабро пурра ворид кунед.",
      );
      return;
    }

    this.profile = {
      ...this.profile,
      name,
      surname,
      school,
      avatar: this._setupAvatarData || this.profile.avatar || "",
    };
    this._setupAvatarData = null;

    this.save();
    this.updateProfileUI(this.profile);

    const overlay = qs("profileSetupOverlay");
    if (overlay) {
      overlay.classList.add("profile-setup-overlay--exit");
      setTimeout(() => {
        overlay.style.display = "none";
        overlay.classList.remove("profile-setup-overlay--exit");
      }, 380);
    }

    this.toast.show("Профил сохта шуд! Ба барнома хуш омадед 🎉");
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
      ctx.fillText(
        percentageMap ? `${percentageMap[grade]}%` : "—",
        810,
        y,
      );
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

  nav(id, button) {
    if (id !== "tab-notes") this.flushNoteAutosave();
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

    const journalButton = document.querySelector(".journal-floating-btn");
    if (journalButton) {
      // hide floating journal button on journal and notes tabs
      const shouldHideJournal = id === "tab-journal" || id === "tab-notes";
      journalButton.classList.toggle("is-hidden", shouldHideJournal);
      // keep notes-mode class for legacy positioning logic removed
      journalButton.classList.toggle("notes-mode", false);
    }

    this.updateNavHighlight?.(
      button || document.querySelector(`[data-tab="${id}"]`),
    );

    this.tone(600, "sine", 0.04);
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

  showLogoutConfirm() {
    this.setProfileMenuOpen(false);
    qs("logoutModal")?.classList.add("open");
    this.tone(450, "sine", 0.06);
  },

  closeLogoutModal() {
    qs("logoutModal")?.classList.remove("open");
    this.tone(300, "sine", 0.04);
  },

  async confirmLogout() {
    this.toast.show("Баромадан ва тоза кардани маълумот...", {
      duration: 1800,
    });
    await clearState();
    window.location.reload();
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

  openNoteModal(noteId = null) {
    this.activeNoteId = noteId;
    const note = noteId ? this.notes.find((item) => item.id === noteId) : null;
    setText("noteModalTitle", note ? "Таҳрир кардани ёддошт" : "Ёддости нав");
    setInputValue("noteTitleInput", note?.title || "");
    setInputValue("noteBodyInput", note?.body || "");
    if (qs("noteImportantInput"))
      qs("noteImportantInput").checked = Boolean(note?.important);
    qs("noteDeleteButton").style.display = note ? "inline-flex" : "none";
    qs("noteDeleteConfirm")?.classList.remove("open");
    this.noteHistory = [];
    this.noteHistoryIndex = -1;
    this.recordNoteChange();
    qs("noteModal")?.classList.add("open");
  },

  closeNoteModal() {
    qs("noteModal")?.classList.remove("open");
    this.activeNoteId = null;
    this.noteHistory = [];
    this.noteHistoryIndex = -1;
  },

  saveNote() {
    const title = clean(qs("noteTitleInput")?.value || "");
    const body = clean(qs("noteBodyInput")?.value || "", 512);
    const important = qs("noteImportantInput")?.checked || false;

    if (!title && !body) {
      this.toast.show("Лутфан ёддоштро холӣ нагузоред.");
      return;
    }

    const noteData = {
      title: title || "Ёддошт",
      body,
      important,
    };

    if (this.activeNoteId) {
      const note = this.notes.find((item) => item.id === this.activeNoteId);
      if (!note) return;
      note.title = noteData.title;
      note.body = noteData.body;
      note.important = noteData.important;
      note.updatedAt = Date.now();
      this.toast.show("Ёддошт навсозӣ шуд.");
    } else {
      this.notes.unshift({
        id: uid(),
        ...noteData,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      this.toast.show("Ёддошт сабт шуд.");
    }

    this.save();
    this.renderNotes();
    this.closeNoteModal();
  },

  showDeleteConfirm() {
    if (!this.activeNoteId) return;
    openInfoModal(qs("noteConfirmModal"));
  },

  cancelDeleteNote() {
    closeInfoModal(qs("noteConfirmModal"));
  },

  confirmDeleteNote() {
    closeInfoModal(qs("noteConfirmModal"));
    this.deleteNote();
  },

  deleteNote() {
    if (!this.activeNoteId) return;
    this.notes = this.notes.filter((item) => item.id !== this.activeNoteId);
    if (this.selectedNoteId === this.activeNoteId) this.selectedNoteId = null;
    this.save();
    this.renderNotes();
    this.closeNoteModal();
    this.toast.show("Ёддошт пок карда шуд.");
  },

  selectNote(noteId) {
    if (!this.notes.some((note) => note.id === noteId)) return;
    this.flushNoteAutosave();
    this.selectedNoteId = noteId;
    this.editingNoteId = null;
    this.creatingNoteInline = false;
    this.renderNotes();
  },

  openNoteEntry(noteId = null) {
    if (!noteId) {
      this.flushNoteAutosave();
      this.selectedNoteId = null;
      this.editingNoteId = null;
      this.creatingNoteInline = true;
      this.renderNoteDetail();
      return;
    }
    this.openNoteModal(noteId);
  },

  startInlineNoteEdit() {
    if (!this.selectedNoteId) return;
    this.editingNoteId = this.selectedNoteId;
    this.renderNoteDetail();
  },

  scheduleNoteAutosave() {
    clearTimeout(this.noteAutosaveTimer);
    this.noteAutosaveTimer = setTimeout(() => {
      this.noteAutosaveTimer = null;
      this.autosaveSelectedNote();
    }, 400);
  },

  flushNoteAutosave() {
    if (!this.noteAutosaveTimer) return;
    clearTimeout(this.noteAutosaveTimer);
    this.noteAutosaveTimer = null;
    this.autosaveSelectedNote();
  },

  autosaveSelectedNote() {
    const title = clean(qs("noteDetailTitleInput")?.value || "");
    const body = clean(qs("noteDetailBodyInput")?.value || "", 512);
    if (!title && !body) return;

    if (this.creatingNoteInline) {
      const now = Date.now();
      const created = {
        id: uid(),
        title: title || "Ёддошт",
        body,
        important: false,
        createdAt: now,
        updatedAt: now,
      };
      this.notes.unshift(created);
      this.selectedNoteId = created.id;
      this.editingNoteId = created.id;
      this.creatingNoteInline = false;
      this.save();
      return;
    }

    const note = this.notes.find((item) => item.id === this.editingNoteId);
    if (!note) return;
    const nextTitle = title || "Ёддошт";
    if (note.title === nextTitle && note.body === body) return;
    note.title = nextTitle;
    note.body = body;
    note.updatedAt = Date.now();
    this.save();
  },

  saveSelectedNoteEdit() {
    this.flushNoteAutosave();
    const title = clean(qs("noteDetailTitleInput")?.value || "");
    const body = clean(qs("noteDetailBodyInput")?.value || "", 512);
    if (!title && !body) {
      this.toast.show("Лутфан ёддоштро холӣ нагузоред.");
      return;
    }
    this.autosaveSelectedNote();
    this.editingNoteId = null;
    this.creatingNoteInline = false;
    this.renderNotes();
    this.toast.show("Ёддошт сабт шуд.");
  },

  cancelSelectedNoteEdit() {
    this.flushNoteAutosave();
    this.editingNoteId = null;
    this.creatingNoteInline = false;
    this.renderNotes();
  },

  requestClearSelectedNote() {
    this.flushNoteAutosave();
    this.selectedNoteId = null;
    this.editingNoteId = null;
    this.creatingNoteInline = false;
    this.renderNotes();
  },

  recordNoteChange() {
    const title = clean(qs("noteTitleInput")?.value || "");
    const body = clean(qs("noteBodyInput")?.value || "", 512);
    const important = qs("noteImportantInput")?.checked || false;

    const snapshot = { title, body, important };
    const last = this.noteHistory[this.noteHistoryIndex];
    if (JSON.stringify(last) === JSON.stringify(snapshot)) return;

    this.noteHistory = this.noteHistory.slice(0, this.noteHistoryIndex + 1);
    this.noteHistory.push(snapshot);
    this.noteHistoryIndex = this.noteHistory.length - 1;
    this.renderNoteHistory();
  },

  applyHistoryState() {
    const state = this.noteHistory[this.noteHistoryIndex];
    if (!state) return;
    setInputValue("noteTitleInput", state.title);
    setInputValue("noteBodyInput", state.body);
    if (qs("noteImportantInput"))
      qs("noteImportantInput").checked = state.important;
    this.renderNoteHistory();
  },

  renderNoteHistory() {
    const list = qs("noteHistory")?.querySelector(".note-history-list");
    if (!list) return;
    list.innerHTML = "";
    if (!this.noteHistory.length) {
      list.innerHTML = `<div class="note-history-empty">Ҳеч тағйирот вуҷуд надорад.</div>`;
      return;
    }
    const entries = this.noteHistory.slice(
      Math.max(0, this.noteHistory.length - 5),
    );
    entries.forEach((state, index) => {
      const step = document.createElement("div");
      step.className = `note-history-entry${this.noteHistoryIndex === index + Math.max(0, this.noteHistory.length - 5) ? " active" : ""}`;
      step.textContent = `${index === entries.length - 1 ? "Ҳозира" : `Қадами ${index + 1}`}`;
      list.appendChild(step);
    });
  },

  toggleNotesSwitcher() {
    const popover = qs("notesSwitcher");
    const trigger = document.querySelector(".notes-switcher-trigger");
    if (!popover || !trigger) return;
    popover.dataset.view = popover.dataset.view || "notes";
    const isOpen = popover.classList.toggle("is-open");
    trigger.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) this.renderTasks();
  },

  bindNotesSwitcherGesture() {
    const trigger = document.querySelector(".notes-switcher-trigger");
    const popover = qs("notesSwitcher");
    if (!trigger || !popover || trigger.dataset.gestureBound) return;
    trigger.dataset.gestureBound = "true";

    let pointerId = null;
    let longPressTimer = null;
    let gestureOpen = false;

    const clearTarget = () => {
      popover
        .querySelectorAll(".is-drag-target")
        .forEach((option) => option.classList.remove("is-drag-target"));
    };

    const closeFromGesture = () => {
      clearTarget();
      popover.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
      gestureOpen = false;
    };

    trigger.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      pointerId = event.pointerId;
      gestureOpen = false;
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => {
        popover.dataset.view = popover.dataset.view || "notes";
        popover.classList.add("is-open");
        trigger.setAttribute("aria-expanded", "true");
        gestureOpen = true;
        this.renderTasks();
      }, 260);
    });

    window.addEventListener("pointermove", (event) => {
      if (event.pointerId !== pointerId || !gestureOpen) return;
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const option = target?.closest?.(".notes-switcher-option");
      clearTarget();
      option?.classList.add("is-drag-target");
    });

    window.addEventListener(
      "pointerup",
      (event) => {
        if (event.pointerId !== pointerId) return;
        clearTimeout(longPressTimer);
        if (!gestureOpen) {
          pointerId = null;
          return;
        }
        const target = document.elementFromPoint(event.clientX, event.clientY);
        const option = target?.closest?.(".notes-switcher-option");
        if (option) this.selectNotesWorkspace(option.dataset.view);
        else closeFromGesture();
        trigger.dataset.suppressClick = "true";
        pointerId = null;
      },
      true,
    );

    trigger.addEventListener("pointercancel", () => {
      clearTimeout(longPressTimer);
      pointerId = null;
      if (gestureOpen) closeFromGesture();
    });

    trigger.addEventListener("click", (event) => {
      if (!trigger.dataset.suppressClick) return;
      delete trigger.dataset.suppressClick;
      event.stopPropagation();
    });

    qs("notesTaskInput")?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      this.addNoteTask();
    });
  },

  selectNotesWorkspace(view = "notes") {
    const popover = qs("notesSwitcher");
    const trigger = document.querySelector(".notes-switcher-trigger");
    if (!popover || !trigger) return;
    const selectedView = view === "tasks" ? "tasks" : "notes";
    popover.dataset.view = selectedView;
    popover
      .querySelectorAll(".notes-switcher-option")
      .forEach((option) =>
        option.classList.toggle("active", option.dataset.view === selectedView),
      );
    popover.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    this.renderTasks();
  },

  renderTasks() {
    const list = qs("notesTaskList");
    if (!list) return;
    setText("notesTaskCount", this.tasks.length);
    list.innerHTML = "";
    if (!this.tasks.length) {
      list.innerHTML = `<div class="notes-task-empty"><span>✓</span><p>Ҳоло вазифа нест.<br>Вазифаи аввалро илова кунед.</p></div>`;
      return;
    }
    this.tasks.forEach((task) => {
      const item = document.createElement("div");
      item.className = `notes-task-item${task.completed ? " is-complete" : ""}`;
      item.innerHTML = `
        <button class="notes-task-check" type="button" data-action="toggleNoteTask" data-task-id="${escapeHtml(task.id)}" aria-label="Иваз кардани ҳолати вазифа" aria-pressed="${task.completed}">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6.5 12.5 3.5 3.5 7.5-8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
        <span class="notes-task-title">${escapeHtml(task.title)}</span>
        <button class="notes-task-delete" type="button" data-action="deleteNoteTask" data-task-id="${escapeHtml(task.id)}" aria-label="Пок кардани вазифа">×</button>`;
      list.appendChild(item);
    });
  },

  addNoteTask() {
    const input = qs("notesTaskInput");
    const title = clean(input?.value || "").slice(0, 160);
    if (!title) return;
    this.tasks.unshift({
      id: uid(),
      title,
      completed: false,
      createdAt: Date.now(),
    });
    if (input) input.value = "";
    this.save();
    this.renderTasks();
    input?.focus();
  },

  toggleNoteTask(taskId) {
    const task = this.tasks.find((item) => item.id === taskId);
    if (!task) return;
    task.completed = !task.completed;
    this.save();
    this.renderTasks();
  },

  deleteNoteTask(taskId) {
    this.tasks = this.tasks.filter((task) => task.id !== taskId);
    this.save();
    this.renderTasks();
  },

  renderNotes() {
    const list = qs("notesList");
    if (!list) return;

    const queryRaw = String(qs("noteSearchInput")?.value || "").trim();
    const query = queryRaw.toLowerCase();

    const filtered = this.notes.filter((note) => {
      if (!query) return true;
      return [note.title, note.body].some((text) =>
        String(text || "")
          .toLowerCase()
          .includes(query),
      );
    });

    list.innerHTML = "";
    this.renderNoteDetail();

    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "note-empty";
      const image = document.createElement("img");
      image.className = "note-empty-image";
      image.alt = "";
      image.src = queryRaw
        ? "assets/images/minai/search.png"
        : "assets/images/minai/write.png";
      const message = document.createElement("p");
      if (queryRaw) {
        const snippet =
          queryRaw.length > 7 ? `${queryRaw.slice(0, 7)}...` : queryRaw;
        message.textContent = `Барои "${snippet}" чизе ёфт нашуд.`;
      } else {
        message.textContent =
          "Шумо ҳоло ягон ёддошт надоред. Барои оғоз ва осон кардани кори худ, ёддошти нав сабт кунед.";
      }
      empty.append(image, message);
      list.appendChild(empty);
      return;
    }

    filtered.forEach((note) => {
      const item = document.createElement("article");
      item.className = "note-item";
      item.dataset.noteId = note.id;
      if (note.id === this.selectedNoteId) item.classList.add("selected");
      item.innerHTML = `
        <div class="note-label-row">
          <div>
            <h4 class="note-item-title">${escapeHtml(note.title)}</h4>
            <p class="note-item-body">${escapeHtml(note.body)}</p>
          </div>
          <div class="note-item-badges">
            ${note.important ? '<span class="note-important-mark" title="Муҳим" aria-label="Муҳим">★</span>' : ""}
          </div>
        </div>
        <div class="note-item-meta">
          <span class="note-time">${new Date(note.createdAt).toLocaleString("tg-TJ", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</span>
        </div>
      `;
      list.appendChild(item);
    });
    this.renderNoteDetail();
  },

  renderNoteDetail() {
    const panel = qs("noteDetailPanel");
    if (!panel) return;
    const note = this.notes.find((item) => item.id === this.selectedNoteId);
    const workspace = panel.closest(".notes-workspace");
    const inlineScreen = Boolean(note) || this.creatingNoteInline;
    workspace?.classList.toggle("note-detail-open", inlineScreen);
    document.body.classList.toggle("notes-detail-screen", inlineScreen);
    panel.classList.toggle("has-note", inlineScreen);
    if (!note && !this.creatingNoteInline) {
      panel.innerHTML = `<div class="note-detail-empty"><span class="note-detail-empty-icon" aria-hidden="true">✦</span><h3>Ёддоштро интихоб кунед</h3><p>Барои дидани матни пурра аз рӯйхати чап як ёддоштро интихоб кунед.</p></div>`;
      return;
    }

    if (this.creatingNoteInline || this.editingNoteId === note?.id) {
      const title = note?.title || "";
      const body = note?.body || "";
      panel.innerHTML = `
        <div class="note-detail-toolbar">
          <button class="note-detail-back" type="button" data-action="clearSelectedNote" aria-label="Бозгашт">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>
          ${note ? '<button class="btn secondary note-toolbar-btn note-toolbar-delete" type="button" data-action="deleteSelectedNote">Пок кардан</button>' : ""}
          <button class="btn secondary note-toolbar-btn" type="button" data-action="cancelSelectedNoteEdit">Лағв</button>
          <button class="btn note-toolbar-btn" type="button" data-action="saveSelectedNoteEdit">Сабт</button>
        </div>
        <div class="note-detail-edit-form">
          <input id="noteDetailTitleInput" class="note-detail-title-input" type="text" value="${escapeHtml(title)}" placeholder="Сарлавҳа" aria-label="Сарлавҳаи ёддошт" />
          <textarea id="noteDetailBodyInput" class="note-detail-body-input" rows="9" placeholder="Матни ёддошт" aria-label="Матни ёддошт">${escapeHtml(body)}</textarea>
        </div>`;
      qs("noteDetailTitleInput")?.focus({ preventScroll: true });
      [
        "noteDetailTitleInput",
        "noteDetailBodyInput",
      ].forEach((id) => {
        qs(id)?.addEventListener("input", () => {
          this.scheduleNoteAutosave();
        });
      });
      return;
    }

    panel.innerHTML = `
      <div class="note-detail-toolbar">
        <button class="note-detail-back" type="button" data-action="clearSelectedNote" aria-label="Бозгашт">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
        <button class="btn secondary note-toolbar-btn note-toolbar-delete" type="button" data-action="deleteSelectedNote">Пок кардан</button>
        <button class="btn note-toolbar-btn" type="button" data-action="editSelectedNote">Таҳрир</button>
      </div>
      <div class="note-detail-header">
        <span class="note-time">${new Date(note.updatedAt || note.createdAt).toLocaleString("tg-TJ", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</span>
      </div>
      <h3 class="note-detail-title">${escapeHtml(note.title)}</h3>
      <div class="note-detail-body">${escapeHtml(note.body).replace(/\n/g, "<br>") || "Матни ёддошт холӣ аст."}</div>
      `;
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
    setText(
      "uiKitValue",
      ["Сабук", "Миёна", "Олӣ"][rangeLevel],
    );
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

  updateProfileUI(info = {}) {
    const name = clean(info.name || "");
    const surname = clean(info.surname || "");
    const school = clean(info.school || "");
    const avatar = String(info.avatar || "");
    const fullName = `${name}${surname ? ` ${surname}` : ""}`.trim();
    const fallback = fullName ? fullName.trim()[0].toUpperCase() : "Ч";

    setText("headerTitle", fullName || "Чоряк");
    // eyebrow shows fixed label; put school number into headerSchoolNumber
    setText("headerSchoolNumber", school ? `№${school}` : "");
    setText("headerFallback", fallback);
    setText("moreProfileName", fullName || "Чоряк");
    setText(
      "moreProfileSchool",
      school ? `Мактаби №${school}` : "Рақами мактаб илова нашудааст",
    );
    setText("profileDisplayName", fullName || "Чоряк");
    setText(
      "profileDisplaySchool",
      school ? `Мактаби №${school}` : "Рақами мактаб илова нашудааст",
    );
    setText("profileAvatarPreviewFallback", fallback);

    const moreProfilePhoto = qs("moreProfilePhoto");
    const moreProfileFallback = qs("moreProfileFallback");
    if (avatar && moreProfilePhoto) {
      moreProfilePhoto.src = avatar;
      moreProfilePhoto.style.display = "block";
      if (moreProfileFallback) moreProfileFallback.style.display = "none";
    } else if (moreProfilePhoto) {
      moreProfilePhoto.style.display = "none";
      if (moreProfileFallback) moreProfileFallback.style.display = "block";
    }

    const headerPhoto = qs("headerPhoto");
    const headerFallbackEl = qs("headerFallback");
    if (avatar && headerPhoto) {
      headerPhoto.src = avatar;
      headerPhoto.style.display = "block";
      if (headerFallbackEl) headerFallbackEl.style.display = "none";
    } else if (headerPhoto) {
      headerPhoto.style.display = "none";
      if (headerFallbackEl) headerFallbackEl.style.display = "block";
    }

    const avatarImg = qs("profileAvatarPreview");
    const avatarFallback = qs("profileAvatarPreviewFallback");
    if (avatar && avatarImg) {
      avatarImg.src = avatar;
      avatarImg.style.display = "block";
      if (avatarFallback) avatarFallback.style.display = "none";
    } else if (avatarImg) {
      avatarImg.style.display = "none";
      if (avatarFallback) avatarFallback.style.display = "block";
    }
  },

  save() {
    void saveState({
      grades: this.grades,
      settings: this.settings,
      pct: this.pct,
      info: {
        pupil: clean(qs("modalPupilInput")?.value || ""),
        subject: clean(qs("modalSubjectInput")?.value || ""),
        grade: clean(qs("modalGradeInput")?.value || ""),
      },
      profile: this.profile,
      notes: this.notes,
      tasks: this.tasks,
    });
    this.updateProfileUI(this.profile);
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
    } catch {}
  },

  vibrate(ms = 60) {
    try {
      if (
        this.settings.vibration !== false &&
        navigator &&
        typeof navigator.vibrate === "function"
      ) {
        navigator.vibrate(Math.round(ms * 1.2));
      }
    } catch (e) {
      // ignore
    }
  },
};

whenReady(() => {
  void app.init();
});

/*
  Сopyright (c) 2026 Abdughafur Khujzoda. All rights reserved.
  :) 
*/

// THE END
// Created by Abdughafur - Believe GOD
