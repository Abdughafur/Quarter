/* login.js */
/* Created by Abdughafur - ЧОРЯК 4.5 S (Stable) */
import { clean, qs, setInputValue } from "../utils/helpers.js";
import { saveState, loadState, DEFAULT_PROFILE } from "./storage.js";
import { bindAvatarPicker } from "../ui/avatar-picker.js";
import { Toast } from "../ui/toast.js";

async function loadProfile() {
  const state = await loadState();
  return state.profile || DEFAULT_PROFILE;
}

async function saveProfile(profile) {
  const state = await loadState();
  await saveState({
    grades: state.grades,
    settings: state.settings,
    pct: state.pct,
    info: state.info,
    profile,
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
  setInputValue("profileSchoolInput", profile.school || "");

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

  ["profileNameInput", "profileSurnameInput"].forEach((id) => {
    qs(id)?.addEventListener("input", (event) => {
      sanitizeLettersOnly(event);
    });
  });

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
    const school = clean(qs("profileSchoolInput")?.value || "");

    if (!name || !surname || !school) {
      showNotice(
        "Лутфан ному насаб ва рақами мактабро пурра ворид кунед.",
        "error",
      );
      return;
    }

    if (!qs("privacyAgreementInput")?.checked) {
      showNotice(
        "Барои идома бо сиёсати махфият розӣ шавед.",
        "error",
      );
      qs("privacyAgreementInput")?.focus();
      return;
    }

    const updatedProfile = {
      ...profile,
      name,
      surname,
      school,
    };

    await saveProfile(updatedProfile);
    showNotice("Профил сабт шуд.", "success");
    setTimeout(() => window.location.assign("index.html"), 900);
  });
}

void init();

/* Created by Abdughafur - ЧОРЯК 4.5 S (Stable) */
