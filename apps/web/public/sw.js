// Minimal service worker — offline app shell + Web Push handler.
const CACHE = "sauna-shell-v3";
// Note: do NOT precache "/" — it's a 307 redirect to /login or /dashboard,
// and a cached redirect response causes Chrome/Safari to fail with
// "response served by service worker has redirections" on later visits.
const SHELL = ["/manifest.webmanifest"];

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
	if (
		event.request.method !== "GET" ||
		url.origin !== self.location.origin ||
		url.pathname.startsWith("/api/") ||
		// Don't intercept HTML navigations — let the browser handle redirects,
		// auth flows, and fresh server renders without a cached middle layer.
		event.request.mode === "navigate"
	) return;
	event.respondWith(
		caches.match(event.request).then((cached) =>
			cached ||
			fetch(event.request)
				.then((res) => {
					// Only cache plain, same-origin, non-redirected, successful responses.
					if (res.ok && res.type === "basic" && !res.redirected) {
						const copy = res.clone();
						caches.open(CACHE).then((c) => c.put(event.request, copy));
					}
					return res;
				})
				.catch(() => cached),
		),
	);
});

// ── Web Push ─────────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
	let data = {};
	try { data = event.data ? event.data.json() : {}; } catch (_) {}
	const title = data.title || "Ember";
	const options = {
		body: data.body || "",
		icon: "/icon-192.png",
		badge: "/icon-192.png",
		tag: data.tag || "ember-alert",
		data: { url: data.url || "/alerts" },
	};
	event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const url = (event.notification.data && event.notification.data.url) || "/alerts";
	event.waitUntil(
		self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
			for (const client of list) {
				if ("focus" in client) { client.navigate(url); return client.focus(); }
			}
			return self.clients.openWindow(url);
		}),
	);
});
