/* Service worker for the installable "Missing Island" web app. */

const CACHE_NAME = "missing-island-static-v1";
const MAX_STATIC_ENTRIES = 150;

const BYPASS_PREFIXES = ["/api/", "/uploads/", "/revalidate"];

const STATIC_PREFIXES = ["/_next/static/", "/fonts/", "/icons/"];

const STATIC_FILES = new Set([
  "/favicon.ico",
  "/banner.webp",
  "/manifest.webmanifest",
]);

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith("missing-island-static-") && key !== CACHE_NAME,
          )
          .map((key) => caches.delete(key)),
      );

      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;
  if (BYPASS_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  const isStatic =
    STATIC_FILES.has(url.pathname) ||
    STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));

  if (isStatic) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirst(request) {
  try {
    return await fetch(request);
  } catch {
    return offlinePage();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  if (cached) return cached;

  try {
    const response = await fetch(request);

    if (response.ok && response.type === "basic") {
      await cache.put(request, response.clone());
      await trimCache(cache);
    }

    return response;
  } catch {
    return new Response("", { status: 504, statusText: "Offline" });
  }
}

async function trimCache(cache) {
  const keys = await cache.keys();

  if (keys.length <= MAX_STATIC_ENTRIES) return;

  await Promise.all(
    keys
      .slice(0, keys.length - MAX_STATIC_ENTRIES)
      .map((key) => cache.delete(key)),
  );
}

function offlinePage() {
  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#bedbbb" />
<title>오프라인 · 어디에도 없는 섬</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  html, body { min-height: 100%; }
  body {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    margin: 0;
    padding: calc(1.5rem + env(safe-area-inset-top, 0px)) 1.5rem calc(1.5rem + env(safe-area-inset-bottom, 0px));
    background: #bedbbb;
    color: #171717;
    font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", sans-serif;
    text-align: center;
  }
  main { max-width: 21rem; }
  .caption {
    margin: 0 0 0.9rem;
    font-size: 0.68rem;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    opacity: 0.55;
  }
  h1 { margin: 0 0 0.75rem; font-size: 1.25rem; font-weight: 600; }
  p { margin: 0 0 1.4rem; font-size: 0.86rem; line-height: 1.6; opacity: 0.75; }
  a {
    display: inline-block;
    padding: 0.6rem 1.2rem;
    border: 1px solid rgba(0, 0, 0, 0.22);
    border-radius: 999px;
    color: inherit;
    font-size: 0.8rem;
    text-decoration: none;
  }
  a:hover { background: rgba(255, 255, 255, 0.35); }
  @media (prefers-color-scheme: dark) {
    body { background: #090c0a; color: #f0f0e6; }
    a { border-color: rgba(255, 255, 255, 0.25); }
    a:hover { background: rgba(255, 255, 255, 0.08); }
  }
</style>
</head>
<body>
<main>
  <p class="caption">Missing Island</p>
  <h1>지금은 섬에 닿을 수 없어요</h1>
  <p>연결이 끊긴 것 같아요.<br />네트워크를 확인한 뒤 다시 시도해 주세요.</p>
  <a href="/">다시 시도</a>
</main>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
