import { loadState } from "./storage.js";

const currentPage = window.location.pathname.split("/").pop() || "index.html";

function hasProfile(profile) {
  return Boolean(profile?.name && profile?.surname && profile?.school);
}

async function route() {
  const state = await loadState();
  const profileReady = hasProfile(state.profile);

  if (!profileReady) {
    if (currentPage !== "landing.html" && currentPage !== "login.html") {
      window.location.replace("landing.html");
    }
    return;
  }

  if (
    currentPage === "landing.html" ||
    currentPage === "login.html"
  ) {
    window.location.replace("index.html");
  }
}

void route().catch(() => {
  if (currentPage !== "landing.html") {
    window.location.replace("landing.html");
  }
});
