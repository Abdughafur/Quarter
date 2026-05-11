import { clean } from "../utils/helpers.js";

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
