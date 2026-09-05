/* profile.js */
/* Created by Abdughafur - ЧОРЯК 4.3.1 */
import { clean, qs, setInputValue } from "../utils/helpers.js";
import { saveState, loadState, DEFAULT_PROFILE } from "./storage.js";

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
  const notice = qs("profileNotice");

  if (profile.avatar && avatarImg) {
    avatarImg.src = profile.avatar;
    avatarImg.style.display = "block";
    if (avatarFallback) avatarFallback.style.display = "none";
  }

  function showNotice(message, type = "error") {
    if (!notice) return;
    notice.textContent = message;
    notice.className = `profile-notice profile-notice--${type}`;
  }

  function clearNotice() {
    if (!notice) return;
    notice.textContent = "";
    notice.className = "profile-notice";
  }

  ["profileNameInput", "profileSurnameInput"].forEach((id) => {
    qs(id)?.addEventListener("input", (event) => {
      sanitizeLettersOnly(event);
      clearNotice();
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

    const updatedProfile = {
      ...profile,
      name,
      surname,
      school,
    };

    await saveProfile(updatedProfile);
    showNotice("Профил сабт шуд.", "success");
    setTimeout(() => window.location.assign("startup.html"), 900);
  });
}

void init();

/* Created by Abdughafur - ЧОРЯК 4.3.1 */
