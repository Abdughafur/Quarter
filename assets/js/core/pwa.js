/* pwa.js */
let deferredPrompt = null;
let hasReloadedForUpdate = false;

export function canInstallPwa() {
  return Boolean(deferredPrompt);
}

export async function promptInstallPwa() {
  if (!deferredPrompt) return false;

  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  updateInstallButton();
  return outcome === "accepted";
}

function updateInstallButton() {
  const button = document.getElementById("installPwaBtn");
  if (!button) return;

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  if (isStandalone || !deferredPrompt) {
    button.classList.remove("is-visible");
    return;
  }

  button.classList.add("is-visible");
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  updateInstallButton();
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  updateInstallButton();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hasReloadedForUpdate) return;
    hasReloadedForUpdate = true;
    window.location.reload();
  });
  window.addEventListener("load", () => {
    const swUrl = new URL("sw.js", window.location.href).href;
    const swScope = new URL(".", window.location.href).pathname;

    navigator.serviceWorker
      .register(swUrl, { scope: swScope })
      .then((registration) => {
        registration.update();
        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      })
      .catch((error) => {
        console.warn("Service worker registration failed:", error);
      });
  });
}

window.addEventListener("load", updateInstallButton);
