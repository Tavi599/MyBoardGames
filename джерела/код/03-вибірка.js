/* ── вибірка й сортування ────────────────────────── */
function effScore(g){
  if(ui.count === "all") return g.score == null ? null : g.score;
  const v = g.byCount ? g.byCount[ui.count] : null;
  return v == null ? null : v;
}
function fitsCount(g){
  if(ui.count === "all") return true;
  if(g.byCount && g.byCount[ui.count] != null) return true;
  const mn = g.minP, mx = g.maxP;
  if(mn == null && mx == null) return true;
  if(ui.count === "5") return mx == null || mx >= 5;
  const c = +ui.count;
  return (mn == null || mn <= c) && (mx == null || mx >= c);
}
/** Полиця з урахуванням того, чи сховані доповнення: підсумки мають
    рахуватися по тому самому, що людина бачить у списку. */
function shelf(){ return ui.noExp ? games.filter((g) => !g.expansion) : games; }

function visible(){
  const q = ui.q.trim().toLowerCase();
  let arr = shelf().filter((g) => {
    if(ui.status !== "all" && !allStats(g).includes(ui.status)) return false;
    if(!fitsCount(g)) return false;
    if(!q) return true;
    // Шукаємо і за українською, і за оригінальною назвою: половина полиці
    // тримається в голові англійською.
    const hay = [g.name, g.nameEn, g.comment, (g.tags || []).join(" ")]
      .join(" ").toLowerCase();
    return hay.includes(q);
  });
  const num = (v) => (v == null || v === "" ? null : +v);
  // Порожні значення завжди в кінці — і при прямому порядку, і при зворотному:
  // гра без оцінки не має спливати нагору лише тому, що список перевернули.
  const бік = ui.rev ? -1 : 1;
  arr.sort((a, b) => {
    if(ui.sort === "name") return бік * (a.name || "").localeCompare(b.name || "", "uk");
    let x, y;
    if(ui.sort === "score"){ x = effScore(a); y = effScore(b); }
    else if(ui.sort === "plays"){ x = num(a.plays) || 0; y = num(b.plays) || 0; }
    else if(ui.sort === "bgg"){ x = num(a.bggRating); y = num(b.bggRating); }
    else if(ui.sort === "added"){ x = a.added || ""; y = b.added || ""; }
    else { x = num(a[ui.sort]); y = num(b[ui.sort]); }
    if(x == null && y == null) return (a.name || "").localeCompare(b.name || "", "uk");
    if(x == null) return 1;
    if(y == null) return -1;
    if(x === y) return (a.name || "").localeCompare(b.name || "", "uk");
    return бік * (ui.sort === "added" ? (x > y ? -1 : 1) : (y - x));
  });
  return arr;
}

