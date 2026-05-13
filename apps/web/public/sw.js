// Minimal service worker — offline app shell only. Live data still requires network.
const CACHE = "sauna-shell-v1";
const SHELL = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
	event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches.keys().then((keys) =>
			Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
		),
	);
	self.clients.claim();
});

self.addEventListener("fetch", (event) => {
	const url = new URL(event.request.url);
	// Only cache GETs to our origin; never cache API or auth.
	if (
		event.request.method !== "GET" ||
		url.origin !== self.location.origin ||
		url.pathname.startsWith("/api/")
	) return;

	event.respondWith(
		caches.match(event.request).then((cached) =>
			cached ||
			fetch(event.request)
				.then((res) => {
					const copy = res.clone();
					caches.open(CACHE).then((c) => c.put(event.request, copy));
					return res;
				})
				.catch(() => cached as Response),
		),
	);
});
