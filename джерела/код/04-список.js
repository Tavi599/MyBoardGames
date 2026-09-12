/* ── малювання ───────────────────────────────────── */
function render(){ renderStats(); renderList(); renderCmp(); }

function renderStats(){
  const games = shelf();
  const доповнень = games.filter((g) => g.expansion).length;
  const rated = games.filter((g) => g.score != null);
  const avg = rated.length
    ? fmt(+(rated.reduce((s, g) => s + g.score, 0) / rated.length).toFixed(2)) : "—";
  const plays = games.reduce((s, g) => s + (+g.plays || 0), 0);
  let extra;
  if(ui.count === "all"){
    const top = rated.slice().sort((a, b) => b.score - a.score)[0];
    extra = ["Перша в списку", top ? esc(top.name) : "—"];
  } else {
    const list = games.filter((g) => g.byCount && g.byCount[ui.count] != null)
                      .sort((a, b) => b.byCount[ui.count] - a.byCount[ui.count]);
    extra = ["Краща на " + CLABEL[ui.count],
             list.length ? esc(list[0].name) + " <small>" + fmt(list[0].byCount[ui.count]) + "</small>" : "—"];
  }
  $("stats").innerHTML =
    cell("Ігор на полиці", доповнень
      ? (games.length - доповнень) + " <small>+ " + доповнень + " доп.</small>"
      : games.length) +
    cell("Оцінено", rated.length + " <small>з " + games.length + "</small>") +
    cell("Середня оцінка", avg) +
    cell("Партій зіграно", plays) +
    cell(extra[0], extra[1]);
  function cell(t, v){ return "<div><dt>" + t + "</dt><dd>" + v + "</dd></div>"; }
}

function renderList(){
  const list = $("list"), arr = visible();
  document.documentElement.style.setProperty("--pick", ui.cmp ? "26px" : "0px");
  $("hScore").textContent = ui.count === "all" ? "Оцінка" : "На " + CLABEL[ui.count];

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
    if(g.minP || g.maxP) meta.push((g.minP || "?") + "–" + (g.maxP || "?") + " гравців");
    if(g.minutes) meta.push(g.minutes + " хв");
    if(g.plays) meta.push(g.plays + " " + plural(g.plays, "партія", "партії", "партій"));
    if(g.weight) meta.push("складність " + fmt(g.weight));
    if(g.bggRating) meta.push("BGG " + fmt(g.bggRating));
    if(g.tags && g.tags.length) meta.push(g.tags.join(" · "));
    const перше = перші(g);
    const cells = COUNTS.map((c) => {
      const v = g.byCount ? g.byCount[c] : null;
      return "<span class='cnt " + (v == null ? "void " : "") + band(v) +
        (ui.count === c ? " now" : "") + "'><b>" + (v == null ? "·" : fmt(v)) +
        "</b><i>" + CLABEL[c] + "</i></span>";
    }).join("");
    // Крапка біля назви фарбується за першим статусом — він же найважливіший.
    return "<li class='row s-" + esc(stats(g)[0] || "") + (g.expansion ? " exp" : "") +
      (ui.picked.has(g.id) ? " picked" : "") + "' data-id='" + esc(g.id) + "'>" +
      (ui.cmp ? "<label class='pick'><input type='checkbox' data-pick='" + esc(g.id) + "' " +
        (ui.picked.has(g.id) ? "checked" : "") + " aria-label='Порівняти " + esc(g.name) + "'></label>" : "<span></span>") +
      "<span class='cov'>" + (g.cover
        ? "<img src='" + esc(g.cover) + "' alt='' loading='lazy' referrerpolicy='no-referrer'>"
        : "<b>" + esc((g.name || "?").trim().charAt(0).toUpperCase()) + "</b>") + "</span>" +
      "<button class='open' data-open='" + esc(g.id) + "'>" +
        "<span class='nm'><i class='dot'></i>" + esc(g.name) +
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
        "' aria-label='Правила: " + esc(g.name) + "'>П</a>" : "<span></span>") +
      "<div class='counts'>" + cells + "</div>" +
      "<div class='score " + b + "'><span class='num" + (s == null ? " none" : "") + "'>" +
        (s == null ? "—" : fmt(s)) + "</span>" +
        "<span class='meter'><i style='width:" + (s == null ? 0 : s * 10) + "%'></i></span></div>" +
    "</li>";
  }).join("");

  function show(t, sub){
    const el = $("blank"); el.hidden = false;
    el.innerHTML = "<b>" + t + "</b>" + sub;
  }
}
function plural(n, one, few, many){
  const a = Math.abs(n) % 100, b = a % 10;
  if(a > 10 && a < 20) return many;
  if(b === 1) return one;
  if(b >= 2 && b <= 4) return few;
  return many;
}

