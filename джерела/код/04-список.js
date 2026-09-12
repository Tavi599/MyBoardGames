/* ── малювання ───────────────────────────────────── */
function render(){ оновитиСтрічки(); renderStats(); renderList(); renderCmp(); }

function renderStats(){
  const games = shelf();
  // «На полиці» — це те, що справді стоїть удома. Позбуті коробки й чужі
  // сюди не рахуються, хоч і лишаються в списку зі своїми оцінками.
  const свої = games.filter((g) => stats(g).indexOf("колекція") >= 0);
  const доповнень = свої.filter((g) => g.expansion).length;
  // «Онлайн» — тільки те, чого вдома немає. Гра, що стоїть на полиці й
  // паралельно йде онлайн, — це все одно гра з полиці, і рахувати її
  // двічі означало б, що сума перестане сходитись.
  const мережеві = games.filter((g) => stats(g).indexOf("онлайн") >= 0
                                    && stats(g).indexOf("колекція") < 0).length;
  const rated = games.filter((g) => g.score != null);
  const plays = games.reduce((s, g) => s + (+g.plays || 0), 0);
  $("stats").innerHTML =
    cell("Ігор на полиці", доповнень
      ? (свої.length - доповнень) + " <small>+ " + доповнень + " доп.</small>"
      : свої.length) +
    cell("Ігор онлайн", мережеві) +
    cell("Оцінено", rated.length + " <small>з " + games.length + "</small>") +
    cell("Партій зіграно", plays);
  function cell(t, v){ return "<div><dt>" + t + "</dt><dd>" + v + "</dd></div>"; }
}

/** Скидає всі фільтри, пошук і приховані групи до типового. Сортування
    не чіпаємо: це не звуження полиці, а спосіб на неї дивитися. */
function скинутиФільтри(){
  ФІЛЬТРИ.forEach((ф) => { ui[ф.ключ] = ф.типово; });
  ui.hide.clear();
  renderFilters();
  renderHide();
  render();
}
function renderFound(arr){
  const усього = games.length;
  // Поки полиця їде з бази, рахувати нічого: «0 коробок» злякало б дарма.
  $("found").hidden = !ready;
  if(!ready) return;
  $("foundN").textContent = звужено()
    ? arr.length + " " + plural(arr.length, "коробка", "коробки", "коробок") +
      " з " + усього
    : усього + " " + plural(усього, "коробка", "коробки", "коробок");
  $("resetBtn").hidden = !звужено();
}

function renderList(){
  const list = $("list"), arr = visible();
  document.documentElement.style.setProperty("--pick", ui.cmp ? "26px" : "0px");
  $("hScore").textContent = ui.count === "all" ? "Оцінка" : "На " + CLABEL[ui.count];
  renderFound(arr);

  if(!ready){
    list.innerHTML = ""; $("headRow").hidden = true;
    show("Хвилинку", "Дістаю полицю з бази.");
    return;
  }
  $("headRow").hidden = arr.length === 0;
  if(!arr.length){
    list.innerHTML = "";
    if(!games.length) show("Полиця порожня", "Натисни «Додати гру» — і почнеться.");
    else show("Нічого не підходить", "Спробуй інший склад столу, статус або пошук.");
    return;
  }
  $("blank").hidden = true;

  list.innerHTML = arr.map((g) => {
    const s = effScore(g), b = band(s);
    const разом = withNames(g);
    const meta = [];
    const назви = statNames(g);
    if(назви.length) meta.push(назви.join(" · "));
    // У рядок іде тільки родина — одне слово. Дрібні жанри чекають у картці:
    // «фентезі · тварини · карткова · пригоди» в рядку списку — це шум.
    const рід = familyNames(g); if(рід.length) meta.push(рід.join(" · "));
    const хто = playersText(g); if(хто) meta.push(хто);
    const коли = timeText(g); if(коли) meta.push(коли);
    if(g.plays) meta.push(g.plays + " " + plural(g.plays, "партія", "партії", "партій"));
    const вага = складність(g); if(вага) meta.push("складність " + fmt(вага));
    if(g.tags && g.tags.length) meta.push(g.tags.join(" · "));
    const перше = перші(g);
    // У рядку — тільки ті склади, за які оцінка вже стоїть. Порожні
    // клітинки з'їдали половину ширини й відсували назву гри; решта
    // складів чекає в картці, і щойно там з'явиться оцінка — клітинка
    // сама вигулькне тут.
    const cells = ratedCounts(g).map((c) => {
      const v = g.byCount[c];
      return "<span class='cnt " + band(v) + (ui.count === c ? " now" : "") +
        "'><b>" + fmt(v) + "</b><i>" + esc(countLabel(g, c)) + "</i></span>";
    }).join("");
    // Крапка біля назви фарбується за першим статусом — він же найважливіший.
    return "<li class='row s-" + esc(stats(g)[0] || "") + (g.expansion ? " exp" : "") +
      (stats(g).indexOf("продаж") >= 0 ? " sale" : "") +
      (ui.picked.has(g.id) ? " picked" : "") + "' data-id='" + esc(g.id) + "'>" +
      (ui.cmp ? "<label class='pick'><input type='checkbox' data-pick='" + esc(g.id) + "' " +
        (ui.picked.has(g.id) ? "checked" : "") + " aria-label='Порівняти " + esc(g.name) + "'></label>" : "<span class='pick'></span>") +
      "<span class='cov'>" + (g.cover
        ? "<img src='" + esc(g.cover) + "' alt='' loading='lazy' referrerpolicy='no-referrer'>"
        : "<b>" + esc((g.name || "?").trim().charAt(0).toUpperCase()) + "</b>") + "</span>" +
      "<button class='open' data-open='" + esc(g.id) + "'>" +
        "<span class='nm'><i class='dot'></i><span class='txt'>" + esc(g.name) + "</span>" +
          (g.expansion ? "<span class='badge'>доп.</span>" : "") +
          (разом.length ? "<span class='badge plus' title='Завжди з: " + esc(разом.join(", ")) +
            "'>+" + разом.length + " доп.</span>" : "") + "</span>" +
        (g.nameEn ? "<span class='alt'>" + esc(g.nameEn) + "</span>" : "") +
        "<span class='meta'>" + esc(meta.filter(Boolean).join(" · ")) + "</span>" +
        (g.comment ? "<span class='note'>" + esc(g.comment) + "</span>" : "") +
      "</button>" +
      // Швидкий виклик правил: суперечка за столом трапляється саме тоді,
      // коли лізти в картку ніколи.
      (перше ? "<a class='rules-btn' href='" + esc(перше.url) + "' target='_blank'" +
        " rel='noopener noreferrer' title='" + esc(rules(g).map((п) =>
          ВИДИ_ПРАВИЛ[п.kind] || п.kind).join(" · ")) +
        "' aria-label='Правила: " + esc(g.name) + "'>П</a>" : "<span class='rules-btn ghost'></span>") +
      "<div class='counts'>" + cells + "</div>" +
      // Оцінка BGG живе в колонці оцінки, а не в кінці рядка метаданих:
      // там її з'їдало обрізання, щойно перед нею набиралося досить тексту.
      // Тут вона стоїть просто під твоєю оцінкою — і видно, чи ви згодні.
      "<div class='score " + b + "'><span class='num" + (s == null ? " none" : "") + "'>" +
        (s == null ? "—" : fmt(s)) + "</span>" +
        "<span class='meter'><i style='width:" + (s == null ? 0 : s * 10) + "%'></i></span>" +
        (g.bggRating ? "<span class='bgg'>BGG " + fmt(g.bggRating) + "</span>" : "") + "</div>" +
    "</li>";
  }).join("");

  function show(t, sub){
    const el = $("blank"); el.hidden = false;
    el.innerHTML = "<b>" + t + "</b>" + sub;
  }
}

