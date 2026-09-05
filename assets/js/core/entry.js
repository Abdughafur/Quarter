import { loadState } from "./storage.js";

const currentPage = window.location.pathname.split("/").pop() || "index.html";

function hasProfile(profile) {
  return Boolean(profile?.name && profile?.surname && profile?.school);
}

async function route() {
  const state = await loadState();
  const profileReady = hasProfile(state.profile);
  const onboardingDone =
    localStorage.getItem("choryak_onboarding_done") === "true";

  if (!profileReady) {
    if (currentPage !== "landing.html" && currentPage !== "profile.html") {
      window.location.replace("landing.html");
    }
    return;
  }

  if (!onboardingDone) {
    if (currentPage !== "startup.html") {
      window.location.replace("startup.html");
    }
    return;
  }

  if (
    currentPage === "landing.html" ||
    currentPage === "profile.html" ||
    currentPage === "startup.html"
  ) {
    window.location.replace("index.html");
  }
}

void route().catch(() => {
  if (currentPage !== "landing.html") {
    window.location.replace("landing.html");
  }
});
