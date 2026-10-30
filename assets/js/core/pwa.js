/* pwa.js */
let deferredPrompt = null;
let hasReloadedForUpdate = false;
let isPwaSupported = false;

function isStandaloneMode() {
  if (typeof window.matchMedia !== "function") {
    return window.navigator.standalone === true;
  }
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

function setOfflineState(isOffline) {
  document.body?.setAttribute("data-offline", String(isOffline));
  document.body?.setAttribute(
    "data-network",
    isOffline ? "offline" : "online",
  );

  const offlineBadge = document.getElementById("offlineBadge");
  if (offlineBadge) {
    offlineBadge.hidden = !isOffline;
    offlineBadge.setAttribute("aria-live", "polite");
  }

  if (typeof window.dispatchEvent === "function") {
    window.dispatchEvent(
      new CustomEvent("app:network-state", {
        detail: { isOffline },
      }),
    );
  }
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

const canUseServiceWorker =
  "serviceWorker" in navigator &&
  typeof window !== "undefined" &&
  (window.location.protocol === "http:" ||
    window.location.protocol === "https:");

if (typeof window !== "undefined") {
  const initialOffline =
    typeof navigator.onLine === "boolean" ? !navigator.onLine : false;
  setOfflineState(initialOffline);

  window.addEventListener("online", () => setOfflineState(false));
  window.addEventListener("offline", () => setOfflineState(true));
}

if (canUseServiceWorker) {
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
        setOfflineState(typeof navigator.onLine === "boolean" ? !navigator.onLine : false);
      });
  });
} else {
  window.addEventListener("load", () => {
    setOfflineState(typeof navigator.onLine === "boolean" ? !navigator.onLine : false);
  });
}

window.addEventListener("load", updateInstallButton);
// Created by Abdughafur - Believe GOD
