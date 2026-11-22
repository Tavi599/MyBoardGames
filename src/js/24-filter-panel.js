/* ── панель керування ─────────────────────────────────────────────────
   Фільтрів стало більше, ніж влазить у рядок. Сама стрічка «Тема» на
   телефоні — це сім рядків кнопок, і власне список починався вже під
   ними. Тому в панелі лишилися пошук і сортування, указник за першою
   літерою став окремим рядком, а решта фільтрів живе в шухляді за
   кнопкою «Фільтри».

   Закрита шухляда ховає не лише кнопки, а й відповідь на «чому коробок
   раптом дванадцять», тож ввімкнене показують плашки над списком —
   кожна знімається дотиком. Малює їх renderFoundRow у «21-list.js». */

/* Де на сторінці стоїть фільтр із кожним `slot` з реєстру. Фільтр без
   slot іде в шухляду. */
const FILTER_SLOT_ELEMENTS = {search: "filterSearchSlot", status: "filterStatusSlot",
                              index: "filterIndexSlot"};
const FILTER_DRAWER_ELEMENT = "filterDrawerSlot";
/* Рядки поза шухлядою, що живуть заради однієї стрічки: рядок ховаємо
   разом із нею, інакше лишиться порожня смуга з відступом. */
const STRIP_ROW_ELEMENTS = [FILTER_SLOT_ELEMENTS.status, FILTER_SLOT_ELEMENTS.index];

function stripElement(filterKey){
  return document.querySelector(".seg[data-filter='" + filterKey + "']");
}
/** Підпис і кнопки однієї стрічки. Окремо, бо їх малюють двоє: повна
    побудова панелі й оновлення стрічки, чиї варіанти залежать від даних. */
function stripInnerHtml(filter){
  return "<span>" + escapeHtml(filter.label) + "</span>" +
    stripButtonsHtml(filter.options(store.games), view.filters[filter.key]);
}
/** Один віджет фільтра. `kind` каже, чим він буде, `slot` — де стане. */
function filterWidgetHtml(filter){
  const value = view.filters[filter.key];
  if(filter.kind === "search"){
    const placeholder = escapeHtml(filter.placeholder || "Пошук");
    return "<div class='fld'><input type='search' data-filter='" + escapeHtml(filter.key) +
      "' value='" + escapeHtml(value) + "' placeholder='" + placeholder +
      "' aria-label='" + placeholder + "'></div>";
  }
  if(filter.kind === "strip"){
    return "<div class='seg" + (filter.wraps ? " wrap" : "") +
      (filter.className ? " " + escapeHtml(filter.className) : "") +
      "' data-filter='" + escapeHtml(filter.key) +
      "' role='group' aria-label='" + escapeHtml(filter.label) + "'>" +
      stripInnerHtml(filter) + "</div>";
  }
  const selectId = "filter-" + filter.key;
  return "<div class='fld'><label for='" + selectId + "'>" + escapeHtml(filter.label) + "</label>" +
    "<select id='" + selectId + "' data-filter='" + escapeHtml(filter.key) + "'>" +
    selectOptionsHtml(filter.options(store.games), value) + "</select></div>";
}

/** Малює фільтри з реєстру, кожен на своє місце. Жодного фільтра тут не
    названо поіменно: щоб додати новий, досить дописати об'єкт у FILTERS. */
function renderFilterWidgets(){
  const htmlByElement = {[FILTER_DRAWER_ELEMENT]: []};
  Object.keys(FILTER_SLOT_ELEMENTS).forEach((slot) => {
    htmlByElement[FILTER_SLOT_ELEMENTS[slot]] = [];
  });
  FILTERS.forEach((filter) => {
    const elementId = FILTER_SLOT_ELEMENTS[filter.slot] || FILTER_DRAWER_ELEMENT;
    htmlByElement[elementId].push(filterWidgetHtml(filter));
  });
  Object.keys(htmlByElement).forEach((elementId) => {
    byId(elementId).innerHTML = htmlByElement[elementId].join("");
  });
  hideEmptyStrips();
}
/** Стрічка, у якій нема з чого вибирати, — це кнопка «усі» й порожнє
    місце. Такі ховаємо: теги, поки жодного не поставлено; указник, поки
    полиця не приїхала. Саме ховаємо, а не пропускаємо малювання: інакше
    стрічці, яка з'явилася разом із даними, не було б куди вигулькнути. */
function hideEmptyStrips(){
  FILTERS.forEach((filter) => {
    const strip = stripElement(filter.key);
    if(strip) strip.hidden = strip.querySelectorAll("button").length < 2;
  });
  STRIP_ROW_ELEMENTS.forEach((elementId) => {
    const strip = byId(elementId).querySelector(".seg");
    byId(elementId).hidden = !strip || strip.hidden;
  });
}
/** Варіанти стрічки можуть залежати від даних: жанри й літери беруться з
    самої полиці, а полиця приїжджає вже після того, як панель намальовано —
    і з мережі, і з кеша, і кількома заходами. Тому перед кожним показом
    звіряємо набір кнопок і перемальовуємо саме ту стрічку, у якої він
    змінився. Панель цілком не чіпаємо навмисне: у ній живе поле пошуку,
    і повне перемальовування висмикує з нього фокус посеред слова. */
function refreshStripOptions(){
  FILTERS.forEach((filter) => {
    if(filter.kind !== "strip") return;
    const strip = stripElement(filter.key);
    if(!strip) return;
    const wanted = filter.options(store.games).map((option) => option[0]);
    const shown = Array.prototype.map.call(
      strip.querySelectorAll("button"), (button) => button.dataset.value);
    // Порівнюємо поелементно, а не склеєними рядками: будь-який роздільник
    // рано чи пізно трапиться всередині самого значення.
    if(shown.length === wanted.length && shown.every((value, i) => value === wanted[i])) return;
    // Обране могло зникнути разом зі своєю кнопкою — тоді вертаємось до
    // типового, інакше список мовчки лишився б порожнім назавжди.
    if(wanted.indexOf(view.filters[filter.key]) < 0) view.filters[filter.key] = filter.defaultValue;
    strip.innerHTML = stripInnerHtml(filter);
  });
  hideEmptyStrips();
}

/** Ставить значення фільтра. Один обробник на всі фільтри, де б вони не
    стояли: у панелі, у рядку указника, у шухляді. */
function setFilter(key, value){
  view.filters[key] = value;
  // Перемальовуємо лише стрічку — вона показує стан кнопками. Список і поле
  // пошуку тримають вибране самі, а повна перемальовка щоразу висмикувала б
  // фокус із віджета просто посеред роботи.
  const strip = stripElement(key);
  if(strip){
    Array.prototype.forEach.call(strip.querySelectorAll("button"), (button) =>
      button.setAttribute("aria-pressed", button.dataset.value === value ? "true" : "false"));
  }
  renderAll();
}
document.addEventListener("input", (event) => {
  const input = event.target.closest("input[data-filter]");
  if(!input) return;
  // Пошук перемальовувати не можна — фокус вискочить із поля посеред слова.
  view.filters[input.dataset.filter] = input.value;
  renderAll();
});
document.addEventListener("change", (event) => {
  const select = event.target.closest("select[data-filter]");
  if(select) setFilter(select.dataset.filter, select.value);
});
document.addEventListener("click", (event) => {
  const button = event.target.closest(".seg[data-filter] button");
  if(button) setFilter(button.closest(".seg").dataset.filter, button.dataset.value);
});

/* ── приховати цілі групи ─────────────────────────────────────────────
   Раніше тут була одна кнопка «Без доповнень». Причин не хотіти бачити
   коробку в списку виявилося більше однієї, і вони не виключають одна
   одну, тож замість кнопки — перелік із позначками: скільки треба,
   стільки й познач. Сам перелік малюється з HIDE_RULES і живе в тій
   самій шухляді, що й фільтри: це теж відповідь на «що показувати». */
function renderHideRules(){
  byId("hideRules").innerHTML = HIDE_RULES.map((rule) =>
    "<label class='pickrow'><input type='checkbox' data-hide='" + escapeHtml(rule.key) + "'" +
    (view.hidden.has(rule.key) ? " checked" : "") + "><span>" + escapeHtml(rule.label) +
    "</span></label>").join("");
}
byId("hideRules").addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-hide]");
  if(!checkbox) return;
  if(checkbox.checked) view.hidden.add(checkbox.dataset.hide);
  else view.hidden.delete(checkbox.dataset.hide);
  renderAll();
});

/** Усе, що показує вибране у фільтрах: віджети й перелік прихованого. */
function renderFilterPanel(){
  renderFilterWidgets();
  renderHideRules();
}
function resetFiltersAndRender(){
  resetFilters(view);
  renderFilterPanel();
  renderAll();
}

/* ── шухляда фільтрів ─────────────────────────────────────────────── */
function openFiltersDrawer(){
  hideMenu();
  byId("filtersScrim").hidden = false;
  byId("filtersDrawer").hidden = false;
  requestAnimationFrame(() => byId("filtersDrawer").classList.add("on"));
  byId("filtersButton").setAttribute("aria-expanded", "true");
  byId("filtersCloseButton").focus();
}
function closeFiltersDrawer(){
  byId("filtersDrawer").classList.remove("on");
  byId("filtersDrawer").hidden = true;
  byId("filtersScrim").hidden = true;
  byId("filtersButton").setAttribute("aria-expanded", "false");
}
/** Лічильник на кнопці. Рахуємо лише те, що сховане в шухляді: пошук і
    указник видно й так, а кнопка, яка числить видиме, лише збиває. */
function renderFiltersButton(narrowings){
  const inDrawer = narrowings.filter((narrowing) => !narrowing.slot).length;
  const button = byId("filtersButton");
  button.textContent = inDrawer ? "Фільтри · " + inDrawer : "Фільтри";
  button.setAttribute("aria-pressed", inDrawer ? "true" : "false");
}
byId("filtersButton").addEventListener("click", () => {
  if(byId("filtersDrawer").hidden) openFiltersDrawer(); else closeFiltersDrawer();
});
byId("filtersCloseButton").addEventListener("click", closeFiltersDrawer);
byId("filtersDoneButton").addEventListener("click", closeFiltersDrawer);
byId("filtersScrim").addEventListener("click", closeFiltersDrawer);
byId("filtersResetButton").addEventListener("click", resetFiltersAndRender);

/* ── сортування ───────────────────────────────────────────────────── */

/** Стрілка й підказка мають казати правду про поточне сортування. */
function renderSortDirection(){
  const sort = currentSort(view);
  const largestFirst = !!sort.descending !== view.reversed;
  const button = byId("sortReverseButton");
  button.textContent = view.reversed ? "↑" : "↓";
  button.title = sort.isText && !sort.descending
    ? (view.reversed ? "Я → А" : "А → Я")
    : (largestFirst ? "від більшого" : "від меншого");
}
byId("sortSelect").innerHTML = selectOptionsHtml(
  SORTS.map((sort) => [sort.key, sort.label]), view.sort);
byId("sortSelect").value = view.sort;
byId("sortSelect").addEventListener("change", (event) => {
  view.sort = event.target.value;
  renderSortDirection();
  renderAll();
});
byId("sortReverseButton").addEventListener("click", () => {
  view.reversed = !view.reversed;
  renderSortDirection();
  renderAll();
});
