/* Службовий робітник: тримає сторінку доступною без мережі.

   Саму сторінку беремо спершу з мережі й лише потім із кешу — інакше після
   кожної правки телефон ще довго показував би стару версію. Дрібниці
   (іконки, маніфест) навпаки: спершу кеш, бо вони майже не змінюються.
   Запити до GitHub API не кешуємо ніколи — інакше вчорашні оцінки
   виглядали б як сьогоднішні. */
const CACHE_NAME = "полиця-v3";
const APP_SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME)
    .then((cache) => cache.addAll(APP_SHELL))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

/** Кладе вдалу відповідь у кеш і повертає її далі. */
function cacheResponse(request, response){
  if(response && response.ok){
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if(request.method !== "GET") return;
  if(new URL(request.url).origin !== location.origin) return;   // GitHub API — завжди в мережу

  if(request.mode === "navigate"){
    event.respondWith(
      fetch(request).then((response) => cacheResponse(request, response))
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const fresh = fetch(request).then((response) => cacheResponse(request, response))
        .catch(() => cached);
      return cached || fresh;
    })
  );
});
