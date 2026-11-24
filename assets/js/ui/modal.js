/* modal.js */
import { clean } from "../utils/helpers.js";

const OPEN_MODAL_SELECTOR = [
  ".modal-backdrop.open",
  ".note-modal-backdrop.open",
  ".avatar-picker-backdrop.open",
  ".developer-photo-lightbox.open",
  '[role="dialog"][aria-modal="true"].open',
].join(", ");
const FOCUSABLE_MODAL_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let modalInteractionLockBound = false;

function getOpenModals() {
  return Array.from(document.querySelectorAll(OPEN_MODAL_SELECTOR));
}

function getTopmostOpenModal() {
  return getOpenModals().reduce((topmost, modal) => {
    if (!topmost) return modal;

    const modalZIndex = Number.parseInt(
      window.getComputedStyle(modal).zIndex,
      10,
    ) || 0;
    const topmostZIndex = Number.parseInt(
      window.getComputedStyle(topmost).zIndex,
      10,
    ) || 0;
    return modalZIndex >= topmostZIndex ? modal : topmost;
  }, null);
}

export function hasOpenModal() {
  return Boolean(getTopmostOpenModal());
}

export function isInsideOpenModal(target) {
  return Boolean(getTopmostOpenModal()?.contains(target));
}

function focusableElements(modal) {
  return Array.from(modal.querySelectorAll(FOCUSABLE_MODAL_SELECTOR)).filter(
    (element) =>
      !element.hidden &&
      element.getClientRects().length > 0 &&
      !element.closest("[hidden], [aria-hidden='true']"),
  );
}

function focusModal(modal, last = false) {
  const elements = focusableElements(modal);
  const target = elements.length
    ? elements[last ? elements.length - 1 : 0]
    : modal;
  if (target === modal && !modal.hasAttribute("tabindex")) {
    modal.setAttribute("tabindex", "-1");
  }
  target.focus({ preventScroll: true });
}

export function bindModalInteractionLock() {
  if (modalInteractionLockBound || !document.body) return;
  modalInteractionLockBound = true;

  const syncModalState = () => {
    const modalOpen = hasOpenModal();
    document.documentElement.classList.toggle("modal-open", modalOpen);
    document.body.classList.toggle("modal-open", modalOpen);

    const topmostModal = getTopmostOpenModal();
    if (topmostModal && !topmostModal.contains(document.activeElement)) {
      focusModal(topmostModal);
    }
  };

  const preventOutsideInteraction = (event) => {
    const topmostModal = getTopmostOpenModal();
    if (!topmostModal || topmostModal.contains(event.target)) return;
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
  };

  const preventBackgroundScroll = (event) => {
    const topmostModal = getTopmostOpenModal();
    if (!topmostModal) return;
    const scrollContainer = event.target.closest?.(
      ".ios-modal, .note-modal-body",
    );
    if (scrollContainer && topmostModal.contains(scrollContainer)) return;
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
  };

  const trapModalKeyboard = (event) => {
    const topmostModal = getTopmostOpenModal();
    if (!topmostModal || event.key === "Escape") return;

    if (event.key === "Tab") {
      const elements = focusableElements(topmostModal);
      if (!elements.length) {
        event.preventDefault();
        focusModal(topmostModal);
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !topmostModal.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !topmostModal.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
      return;
    }

    if (!topmostModal.contains(event.target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  const keepFocusInModal = (event) => {
    const topmostModal = getTopmostOpenModal();
    if (!topmostModal || topmostModal.contains(event.target)) return;
    focusModal(topmostModal);
    event.stopImmediatePropagation();
  };

  document.addEventListener("pointerdown", preventOutsideInteraction, true);
  document.addEventListener("click", preventOutsideInteraction, true);
  document.addEventListener("contextmenu", preventOutsideInteraction, true);
  document.addEventListener("wheel", preventBackgroundScroll, {
    capture: true,
    passive: false,
  });
  document.addEventListener("touchmove", preventBackgroundScroll, {
    capture: true,
    passive: false,
  });
  document.addEventListener("keydown", trapModalKeyboard, true);
  document.addEventListener("focusin", keepFocusInModal, true);
  document.addEventListener("keydown", (event) => {
    if (hasOpenModal() && event.key !== "Escape") {
      event.stopImmediatePropagation();
    }
  });

  const observer = new MutationObserver(syncModalState);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
    childList: true,
    subtree: true,
  });
  syncModalState();
}

export function openInfoModal(modal, pupilInput, subjectInput) {
  if (!modal) return;

  modal.classList.add("open");

  const pupil = clean(pupilInput?.value || "");
  const focusTarget = pupil ? subjectInput : pupilInput;

  setTimeout(() => focusTarget?.focus(), 80);
}

export function closeInfoModal(modal) {
  modal?.classList.remove("open");
}
// Created by Abdughafur - Believe GOD
