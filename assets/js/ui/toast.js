import { qs } from "../utils/helpers.js";

export class Toast {
  constructor(id = "toast") {
    this.id = id;
    this.timer = null;
  }

  show(message, duration = 2100) {
    const el = qs(this.id);
    if (!el) return;

    el.textContent = message;
    el.classList.add("show");

    clearTimeout(this.timer);
    this.timer = setTimeout(() => el.classList.remove("show"), duration);
  }
}
