/* ── стан перегляду ───────────────────────────────────────────────────
   Усе, що описує, як людина зараз дивиться на полицю: фільтри, сортування,
   вигляд списку, відкрита картка, режим порівняння. До даних це не
   належить і в базу не їде. Частину, від якої залежить вибірка, оголошено
   в «02-filters.js» (defaultView) — там її перевіряють тести. */

const LAYOUT = {LIST: "list", GRID: "grid"};
const MAX_COMPARED = 4;

/* Вигляд списку — річ пристрою, а не полиці: на телефоні зручніша сітка,
   за столом — список. Тому він лежить у пам'яті цього браузера й ніколи
   не їде в репозиторій разом з оцінками; на іншому пристрої свій. */
function loadSavedLayout(){
  return readStored(STORAGE_KEYS.layout) === LAYOUT.GRID ? LAYOUT.GRID : LAYOUT.LIST;
}
function saveLayout(layout){ writeStored(STORAGE_KEYS.layout, layout); }

const view = Object.assign(defaultView(), {
  layout: loadSavedLayout(),
  comparing: false,           // чи ввімкнено режим порівняння
  compared: new Set(),        // id коробок, позначених для порівняння
  openGameId: null,           // чия картка відкрита
  showFullPlayLog: false,     // журнал у картці розгорнуто повністю
});

/** Коробка, чию картку зараз відкрито, або null. */
function openGame(){ return view.openGameId ? store.findGame(view.openGameId) : null; }
