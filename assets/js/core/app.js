/* app.js */
import { loadState, saveState } from "./storage.js";
import { Toast } from "../ui/toast.js";
import { clamp, clean, qs, setInputValue, whenReady } from "../utils/helpers.js";
import { recoveryFeature } from "./app/features/recovery.js";
import { profileFeature } from "./app/features/profile.js";
import { calculatorFeature } from "./app/features/calculator.js";
import { navigationFeature } from "./app/features/navigation.js";
import { settingsFeature } from "./app/features/settings.js";
import { notesFeature } from "./app/features/notes.js";
import { clearStretchState, setStretchState } from "./app/shared.js";

export const app = {
  ...recoveryFeature,
  ...profileFeature,
  ...calculatorFeature,
  ...navigationFeature,
  ...settingsFeature,
  ...notesFeature,
  grades: [],
  pct: { total: 0, counts: {} },
  settings: {},
  audioCtx: null,
  toast: new Toast(),
  updateFrame: null,
  shouldBump: false,
  shouldScrollGrades: false,
  initialized: false,
  storageWarningShown: false,
  logoutInProgress: false,
  logoutSwipeReset: null,
  pendingBackupData: null,
  mobileMorePreviousTab: null,
  notes: [],
  calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  calendarSelectedDate: new Date(),
  calendarPickerYear: new Date().getFullYear(),
  calendarPickerOpen: false,
  calendarPickerMode: "months",
  calendarPickerHeading: "Интихоби моҳ",
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

    window.addEventListener("choryak-storage-warning", (event) => {
      if (this.storageWarningShown) return;
      this.storageWarningShown = true;
      this.toast.show(
        event.detail?.message ||
          "Сабти маълумот бо мушкил рӯ ба рӯ шуд. Маълумоти мавҷуда нигоҳ дошта шуд.",
        7000,
      );
    });

    const state = await loadState();
    this.grades = state.grades;
    this.pct = state.pct;
    this.settings = state.settings;
    this.notes = Array.isArray(state.notes) ? state.notes : [];
    this.activeNoteId = null;

    document.addEventListener(
      "pointerdown",
      (event) => {
        if (
          this.settings.uiKit !== "perfect" &&
          !event.target.closest(
            ".theme-options, #uiKitRange, #profileMenu, .block, .nav-btn, .logout-swipe-track",
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
    this.bindBackupControls();
    this.bindLogoutSwipe();
    this.info = state.info || {};
    this.profile = state.profile || this.profile;
    if (this.checkFirstRun()) return;
    const savePendingChanges = () => {
      if (this.logoutInProgress) return;
      this.flushNoteAutosave();
      void this.save();
    };
    window.addEventListener("pagehide", savePendingChanges);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") savePendingChanges();
    });
    window.addEventListener("error", (event) => {
      console.error("An application runtime error occurred.", event.error);
      savePendingChanges();
    });
    window.addEventListener("unhandledrejection", (event) => {
      console.error("An application operation failed.", event.reason);
      savePendingChanges();
    });
    this.bindProfile();
    this.updateProfileUI(this.profile);
    this.buildKeypad();
    this.buildPercentRows();
    this.applySettings();
    this.updateAll();
    this.renderNotes();
    this.renderCalendar();
    this.bindCalendarSwipe();

    // initialize nav highlight and draggable behavior
    this.setupNavDrag();
  },

  setupNavDrag() {
    const nav = document.querySelector("nav");
    if (!nav) return;

    const buttons = Array.from(nav.querySelectorAll(".nav-btn"));
    if (!buttons.length) return;
    const visibleButtons = () =>
      buttons.filter((button) => button.getClientRects().length > 0);
    const navigationTarget = (button) =>
      button?.dataset.tab === "tab-calendar" && this.isPhoneLayout()
        ? nav.querySelector(".mobile-more-trigger")
        : button;

    const indicator = nav.querySelector(".nav-active-indicator");
    const updateIndicator = (button) => {
      if (!indicator || !button) return;
      const navRect = nav.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      const paddingLeft =
        Number.parseFloat(getComputedStyle(nav).paddingLeft) || 0;
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
      const target = navigationTarget(button);
      buttons.forEach((item) => {
        const selected = item === target;
        item.classList.toggle("active", selected);
        if (selected) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
      });
      updateIndicator(target);
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
      buttonCenters = visibleButtons().map((button) => {
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
      const visible = visibleButtons();
      const firstButton = visible[0].getBoundingClientRect();
      const lastButton = visible[visible.length - 1].getBoundingClientRect();
      const navStyle = getComputedStyle(nav);
      const paddingLeft = Number.parseFloat(navStyle.paddingLeft) || 0;
      const origin = navRect.left + nav.clientLeft + paddingLeft;
      const width = firstButton.width;
      const minX = firstButton.left - origin;
      const maxX = Math.max(minX, lastButton.right - origin - width);
      const x = Math.max(minX, Math.min(maxX, clientX - origin - width / 2));
      indicator.style.setProperty("--nav-indicator-x", `${x}px`);
    };
    const canDrag = () =>
      !document.body.classList.contains("more-subview-open") &&
      !document.body.classList.contains("mobile-more-menu-open") &&
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
        updatePosition(nav.querySelector(".nav-btn.active") || buttons[0]);
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
        updatePosition(nav.querySelector(".nav-btn.active") || buttons[0]);
        return;
      }

      refreshButtonData();
      const nearest = nearestButton(event.clientX);
      suppressNextClick = true;
      setTimeout(() => {
        suppressNextClick = false;
      }, 0);
      if (nearest.btn.dataset.tab) {
        if (
          nearest.btn.classList.contains("mobile-more-trigger") &&
          this.isPhoneLayout()
        ) {
          this.openMobileMoreMenu();
        } else {
          this.nav(nearest.btn.dataset.tab, nearest.btn);
        }
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
      if (event.target.closest("#mobileMoreBackdrop")) {
        this.closeMobileMoreMenu(false, true);
        return;
      }

      const mobileMoreTrigger = event.target.closest(".mobile-more-trigger");
      if (mobileMoreTrigger && this.isPhoneLayout()) {
        event.preventDefault();
        this.toggleMobileMoreMenu();
        return;
      }

      if (
        !event.target.closest("#mobileMoreMenu") &&
        !qs("mobileMoreMenu")?.hidden
      ) {
        this.closeMobileMoreMenu();
      }

      const actionButton = event.target.closest("[data-action]");
      if (actionButton?.dataset.dragged) {
        delete actionButton.dataset.dragged;
        return;
      }
      if (actionButton)
        this.action(actionButton.dataset.action, actionButton.dataset);
      if (event.target.id === "shareModal") this.closeShareModal();
      if (event.target.id === "resultDetailsModal")
        this.closeResultDetailsModal();
      if (event.target.id === "calendarPickerModal") this.closeCalendarPicker();
      if (event.target.id === "backupExportModal") {
        this.closeBackupExportModal();
      }
      if (event.target.id === "backupRestoreModal") {
        this.closeBackupRestoreModal();
      }

      const tabButton = event.target.closest("[data-tab]");
      if (tabButton) this.nav(tabButton.dataset.tab, tabButton);
    });

    qs("calendarDateForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      this.goToCalendarDate();
    });
    document.querySelectorAll(".calendar-date-part").forEach((input) => {
      input.addEventListener("input", () => {
        input.value = input.value.replace(/\D/g, "").slice(0, input.maxLength);
      });
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

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.closeShareModal();
        this.closeResultDetailsModal();
        this.closeCalendarPicker();
        if (!qs("mobileMoreMenu")?.hidden) {
          this.closeMobileMoreMenu(true, true);
        }
      }
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
      const position = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / rect.width),
      );
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
      closeResultDetailsModal: () => this.closeResultDetailsModal(),
      changeCalendarMonth: (payload) =>
        this.changeCalendarMonth(Number(payload.offset)),
      showCalendarToday: () => this.showCalendarToday(),
      selectCalendarDate: (payload) => this.selectCalendarDate(payload.date),
      openCalendarMonthPicker: () =>
        this.openCalendarPicker("months", "Интихоби моҳ"),
      openCalendarYearPicker: () =>
        this.openCalendarPicker("years", "Интихоби сол"),
      openCalendarDatePicker: () =>
        this.openCalendarPicker("date", "Гузариш ба сана"),
      closeCalendarPicker: () => this.closeCalendarPicker(),
      selectCalendarYear: (payload) => this.selectCalendarYear(payload.year),
      selectCalendarMonth: (payload) => this.selectCalendarMonth(payload.month),
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
      showBackupModal: () => this.showBackupModal(),
      closeBackupExportModal: () => this.closeBackupExportModal(),
      downloadBackup: () => this.downloadBackup(),
      showRestoreModal: () => this.showRestoreModal(),
      closeBackupRestoreModal: () => this.closeBackupRestoreModal(),
      confirmBackupRestore: () => this.confirmBackupRestore(),
      toggleProfileMenu: () =>
        this.setProfileMenuOpen(qs("profileMenuPanel")?.hidden ?? true),
      closeProfileMenu: () => this.setProfileMenuOpen(false),
      openProfileNameModal: () => this.openProfileNameModal(),
      closeProfileNameModal: () => this.closeProfileNameModal(),
      saveProfileName: () => this.saveProfileName(),
      showLogoutFinalConfirm: () => this.showLogoutFinalConfirm(),
      cancelLogout: () => this.closeLogoutModal(),
      cancelLogoutFinal: () => this.closeLogoutFinalModal(),
      scrollToShortcuts: () => this.showSubView("more-shortcuts-view"),
      shareApp: () => this.shareApp(),
      closeShareModal: () => this.closeShareModal(),
      copyShareLink: () => this.copyShareLink(),
      sendShareLink: () => this.sendShareLink(),
      installPwa: () => this.installPwa(),
      installPwaNow: () => this.installPwa(),
      navigateMobileMore: (payload) =>
        this.navigateFromMobileMore(payload?.targetTab),
      openNoteModal: (payload) => this.openNoteEntry(payload?.noteId),
      closeNoteModal: () => this.closeNoteModal(),
      saveNote: () => this.saveNote(),
      deleteNote: () => this.deleteNote(),
      showDeleteConfirm: () => this.showDeleteConfirm(),
      cancelDeleteNote: () => this.cancelDeleteNote(),
      confirmDeleteNote: () => this.confirmDeleteNote(),
      editSelectedNote: () => this.startInlineNoteEdit(),
      saveSelectedNoteEdit: () => this.saveSelectedNoteEdit(),
      clearSelectedNote: () => this.requestClearSelectedNote(),
      deleteSelectedNote: () => {
        this.activeNoteId = this.selectedNoteId;
        this.showDeleteConfirm();
      },
    };

    actions[name]?.(payload);
  },

  save() {
    const savePromise = saveState({
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
    }).catch((error) => {
      console.error("Could not save app state.", error);
      if (!this.storageWarningShown) {
        this.storageWarningShown = true;
        this.toast.show(
          "Маълумот сабт нашуд. Дастрасии хотираи браузерро санҷед ва дубора кӯшиш кунед.",
          7000,
        );
      }
      return null;
    });
    this.updateProfileUI(this.profile);
    return savePromise;
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
  void app.init().catch((error) => {
    console.error("Could not initialize the app.", error);
    app.toast.show(
      "Маълумоти барномаро кушода натавонистем. Маълумоти мавҷуда пок нашудааст; дастрасии хотираи браузерро санҷед ва саҳифаро аз нав кушоед.",
      9000,
    );
  });
});

/*
  Copyright (c) 2026 Abdughafur Khujzoda.
  Licensed under the MIT License.
*/

// THE END
// Created by Abdughafur - Believe GOD
