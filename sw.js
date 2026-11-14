/* sw.js */
var APP_VERSION = "4.5.3B16";
var CACHE_NAME =
  "choryak-cache-v" + APP_VERSION.toLowerCase().replace(/\./g, "-");

var PRECACHE = [
  "./",
  "./index.html",
  "./landing.html",
  "./login.html",
  "./privacy.html",
  "./manifest.json",
  "./assets/images/pics/logo.png",
  "./assets/images/pics/abdughafur.webp",
  "./assets/images/pics/share-qr.svg",
  "./assets/images/avatars/01.jpeg",
  "./assets/images/avatars/02.jpeg",
  "./assets/images/avatars/03.jpeg",
  "./assets/images/avatars/04.jpeg",
  "./assets/images/avatars/05.jpeg",
  "./assets/images/avatars/06.jpeg",
  "./assets/images/avatars/07.jpeg",
  "./assets/images/avatars/08.jpeg",
  "./assets/images/avatars/09.jpeg",
  "./assets/images/avatars/10.jpeg",
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
  "./assets/css/components/context-menu.css",
  "./assets/css/pages/home.css",
  "./assets/css/pages/calendar.css",
  "./assets/css/pages/lessons.css",
  "./assets/css/pages/percent.css",
  "./assets/css/pages/ai.css",
  "./assets/css/pages/settings.css",
  "./assets/css/pages/login.css",
  "./assets/css/pages/landing.css",
  "./assets/css/utilities/spacing.css",
  "./assets/css/utilities/colors.css",
  "./assets/css/utilities/shadows.css",
  "./assets/css/utilities/radius.css",
  "./assets/css/utilities/helpers.css",
  "./assets/js/core/app.js",
  "./assets/js/core/entry.js",
  "./assets/js/core/login.js",
  "./assets/js/core/backup.js",
  "./assets/js/core/storage.js",
  "./assets/js/core/app/shared.js",
  "./assets/js/core/app/features/recovery.js",
  "./assets/js/core/app/features/profile.js",
  "./assets/js/core/app/features/calculator.js",
  "./assets/js/core/app/features/navigation.js",
  "./assets/js/core/app/features/settings.js",
  "./assets/js/core/app/features/notes.js",
  "./assets/js/core/app/features/lessons.js",
  "./assets/js/core/stats.js",
  "./assets/js/core/pwa.js",
  "./assets/js/ui/toast.js",
  "./assets/js/ui/modal.js",
  "./assets/js/ui/chart.js",
  "./assets/js/ui/avatar-picker.js",
  "./assets/js/utils/helpers.js",
  "./assets/images/minai/ai.webp",
  "./assets/images/minai/hello.webp",
  "./assets/images/minai/search.webp",
  "./assets/images/minai/write.webp",
  "./assets/images/minai/smile.webp",
  "./assets/images/pics/mountain.webp"
];

function isSameOrigin(request) {
  try {
    return new URL(request.url).origin === self.location.origin;
  } catch (e) {
    return false;
  }
}

function isNavigationRequest(request) {
  return request.mode === "navigate" || request.destination === "document";
}

function getCacheKey(request) {
  return new URL(request.url).href;
}

function getUnversionedCacheKey(request) {
  var url = new URL(request.url);
  var queryKeys = Array.from(url.searchParams.keys());
  if (
    !isNavigationRequest(request) &&
    queryKeys.length === 1 &&
    queryKeys[0] === "v"
  ) {
    url.search = "";
  }
  return url.href;
}

function isVersionedRequest(request) {
  var url = new URL(request.url);
  var queryKeys = Array.from(url.searchParams.keys());
  return (
    !isNavigationRequest(request) &&
    queryKeys.length === 1 &&
    queryKeys[0] === "v"
  );
}

function cacheResponse(cache, key, response) {
  if (!response || !response.ok) return Promise.resolve(response);
  return cache
    .put(key, response.clone())
    .then(function() {
      return response;
    })
    .catch(function(error) {
      console.warn("Unable to cache response:", key, error);
      return response;
    });
}

function networkFirst(request) {
  return caches.open(CACHE_NAME).then(function(cache) {
    return fetch(request)
      .then(function(response) {
        return cacheResponse(cache, getCacheKey(request), response);
      })
      .catch(function() {
        return cache
          .match(getCacheKey(request))
          .then(function(cached) {
            if (cached) return cached;
            var fallbackKey = getUnversionedCacheKey(request);
            return fallbackKey === getCacheKey(request)
              ? null
              : cache.match(fallbackKey);
          })
          .then(function(cached) {
            return cached || cache.match("./index.html");
          })
          .then(function(cached) {
            return cached || cache.match("/index.html");
          })
          .then(function(cached) {
            return cached || cache.match("./");
          });
      });
  });
}

function cacheVersionedAsset(request) {
  var cacheKey = getCacheKey(request);
  var fallbackKey = getUnversionedCacheKey(request);

  return caches.open(CACHE_NAME).then(function(cache) {
    return cache.match(cacheKey).then(function(cached) {
      if (cached) return cached;

      return fetch(request)
        .then(function(response) {
          return cacheResponse(cache, cacheKey, response);
        })
        .catch(function(error) {
          console.warn("Unable to fetch versioned asset:", cacheKey, error);
          return cache.match(fallbackKey).then(function(fallback) {
            return fallback || Response.error();
          });
        });
    });
  });
}

function staleWhileRevalidate(request, event) {
  var cacheKey = getCacheKey(request);
  var cachePromise = caches.open(CACHE_NAME);
  var updatePromise = cachePromise.then(function(cache) {
    return fetch(request).then(function(response) {
      return cacheResponse(cache, cacheKey, response);
    });
  });

  event.waitUntil(
    updatePromise.catch(function(error) {
      console.warn("Unable to refresh cached response:", cacheKey, error);
    })
  );

  return cachePromise
    .then(function(cache) {
      return cache.match(cacheKey);
    })
    .then(function(cached) {
      return cached || updatePromise;
    })
    .catch(function(error) {
      console.warn("Unable to read cached response:", cacheKey, error);
      return Response.error();
    });
}

self.addEventListener("install", function(event) {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(function(cache) {
        return cache.addAll(PRECACHE);
      })
      .then(function() {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("message", function(event) {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", function(event) {
  event.waitUntil(
    caches
      .keys()
      .then(function(keys) {
        return Promise.all(
          keys
            .filter(function(key) {
              return key.indexOf("choryak-cache") === 0 && key !== CACHE_NAME;
            })
            .map(function(key) {
              return caches.delete(key);
            })
        );
      })
      .then(function() {
        return self.clients.claim();
      })
  );
});

self.addEventListener("fetch", function(event) {
  if (event.request.method !== "GET" || !isSameOrigin(event.request)) {
    return;
  }

  if (event.request.headers.has("range")) {
    return;
  }

  if (isNavigationRequest(event.request)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (isVersionedRequest(event.request)) {
    event.respondWith(cacheVersionedAsset(event.request));
    return;
  }

  event.respondWith(staleWhileRevalidate(event.request, event));
});
// Created by Abdughafur - Believe GOD
