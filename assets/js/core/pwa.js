/* pwa.js */
let deferredPrompt = null;
let hasReloadedForUpdate = false;
let isPwaSupported = false;

function isStandaloneMode() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true ||
    window.matchMedia("(display-mode: fullscreen)").matches
  );
}

function isIOS() {
  return /iPhone|iPad|iPod/i.test(window.navigator.userAgent);
}

function isSafari() {
  return (
    /Safari/i.test(window.navigator.userAgent) &&
    !/Chrome|CriOS|FxiOS|EdgiOS/i.test(window.navigator.userAgent)
  );
}

function updateInstallButton() {
  const button = document.getElementById("installPwaBtn");
  if (!button) return;

  const shouldShow =
    !isStandaloneMode() && (deferredPrompt || isIOS() || isSafari());
  button.classList.toggle("is-visible", shouldShow);
  button.style.display = shouldShow ? "flex" : "none";
}

export function canInstallPwa() {
  return Boolean(deferredPrompt);
}

export async function promptInstallPwa() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    updateInstallButton();
    return outcome === "accepted";
  }

  if (isIOS() && isSafari()) {
    window.open(
      "https://developer.apple.com/documentation/webkit/promoting-progressive-web-apps-to-the-home-screen",
      "_blank",
      "noopener",
    );
    return false;
  }

  return false;
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  isPwaSupported = false;
  updateInstallButton();
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  isPwaSupported = true;
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
        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }
        return registration.update();
      })
      .catch((error) => {
        console.warn("Service worker registration failed:", error);
      });
  });
}

window.addEventListener("load", updateInstallButton);
