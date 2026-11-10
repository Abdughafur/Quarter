import { clearState, restoreBackupData } from "../../storage.js";
import { downloadBackupFile, readBackupFile } from "../../backup.js";
import { qs } from "../../../utils/helpers.js";

export const recoveryFeature = {
  showLogoutConfirm() {
    this.setProfileMenuOpen(false);
    qs("logoutModal")?.classList.add("open");
    this.tone(450, "sine", 0.06);
  },

  showLogoutFinalConfirm() {
    qs("logoutModal")?.classList.remove("open");
    this.resetLogoutSwipe();
    qs("logoutFinalModal")?.classList.add("open");
    this.tone(450, "sine", 0.06);
  },

  closeLogoutModal() {
    qs("logoutModal")?.classList.remove("open");
    this.tone(300, "sine", 0.04);
  },

  closeLogoutFinalModal() {
    qs("logoutFinalModal")?.classList.remove("open");
    this.resetLogoutSwipe();
    this.tone(300, "sine", 0.04);
  },

  bindLogoutSwipe() {
    const track = qs("logoutSwipeTrack");
    const thumb = track?.querySelector(".logout-swipe-thumb");
    if (!track || !thumb) return;

    let progress = 0;
    let pointerId = null;
    let startX = 0;
    let startProgress = 0;
    const maxTravel = () =>
      Math.max(0, track.clientWidth - thumb.offsetWidth - 8);

    const updateProgress = (value) => {
      progress = Math.max(0, Math.min(100, value));
      thumb.style.setProperty(
        "--logout-swipe-x",
        `${(maxTravel() * progress) / 100}px`,
      );
      track.style.setProperty("--logout-swipe-progress", `${progress}%`);
      track.setAttribute("aria-valuenow", String(Math.round(progress)));
      track.setAttribute(
        "aria-valuetext",
        progress >= 90 ? "Омода барои пок кардан" : "Барои пок кардан лағжонед",
      );
    };

    const finishSwipe = (event) => {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      if (thumb.hasPointerCapture?.(event.pointerId)) {
        thumb.releasePointerCapture(event.pointerId);
      }

      if (event.type === "pointerup" && progress >= 90) {
        updateProgress(100);
        void this.confirmLogoutFinal();
      } else {
        updateProgress(0);
      }
    };

    thumb.addEventListener("pointerdown", (event) => {
      if (this.logoutInProgress || event.button > 0) return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startProgress = progress;
      thumb.setPointerCapture?.(pointerId);
      event.preventDefault();
    });

    thumb.addEventListener("pointermove", (event) => {
      if (event.pointerId !== pointerId) return;
      const travel = Math.max(1, maxTravel());
      updateProgress(
        startProgress + ((event.clientX - startX) / travel) * 100,
      );
    });

    thumb.addEventListener("pointerup", finishSwipe);
    thumb.addEventListener("pointercancel", finishSwipe);
    thumb.addEventListener("lostpointercapture", (event) => {
      if (event.pointerId === pointerId) updateProgress(0);
      pointerId = null;
    });

    track.addEventListener("keydown", (event) => {
      if (this.logoutInProgress) return;
      if (event.key === "Home") {
        event.preventDefault();
        updateProgress(0);
      } else if (event.key === "End") {
        event.preventDefault();
        updateProgress(100);
        void this.confirmLogoutFinal();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        const nextProgress = Math.min(100, progress + 10);
        updateProgress(nextProgress);
        if (nextProgress === 100) void this.confirmLogoutFinal();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        updateProgress(progress - 10);
      }
    });
    this.logoutSwipeReset = () => updateProgress(0);
  },

  resetLogoutSwipe() {
    this.logoutSwipeReset?.();
  },

  bindBackupControls() {
    qs("backupRestoreFileInput")?.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      this.pendingBackupData = null;
      const status = qs("backupRestoreStatus");
      this.updateBackupRestoreButton();
      if (!status) return;
      status.dataset.state = "";
      if (!file) {
        status.textContent = "Файли нусха интихоб нашуд.";
        return;
      }
      status.textContent = "Нусхаро санҷида истодаем...";

      try {
        const { backup, summary } = await readBackupFile(file);
        this.pendingBackupData = backup;
        this.updateBackupRestoreButton();
        status.dataset.state = "success";
        status.textContent =
          `Нусха омода аст: ${summary.grades} баҳо, ${summary.notes} ёддошт` +
          (summary.hasProfile ? ", профил" : "") +
          (summary.hasSettings ? ", танзимот." : ".");
      } catch (error) {
        console.error("Could not read the selected backup file.", error);
        status.textContent = error.message || "Файли нусхаро хонда натавонистем.";
        status.dataset.state = "error";
        this.toast.show(status.textContent);
      }
    });

    document.querySelectorAll('input[name="backupRestoreMode"]').forEach((input) => {
      input.addEventListener("change", () => {
        const replacing = qs("backupRestoreModeReplace")?.checked === true;
        const warning = qs("backupReplaceConfirmWrap");
        const confirmation = qs("backupReplaceConfirm");
        if (warning) warning.hidden = !replacing;
        if (confirmation) confirmation.checked = false;
        this.updateBackupRestoreButton();
      });
    });
    qs("backupReplaceConfirm")?.addEventListener("change", () => {
      this.updateBackupRestoreButton();
    });
  },

  updateBackupRestoreButton() {
    const replacing = qs("backupRestoreModeReplace")?.checked === true;
    const confirmed = qs("backupReplaceConfirm")?.checked === true;
    const button = qs("backupRestoreConfirmButton");
    if (button) {
      button.disabled = !this.pendingBackupData || (replacing && !confirmed);
    }
  },

  showBackupModal() {
    qs("backupExportModal")?.classList.add("open");
  },

  closeBackupExportModal() {
    qs("backupExportModal")?.classList.remove("open");
  },

  async downloadBackup() {
    try {
      await downloadBackupFile();
      this.closeBackupExportModal();
      this.toast.show("Нусхаи эҳтиётӣ ба дастгоҳ зеркашӣ шуд.");
    } catch (error) {
      console.error("Could not create the application backup.", error);
      this.toast.show(
        "Нусха сохта нашуд. Дастрасии хотираи браузерро санҷед ва дубора кӯшиш кунед.",
        7000,
      );
    }
  },

  showRestoreModal() {
    this.pendingBackupData = null;
    if (qs("backupRestoreFileInput")) qs("backupRestoreFileInput").value = "";
    if (qs("backupRestoreModeMerge")) qs("backupRestoreModeMerge").checked = true;
    if (qs("backupRestoreModeReplace")) qs("backupRestoreModeReplace").checked = false;
    if (qs("backupReplaceConfirmWrap")) {
      qs("backupReplaceConfirmWrap").hidden = true;
    }
    if (qs("backupReplaceConfirm")) qs("backupReplaceConfirm").checked = false;
    if (qs("backupRestoreStatus")) {
      qs("backupRestoreStatus").textContent =
        "Файлҳои нусхаи кӯҳна ва нав дастгирӣ мешаванд.";
      qs("backupRestoreStatus").dataset.state = "";
    }
    this.updateBackupRestoreButton();
    qs("backupRestoreModal")?.classList.add("open");
  },

  closeBackupRestoreModal() {
    qs("backupRestoreModal")?.classList.remove("open");
    this.pendingBackupData = null;
  },

  async confirmBackupRestore() {
    if (!this.pendingBackupData) {
      this.toast.show("Аввал файли нусхаи эҳтиётиро интихоб кунед.");
      return;
    }
    const mode = qs("backupRestoreModeReplace")?.checked ? "replace" : "merge";
    if (mode === "replace" && !qs("backupReplaceConfirm")?.checked) {
      this.toast.show("Барои иваз кардан аввал огоҳиро тасдиқ кунед.");
      return;
    }

    const confirmButton = qs("backupRestoreConfirmButton");
    if (confirmButton) confirmButton.disabled = true;
    try {
      const result = await restoreBackupData(this.pendingBackupData, mode);
      this.toast.show(
        result.indexedDbSaved && result.localBackupSaved
          ? "Маълумот барқарор шуд."
          : "Маълумот барқарор шуд, аммо яке аз роҳҳои нигоҳдорӣ дастрас нест.",
        5000,
      );
      this.closeBackupRestoreModal();
      setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      console.error("Could not restore the application backup.", error);
      this.updateBackupRestoreButton();
      this.toast.show(
        error.message ||
          "Маълумот барқарор нашуд. Маълумоти қаблӣ нигоҳ дошта шудааст.",
        7000,
      );
    }
  },

  async confirmLogoutFinal() {
    if (this.logoutInProgress) return;
    this.logoutInProgress = true;
    try {
      await clearState();
      window.location.reload();
    } catch (error) {
      this.logoutInProgress = false;
      this.resetLogoutSwipe();
      console.error("Could not clear saved data during logout.", error);
      this.toast.show(
        "Маълумот пок карда нашуд. Пеш аз баромадан ҳамаи равзанаҳои барномаро пӯшед ва дубора кӯшиш кунед.",
        7000,
      );
    }
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
    try {
      await clearState();
      window.location.reload();
    } catch (error) {
      console.error("Could not clear saved data during logout.", error);
      this.toast.show(
        "Маълумот пок карда нашуд. Пеш аз баромадан ҳамаи равзанаҳои барномаро пӯшед ва дубора кӯшиш кунед.",
        7000,
      );
    }
  },


};
