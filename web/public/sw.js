// Service worker CSM (PWA, 10 oct. 2026). Volontairement minimal : AUCUNE donnée métier n'est mise en cache (données
// personnelles PMR, postes partagés). Il sert à l'installation, à une page « hors connexion » et aux notifications
// (Android exige un service worker pour les afficher).
const OFFLINE = "/offline.html";
const CACHE = "csm-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/icons/icon-192.png"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Navigation seulement : réseau d'abord, page hors connexion si le réseau manque. Rien d'autre n'est intercepté.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)));
});

// Clic sur une notification affichée par le service worker : onglet CSM ramené au premier plan, sur le lien.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";
  const url = new URL(link, self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url.href);
          return c.focus();
        }
      }
      return self.clients.openWindow(url.href);
    }),
  );
});
