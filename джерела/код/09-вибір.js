/* ── «Що зіграти?» ────────────────────────────────────────────────────
   Полиця відповідає на «що в мене є». Вечір питає інше: нас троє, маємо
   годину — діставати що? Фільтри на це відповідають списком із двадцяти
   коробок, а з двадцяти вибирати так само важко, як із дев'яноста.

   Тому тут не фільтр, а жереб: кілька коробок, які підходять саме зараз.
   Сам жереб — кандидати, ваги, витягування — живе у «03-вибірка.js»
   разом з рештою вибірки: там його перевіряють тести. Тут лишилося
   тільки те, що чіпає сторінку. */

const ПИТАННЯ = [
  {ід: "pickCount", поле: "count", підпис: "Нас",
   варіанти: () => [["all", "байдуже"]].concat(COUNTS.map((c) => [c, CLABEL[c]]))},
  {ід: "pickTime", поле: "time", підпис: "Часу",
   варіанти: () => ФІЛЬТРИ.find((ф) => ф.ключ === "time").варіанти()
     .map((в) => (в[0] === "all" ? ["all", "байдуже"] : в))},
];
function renderПитання(){
  ПИТАННЯ.forEach((п) => {
    $(п.ід).innerHTML = "<span>" + esc(п.підпис) + "</span>" +
      п.варіанти().map(([знач, підпис]) =>
        "<button data-v='" + esc(знач) + "' aria-pressed='" +
        (вибірВечора[п.поле] === знач ? "true" : "false") + "'>" +
        esc(підпис) + "</button>").join("");
  });
}
function renderВибір(обрані, скількиБуло){
  $("pickOut").innerHTML = обрані.length
    ? обрані.map((g) =>
        "<div class='cand'>" +
        "<span class='cov'>" + (g.cover
          ? "<img src='" + esc(посилання(g.cover)) + "' alt='' loading='lazy' referrerpolicy='no-referrer'>"
          : "<b>" + esc((g.name || "?").trim().charAt(0).toUpperCase()) + "</b>") + "</span>" +
        "<span class='what'><b>" + esc(g.name) + "</b>" +
        "<span class='why'>" + esc([playersText(g), timeText(g), колиОстаннє(g)]
          .filter(Boolean).join(" · ")) + "</span></span>" +
        // Своя оцінка й чужа — стовпчиком, як у списку: коли збираєшся
        // грати іншою компанією, чужа середня важить не менше за свою.
        "<span class='cand-score'><span class='num " + band(g.score) + "'>" +
        (g.score == null ? "—" : fmt(g.score)) + "</span>" +
        (g.bggRating ? "<span class='bgg'>BGG " + fmt(g.bggRating) + "</span>" : "") +
        "</span>" +
        "<span class='cand-do'>" +
        "<button class='btn' data-cplay='" + esc(g.id) + "' type='button'>+ партія</button>" +
        "<button class='link' data-copen='" + esc(g.id) + "' type='button'>картка</button>" +
        "</span></div>").join("")
    : "<p class='hint'>Під такий стіл нічого не підходить. Спробуй інший склад " +
      "чи більше часу — або зазирни в те, що вже грали цими днями.</p>";
  $("pickWhy").textContent = скількиБуло
    ? "жереб із " + скількиБуло + " " +
      plural(скількиБуло, "коробки", "коробок", "коробок")
    : "";
}
function кинутиЖереб(){
  const було = кандидати().length;
  renderВибір(кинути(), було);
}
function openPick(){
  hideMenu();
  renderПитання();
  кинутиЖереб();
  $("keyScrim").hidden = false;
  $("pickBox").hidden = false;
}
function closePick(){
  $("pickBox").hidden = true;
  if($("keyBox").hidden && $("bggBox").hidden) $("keyScrim").hidden = true;
}
/* Значок — гральна кістка: питання «що діставати» саме таке. */
$("diceBtn").innerHTML =
  "<svg viewBox='0 0 16 16' width='15' height='15' fill='currentColor' aria-hidden='true'>" +
  "<rect x='1' y='1' width='14' height='14' rx='3.5' fill='none' stroke='currentColor'" +
  " stroke-width='1.4'/><circle cx='5' cy='5' r='1.35'/><circle cx='8' cy='8' r='1.35'/>" +
  "<circle cx='11' cy='11' r='1.35'/></svg>";
$("diceBtn").title = "Що зіграти? — жереб із того, що підходить";
$("diceBtn").setAttribute("aria-label", "Що зіграти?");
$("diceBtn").addEventListener("click", openPick);
$("mPick").addEventListener("click", openPick);
$("pickClose").addEventListener("click", closePick);
$("pickRoll").addEventListener("click", кинутиЖереб);
$("keyScrim").addEventListener("click", closePick);
document.addEventListener("keydown", (e) => {
  if(e.key === "Escape" && !$("pickBox").hidden) closePick();
});
$("pickBox").addEventListener("click", (e) => {
  const кн = e.target.closest("[data-v]");
  if(кн){
    const п = ПИТАННЯ.find((x) => x.ід === кн.parentNode.id);
    if(п){ вибірВечора[п.поле] = кн.dataset.v; renderПитання(); кинутиЖереб(); }
    return;
  }
  const відкрити = e.target.closest("[data-copen]");
  if(відкрити){ closePick(); openCard(відкрити.dataset.copen); return; }
  // Записати партію просто звідси: коробку витягли зі столу за цією
  // підказкою, і йти по «+» у картку заради одного дотику — зайве.
  const зіграли = e.target.closest("[data-cplay]");
  if(зіграли){
    const g = games.find((x) => x.id === зіграли.dataset.cplay);
    if(!g || !canEdit()) return;
    додатиПартію(g);
    stamp(g);
    render();
    persist(g);
    toast("«" + g.name + "» — партію записано.");
    кинутиЖереб();
  }
});
