/* Службовий робітник: тримає сторінку доступною без мережі.
   Оболонку віддаємо з кешу й тихо оновлюємо; дані до GitHub API ніколи
   не кешуємо — інакше показували б учорашні оцінки як сьогоднішні. */
const КЕШ = "полиця-v1";
const ОБОЛОНКА = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (подія) => {
  подія.waitUntil(caches.open(КЕШ).then((кеш) => кеш.addAll(ОБОЛОНКА)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (подія) => {
  подія.waitUntil(
    caches.keys()
      .then((назви) => Promise.all(назви.filter((н) => н !== КЕШ).map((н) => caches.delete(н))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (подія) => {
  const запит = подія.request;
  if(запит.method !== "GET") return;
  const адреса = new URL(запит.url);
  if(адреса.origin !== location.origin) return;   // GitHub API — завжди в мережу

  подія.respondWith(
    caches.match(запит).then((збережене) => {
      const свіже = fetch(запит).then((відповідь) => {
        if(відповідь && відповідь.ok){
          const копія = відповідь.clone();
          caches.open(КЕШ).then((кеш) => кеш.put(запит, копія));
        }
        return відповідь;
      }).catch(() => збережене);
      return збережене || свіже;
    })
  );
});
