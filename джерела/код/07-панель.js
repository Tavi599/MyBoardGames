/* ── панель керування ─────────────────────────────────────────────────
   Фільтрів стало більше, ніж влазить у рядок. Сама стрічка «Тема» на
   телефоні — це сім рядків кнопок, і власне список починався вже під
   ними. Тому в панелі лишилися пошук і сортування, указник за першою
   літерою став окремим рядком, а решта фільтрів живе в шухляді за
   кнопкою «Фільтри».

   Закрита шухляда ховає не лише кнопки, а й відповідь на «чому коробок
   раптом дванадцять», тож ввімкнене показують плашки над списком —
   кожна знімається дотиком. Малює їх renderFound у «04-список.js». */

/** Підпис і кнопки однієї стрічки. Окремо, бо їх малюють двоє: повна
    побудова панелі й оновлення стрічки, чиї варіанти залежать від даних. */
function нутрощіСтрічки(ф){
  return "<span>" + esc(ф.підпис) + "</span>" +
    ф.варіанти().map(([знач, підпис]) =>
      "<button data-v='" + esc(знач) + "' aria-pressed='" +
      (ui[ф.ключ] === знач ? "true" : "false") + "'>" + esc(підпис) + "</button>").join("");
}

/** Один віджет фільтра. Вид каже, чим він буде, місце — де стане. */
function віджет(ф){
  const v = ui[ф.ключ];
  if(ф.вид === "пошук"){
    return "<div class='fld'><input type='search' data-ф='" + esc(ф.ключ) +
      "' value='" + esc(v) + "' placeholder='" + esc(ф.держак || "Пошук") +
      "' aria-label='" + esc(ф.держак || "Пошук") + "'></div>";
  }
  if(ф.вид === "стрічка"){
    return "<div class='seg" + (ф.широка ? " wrap" : "") +
      (ф.клас ? " " + esc(ф.клас) : "") + "' data-ф='" + esc(ф.ключ) +
      "' role='group' aria-label='" + esc(ф.підпис) + "'>" +
      нутрощіСтрічки(ф) + "</div>";
  }
  const ід = "f-" + ф.ключ;
  return "<div class='fld'><label for='" + ід + "'>" + esc(ф.підпис) + "</label>" +
    "<select id='" + ід + "' data-ф='" + esc(ф.ключ) + "'>" +
    ф.варіанти().map(([знач, підпис]) =>
      "<option value='" + esc(знач) + "'" + (v === знач ? " selected" : "") + ">" +
      esc(підпис) + "</option>").join("") + "</select></div>";
}

/** Малює фільтри з реєстру, кожен на своє місце. Жодного фільтра тут не
    названо поіменно: щоб додати новий, досить дописати об'єкт у ФІЛЬТРИ. */
function renderFilters(){
  const купки = {search: [], abc: [], filtBody: []};
  ФІЛЬТРИ.forEach((ф) => { (купки[ф.місце] || купки.filtBody).push(віджет(ф)); });
  Object.keys(купки).forEach((де) => { $(де).innerHTML = купки[де].join(""); });
  оновитиАбетку();
}
/** Указник з однією кнопкою «усі» — це порожній рядок і змарнована висота:
    полиця або ще не приїхала, або стоїть уся під однією літерою. */
function оновитиАбетку(){
  const стрічка = $("abc").querySelector(".seg");
  $("abc").hidden = !стрічка || стрічка.querySelectorAll("button").length < 3;
}

/** Варіанти стрічки можуть залежати від даних: жанри й літери беруться з
    самої полиці, а полиця приїжджає вже після того, як панель намальовано —
    і з мережі, і з кеша, і кількома заходами. Тому перед кожним показом
    звіряємо набір кнопок і перемальовуємо саме ту стрічку, у якої він
    змінився. Панель цілком не чіпаємо навмисне: у ній живе поле пошуку,
    і повне перемальовування висмикує з нього фокус посеред слова. */
function оновитиСтрічки(){
  ФІЛЬТРИ.forEach((ф) => {
    if(ф.вид !== "стрічка") return;
    const вузол = document.querySelector(".seg[data-ф='" + ф.ключ + "']");
    if(!вузол) return;
    const треба = ф.варіанти().map((в) => в[0]);
    const є = Array.prototype.map.call(вузол.querySelectorAll("button"), (b) => b.dataset.v);
    // Порівнюємо поелементно, а не склеєними рядками: будь-який роздільник
    // рано чи пізно трапиться всередині самого значення.
    if(є.length === треба.length && є.every((v, i) => v === треба[i])) return;
    // Обране могло зникнути разом зі своєю кнопкою — тоді вертаємось до
    // типового, інакше список мовчки лишився б порожнім назавжди.
    if(треба.indexOf(ui[ф.ключ]) < 0) ui[ф.ключ] = ф.типово;
    вузол.innerHTML = нутрощіСтрічки(ф);
  });
  оновитиАбетку();
}

/** Ставить значення фільтра. Один обробник на всі фільтри, де б вони не
    стояли: у панелі, у рядку указника, у шухляді. */
function поставити(ключ, знач){
  ui[ключ] = знач;
  // Перемальовуємо лише стрічку — вона показує стан кнопками. Список і поле
  // пошуку тримають вибране самі, а повна перемальовка щоразу висмикувала б
  // фокус із віджета просто посеред роботи.
  const стрічка = document.querySelector(".seg[data-ф='" + ключ + "']");
  if(стрічка){
    Array.prototype.forEach.call(стрічка.querySelectorAll("button"), (b) =>
      b.setAttribute("aria-pressed", b.dataset.v === знач ? "true" : "false"));
  }
  render();
}
document.addEventListener("input", (e) => {
  const el = e.target.closest("input[data-ф]"); if(!el) return;
  // Пошук перемальовувати не можна — фокус вискочить із поля посеред слова.
  ui[el.dataset["ф"]] = el.value;
  render();
});
document.addEventListener("change", (e) => {
  const el = e.target.closest("select[data-ф]"); if(!el) return;
  поставити(el.dataset["ф"], el.value);
});
document.addEventListener("click", (e) => {
  const b = e.target.closest(".seg[data-ф] button"); if(!b) return;
  поставити(b.closest(".seg").dataset["ф"], b.dataset.v);
});

/* ── шухляда фільтрів ─────────────────────────────────────────────── */
function openFilters(){
  hideMenu();
  $("filtScrim").hidden = false;
  $("filtBox").hidden = false;
  requestAnimationFrame(() => $("filtBox").classList.add("on"));
  $("filtBtn").setAttribute("aria-expanded", "true");
  $("filtClose").focus();
}
function closeFilters(){
  $("filtBox").classList.remove("on");
  $("filtBox").hidden = true;
  $("filtScrim").hidden = true;
  $("filtBtn").setAttribute("aria-expanded", "false");
}
/** Лічильник на кнопці. Рахуємо лише те, що сховане в шухляді: пошук і
    указник видно й так, а кнопка, яка числить видиме, лише збиває. */
function paintFiltBtn(){
  const скільки = звуження().filter((з) => !з.місце).length;
  const кн = $("filtBtn");
  кн.textContent = скільки ? "Фільтри · " + скільки : "Фільтри";
  кн.setAttribute("aria-pressed", скільки ? "true" : "false");
}
$("filtBtn").addEventListener("click", () => {
  if($("filtBox").hidden) openFilters(); else closeFilters();
});
$("filtClose").addEventListener("click", closeFilters);
$("filtDone").addEventListener("click", closeFilters);
$("filtScrim").addEventListener("click", closeFilters);
$("filtReset").addEventListener("click", скинутиФільтри);
$("resetBtn").addEventListener("click", скинутиФільтри);
/* Плашка знімає своє звуження — і лишає решту. Саме цього від неї й
   чекаєш: «прибрати оце», а не «скинути все». */
$("pills").addEventListener("click", (e) => {
  const b = e.target.closest("[data-off]"); if(!b) return;
  const частини = b.dataset.off.split(":");
  знятиЗвуження(частини[0], частини[1]);
  renderFilters();
  renderHide();
  render();
});

$("fSort").innerHTML = СОРТУВАННЯ.map((с) =>
  "<option value='" + esc(с.ключ) + "'>" + esc(с.підпис) + "</option>").join("");
$("fSort").value = ui.sort;
$("fSort").addEventListener("change", (e) => { ui.sort = e.target.value; підказка(); render(); });
$("fFlip").addEventListener("click", function(){
  ui.rev = !ui.rev;
  підказка();
  render();
});
/** Стрілка й підказка мають казати правду про поточне сортування. */
function підказка(){
  const с = СОРТУВАННЯ.find((x) => x.ключ === ui.sort) || СОРТУВАННЯ[0];
  const вниз = с.спадання !== !!ui.rev;
  $("fFlip").textContent = ui.rev ? "↑" : "↓";
  $("fFlip").title = с.текст && !с.спадання
    ? (ui.rev ? "Я → А" : "А → Я")
    : (вниз ? "від більшого" : "від меншого");
}
renderFilters();
підказка();
/* ── приховати цілі групи ─────────────────────────────────────────────
   Раніше тут була одна кнопка «Без доповнень». Причин не хотіти бачити
   коробку в списку виявилося більше однієї, і вони не виключають одна
   одну, тож замість кнопки — перелік із позначками: скільки треба,
   стільки й познач. Сам перелік малюється з ХОВАНОК і живе в тій самій
   шухляді, що й фільтри: це теж відповідь на «що показувати». */
function renderHide(){
  $("hidePick").innerHTML = ХОВАНКИ.map((п) =>
    "<label class='pickrow'><input type='checkbox' data-hide='" + esc(п.ключ) + "'" +
    (ui.hide.has(п.ключ) ? " checked" : "") + "><span>" + esc(п.підпис) +
    "</span></label>").join("");
}
/* Значки перемикача. Кнопка показує той вигляд, у який перемкне, — це
   звичніше за показ поточного стану: на неї тиснуть, щоб отримати те,
   що на ній намальовано. Назву все одно дублюємо в title й aria-label,
   бо самого значка для розуміння замало. */
const ЗНАЧОК_СІТКИ =
  "<svg viewBox='0 0 16 16' width='15' height='15' fill='currentColor' aria-hidden='true'>" +
  "<rect x='1' y='1' width='6' height='6' rx='1.5'/><rect x='9' y='1' width='6' height='6' rx='1.5'/>" +
  "<rect x='1' y='9' width='6' height='6' rx='1.5'/><rect x='9' y='9' width='6' height='6' rx='1.5'/></svg>";
const ЗНАЧОК_СПИСКУ =
  "<svg viewBox='0 0 16 16' width='15' height='15' fill='currentColor' aria-hidden='true'>" +
  "<rect x='1' y='2' width='4' height='4' rx='1'/><rect x='7' y='3' width='8' height='2' rx='1'/>" +
  "<rect x='1' y='10' width='4' height='4' rx='1'/><rect x='7' y='11' width='8' height='2' rx='1'/></svg>";

/** Перемикач вигляду. Запам'ятовується для кожного пристрою окремо. */
function paintView(){
  const сітка = ui.view === "grid";
  const кн = $("viewBtn");
  кн.innerHTML = сітка ? ЗНАЧОК_СПИСКУ : ЗНАЧОК_СІТКИ;
  кн.setAttribute("aria-pressed", сітка ? "true" : "false");
  const підпис = сітка ? "Показати списком" : "Показати сіткою — кілька ігор у ряд";
  кн.title = підпис;
  кн.setAttribute("aria-label", підпис);
}
paintView();
$("viewBtn").addEventListener("click", () => {
  ui.view = ui.view === "grid" ? "list" : "grid";
  try{ localStorage.setItem(VKEY, ui.view); }catch(e){}
  paintView();
  render();
});
renderHide();
$("hidePick").addEventListener("change", (e) => {
  const el = e.target.closest("[data-hide]"); if(!el) return;
  if(el.checked) ui.hide.add(el.dataset.hide); else ui.hide.delete(el.dataset.hide);
  render();
});
$("cWith").addEventListener("change", (e) => {
  const el = e.target.closest("[data-exp]"); if(!el) return;
  const g = current(); if(!g) return;
  if(!canEdit()){ el.checked = !el.checked; return; }
  tie(g, el.dataset.exp, el.checked);
});
/** Прив'язати або відв'язати доповнення й перемалювати чипи. */
function tie(g, id, треба){
  const набір = new Set(g.withExp || []);
  if(треба) набір.add(id); else набір.delete(id);
  g.withExp = Array.from(набір).sort();
  if(!g.withExp.length) delete g.withExp;
  renderWith(g);
  render();
  touch();
}
$("cTied").addEventListener("click", (e) => {
  const b = e.target.closest("[data-untie]"); if(!b) return;
  const g = current(); if(!g || !canEdit()) return;
  tie(g, b.dataset.untie, false);
});
$("cWithAdd").addEventListener("click", () => {
  const відкрито = $("cWithPick").hidden;
  $("cWithPick").hidden = !відкрито;
  $("cWithAdd").setAttribute("aria-expanded", відкрито ? "true" : "false");
  if(відкрито) $("cWithQ").focus();
});
$("cWithQ").addEventListener("input", () => {
  const g = current(); if(g) renderPick(g);
});
$("cExp").addEventListener("click", function(){
  const g = current(); if(!g) return;
  if(!canEdit()) return;
  g.expansion = !g.expansion;
  if(!g.expansion) delete g.expansion;
  this.setAttribute("aria-pressed", g.expansion ? "true" : "false");
  touch();
});
$("cmpBtn").addEventListener("click", function(){
  ui.cmp = !ui.cmp;
  this.setAttribute("aria-pressed", ui.cmp ? "true" : "false");
  if(!ui.cmp) ui.picked.clear();
  render();
});
$("list").addEventListener("click", (e) => {
  const o = e.target.closest("[data-open]");
  if(o){ openCard(o.dataset.open); return; }
});
$("list").addEventListener("change", (e) => {
  const p = e.target.closest("[data-pick]"); if(!p) return;
  const id = p.dataset.pick;
  if(p.checked){
    if(ui.picked.size >= 4){ p.checked = false; toast("Більше чотирьох поруч уже не читається."); return; }
    ui.picked.add(id);
  } else ui.picked.delete(id);
  render();
});
$("lockedKey").addEventListener("click", openKey);
$("addBtn").addEventListener("click", async () => {
  if(!canEdit()) return;
  const g = Object.assign(blank(""), {id:newId()});
  games.push(g);
  if(!db) localSave();
  render(); openCard(g.id);
  if(db) await persist(g);
});
