/* ── підсумки й список ────────────────────────────────────────────── */

function summaryCellHtml(title, value){
  return "<div><dt>" + title + "</dt><dd>" + value + "</dd></div>";
}
function renderSummary(){
  const shelf = shelfGames(store.games, view.hidden);
  // «На полиці» — це те, що справді стоїть удома. Позбуті коробки й чужі
  // сюди не рахуються, хоч і лишаються в списку зі своїми оцінками.
  const owned = shelf.filter((game) => hasStatus(game, STATUS.OWNED));
  const ownedExpansions = owned.filter((game) => game.expansion).length;
  // Чужі коробки стоять поруч із числом полиці окремим доважком: пограти
  // в них можна, але твоїми вони не стали. Ті, що з «позбувся», сюди не
  // йдуть: це коробки, які друг уже продав, — пограти в них не вийде.
  const atFriends = shelf.filter((game) =>
    hasStatus(game, STATUS.FRIENDS) && !hasStatus(game, STATUS.GONE)).length;
  // «Онлайн» рахує все, у що граєш онлайн, — і те, що стоїть удома теж.
  // Це не частка від полиці, а окреме питання «скільки ігор доступні
  // мені в мережі», тож перетин із «на полиці» тут доречний.
  const online = shelf.filter((game) => hasStatus(game, STATUS.ONLINE)).length;
  const rated = shelf.filter((game) => game.score != null).length;
  const totalPlays = shelf.reduce((sum, game) => sum + playCount(game), 0);
  byId("shelfSummary").innerHTML =
    summaryCellHtml("Ігор на полиці", (owned.length - ownedExpansions) +
      (ownedExpansions ? " <small>+ " + ownedExpansions + " доп.</small>" : "") +
      (atFriends ? " <small>+ " + atFriends + " у друзів</small>" : "")) +
    // Порядок такий, щоб на телефоні у два стовпці «партій зіграно»
    // стало точно під «ігор на полиці»: обидва — про саму полицю,
    // а «онлайн» і «оцінено» — про те, що з нею робиться.
    summaryCellHtml("Ігор онлайн", online) +
    summaryCellHtml("Партій зіграно", totalPlays) +
    summaryCellHtml("Оцінено", rated + " <small>з " + shelf.length + "</small>");
}

const boxesWord = (count) => pluralize(count, "коробка", "коробки", "коробок");

/** Рядок над списком: скільки коробок видно й чому саме стільки.
    Фільтри тепер за кнопкою, тож кожне ввімкнене звуження стоїть тут
    плашкою — і знімається дотиком по ній. Плашки дістаються лише тим,
    що сховане в шухляді: пошук і указник за літерою видно й так. */
function renderFoundRow(shown){
  const total = store.games.length;
  // Поки полиця їде з бази, рахувати нічого: «0 коробок» злякало б дарма.
  byId("foundRow").hidden = !store.ready;
  if(!store.ready) return;
  const narrowings = activeNarrowings(store.games, view);
  byId("foundCount").textContent = narrowings.length
    ? shown.length + " " + boxesWord(shown.length) + " з " + total
    : total + " " + boxesWord(total);
  byId("narrowingPills").innerHTML = narrowings.filter((narrowing) => !narrowing.slot)
    .map((narrowing) =>
      "<button class='pill' type='button' data-clear='" + escapeHtml(narrowing.kind) + ":" +
      escapeHtml(narrowing.key) + "' title='Зняти'>" + escapeHtml(narrowing.label) + ": " +
      escapeHtml(narrowing.value) + "<i aria-hidden='true'>✕</i></button>").join("");
  byId("resetFiltersButton").hidden = !narrowings.length;
  renderFiltersButton(narrowings);
}

/* ── рядок і плитка ───────────────────────────────────────────────────
   Спільне для обох виглядів: обкладинка, позначка порівняння й кнопка
   правил. Різниця між рядком і плиткою — у тому, скільки тексту навколо
   них, а не в тому, з чого вони складені. */

function rowClasses(game){
  // Позначки рядка йдуть від найтихішої до найгучнішої, бо саме в
  // такому порядку їх перекриває CSS: доповнення тихіше за те, чия
  // це взагалі коробка. Крапка біля назви фарбується за першим
  // статусом — він же найважливіший.
  return "s-" + escapeHtml(statusesOf(game)[0] || "") + (game.expansion ? " exp" : "") +
    (hasStatus(game, STATUS.FRIENDS) ? " other" : "") +
    (hasStatus(game, STATUS.FOR_SALE) ? " sale" : "") +
    (view.compared.has(game.id) ? " picked" : "");
}
/** `overlay` лягає всередину обкладинки — так у плитці на ній тримається
    кутик з оцінкою BGG. Рядкові він не потрібен: там ця оцінка стоїть
    просто під твоєю. */
function coverHtml(game, overlay){
  return "<span class='cov'>" + coverImageHtml(game, true) + (overlay || "") + "</span>";
}
/* Оцінка BGG кутиком навпроти твоєї: твоя вгорі праворуч, чужа внизу
   ліворуч. Без неї плитка каже просто «8», і з двох метрів незрозуміло,
   чия то вісімка; у рядку вони стоять одна під одною й такого питання
   не виникає. */
function bggCornerHtml(game){
  return game.bggRating
    ? "<span class='cov-bgg'>BGG " + formatNumber(game.bggRating) + "</span>" : "";
}
function compareMarkHtml(game){
  return view.comparing
    ? "<label class='pick'><input type='checkbox' data-compare='" + escapeHtml(game.id) + "' " +
      (view.compared.has(game.id) ? "checked" : "") + " aria-label='Порівняти " +
      escapeHtml(game.name) + "'></label>"
    : "<span class='pick'></span>";
}
// Швидкий виклик правил: суперечка за столом трапляється саме тоді,
// коли лізти в картку ніколи.
function rulesButtonHtml(game){
  const rule = firstRule(game);
  if(!rule) return "<span class='rules-btn ghost'></span>";
  const kinds = sortedRules(game).map((each) => RULE_KIND_LABELS[each.kind] || each.kind);
  return "<a class='rules-btn' href='" + escapeHtml(safeUrl(rule.url)) + "' target='_blank'" +
    " rel='noopener noreferrer' title='" + escapeHtml(kinds.join(" · ")) +
    "' aria-label='Правила: " + escapeHtml(game.name) + "'>П</a>";
}
function scoreHtml(game){
  const score = scoreInView(game, view);
  return "<div class='score " + scoreBandClass(score) + "'><span class='num" +
    (score == null ? " none" : "") + "'>" + (score == null ? "—" : formatNumber(score)) + "</span>" +
    "<span class='meter'><i style='width:" + (score == null ? 0 : score * 10) + "%'></i></span>" +
    (game.bggRating ? "<span class='bgg'>BGG " + formatNumber(game.bggRating) + "</span>" : "") +
    "</div>";
}
function nameHtml(game, extraBadges){
  return "<span class='nm'><i class='dot'></i><span class='txt'>" + escapeHtml(game.name) + "</span>" +
    (game.expansion ? "<span class='badge'>доп.</span>" : "") + (extraBadges || "") + "</span>";
}
/** Дрібний рядок під назвою: статуси, жанри, склад, час, партії, теги. */
function rowMetaText(game){
  const parts = [];
  const statuses = statusLabels(game);
  if(statuses.length) parts.push(statuses.join(" · "));
  // Родина плюс перші три ключові жанри. Усі двадцять два в рядок не
  // влазять і не мусять — решта чекає в картці.
  const genres = familyLabels(game).concat(keyGenreLabels(game).slice(0, 3));
  if(genres.length) parts.push(genres.join(" · "));
  parts.push(playersText(game), durationText(game));
  if(game.plays){
    // Дата останньої партії стоїть тут же, при лічильнику: заради неї
    // журнал і заводили, а окремої колонки вона не варта.
    const lastDate = lastPlayedOn(game);
    parts.push(game.plays + " " + pluralize(game.plays, "партія", "партії", "партій") +
      (lastDate ? ", востаннє " + formatShortDate(lastDate) : ""));
  }
  const weight = weightOf(game);
  if(weight) parts.push("складність " + formatNumber(weight));
  if(game.tags && game.tags.length) parts.push(game.tags.join(" · "));
  return parts.filter(Boolean).join(" · ");
}
function rowHtml(game){
  const expansions = linkedExpansionNames(game, store.games);
  // У рядку — тільки ті склади, за які оцінка вже стоїть. Порожні
  // клітинки з'їдали половину ширини й відсували назву гри; решта
  // складів чекає в картці, і щойно там з'явиться оцінка — клітинка
  // сама вигулькне тут.
  const countCells = ratedPlayerCounts(game).map((count) => {
    const score = game.byCount[count];
    return "<span class='cnt " + scoreBandClass(score) +
      (view.filters.playerCount === count ? " now" : "") +
      "'><b>" + formatNumber(score) + "</b><i>" + escapeHtml(playerCountLabel(game, count)) +
      "</i></span>";
  }).join("");
  const expansionsBadge = expansions.length
    ? "<span class='badge plus' title='Завжди з: " + escapeHtml(expansions.join(", ")) +
      "'>+" + expansions.length + " доп.</span>" : "";
  return "<li class='row " + rowClasses(game) + "' data-id='" + escapeHtml(game.id) + "'>" +
    compareMarkHtml(game) + coverHtml(game) +
    "<button class='open' data-open-game='" + escapeHtml(game.id) + "'>" +
      nameHtml(game, expansionsBadge) +
      (game.nameEn ? "<span class='alt'>" + escapeHtml(game.nameEn) + "</span>" : "") +
      "<span class='meta'>" + escapeHtml(rowMetaText(game)) + "</span>" +
      (game.comment ? "<span class='note'>" + escapeHtml(game.comment) + "</span>" : "") +
    "</button>" +
    rulesButtonHtml(game) +
    "<div class='counts'>" + countCells + "</div>" +
    // Оцінка BGG живе в колонці оцінки, а не в кінці рядка метаданих:
    // там її з'їдало обрізання, щойно перед нею набиралося досить тексту.
    // Тут вона стоїть просто під твоєю оцінкою — і видно, чи ви згодні.
    scoreHtml(game) +
  "</li>";
}
/* Плитка: обкладинка на всю ширину, оцінка кутиком на ній, назва під
   нею — і більше нічого. Решта дізнається дотиком по самій плитці.
   Саме тому все, крім назви, лежить поверх обкладинки: інакше «мінімум
   тексту» перетворюється на той самий рядок, лише вужчий. */
function tileHtml(game){
  return "<li class='tile " + rowClasses(game) + "' data-id='" + escapeHtml(game.id) + "'>" +
    "<button class='open' data-open-game='" + escapeHtml(game.id) + "' title='" +
      escapeHtml(game.name) + "'>" +
      coverHtml(game, bggCornerHtml(game)) + nameHtml(game) +
    "</button>" +
    scoreHtml(game) + rulesButtonHtml(game) + compareMarkHtml(game) +
  "</li>";
}

function showEmptyState(title, hint){
  const node = byId("emptyState");
  node.hidden = false;
  node.innerHTML = "<b>" + title + "</b>" + hint;
}
function renderList(){
  const list = byId("gameList");
  const shown = visibleGames(store.games, view);
  const asGrid = view.layout === LAYOUT.GRID;
  const playerCount = view.filters.playerCount;
  list.classList.toggle("grid", asGrid);
  document.documentElement.style.setProperty("--pick", view.comparing ? "26px" : "0px");
  byId("listHeaderScore").textContent = playerCount === ANY
    ? "Оцінка" : "На " + PLAYER_COUNT_LABELS[playerCount];
  renderFoundRow(shown);

  if(!store.ready){
    list.innerHTML = "";
    byId("listHeader").hidden = true;
    showEmptyState("Хвилинку", "Дістаю полицю з бази.");
    return;
  }
  byId("listHeader").hidden = shown.length === 0 || asGrid;
  if(!shown.length){
    list.innerHTML = "";
    if(!store.games.length) showEmptyState("Полиця порожня", "Натисни «Додати гру» — і почнеться.");
    else showEmptyState("Нічого не підходить", "Спробуй інший склад столу, статус або пошук.");
    return;
  }
  byId("emptyState").hidden = true;
  reconcileChildren(list, shown, asGrid ? tileHtml : rowHtml);
}

byId("gameList").addEventListener("click", (event) => {
  const opener = event.target.closest("[data-open-game]");
  if(opener) openCard(opener.dataset.openGame);
});
byId("gameList").addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-compare]");
  if(!checkbox) return;
  const id = checkbox.dataset.compare;
  if(checkbox.checked){
    if(view.compared.size >= MAX_COMPARED){
      checkbox.checked = false;
      toast("Більше чотирьох поруч уже не читається.");
      return;
    }
    view.compared.add(id);
  } else view.compared.delete(id);
  renderAll();
});
byId("narrowingPills").addEventListener("click", (event) => {
  /* Плашка знімає своє звуження — і лишає решту. Саме цього від неї й
     чекаєш: «прибрати оце», а не «скинути все». */
  const pill = event.target.closest("[data-clear]");
  if(!pill) return;
  const [kind, key] = pill.dataset.clear.split(":");
  clearNarrowing(view, kind, key);
  renderFilterPanel();
  renderAll();
});
byId("resetFiltersButton").addEventListener("click", resetFiltersAndRender);
byId("compareButton").addEventListener("click", function(){
  view.comparing = !view.comparing;
  this.setAttribute("aria-pressed", view.comparing ? "true" : "false");
  if(!view.comparing) view.compared.clear();
  renderAll();
});
byId("addGameButton").addEventListener("click", async () => {
  if(!ensureEditable()) return;
  const game = Object.assign(newGame(""), {id: newGameId()});
  const saved = store.addGame(game);
  openCard(game.id);
  await saved;
});
byId("readOnlyTokenButton").addEventListener("click", openTokenDialog);

/* Значки перемикача. Кнопка показує той вигляд, у який перемкне, — це
   звичніше за показ поточного стану: на неї тиснуть, щоб отримати те,
   що на ній намальовано. Назву все одно дублюємо в title й aria-label,
   бо самого значка для розуміння замало. */
const GRID_ICON =
  "<svg viewBox='0 0 16 16' width='15' height='15' fill='currentColor' aria-hidden='true'>" +
  "<rect x='1' y='1' width='6' height='6' rx='1.5'/><rect x='9' y='1' width='6' height='6' rx='1.5'/>" +
  "<rect x='1' y='9' width='6' height='6' rx='1.5'/><rect x='9' y='9' width='6' height='6' rx='1.5'/></svg>";
const LIST_ICON =
  "<svg viewBox='0 0 16 16' width='15' height='15' fill='currentColor' aria-hidden='true'>" +
  "<rect x='1' y='2' width='4' height='4' rx='1'/><rect x='7' y='3' width='8' height='2' rx='1'/>" +
  "<rect x='1' y='10' width='4' height='4' rx='1'/><rect x='7' y='11' width='8' height='2' rx='1'/></svg>";

/** Перемикач вигляду. Запам'ятовується для кожного пристрою окремо. */
function renderLayoutButton(){
  const asGrid = view.layout === LAYOUT.GRID;
  const button = byId("layoutButton");
  button.innerHTML = asGrid ? LIST_ICON : GRID_ICON;
  button.setAttribute("aria-pressed", asGrid ? "true" : "false");
  const label = asGrid ? "Показати списком" : "Показати сіткою — кілька ігор у ряд";
  button.title = label;
  button.setAttribute("aria-label", label);
}
byId("layoutButton").addEventListener("click", () => {
  view.layout = view.layout === LAYOUT.GRID ? LAYOUT.LIST : LAYOUT.GRID;
  saveLayout(view.layout);
  renderLayoutButton();
  renderAll();
});
