/* app.js */
import { renderMinAI } from "../ai/minai.js";
import { calculateStats, gradeLabel, GRADE_LABELS } from "./stats.js";
import { loadState, saveState, clearState } from "./storage.js";
import { promptInstallPwa } from "./pwa.js";
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
  notes: [],
  noteFilter: "all",
  activeNoteId: null,
  noteHistory: [],
  noteHistoryIndex: -1,
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
    this.noteFilter = "all";
    this.activeNoteId = null;

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
    try {
      // enable draggable highlight only on phone-sized screens
      const isMobile =
        typeof window !== "undefined" &&
        ((window.matchMedia &&
          window.matchMedia("(max-width: 760px)").matches) ||
          window.innerWidth <= 760);
      if (!isMobile) return;
      const nav = document.querySelector("nav");
      if (!nav) return;

      const buttons = Array.from(nav.querySelectorAll(".nav-btn"));
      if (!buttons.length) return;

      const updatePosition = (btn) => {
        btn.classList.add("active");
      };

      // initial position to active and size highlight
      const active = nav.querySelector(".nav-btn.active") || buttons[0];
      updatePosition(active);

      // when nav is changed programmatically
      this.updateNavHighlight = (button) => {
        const btn =
          button || nav.querySelector(".nav-btn.active") || buttons[0];
        if (btn) updatePosition(btn);
      };

      // pointer drag
      let dragging = false;
      let pointerId = null;
      let pendingFrame = false;
      let currentX = 0;
      let dragStartX = 0;
      let dragDirection = "left center";
      let navRect = null;
      let buttonCenters = [];
      let minX = 0;
      let maxX = 0;
      let lastNearest = null;

      const refreshButtonData = () => {
        navRect = nav.getBoundingClientRect();
        buttonCenters = buttons.map((btn) => {
          const brect = btn.getBoundingClientRect();
          return {
            btn,
            center: brect.left - navRect.left + brect.width / 2,
          };
        });

        const first = buttonCenters[0];
        const last = buttonCenters[buttonCenters.length - 1];
        minX = Math.round(first.center);
        maxX = Math.round(last.center);
      };

      const updateDrag = () => {
        pendingFrame = false;
        if (!dragging) return;
        if (!navRect || !buttonCenters.length) refreshButtonData();

        const xCenter = currentX - navRect.left;

        let nearest = buttonCenters[0];
        let nearestDist = Infinity;
        for (const item of buttonCenters) {
          const dist = Math.abs(item.center - xCenter);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearest = item;
          }
        }

        dragDirection = currentX >= dragStartX ? "left center" : "right center";

        if (nearest.btn !== lastNearest) {
          buttons.forEach((button) => {
            button.classList.remove("drag-target");
            button.style.removeProperty("--drag-origin");
          });
          nearest.btn.classList.add("drag-target");
          nearest.btn.style.setProperty("--drag-origin", dragDirection);
          lastNearest = nearest.btn;
        } else {
          nearest.btn.style.setProperty("--drag-origin", dragDirection);
        }
      };

      const onPointerDown = (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        dragging = true;
        document.documentElement.classList.add("button-stretching");
        document.body.classList.add("button-stretching");
        pointerId = e.pointerId;
        dragStartX = e.clientX;
        dragDirection = "left center";
        nav.classList.add("is-dragging");
        try {
          nav.setPointerCapture?.(pointerId);
        } catch (_) {}
        refreshButtonData();
        currentX = e.clientX;
        lastNearest = null;
        if (!pendingFrame) {
          pendingFrame = true;
          requestAnimationFrame(updateDrag);
        }
      };

      const onPointerMove = (e) => {
        if (!dragging || e.pointerId !== pointerId) return;
        currentX = e.clientX;
        dragDirection = currentX >= dragStartX ? "left center" : "right center";
        if (!pendingFrame) {
          pendingFrame = true;
          requestAnimationFrame(updateDrag);
        }
      };

      const onPointerUp = (e) => {
        if (!dragging || e.pointerId !== pointerId) return;
        dragging = false;
        document.documentElement.classList.remove("button-stretching");
        document.body.classList.remove("button-stretching");
        nav.classList.remove("is-dragging");
        buttons.forEach((button) => {
          button.classList.remove("drag-target");
          button.style.removeProperty("--drag-origin");
        });
        try {
          nav.releasePointerCapture?.(pointerId);
        } catch (_) {}

        refreshButtonData();
        const centerX = e.clientX - navRect.left;
        let nearest = buttonCenters[0];
        let nearestDist = Infinity;
        for (const item of buttonCenters) {
          const dist = Math.abs(item.center - centerX);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearest = item;
          }
        }

        const tab = nearest.btn.dataset.tab;
        if (tab) this.nav(tab, nearest.btn);
        updatePosition(nearest.btn, true);
      };

      nav.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    } catch (err) {
      // silent
    }
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
      const scale = 0.975 + Math.min(distance * 0.0025, 0.045);
      const dragDirection = deltaX >= 0 ? "left center" : "right center";

      toggle.style.transformOrigin = dragDirection;
      toggle.style.transition =
        "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)";
      toggle.style.transform = `translate(${offsetX}px, ${offsetY}px) scaleX(${scale})`;
    });

    const resetToggle = (event) => {
      if (event.pointerId !== pointerId) return;

      try {
        toggle.releasePointerCapture?.(pointerId);
      } catch (error) {}
      toggle.classList.remove("is-stretching");
      document.documentElement.classList.remove("button-stretching");
      document.body.classList.remove("button-stretching");
      toggle.style.transition =
        "transform 560ms cubic-bezier(0.22, 1, 0.36, 1)";
      toggle.style.transform = "translate(0, 0) scaleX(1)";

      if (dragged) {
        toggle.dataset.dragged = "true";
        setTimeout(() => delete toggle.dataset.dragged, 0);
      }

      pointerId = null;
      setTimeout(() => {
        toggle.style.removeProperty("transform");
        toggle.style.removeProperty("transition");
        toggle.style.removeProperty("transform-origin");
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
      const scale = 0.98 + Math.min(distance * 0.003, 0.05);
      const dragDirection = deltaX >= 0 ? "left center" : "right center";

      toggle.style.transformOrigin = dragDirection;
      toggle.style.transition =
        "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)";
      toggle.style.transform = `translate(${offsetX}px, ${offsetY}px) scaleX(${scale})`;
    });

    const resetToggle = (event) => {
      if (event.pointerId !== pointerId) return;

      try {
        toggle.releasePointerCapture?.(pointerId);
      } catch (error) {}
      toggle.classList.remove("is-stretching");
      document.documentElement.classList.remove("button-stretching");
      document.body.classList.remove("button-stretching");
      toggle.style.transition =
        "transform 560ms cubic-bezier(0.22, 1, 0.36, 1)";
      toggle.style.transform = "translate(0, 0) scaleX(1)";

      if (dragged) {
        toggle.dataset.dragged = "true";
        setTimeout(() => delete toggle.dataset.dragged, 0);
      }

      pointerId = null;
      setTimeout(() => {
        toggle.style.removeProperty("transform");
        toggle.style.removeProperty("transition");
        toggle.style.removeProperty("transform-origin");
      }, 600);
    };

    toggle.addEventListener("pointerup", resetToggle);
    toggle.addEventListener("pointercancel", resetToggle);
  },

  bindExportActionStretch() {
    const button = document.querySelector(".export-action");
    if (!button || button.dataset.stretchBound === "true") return;

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
      const scale = 0.985 + Math.min(distance * 0.0025, 0.05);
      const dragDirection = deltaX >= 0 ? "left center" : "right center";

      button.style.transformOrigin = dragDirection;
      button.style.transition =
        "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)";
      button.style.transform = `translate(${offsetX}px, ${offsetY}px) scaleX(${scale})`;
    });

    const resetButton = (event) => {
      if (event.pointerId !== pointerId) return;

      try {
        button.releasePointerCapture?.(pointerId);
      } catch (error) {}
      button.classList.remove("is-stretching");
      document.documentElement.classList.remove("button-stretching");
      document.body.classList.remove("button-stretching");
      button.style.transition =
        "transform 560ms cubic-bezier(0.22, 1, 0.36, 1)";
      button.style.transform = "translate(0, 0) scaleX(1)";

      if (dragged) {
        button.dataset.dragged = "true";
        setTimeout(() => delete button.dataset.dragged, 0);
      }

      pointerId = null;
      setTimeout(() => {
        button.style.removeProperty("transform");
        button.style.removeProperty("transition");
        button.style.removeProperty("transform-origin");
      }, 600);
    };

    button.addEventListener("pointerup", resetButton);
    button.addEventListener("pointercancel", resetButton);
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

    document.addEventListener("click", (event) => {
      const actionButton = event.target.closest("[data-action]");
      if (actionButton?.dataset.dragged) {
        delete actionButton.dataset.dragged;
        return;
      }
      if (actionButton)
        this.action(actionButton.dataset.action, actionButton.dataset);

      const tabButton = event.target.closest("[data-tab]");
      if (tabButton) this.nav(tabButton.dataset.tab, tabButton);
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

          const angle = Math.max(
            -1.5,
            Math.min(1.5, (Math.atan2(deltaY, deltaX) * 180) / Math.PI),
          );
          const offsetX = Math.max(-3, Math.min(3, deltaX * 0.035));
          const offsetY = Math.max(-3, Math.min(3, deltaY * 0.02));
          const scale = 0.97 + Math.min(distance * 0.004, 0.04);
          const dragDirection = deltaX >= 0 ? "left center" : "right center";
          headerControl.style.transformOrigin = dragDirection;
          headerControl.style.transition =
            "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)";
          headerControl.style.transform = `translate(${offsetX}px, ${offsetY}px) rotate(${angle}deg) scaleX(${scale})`;
        });

        const resetDrag = (event) => {
          if (!headerControl.classList.contains("is-dragging")) return;
          try {
            headerControl.releasePointerCapture?.(event.pointerId);
          } catch (error) {}
          headerControl.classList.remove("is-dragging");
          document.documentElement.classList.remove("button-stretching");
          document.body.classList.remove("button-stretching");
          headerControl.style.transition =
            "transform 560ms cubic-bezier(0.22, 1, 0.36, 1)";
          headerControl.style.transform =
            "translate(0, 0) rotate(0deg) scaleX(1)";
          setTimeout(() => {
            headerControl.style.removeProperty("transition");
            headerControl.style.removeProperty("transform");
            headerControl.style.removeProperty("transform-origin");
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
          headerControl.style.transition =
            "transform 560ms cubic-bezier(0.22, 1, 0.36, 1)";
          headerControl.style.transform =
            "translate(0, 0) rotate(0deg) scaleX(1)";
          setTimeout(() => {
            headerControl.style.removeProperty("transition");
            headerControl.style.removeProperty("transform");
            headerControl.style.removeProperty("transform-origin");
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
        const scale = 1.015 + Math.min(Math.abs(deltaX) * 0.003, 0.05);
        const dragDirection = deltaX >= 0 ? "left center" : "right center";

        clearButton.style.transformOrigin = dragDirection;
        clearButton.style.transition =
          "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)";
        clearButton.style.transform = `translate(${offsetX}px, ${offsetY - 1}px) scaleX(${scale})`;
      });

      const resetClearButton = (event) => {
        if (event.pointerId !== pointerId) return;

        clearButton.releasePointerCapture?.(pointerId);
        clearButton.classList.remove("is-pressing");
        document.documentElement.classList.remove("button-stretching");
        document.body.classList.remove("button-stretching");
        clearButton.style.transition =
          "transform 560ms cubic-bezier(0.22, 1, 0.36, 1)";
        clearButton.style.transform = "translate(0, 0) scaleX(1)";

        if (dragged) {
          clearButton.dataset.dragged = "true";
          setTimeout(() => delete clearButton.dataset.dragged, 0);
        }

        pointerId = null;
        setTimeout(() => {
          clearButton.style.removeProperty("transform");
          clearButton.style.removeProperty("transition");
          clearButton.style.removeProperty("transform-origin");
        }, 600);
      };

      clearButton.addEventListener("pointerup", resetClearButton);
      clearButton.addEventListener("pointercancel", resetClearButton);
    });

    document
      .querySelectorAll(".journal-floating-btn, .floating-add-note")
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
          floatingButton.setPointerCapture?.(pointerId);
        });

        floatingButton.addEventListener("pointermove", (event) => {
          if (event.pointerId !== pointerId) return;

          const deltaX = event.clientX - startX;
          const deltaY = event.clientY - startY;
          const distance = Math.hypot(deltaX, deltaY);
          if (distance > 8) dragged = true;

          const offsetX = Math.max(-4, Math.min(4, deltaX * 0.035));
          const offsetY = Math.max(-4, Math.min(4, deltaY * 0.035));
          const scaleX = 0.98 + Math.min(distance * 0.003, 0.06);
          const scaleY = 0.98 + Math.min(distance * 0.0015, 0.025);
          const dragDirection = deltaX >= 0 ? "left center" : "right center";

          floatingButton.style.transformOrigin = dragDirection;
          floatingButton.style.transition =
            "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)";
          floatingButton.style.transform = `translate(${offsetX}px, ${offsetY}px) scaleX(${scaleX}) scaleY(${scaleY})`;
        });

        const resetFloatingButton = (event) => {
          if (event.pointerId !== pointerId) return;

          floatingButton.releasePointerCapture?.(pointerId);
          floatingButton.classList.remove("is-stretching");
          document.documentElement.classList.remove("button-stretching");
          document.body.classList.remove("button-stretching");
          floatingButton.style.transition =
            "transform 560ms cubic-bezier(0.22, 1, 0.36, 1)";
          floatingButton.style.transform = "translate(0, 0) scale(1)";

          if (dragged) {
            floatingButton.dataset.dragged = "true";
            setTimeout(() => delete floatingButton.dataset.dragged, 0);
          }

          pointerId = null;
          setTimeout(() => {
            floatingButton.style.removeProperty("transform");
            floatingButton.style.removeProperty("transition");
            floatingButton.style.removeProperty("transform-origin");
          }, 600);
        };

        floatingButton.addEventListener("pointerup", resetFloatingButton);
        floatingButton.addEventListener("pointercancel", resetFloatingButton);
      });

    qs("notesList")?.addEventListener("click", (event) => {
      const noteCard = event.target.closest(".note-item");
      if (!noteCard) return;
      const noteId = noteCard.dataset.noteId;
      if (noteId) this.openNoteModal(noteId);
    });

    qs("noteCategoryRow")?.addEventListener("click", (event) => {
      const button = event.target.closest(".note-category-pill");
      if (!button) return;
      const category = button.dataset.category;
      this.setNoteCategory(category);
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
    this.bindSwitches();
  },

  bindSwitches() {
    const switches = Array.from(
      document.querySelectorAll(
        "#themeToggle, #soundToggle, #fsToggle, #diagramToggle",
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
    setInputValue("profileNameInput", this.profile.name || "");
    setInputValue("profileSurnameInput", this.profile.surname || "");
    setInputValue("profileSchoolInput", this.profile.school || "");

    ["profileNameInput", "profileSurnameInput"].forEach((fieldId) => {
      qs(fieldId)?.addEventListener("input", (event) =>
        this.sanitizeLettersOnly(event),
      );
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
        window.location.assign("profile.html");
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
      downloadResult: () => this.ensureInfo(),
      closeModal: () => this.closeModal(),
      saveModalInfo: () => this.saveModalInfo(),
      toggleTheme: () => this.toggleTheme(payload),
      toggleSound: () => this.toggleSound(payload),
      toggleFS: () => this.toggleFS(payload),
      toggleDiagram: () => this.toggleDiagram(payload),
      toggleResultDetails: () => this.toggleResultDetails(),
      editProfile: () => this.showSubView("more-profile-view"),
      saveProfile: () => this.saveProfile(),
      goToProfile: () => this.showSubView("more-profile-view"),
      saveSetupProfile: () => this.saveSetupProfile(),
      showSettings: () => this.showSubView("more-settings-view"),
      showDeveloper: () => this.showSubView("more-developer-view"),
      showMoreProfile: () => this.showSubView("more-profile-view"),
      showMoreShortcuts: () => this.showSubView("more-shortcuts-view"),
      showMoreAbout: () => this.showSubView("more-about-view"),
      hideSubviews: () => this.showSubView("more-home-view"),
      showLogoutConfirm: () => this.showLogoutConfirm(),
      showLogoutFinalConfirm: () => this.showLogoutFinalConfirm(),
      cancelLogout: () => this.closeLogoutModal(),
      cancelLogoutFinal: () => this.closeLogoutFinalModal(),
      confirmLogout: () => this.confirmLogoutFinal(),
      scrollToShortcuts: () => this.showSubView("more-shortcuts-view"),
      shareApp: () => this.shareApp(),
      installPwa: () => this.installPwa(),
      openNoteModal: (payload) => this.openNoteModal(payload?.noteId),
      closeNoteModal: () => this.closeNoteModal(),
      saveNote: () => this.saveNote(),
      deleteNote: () => this.deleteNote(),
      showDeleteConfirm: () => this.showDeleteConfirm(),
      cancelDeleteNote: () => this.cancelDeleteNote(),
      confirmDeleteNote: () => this.confirmDeleteNote(),

      setNoteCategory: (payload) => this.setNoteCategory(payload?.category),
      setNoteFilter: (payload) => this.setNoteFilter(payload),
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

    if (isInput && key !== "escape") return;

    if (/^[1-9]$/.test(key)) {
      event.preventDefault();
      this.add(Number(key));
    } else if (key === "0") {
      // if percent tab is active, use 0 as quick clear-percent shortcut
      const prosentActive = qs("tab-prosent")?.classList.contains("active");
      if (prosentActive) {
        event.preventDefault();
        this.clearAllPercentages();
      } else {
        event.preventDefault();
        this.add(10);
      }
    } else if (key === "backspace") {
      event.preventDefault();
      this.deleteLast();
      /* English */
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
    } else if (key === "p") {
      this.nav("tab-prosent");
    } else if (key === "j") {
      // navigate to journal tab
      event.preventDefault();
      this.nav("tab-journal");
    } else if (key === "n") {
      this.nav("tab-notes");
      /* Русский */
    } else if (key === "с") {
      event.preventDefault();
      this.clearAll();
    } else if (key === "у") {
      event.preventDefault();
      this.toggleLast();
    } else if (key === "р") {
      this.nav("tab-home");
    } else if (key === "ы") {
      this.nav("tab-more");
    } else if (key === "з") {
      this.nav("tab-prosent");
      /* Тоҷикӣ */
    } else if (key === "с") {
      event.preventDefault();
      this.clearAll();
    } else if (key === "у") {
      event.preventDefault();
      this.toggleLast();
    } else if (key === "р") {
      this.nav("tab-home");
    } else if (key === "ҷ") {
      this.nav("tab-more");
    } else if (key === "з") {
      this.nav("tab-prosent");
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
    this.toast.show(
      grade.type === "exam"
        ? "Навъи балл ба балли корҳои санҷишӣ тағйир ёфт."
        : "Навъи балл ба балли дарсӣ тағйир ёфт.",
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

    renderGradeBlocks(qs("blocksContainer"), this.grades, GRADE_LABELS, (id) =>
      this.toggleGrade(id),
    );
    const gradesToggle = document.querySelector(".grades-toggle");
    if (gradesToggle) {
      const hasGrades = this.grades.length > 0;
      gradesToggle.classList.toggle("is-visible", hasGrades);
      gradesToggle.disabled = !hasGrades;
      gradesToggle.setAttribute("aria-hidden", String(!hasGrades));
      gradesToggle.style.opacity = hasGrades ? "1" : "0";
      gradesToggle.style.visibility = hasGrades ? "visible" : "hidden";
      gradesToggle.style.pointerEvents = hasGrades ? "auto" : "none";
    }
    renderGradeChart(qs("gradeChart"), this.grades);
    this.percentUpdate();

    renderMinAI({
      box: qs("aiAnalysisBox"),
      text: qs("aiText"),
      grades: this.grades,
    });
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

  saveProfile() {
    const name = clean(qs("profileNameInput")?.value || "");
    const surname = clean(qs("profileSurnameInput")?.value || "");
    const school = clean(qs("profileSchoolInput")?.value || "");

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
    };
    this.save();
    this.updateProfileUI(this.profile);
    this.toast.show("Профил сабт шуд.");
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

    setInputValue("profileNameInput", name);
    setInputValue("profileSurnameInput", surname);
    setInputValue("profileSchoolInput", school);

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
    canvas.height = 1330;

    const ctx = canvas.getContext("2d");
    const stats = calculateStats(this.grades);
    const pupil = clean(qs("modalPupilInput")?.value || "");
    const subject = clean(qs("modalSubjectInput")?.value || "");
    const gradeValue = clean(qs("modalGradeInput")?.value || "");
    const exportStamp = new Date().toLocaleString("tg-TJ");

    const primary = "#4f46e5";
    const primary2 = "#6366f1";
    const accent = "#9333ea";

    const bgGrad = ctx.createLinearGradient(0, 0, 1290, 1330);
    bgGrad.addColorStop(0, "#090514");
    bgGrad.addColorStop(0.5, "#0b0b1e");
    bgGrad.addColorStop(1, "#05070f");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1290, 1330);

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 70px Arial";
    ctx.fillText("Чоряк", 150, 180);

    ctx.fillStyle = "rgba(255,255,255,0.64)";
    ctx.font = "700 26px Arial";
    ctx.fillText(`Вақт: ${exportStamp}`, 800, 170);

    const lineGrad = ctx.createLinearGradient(120, 240, 1170, 240);
    lineGrad.addColorStop(0, "rgba(79, 70, 229, 0.1)");
    lineGrad.addColorStop(0.5, "rgba(147, 51, 234, 0.8)");
    lineGrad.addColorStop(1, "rgba(79, 70, 229, 0.1)");
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(120, 240);
    ctx.lineTo(1170, 240);
    ctx.stroke();

    roundRect(ctx, 120, 280, 1050, 360, 32);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#c084fc";
    ctx.font = "900 24px Arial";
    ctx.fillText("МАЪЛУМОТИ ХОНАНДА", 170, 340);

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 32px Arial";
    ctx.fillText(`Ному насаб: ${pupil || "—"}`, 170, 405);
    ctx.fillText(`Фан: ${subject || "—"}`, 170, 470);
    ctx.fillText(`Синф: ${gradeValue || "—"}`, 170, 535);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "900 24px Arial";
    ctx.fillText("НАТИҶАИ ЧОРЯК", 740, 340);

    const avgScoreGrad = ctx.createLinearGradient(740, 370, 740, 500);
    avgScoreGrad.addColorStop(0, "#818cf8");
    avgScoreGrad.addColorStop(1, "#c084fc");
    ctx.fillStyle = avgScoreGrad;
    ctx.font = "900 130px Arial";
    ctx.fillText(stats.final.toFixed(2), 740, 480);

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 32px Arial";
    ctx.fillText(`Сатҳ: ${gradeLabel(stats.final)}`, 740, 535);

    const summaryCards = [
      { title: "Натиҷаи баллҳои дарсӣ", value: stats.avgR.toFixed(2) },
      { title: "Натиҷаи баллҳои корҳои санҷишӣ", value: stats.avgE.toFixed(2) },
    ];

    summaryCards.forEach((card, index) => {
      const x = 120 + index * 550;
      const y = 670;

      roundRect(ctx, x, y, 500, 150, 24);
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#94a3b8";
      ctx.font = "800 24px Arial";
      ctx.fillText(card.title, x + 35, y + 48);

      ctx.fillStyle = "#ffffff";
      ctx.font = "900 50px Arial";
      ctx.fillText(card.value, x + 35, y + 112);
    });

    roundRect(ctx, 120, 890, 1050, 400, 32);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#94a3b8";
    ctx.font = "900 24px Arial";
    ctx.fillText("МИҚДОРИ БАЛЛҲОИ ГИРИФТАШУДА", 170, 905);

    const gradeCounts = {};
    for (let g = 1; g <= 10; g++) gradeCounts[g] = 0;
    this.grades.forEach((g) => {
      if (gradeCounts[g.val] !== undefined) {
        gradeCounts[g.val]++;
      }
    });

    for (let r = 0; r < 5; r++) {
      const yStart = 955 + r * 65;

      const grade1 = 10 - r;
      const count1 = gradeCounts[grade1] || 0;

      roundRect(ctx, 170, yStart, 80, 46, 12);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "900 26px Arial";
      ctx.textAlign = "center";
      ctx.fillText(String(grade1), 170 + 40, yStart + 32);
      ctx.textAlign = "left";

      ctx.fillStyle = "#e2e8f0";
      ctx.font = "700 28px Arial";
      ctx.fillText(`—  ${count1} то`, 170 + 100, yStart + 32);

      const grade2 = 5 - r;
      const count2 = gradeCounts[grade2] || 0;

      roundRect(ctx, 560, yStart, 80, 46, 12);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "900 26px Arial";
      ctx.textAlign = "center";
      ctx.fillText(String(grade2), 560 + 40, yStart + 32);
      ctx.textAlign = "left";

      ctx.fillStyle = "#e2e8f0";
      ctx.font = "700 28px Arial";
      ctx.fillText(`—  ${count2} то`, 560 + 100, yStart + 32);
    }

    return canvas;
  },

  nav(id, button) {
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

    // update draggable highlight if present
    try {
      this.updateNavHighlight &&
        this.updateNavHighlight(
          button || document.querySelector(`[data-tab="${id}"]`),
        );
    } catch (e) {}

    this.tone(600, "sine", 0.04);
  },

  showSubView(viewId) {
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

  async shareApp() {
    const shareUrl = "https://abdughafur.github.io/Quarter/";
    const shareData = {
      title: "Чоряк - Ҳисобкунаки Чорякҳо",
      text: "Барномаи муосири Чоряк барои ҳисоб кардани натиҷаи баллҳои хонандагон.",
      url: shareUrl,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        this.toast.show("Ба дигарон фиристода шуд!");
      } else {
        await navigator.clipboard.writeText(shareUrl);
        this.toast.show(
          "Пайванд (ссылка) ба нусхабардорӣ шуд! Барои мубодила пайвандро ба дигарон фиристед",
        );
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        await navigator.clipboard.writeText(shareUrl);
        this.toast.show("Пайванд (ссылка) нусхабардорӣ шуд!");
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

  toggleTheme(value) {
    if (typeof value === "boolean") {
      this.settings.theme = value ? "dark" : "light";
    } else {
      const toggle = qs("themeToggle");
      this.settings.theme = toggle
        ? toggle.checked
          ? "dark"
          : "light"
        : this.settings.theme === "dark"
          ? "light"
          : "dark";
    }
    this.applySettings();
    this.save();
  },

  toggleSound(value) {
    if (typeof value === "boolean") {
      this.settings.sound = value;
    } else {
      const toggle = qs("soundToggle");
      this.settings.sound = toggle ? toggle.checked : !this.settings.sound;
    }
    this.save();
    this.tone(680, "sine", 0.06, true);
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

    this.toast.show(
      this.settings.diagram ? "Диаграмма фаъол шуд." : "Диаграмма хомӯш шуд.",
    );
  },

  openNoteModal(noteId = null) {
    this.activeNoteId = noteId;
    const note = noteId ? this.notes.find((item) => item.id === noteId) : null;
    setText("noteModalTitle", note ? "Таҳрир кардани ёддошт" : "Ёддости нав");
    setInputValue("noteTitleInput", note?.title || "");
    setInputValue("noteBodyInput", note?.body || "");
    setInputValue("noteCategoryInput", note?.category || "lesson");
    if (qs("noteImportantInput"))
      qs("noteImportantInput").checked = Boolean(note?.important);
    qs("noteDeleteButton").style.display = note ? "inline-flex" : "none";
    qs("noteDeleteConfirm")?.classList.remove("open");
    this.noteHistory = [];
    this.noteHistoryIndex = -1;
    this.setNoteCategory(qs("noteCategoryInput")?.value || "lesson");
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
    const category = qs("noteCategoryInput")?.value || "other";
    const important = qs("noteImportantInput")?.checked || false;

    if (!title && !body) {
      this.toast.show("Лутфан ёддоштро холӣ нагузоред.");
      return;
    }

    const noteData = {
      title: title || "Ёддошт",
      body,
      category,
      important,
    };

    if (this.activeNoteId) {
      const note = this.notes.find((item) => item.id === this.activeNoteId);
      if (!note) return;
      note.title = noteData.title;
      note.body = noteData.body;
      note.category = noteData.category;
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
    this.save();
    this.renderNotes();
    this.closeNoteModal();
    this.toast.show("Ёддошт пок карда шуд.");
  },

  setNoteCategory(category) {
    if (!qs("noteCategoryInput")) return;
    qs("noteCategoryInput").value = category;
    qs("noteCategoryRow")
      ?.querySelectorAll(".note-category-pill")
      .forEach((pill) => {
        pill.classList.toggle("active", pill.dataset.category === category);
      });
    this.recordNoteChange("category");
  },

  recordNoteChange(field) {
    const title = clean(qs("noteTitleInput")?.value || "");
    const body = clean(qs("noteBodyInput")?.value || "", 512);
    const category = qs("noteCategoryInput")?.value || "other";
    const important = qs("noteImportantInput")?.checked || false;

    const snapshot = { title, body, category, important };
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
    setInputValue("noteCategoryInput", state.category);
    if (qs("noteImportantInput"))
      qs("noteImportantInput").checked = state.important;
    this.setNoteCategory(state.category);
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

  setNoteFilter(payload) {
    const filter =
      typeof payload === "string" ? payload : payload?.filter || "all";
    this.noteFilter = filter;
    document.querySelectorAll(".pill").forEach((pill) => {
      pill.classList.toggle("active", pill.dataset.filter === filter);
    });
    this.renderNotes();
  },

  renderNotes() {
    const list = qs("notesList");
    if (!list) return;

    const query = String(qs("noteSearchInput")?.value || "")
      .trim()
      .toLowerCase();

    const filtered = this.notes.filter((note) => {
      if (this.noteFilter !== "all" && note.category !== this.noteFilter) {
        return false;
      }
      if (!query) return true;
      return [note.title, note.body, note.category].some((text) =>
        String(text || "")
          .toLowerCase()
          .includes(query),
      );
    });

    list.innerHTML = "";

    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "note-empty";
      const queryRaw = String(qs("noteSearchInput")?.value || "").trim();
      if (queryRaw) {
        const snippet =
          queryRaw.length > 7 ? `${queryRaw.slice(0, 7)}...` : queryRaw;
        empty.textContent = `Барои "${snippet}" чизе ёфт нашуд.`;
      } else if (this.noteFilter && this.noteFilter !== "all") {
        const labels = {
          lesson: "Дарс",
          task: "Вазифа",
          idea: "Идея",
          other: "Дигар",
        };
        const label = labels[this.noteFilter] || this.noteFilter;
        empty.textContent = `Дар "${label}" чизе ёфт нашуд.`;
      } else {
        empty.textContent =
          "Шумо ҳоло ягон ёддошт надоред. Барои оғоз ва осон кардани кори худ, ёддошти нав сабт кунед.";
      }
      list.appendChild(empty);
      return;
    }

    filtered.forEach((note) => {
      const item = document.createElement("article");
      item.className = "note-item";
      item.dataset.noteId = note.id;
      item.innerHTML = `
        <div class="note-label-row">
          <div>
            <h4 class="note-item-title">${String(note.title)}</h4>
            <p class="note-item-body">${String(note.body)}</p>
          </div>
          <span class="note-chip note-chip-${note.category || "other"}">${note.category === "lesson" ? "Дарс" : note.category === "task" ? "Вазифа" : note.category === "idea" ? "Идея" : "Дигар"}</span>
        </div>
        <div class="note-item-meta">
          <span class="note-time">${new Date(note.createdAt).toLocaleString("tg-TJ", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</span>
        </div>
      `;
      list.appendChild(item);
    });
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

  applySettings() {
    const root = document.documentElement;
    const body = document.body;
    const theme = this.settings?.theme === "dark" ? "dark" : "light";
    const diagram = this.settings?.diagram === false ? "off" : "on";

    if (body) {
      body.dataset.theme = theme;
      body.style.colorScheme = theme;
    }

    if (root) {
      root.dataset.theme = theme;
      root.dataset.diagram = diagram;
      root.style.colorScheme = theme;
    }

    setChecked("themeToggle", theme === "dark");
    setChecked("soundToggle", this.settings.sound);
    setChecked("fsToggle", this.settings.fs);
    setChecked("diagramToggle", this.settings.diagram);

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

  vibrate(ms = 50) {
    try {
      if (navigator && typeof navigator.vibrate === "function") {
        navigator.vibrate(ms);
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
