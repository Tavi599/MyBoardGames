/* ── дрібні помічники ────────────────────────────────────────────────
   Те, що не знає про полицю нічого: рядки, числа, вузли сторінки. */

const byId = (id) => document.getElementById(id);

/* Атрибути в розмітці стоять в одинарних лапках, тож апостроф екранується
   нарівні з подвійною лапкою: інакше «Кам'яна доба» закриває атрибут, а
   решта назви стає розміткою. */
const HTML_ESCAPES = {"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"};
const escapeHtml = (text) => String(text == null ? "" : text)
  .replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

/* Адреса, яку не страшно покласти в href чи src.

   escapeHtml() рятує від виходу з атрибута, але не від самої адреси:
   «javascript:» в href — це чужий код у нашій сторінці, а на сторінці лежить
   ключ доступу до репозиторію. Адреси в даних не всі наші: посилання на
   правила вписують руками, обкладинки приїжджають із BGG, а імпорт JSON
   приймає взагалі будь-що. Тому все, що йде в href або src, проходить тут.

   Схему звіряємо з очищеної копії: «java\tscript:» браузер прочитає як
   схему, а наївна перевірка — ні. Відносні адреси лишаємо: коду в них
   немає, а сторінка з диска на них і живе. */
const SAFE_URL_SCHEME = /^(?:https?|mailto):/i;
function safeUrl(url){
  const text = String(url == null ? "" : url).trim();
  const compact = text.replace(/[\u0000- ]/g, "");
  if(!/^[a-z][a-z0-9+.-]*:/i.test(compact)) return text;      // відносна
  return SAFE_URL_SCHEME.test(compact) ? text : "";
}

/** Українська множина: 1 гравець, 2 гравці, 5 гравців. */
function pluralize(count, one, few, many){
  const lastTwo = Math.abs(count) % 100, last = lastTwo % 10;
  if(lastTwo > 10 && lastTwo < 20) return many;
  if(last === 1) return one;
  if(last >= 2 && last <= 4) return few;
  return many;
}

/** 6.5 → «6,5», 7 → «7». Кома, бо українською десяткова кома.

    Лише справжні числа: результат іде в розмітку без екранування, а дані
    приходять і з чужих рук (імпорт JSON, сусідній пристрій). Рядок на місці
    оцінки — це не оцінка, а нагода вставити в сторінку свій код, тож усе,
    що не число, стає порожнім. Числовий рядок («7.5») читаємо як число. */
function formatNumber(value){
  if(value == null || value === "") return "";
  const number = typeof value === "number" ? value : Number(value);
  return isFinite(number) ? String(number).replace(".", ",") : "";
}

/** Клас кольору для оцінки за десятибальною шкалою. */
function scoreBandClass(score){
  if(score == null) return "";
  return score <= 3 ? "b-low" : score <= 6 ? "b-mid" : score <= 8 ? "b-good" : "b-top";
}

/** [2,3,5,6] → «2–3 · 5–6»: суцільні відрізки склеюються, бо «2, 3, 4, 5»
    читається гірше за «2–5». */
function formatRanges(numbers){
  if(!Array.isArray(numbers) || !numbers.length) return "";
  const parts = [];
  let start = numbers[0], end = numbers[0];
  const flush = () => parts.push(start === end ? String(start) : start + "–" + end);
  for(let i = 1; i < numbers.length; i++){
    if(numbers[i] === end + 1){ end = numbers[i]; continue; }
    flush();
    start = end = numbers[i];
  }
  flush();
  return parts.join(" · ");
}

const MONTH_SHORT = ["січ", "лют", "бер", "квіт", "трав", "черв",
                     "лип", "серп", "вер", "жовт", "лист", "груд"];
/** «2026-09-13» → «13 вер». Рік дописуємо лише чужий: свій і так видно. */
function formatShortDate(isoDate, now){
  const parts = String(isoDate || "").split("-");
  if(parts.length !== 3) return String(isoDate || "");
  const thisYear = new Date(now == null ? Date.now() : now).getFullYear();
  return (+parts[2]) + " " + (MONTH_SHORT[+parts[1] - 1] || parts[1]) +
    (+parts[0] === thisYear ? "" : " " + parts[0]);
}
/** Сьогодні як «YYYY-MM-DD» за місцевим часом: партію грали ввечері тут,
    а не вранці за Гринвічем. */
function todayIso(){
  const now = new Date();
  const twoDigits = (n) => (n < 10 ? "0" : "") + n;
  return now.getFullYear() + "-" + twoDigits(now.getMonth() + 1) + "-" + twoDigits(now.getDate());
}

/* ── список по частинах ───────────────────────────────────────────────
   Раніше кожне перемальовування складало увесь список одним рядком HTML
   і клало його в innerHTML. При дев'яноста коробках це непомітно, при
   кількох сотнях — уже ні: набір слова в пошуку — це перемальовування на
   кожну літеру, тобто створити наново всі рядки з усіма <img>.

   Тому вузли живуть далі, а перемальовується лише те, що змінилося.
   Ключ — id запису. Ознака зміни — сам зліплений HTML рядка: у ньому
   вже є все, від чого рядок залежить (оцінки, статуси, позначка
   порівняння, поточний склад столу), тож окремого опису «що
   враховувати» не треба — а отже, нема чому й розійтися з дійсністю. */
const renderedHtmlOf = new WeakMap();
const nodeTemplate = document.createElement("template");
function nodeFromHtml(html){
  nodeTemplate.innerHTML = html;
  const node = nodeTemplate.content.firstElementChild;
  renderedHtmlOf.set(node, html);
  return node;
}
/** Приводить дітей `container` до `items`, чіпаючи лише те, що змінилося:
    зниклі прибирає, нові створює, наявні пересуває на місце. Кожен елемент
    мусить мати `id`, а його HTML — кореневий вузол із тим самим `data-id`. */
function reconcileChildren(container, items, toHtml){
  const existing = new Map();
  Array.prototype.forEach.call(container.children, (node) => {
    if(node.dataset.id) existing.set(node.dataset.id, node);
  });
  let previous = null;
  items.forEach((item) => {
    const html = toHtml(item);
    let node = existing.get(item.id);
    if(node){
      existing.delete(item.id);
      // Рядок змінився — ліпимо новий цілком, а не вгадуємо, що саме
      // всередині поїхало: власного стану в рядку немає, губити нічого.
      if(renderedHtmlOf.get(node) !== html){
        const fresh = nodeFromHtml(html);
        container.replaceChild(fresh, node);
        node = fresh;
      }
    } else node = nodeFromHtml(html);
    const expectedPlace = previous ? previous.nextSibling : container.firstChild;
    if(node !== expectedPlace) container.insertBefore(node, expectedPlace);
    previous = node;
  });
  // Зайве лишилося в мапі: його або прибрали з полиці, або відсіяв фільтр.
  existing.forEach((node) => node.remove());
}
