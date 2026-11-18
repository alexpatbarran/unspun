// Unspun service worker: shows "new stories" notifications and keeps the icon badge right.
// It does not cache anything, so the app always loads fresh.
const SCOPE = self.registration.scope;              // e.g. https://alexpatbarran.github.io/unspun/
const STATE = SCOPE + "state/read.json";            // read list, written by the app

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

async function unreadCount(){
  const [r, saved] = await Promise.all([
    fetch(SCOPE + "news.json?t=" + Date.now(), { cache: "no-store" }),
    caches.open("unspun-state").then(c => c.match(STATE))
  ]);
  const j = await r.json();
  const read = saved ? await saved.json() : {};
  const blocked = a => /grand\s*theft\s*auto|\bgta\s*-?\s*(6|vi|six)\b/i.test([a.title, a.summary, ...(a.keyFacts || [])].join(" "));
  return (j.articles || []).filter(a => a && a.id && !read[a.id] && !blocked(a)).length;
}

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil((async () => {
    // show the notification first; a unique tag so each update alerts instead of silently replacing the last one
    await self.registration.showNotification(d.title || "Unspun", {
      body: d.body || "New stories are in.",
      icon: SCOPE + "icons/icon-192.png",
      tag: "unspun-" + Date.now(),
      data: { url: SCOPE }
    });
    try {
      const n = await unreadCount();
      if (self.navigator && self.navigator.setAppBadge) n ? await self.navigator.setAppBadge(n) : await self.navigator.clearAppBadge();
    } catch {}
  })());
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) if (w.url.startsWith(SCOPE) && "focus" in w) return w.focus();
    return self.clients.openWindow(SCOPE);
  })());
});
