/*
 * The iPhone app's offline copy of the web app (ADR-0012, amended 2026-11-13).
 *
 * Registered only inside the iPhone app, by `src/native-bridge.ts`; a browser never
 * registers it. Network first, always: with a signal the app gets exactly what the site
 * serves now, and this copy is used only when the network fails, so a launch with no
 * signal still opens the app.
 *
 * Left alone: other sites, `/api` and Vercel's own paths, anything not a GET, and ranged
 * reads (the map's tile files and audio), which the network answers or nothing does.
 */
const CACHE = "echo-finders-app-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("echo-finders-app-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_vercel/")) return;
  if (url.pathname.startsWith("/audio/") || url.pathname.endsWith(".pmtiles")) return;
  if (request.headers.has("range")) return;

  const navigate = request.mode === "navigate";
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          // A navigation is kept as the app's front page, whatever its address says.
          void caches.open(CACHE).then((cache) => cache.put(navigate ? "/" : request, copy));
        }
        return response;
      })
      .catch(() =>
        caches
          .match(navigate ? "/" : request)
          .then((hit) => hit || Response.error()),
      ),
  );
});
