/* login.js */
/* Created by Abdughafur - ЧОРЯК v4.5.3B4 (Beta) */
import { clean, qs, setInputValue } from "../utils/helpers.js";
import {
  saveState,
  loadState,
  DEFAULT_PROFILE,
  restoreBackupData,
} from "./storage.js";
import { readBackupFile } from "./backup.js";
import { bindAvatarPicker } from "../ui/avatar-picker.js";
import { Toast } from "../ui/toast.js";

const SCHOOL_INPUT_IDS = [
  "profileSchoolInput",
  "profileSchool2Input",
  "profileSchool3Input",
  "profileSchool4Input",
  "profileSchool5Input",
];

async function loadProfile() {
  const state = await loadState();
  return state.profile || DEFAULT_PROFILE;
}

async function saveProfile(profile) {
  const state = await loadState();
  return saveState({
    grades: state.grades,
    settings: state.settings,
    pct: state.pct,
    info: state.info,
    profile,
    notes: state.notes,
  });
}

function cleanSchoolNumber(value) {
  const school = String(value || "").replace(/\D/g, "").slice(0, 4);
  return school && Number(school) > 0 ? school : "";
}

function bindSchoolNumberInput(id) {
  qs(id)?.addEventListener("input", (event) => {
    event.target.value = cleanSchoolNumber(event.target.value);
  });
}

function sanitizeLettersOnly(event) {
  const input = event.target;
  if (!input) return;
  const value = String(input.value || "")
    .replace(/[^\p{L}\p{M}\s'\-]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trimStart();
  input.value = value;
}

async function init() {
  const profile = await loadProfile();
  setInputValue("profileNameInput", profile.name || "");
  setInputValue("profileSurnameInput", profile.surname || "");
  const schools = Array.isArray(profile.schools)
    ? profile.schools
    : [profile.school, profile.school2, profile.school3];
  SCHOOL_INPUT_IDS.forEach((id, index) => {
    setInputValue(id, schools[index] || "");
  });

  const avatarImg = qs("profileAvatarPreview");
  const avatarFallback = qs("profileAvatarPreviewFallback");
  const toast = new Toast();

  if (profile.avatar && avatarImg) {
    avatarImg.src = profile.avatar;
    avatarImg.style.display = "block";
    if (avatarFallback) avatarFallback.style.display = "none";
  }

  function showNotice(message, type = "error") {
    toast.show(message, type === "success" ? 1600 : 3500);
  }

  let pendingBackupData = null;
  const restoreModal = qs("loginRestoreModal");
  const restoreFileInput = qs("loginRestoreFileInput");
  const restoreStatus = qs("loginRestoreStatus");
  const restoreButton = qs("confirmLoginRestore");
  const closeRestoreModal = () => {
    restoreModal?.classList.remove("open");
    pendingBackupData = null;
  };

  qs("openLoginRestoreModal")?.addEventListener("click", () => {
    pendingBackupData = null;
    if (restoreFileInput) restoreFileInput.value = "";
    if (restoreButton) restoreButton.disabled = true;
    if (restoreStatus) {
      restoreStatus.textContent = "Файлҳои нусхаи кӯҳна ва нав дастгирӣ мешаванд.";
      restoreStatus.dataset.state = "";
    }
    restoreModal?.classList.add("open");
  });
  qs("cancelLoginRestore")?.addEventListener("click", closeRestoreModal);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeRestoreModal();
  });
  restoreModal?.addEventListener("click", (event) => {
    if (event.target === restoreModal) closeRestoreModal();
  });
  if (new URLSearchParams(window.location.search).get("restore") === "1") {
    restoreModal?.classList.add("open");
  }

  restoreFileInput?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    pendingBackupData = null;
    if (restoreButton) restoreButton.disabled = true;
    if (!restoreStatus) return;
    restoreStatus.dataset.state = "";
    if (!file) {
      restoreStatus.textContent = "Файли нусха интихоб нашуд.";
      return;
    }
    restoreStatus.textContent = "Нусхаро санҷида истодаем...";

    try {
      const { backup, summary } = await readBackupFile(file);
      if (!summary.hasProfile) {
        throw new Error(
          "Ин нусха профили пурра надорад. Барои ворид шудан нусхаи пурраи барномаро интихоб кунед.",
        );
      }
      pendingBackupData = backup;
      if (restoreButton) restoreButton.disabled = false;
      restoreStatus.dataset.state = "success";
      restoreStatus.textContent =
        `Нусха омода аст: ${summary.grades} баҳо, ${summary.notes} ёддошт` +
        (summary.hasProfile ? ", профил" : "") +
        (summary.hasSettings ? ", танзимот." : ".");
    } catch (error) {
      console.error("Could not read the selected login backup.", error);
      restoreStatus.textContent =
        error.message || "Файли нусхаро хонда натавонистем.";
      restoreStatus.dataset.state = "error";
      showNotice(restoreStatus.textContent);
    }
  });

  restoreButton?.addEventListener("click", async () => {
    if (!pendingBackupData) {
      showNotice("Аввал файли нусхаи эҳтиётиро интихоб кунед.");
      return;
    }
    restoreButton.disabled = true;
    try {
      const result = await restoreBackupData(pendingBackupData, "replace");
      const restoredState = await loadState();
      const restoredProfile = restoredState.profile || DEFAULT_PROFILE;
      setInputValue("profileNameInput", restoredProfile.name || "");
      setInputValue("profileSurnameInput", restoredProfile.surname || "");
      SCHOOL_INPUT_IDS.forEach((id, index) => {
        setInputValue(id, restoredProfile.schools?.[index] || "");
      });
      if (restoredProfile.avatar && avatarImg) {
        avatarImg.src = restoredProfile.avatar;
        avatarImg.style.display = "block";
        if (avatarFallback) avatarFallback.style.display = "none";
      } else {
        if (avatarImg) {
          avatarImg.removeAttribute("src");
          avatarImg.style.display = "none";
        }
        if (avatarFallback) avatarFallback.style.display = "block";
      }

      closeRestoreModal();
      if (
        restoredProfile.name &&
        restoredProfile.surname &&
        restoredProfile.school
      ) {
        showNotice(
          result.indexedDbSaved && result.localBackupSaved
            ? "Маълумот барқарор шуд. Барнома кушода мешавад."
            : "Маълумот барқарор шуд, аммо яке аз роҳҳои нигоҳдорӣ дастрас нест.",
          "success",
        );
        setTimeout(() => window.location.assign("index.html"), 700);
      } else {
        showNotice(
          "Маълумот барқарор шуд. Профилро пур карда, ворид шавед.",
          "success",
        );
      }
    } catch (error) {
      console.error("Could not restore the login backup.", error);
      restoreButton.disabled = false;
      if (restoreStatus) {
        restoreStatus.dataset.state = "error";
        restoreStatus.textContent =
          error.message || "Маълумот барқарор нашуд.";
      }
      showNotice(
        error.message ||
          "Маълумот барқарор нашуд. Маълумоти қаблӣ нигоҳ дошта шудааст.",
      );
    }
  });

  ["profileNameInput", "profileSurnameInput"].forEach((id) => {
    qs(id)?.addEventListener("input", (event) => {
      sanitizeLettersOnly(event);
    });
  });
  SCHOOL_INPUT_IDS.forEach(bindSchoolNumberInput);

  qs("profileAvatarInput")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showNotice(
        "Файли интихоб кардаи шумо дар формати Акс нест. Агар ҳоло ягон акс надоред метавонед бидуни акс профили худро созед ва баъдтар дар дохили барнома акси худро дохил кунед.",
        "error",
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (avatarImg) {
        avatarImg.src = reader.result || "";
        avatarImg.style.display = "block";
      }
      if (avatarFallback) avatarFallback.style.display = "none";
      profile.avatar = reader.result || "";
    };
    reader.readAsDataURL(file);
  });

  bindAvatarPicker({
    inputId: "profileAvatarInput",
    triggerSelector: "[data-avatar-picker-trigger]",
    onSelect: (avatar) => {
      if (avatarImg) {
        avatarImg.src = avatar;
        avatarImg.style.display = "block";
      }
      if (avatarFallback) avatarFallback.style.display = "none";
      profile.avatar = avatar;
    },
  });

  qs("saveProfileButton")?.addEventListener("click", async () => {
    const name = clean(qs("profileNameInput")?.value || "");
    const surname = clean(qs("profileSurnameInput")?.value || "");
    const schoolValues = SCHOOL_INPUT_IDS.map((id) =>
      cleanSchoolNumber(qs(id)?.value),
    );
    const seenSchoolNumbers = new Set();
    const duplicateSchoolIndex = schoolValues.findIndex((school) => {
      if (!school) return false;
      const schoolNumber = Number(school);
      if (seenSchoolNumbers.has(schoolNumber)) return true;
      seenSchoolNumbers.add(schoolNumber);
      return false;
    });
    if (duplicateSchoolIndex !== -1) {
      showNotice("Рақамҳои мактаб набояд такрор шаванд.", "error");
      qs(SCHOOL_INPUT_IDS[duplicateSchoolIndex])?.focus();
      return;
    }

    const schools = schoolValues.filter(Boolean);
    const [school = ""] = schools;

    if (!name || !surname || !school) {
      showNotice(
        "Лутфан ному насаб ва рақами мактабро пурра ворид кунед.",
        "error",
      );
      return;
    }

    if (!qs("privacyAgreementInput")?.checked) {
      showNotice("Барои идома бо сиёсати махфият розӣ шавед.", "error");
      qs("privacyAgreementInput")?.focus();
      return;
    }

    const updatedProfile = {
      ...profile,
      name,
      surname,
      school,
      schools,
    };

    try {
      const result = await saveProfile(updatedProfile);
      if (!result.indexedDbSaved) {
        showNotice(
          "Профил дар нусхаи маҳаллии браузер сабт шуд, аммо IndexedDB дастрас нест.",
        );
      } else {
        showNotice("Профил сабт шуд.", "success");
      }
      setTimeout(() => window.location.assign("index.html"), 900);
    } catch (error) {
      console.error("Could not save the profile.", error);
      showNotice(
        "Профил сабт нашуд. Маълумоти қаблӣ нигоҳ дошта шудааст; хотираи браузерро санҷед ва дубора кӯшиш кунед.",
      );
    }
  });
}

void init().catch((error) => {
  console.error("Could not initialize the profile form.", error);
  new Toast().show(
    "Маълумоти профилро кушода натавонистем. Маълумоти қаблӣ пок нашудааст; хотираи браузерро санҷед ва саҳифаро аз нав кушоед.",
    9000,
  );
});

/* Created by Abdughafur - ЧОРЯК v4.5.3B4 (Beta) */
// Created by Abdughafur - Believe GOD
