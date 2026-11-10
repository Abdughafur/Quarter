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

  if (currentPage === "landing.html" || currentPage === "login.html") {
    window.location.replace("index.html");
  }
}

function showStorageNotice(message) {
  let notice = document.getElementById("storage-error-notice");
  if (!notice) {
    notice = document.createElement("div");
    notice.id = "storage-error-notice";
    notice.className = "storage-error-notice";
    notice.setAttribute("role", "alert");
    document.body.prepend(notice);
  }
  notice.textContent = message;
}

window.addEventListener("choryak-storage-warning", (event) => {
  if (event.detail?.message) showStorageNotice(event.detail.message);
});

void route().catch((error) => {
  console.error("Could not check the saved profile.", error);
  showStorageNotice(
    "Маълумоти сабтшударо кушода натавонистем. Маълумот пок нашудааст; дастрасии хотираи браузерро санҷед ва саҳифаро аз нав кушоед.",
  );
});
// Created by Abdughafur - Believe GOD
