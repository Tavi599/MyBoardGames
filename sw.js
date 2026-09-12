/* Службовий робітник: тримає сторінку доступною без мережі.

   Саму сторінку беремо спершу з мережі й лише потім із кешу — інакше після
   кожної правки телефон ще довго показував би стару версію. Дрібниці
   (іконки, маніфест) навпаки: спершу кеш, бо вони майже не змінюються.
   Запити до GitHub API не кешуємо ніколи — інакше вчорашні оцінки
   виглядали б як сьогоднішні. */
const КЕШ = "полиця-v2";
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

function покласти(запит, відповідь){
  if(відповідь && відповідь.ok){
    const копія = відповідь.clone();
    caches.open(КЕШ).then((кеш) => кеш.put(запит, копія));
  }
  return відповідь;
}

self.addEventListener("fetch", (подія) => {
  const запит = подія.request;
  if(запит.method !== "GET") return;
  if(new URL(запит.url).origin !== location.origin) return;   // GitHub API — завжди в мережу

  if(запит.mode === "navigate"){
    подія.respondWith(
      fetch(запит).then((відповідь) => покласти(запит, відповідь))
        .catch(() => caches.match(запит).then((з) => з || caches.match("./index.html")))
    );
    return;
  }

  подія.respondWith(
    caches.match(запит).then((збережене) => {
      const свіже = fetch(запит).then((відповідь) => покласти(запит, відповідь))
        .catch(() => збережене);
      return збережене || свіже;
    })
  );
});
