import { closeInfoModal, openInfoModal } from "../../../ui/modal.js";
import { clean, escapeHtml, qs, setInputValue, setText, uid } from "../../../utils/helpers.js";

export const notesFeature = {
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
        ? "assets/images/minai/search.webp"
        : "assets/images/minai/write.webp";
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
          <button class="btn note-toolbar-btn" type="button" data-action="saveSelectedNoteEdit">Сабт</button>
        </div>
        <div class="note-detail-edit-form">
          <input id="noteDetailTitleInput" class="note-detail-title-input" type="text" value="${escapeHtml(title)}" placeholder="Сарлавҳа" aria-label="Сарлавҳаи ёддошт" />
          <textarea id="noteDetailBodyInput" class="note-detail-body-input" rows="9" placeholder="Матни ёддошт" aria-label="Матни ёддошт">${escapeHtml(body)}</textarea>
        </div>`;
      qs("noteDetailTitleInput")?.focus({ preventScroll: true });
      ["noteDetailTitleInput", "noteDetailBodyInput"].forEach((id) => {
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


};
