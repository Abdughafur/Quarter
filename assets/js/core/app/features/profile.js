import { bindAvatarPicker } from "../../../ui/avatar-picker.js";
import { clean, qs, setInputValue, setText } from "../../../utils/helpers.js";
import { PROFILE_EDIT_SCHOOL_INPUT_IDS } from "../shared.js";

export const profileFeature = {
  bindProfile() {
    ["profileEditNameInput", "profileEditSurnameInput"].forEach((fieldId) => {
      qs(fieldId)?.addEventListener("input", (event) =>
        this.sanitizeLettersOnly(event),
      );
    });
    PROFILE_EDIT_SCHOOL_INPUT_IDS.forEach((fieldId) => {
      qs(fieldId)?.addEventListener("input", (event) => {
        const school = String(event.target.value || "")
          .replace(/\D/g, "")
          .slice(0, 4);
        event.target.value = school && Number(school) > 0 ? school : "";
      });
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest("#profileMenu")) {
        this.setProfileMenuOpen(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (qs("backupExportModal")?.classList.contains("open")) {
        this.closeBackupExportModal();
      }
      if (qs("backupRestoreModal")?.classList.contains("open")) {
        this.closeBackupRestoreModal();
      }
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
    const schools = Array.isArray(this.profile.schools)
      ? this.profile.schools
      : [this.profile.school, this.profile.school2, this.profile.school3];
    PROFILE_EDIT_SCHOOL_INPUT_IDS.forEach((id, index) => {
      setInputValue(id, schools[index] || "");
    });
    qs("profileNameModal")?.classList.add("open");
    setTimeout(() => qs("profileEditNameInput")?.focus(), 80);
  },

  closeProfileNameModal() {
    qs("profileNameModal")?.classList.remove("open");
  },

  async saveProfileName() {
    const name = clean(qs("profileEditNameInput")?.value || "");
    const surname = clean(qs("profileEditSurnameInput")?.value || "");
    const schoolValues = PROFILE_EDIT_SCHOOL_INPUT_IDS.map((id) => {
      const number = String(qs(id)?.value || "")
        .replace(/\D/g, "")
        .slice(0, 4);
      return number && Number(number) > 0 ? number : "";
    });
    const seenSchoolNumbers = new Set();
    const duplicateSchoolIndex = schoolValues.findIndex((number) => {
      if (!number) return false;
      const schoolNumber = Number(number);
      if (seenSchoolNumbers.has(schoolNumber)) return true;
      seenSchoolNumbers.add(schoolNumber);
      return false;
    });
    if (duplicateSchoolIndex !== -1) {
      this.toast.show("Рақамҳои мактаб набояд такрор шаванд.");
      qs(PROFILE_EDIT_SCHOOL_INPUT_IDS[duplicateSchoolIndex])?.focus();
      return;
    }

    const schools = schoolValues.filter(Boolean).slice(0, 5);
    const [school = ""] = schools;

    if (!name || !surname || !school) {
      this.toast.show("Лутфан ному насаб ва рақами мактаби асосиро пур кунед.");
      return;
    }

    const previousProfile = this.profile;
    this.profile = {
      ...this.profile,
      name,
      surname,
      school,
      schools,
    };
    this.updateProfileUI(this.profile);
    this.renderLessons?.();
    const result = await this.save();
    if (!result) {
      this.profile = previousProfile;
      this.updateProfileUI(this.profile);
      this.renderLessons?.();
      return;
    }

    this.closeProfileNameModal();
    this.toast.show("Профил сабт шуд.");
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

  updateProfileUI(info = {}) {
    const name = clean(info.name || "");
    const surname = clean(info.surname || "");
    const schools = (Array.isArray(info.schools)
      ? info.schools
      : [info.school, info.school2, info.school3]
    )
      .map((number) => String(number || "").replace(/\D/g, "").slice(0, 4))
      .filter((number) => number && Number(number) > 0)
      .filter((number, index, list) => list.indexOf(number) === index)
      .slice(0, 5);
    const school = schools[0] || "";
    const schoolSummary =
      schools.length === 1
        ? `Мактаби №${schools[0]}`
        : schools.length > 1
          ? `Мактабҳои ${schools.map((number) => `№${number}`).join(", ")}`
          : "Рақами мактаб илова нашудааст";
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
    setText("profileDisplaySchool", schoolSummary);
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


};
