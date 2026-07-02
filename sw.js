/* sw.js */
const CACHE_NAME = "choryak-v4.1";

const PRECACHE = [
  "./",
  "./index.html",
  "./profile.html",
  "./manifest.json",
  "./assets/css/main.css",
  "./assets/css/core/reset.css",
  "./assets/css/core/variables.css",
  "./assets/css/core/base.css",
  "./assets/css/core/typography.css",
  "./assets/css/core/animations.css",
  "./assets/css/themes/light.css",
  "./assets/css/themes/dark.css",
  "./assets/css/themes/glass.css",
  "./assets/css/layout/grid.css",
  "./assets/css/layout/container.css",
  "./assets/css/layout/header.css",
  "./assets/css/layout/footer.css",
  "./assets/css/layout/navigation.css",
  "./assets/css/components/buttons.css",
  "./assets/css/components/cards.css",
  "./assets/css/components/inputs.css",
  "./assets/css/components/switches.css",
  "./assets/css/components/modal.css",
  "./assets/css/components/toast.css",
  "./assets/css/components/charts.css",
  "./assets/css/components/keypad.css",
  "./assets/css/components/loader.css",
  "./assets/css/components/badges.css",
  "./assets/css/pages/home.css",
  "./assets/css/pages/percent.css",
  "./assets/css/pages/ai.css",
  "./assets/css/pages/settings.css",
  "./assets/css/pages/profile.css",
  "./assets/css/utilities/spacing.css",
  "./assets/css/utilities/colors.css",
  "./assets/css/utilities/shadows.css",
  "./assets/css/utilities/radius.css",
  "./assets/css/utilities/helpers.css",
  "./assets/js/core/app.js",
  "./assets/js/core/profile.js",
  "./assets/js/core/storage.js",
  "./assets/js/core/stats.js",
  "./assets/js/core/pwa.js",
  "./assets/js/ai/minai.js",
  "./assets/js/ui/toast.js",
  "./assets/js/ui/modal.js",
  "./assets/js/ui/chart.js",
  "./assets/js/utils/helpers.js",
];

function isDownloadPage(url) {
  return /\/download\.html(?:$|[?#])/.test(url.pathname);
}

function isSameOrigin(request) {
  try {
    return new URL(request.url).origin === self.location.origin;
  } catch {
    return false;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !isSameOrigin(event.request)) return;

  const url = new URL(event.request.url);

  if (isDownloadPage(url)) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response;
          }

          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => cached);
    }),
  );
});
