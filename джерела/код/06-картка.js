/* ── картка гри ──────────────────────────────────── */
let saveTimer = null;
function current(){ return games.find((g) => g.id === ui.open) || null; }

function scale(host, max, get, set){
  host.innerHTML = "";
  for(let i = 1; i <= max; i++){
    const b = document.createElement("button");
    b.type = "button"; b.textContent = i; b.dataset.n = i;
    b.setAttribute("aria-label", "оцінка " + i);
    host.appendChild(b);
  }
  host.dataset.max = max;
  host._get = get; host._set = set;
  host.onclick = (e) => {
    const b = e.target.closest("button"); if(!b) return;
    if(!canEdit()) return;
    const n = +b.dataset.n, було = get();
    // Три стани на одній цифрі: ціле → пів бала менше → порожньо.
    // Так півбали доступні і мишею, і пальцем, без крихітних мішеней.
    const стане = було === n ? n - 0.5 : (було === n - 0.5 ? null : n);
    set(стане);
    paintScale(host);
    touch();
  };
  paintScale(host);
}
function paintScale(host){
  const v = host._get(), max = +host.dataset.max;
  const cls = max === 10 ? band(v) : "b-top";
  host.className = host.className.replace(/\bb-(low|mid|good|top)\b/g, "").trim() + " " + (v == null ? "" : cls);
  Array.prototype.forEach.call(host.children, (b, i) => {
    const n = i + 1;
    const повна = v != null && v >= n;
    const пів = v != null && !повна && v > n - 1;
    b.classList.toggle("on", повна);
    b.classList.toggle("half", пів);
    b.setAttribute("aria-pressed", повна || пів ? "true" : "false");
  });
}

/** Статуси картки. Похідний «ще не зіграна» показуємо разом із рештою, але
    мертвим чипом: його вимикає перша партія, а не палець. */
function renderStatus(g){
  const є = new Set(stats(g));
  const ручні = Object.keys(STATUS).map((k) =>
    "<button type='button' class='chip' data-st='" + esc(k) + "' aria-pressed='" +
    (є.has(k) ? "true" : "false") + "'>" + esc(STATUS[k]) + "</button>");
  $("cStatus").innerHTML = ручні.join("");
  const авто = autoStats(g).map((k) => AUTO[k]);
  $("cAuto").hidden = !авто.length;
  $("cAuto").textContent = авто.length
    ? авто.join(" · ") + " — зникне саме після першої партії"
    : "";
}

/** Драбинки оцінок за складом столу. У картці показуємо всі склади, на які
    коробка розрахована, — порожні теж, бо саме тут оцінку й ставлять.
    Перемальовується щоразу, коли міняються межі «Від»/«До»: інакше
    клітинка на п'ятьох не з'явиться, доки картку не закрити й не відкрити. */
function renderPad(g){
  const pad = $("pad");
  pad.innerHTML = "";
  countsOf(g).forEach((c) => {
    const who = document.createElement("div");
    who.className = "who";
    who.innerHTML = esc(countLabel(g, c)) + "<small>ГР.</small>";
    const row = document.createElement("div");
    row.className = "scale s10";
    pad.appendChild(who); pad.appendChild(row);
    scale(row, 10,
      () => { const g2 = current(); return g2 && g2.byCount ? g2.byCount[c] : null; },
      (v) => {
        const g2 = current(); if(!g2) return;
        g2.byCount = g2.byCount || {};
        if(v == null) delete g2.byCount[c]; else g2.byCount[c] = v;
      });
  });
}

/** Що про цю коробку каже BGG. Нічого з цього не редагується: це чужі
    числа, і правити їх тут означало б удавати, ніби вони твої. Свої —
    у полях «Від», «До», «Хвилин» і «Складність»: вони лягають зверху. */
function renderBgg(g){
  const рядки = [];
  const дод = (підпис, значення) => { if(значення) рядки.push([підпис, значення]); };
  дод("Оцінка", g.bggRating ? fmt(g.bggRating) : "");
  дод("Місце в рейтингу", g.bggRank ? "№ " + g.bggRank : "");
  дод("Гравців", g.bggMin || g.bggMax
    ? (g.bggMin || "?") + "–" + (g.bggMax || "?") : "");
  дод("Найкраще на", ranges(g.bggBest));
  дод("Годиться на", ranges(g.bggRec));
  дод("Партія", g.bggTimeMin || g.bggTimeMax
    ? (g.bggTimeMin === g.bggTimeMax || !g.bggTimeMax
        ? (g.bggTimeMin || g.bggTimeMax) + " хв"
        : g.bggTimeMin + "–" + g.bggTimeMax + " хв") : "");
  дод("Складність", g.bggWeight ? fmt(g.bggWeight) + " з 5" : "");

  // Жанри — чипами, а не рядком: кожен шукає себе по всій полиці. Родина
  // йде першою й окремим кольором, бо саме за нею фільтрують угорі.
  const мітки = familyNames(g).map((н) => [н, "рід"])
    .concat(genreNames(g).map((н) => [н, ""]));
  $("cGenres").hidden = !мітки.length;
  $("cGenres").innerHTML = мітки.map(([н, к]) =>
    "<button type='button' class='chip tag " + к + "' data-genre='" + esc(н) +
    "' title='Знайти всі такі'>" + esc(н) + "</button>").join("");

  $("bggGrp").hidden = !рядки.length && !мітки.length;
  if(!рядки.length) return;
  $("cBgg").innerHTML = рядки.map(([п, з]) =>
    "<div><dt>" + esc(п) + "</dt><dd>" + esc(з) + "</dd></div>").join("");
  const л = $("cBggLink");
  л.hidden = !g.bggId;
  if(g.bggId) л.href = "https://boardgamegeek.com/boardgame/" + encodeURIComponent(g.bggId);
}

/** Правила гри: список посилань із хрестиком і рядок для нового. */
function renderRules(g){
  const список = rules(g);
  $("cRules").innerHTML = список.length
    ? список.map((п) =>
        "<div class='rule'>" +
        "<a href='" + esc(п.url) + "' target='_blank' rel='noopener noreferrer'>" +
        esc(п.title || ВИДИ_ПРАВИЛ[п.kind] || "правила") + "</a>" +
        "<i>" + esc(ВИДИ_ПРАВИЛ[п.kind] || п.kind || "") + "</i>" +
        "<button type='button' class='rm' data-rule='" + esc(п.url) +
        "' aria-label='Прибрати'>✕</button></div>").join("")
    : "<p class='hint'>Правил ще немає.</p>";
}

/** Доповнення, які ця база завжди тягне за собою. Прив'язані видно чипами,
    а весь перелік ховається за кнопкою: коли доповнень на полиці півтора
    десятка, показувати їх усі в кожній картці — знущання.
    У картці самого доповнення блок не потрібен, тому ховається. */
function renderWith(g){
  $("expGrp").hidden = !!g.expansion;
  if(g.expansion) return;
  $("cTied").innerHTML = (g.withExp || [])
    .map((id) => games.find((x) => x.id === id))
    .filter(Boolean)
    .map((x) => "<button type='button' class='chip tied' data-untie='" + esc(x.id) +
      "' aria-label='Відв’язати " + esc(x.name) + "'>" + esc(x.name) + "<b>✕</b></button>")
    .join("") || "<span class='hint'>Жодного не прив'язано.</span>";
  renderPick(g);
}

/** Перелік у розкривачці. Спершу ті, чия назва починається так само, як
    у базової гри, — «Ходу героям нема. Великий сплячий» має бути під рукою
    саме в «Ходу героям нема». */
function renderPick(g){
  const host = $("cWith");
  const q = $("cWithQ").value.trim().toLowerCase();
  const корінь = (g.name || "").split(/[.:–—(]/)[0].trim().toLowerCase();
  const свій = (x) => корінь && (x.name || "").toLowerCase().startsWith(корінь) ? 0 : 1;
  const доп = games
    .filter((x) => x.expansion && x.id !== g.id)
    .filter((x) => !q || [x.name, x.nameEn].join(" ").toLowerCase().includes(q))
    .sort((a, b) => свій(a) - свій(b) ||
                    (a.name || "").localeCompare(b.name || "", "uk"));
  if(!доп.length){
    host.innerHTML = "<p class='hint'>" + (q
      ? "Нічого не знайшлося."
      : "Жодної коробки ще не позначено як доповнення. Відкрий доповнення й " +
        "натисни там «Це доповнення» — після цього воно з'явиться тут.") + "</p>";
    return;
  }
  const обрані = new Set(g.withExp || []);
  host.innerHTML = доп.map((x) =>
    "<label class='pickrow'><input type='checkbox' data-exp='" + esc(x.id) + "'" +
    (обрані.has(x.id) ? " checked" : "") + "><span>" + esc(x.name) + "</span></label>"
  ).join("");
}
/** Назви доповнень, прив'язаних до гри; зниклі коробки просто випадають. */
function withNames(g){
  return (g.withExp || [])
    .map((id) => (games.find((x) => x.id === id) || {}).name)
    .filter(Boolean);
}

function openCard(id){
  ui.open = id;
  const g = current(); if(!g) return;
  $("cName").value = g.name || "";
  $("cAlt").value = g.nameEn || "";
  renderStatus(g);
  $("pVal").textContent = g.plays || 0;
  $("cMin").value = g.minP == null ? "" : g.minP;
  $("cMax").value = g.maxP == null ? "" : g.maxP;
  $("cMinutes").value = g.minutes == null ? "" : g.minutes;
  $("cExp").setAttribute("aria-pressed", g.expansion ? "true" : "false");
  renderBgg(g);
  // Розкривачка доповнень щоразу починається згорнутою й без старого пошуку.
  renderRules(g);
  $("cRuleUrl").value = "";
  $("cWithQ").value = "";
  $("cWithPick").hidden = true;
  $("cWithAdd").setAttribute("aria-expanded", "false");
  renderWith(g);
  $("cCover").value = g.cover || "";
  paintCover(g);
  $("cTags").value = (g.tags || []).join(", ");
  $("cNote").value = g.comment || "";
  $("cSaved").textContent = "";
  $("cDel").textContent = "Видалити";

  scale($("sMain"), 10, () => current() && current().score, (v) => { current().score = v; });
  scale($("sWeight"), 5, () => current() && current().weight, (v) => { current().weight = v; });
  renderPad(g);

  $("scrim").hidden = false; $("card").hidden = false;
  requestAnimationFrame(() => $("card").classList.add("on"));
  $("cName").focus();
}
function closeCard(){
  ui.open = null;
  $("card").classList.remove("on");
  $("card").hidden = true; $("scrim").hidden = true;
}
function touch(){
  const g = current(); if(!g) return;
  stamp(g);
  render();
  clearTimeout(saveTimer);
  $("cSaved").textContent = "…";
  saveTimer = setTimeout(async () => {
    await persist(g);
    $("cSaved").textContent = "збережено";
    setTimeout(() => { if($("cSaved").textContent === "збережено") $("cSaved").textContent = ""; }, 1600);
  }, 350);
}
function bindField(el, apply, ev, restore){
  el.addEventListener(ev || "input", () => {
    const g = current(); if(!g) return;
    if(!canEdit()){ if(restore) el.value = restore(g); return; }
    apply(g, el.value);
    touch();
  });
}
const порожньо = (v) => (v == null ? "" : v);
bindField($("cName"), (g, v) => { g.name = v; }, "input", (g) => g.name || "");
bindField($("cAlt"), (g, v) => { g.nameEn = v; }, "input", (g) => g.nameEn || "");
function paintCover(g){
  $("cCovPrev").innerHTML = g.cover
    ? "<img src='" + esc(g.cover) + "' alt='' referrerpolicy='no-referrer'>"
    : "<b>" + esc((g.name || "?").trim().charAt(0).toUpperCase()) + "</b>";
}
bindField($("cCover"), (g, v) => {
  const u = v.trim();
  if(u) g.cover = u; else delete g.cover;
  paintCover(g);
}, "input", (g) => g.cover || "");
$("cStatus").addEventListener("click", (e) => {
  const b = e.target.closest("[data-st]"); if(!b) return;
  const g = current(); if(!g || !canEdit()) return;
  const k = b.dataset.st, набір = new Set(stats(g));
  if(набір.has(k)) набір.delete(k); else узгодити(набір.add(k), k);
  setStats(g, набір);
  renderStatus(g);
  render();
  touch();
});
// Межі столу вирішують, які клітинки складу взагалі є, — тож після правки
// драбинки перемальовуються.
bindField($("cMin"), (g, v) => { g.minP = v === "" ? null : +v; renderPad(g); },
  "input", (g) => порожньо(g.minP));
bindField($("cMax"), (g, v) => { g.maxP = v === "" ? null : +v; renderPad(g); },
  "input", (g) => порожньо(g.maxP));
bindField($("cMinutes"), (g, v) => { g.minutes = v === "" ? null : +v; }, "input", (g) => порожньо(g.minutes));
bindField($("cNote"), (g, v) => { g.comment = v; }, "input", (g) => g.comment || "");
bindField($("cTags"), (g, v) => {
  g.tags = v.split(",").map((s) => s.trim()).filter(Boolean);
}, "input", (g) => (g.tags || []).join(", "));
$("pPlus").onclick = () => bumpPlays(1);
$("pMinus").onclick = () => bumpPlays(-1);
function bumpPlays(d){
  const g = current(); if(!g) return;
  if(!canEdit()) return;
  g.plays = Math.max(0, (+g.plays || 0) + d);
  $("pVal").textContent = g.plays;
  renderStatus(g);   // перша партія знімає «ще не зіграна», нуль — повертає
  touch();
}
$("cDone").onclick = closeCard;
$("cClose").onclick = closeCard;
$("scrim").onclick = closeCard;
$("cDel").onclick = function(){
  const g = current(); if(!g) return;
  if(!canEdit()) return;
  if(this.textContent !== "Точно видалити?"){ this.textContent = "Точно видалити?"; return; }
  const id = g.id, name = g.name;
  closeCard(); drop(id); toast("«" + name + "» знято з полиці.");
};
document.addEventListener("keydown", (e) => {
  if(e.key === "Escape"){
    if(!$("bggBox").hidden) closeBgg();
    else if(!$("keyBox").hidden) closeKey();
    else if(ui.open) closeCard();
    else if(!$("menu").hidden) hideMenu();
  }
});

/* ── правила ─────────────────────────────────────── */
$("cRuleKind").innerHTML = Object.keys(ВИДИ_ПРАВИЛ).map((k) =>
  "<option value='" + esc(k) + "'>" + esc(ВИДИ_ПРАВИЛ[k]) + "</option>").join("");

$("cRuleAdd").addEventListener("click", () => {
  const g = current(); if(!g || !canEdit()) return;
  const url = $("cRuleUrl").value.trim();
  if(!/^https?:\/\//i.test(url)){
    toast("Потрібне посилання, що починається з http");
    return;
  }
  const kind = $("cRuleKind").value;
  g.rules = (g.rules || []).filter((п) => п.url !== url);
  g.rules.push({title: ВИДИ_ПРАВИЛ[kind], url: url, kind: kind});
  $("cRuleUrl").value = "";
  renderRules(g);
  render();
  touch();
});
$("cRuleUrl").addEventListener("keydown", (e) => {
  if(e.key === "Enter"){ e.preventDefault(); $("cRuleAdd").click(); }
});
/* Жанр у картці — це не позначка, а запит: натиснув «фентезі» — закрилась
   картка, у пошуку стоїть «фентезі», у списку лише воно. Це та навігація
   по жанрах, якої бракувало: дрібних жанрів вісім десятків, і фільтром
   вони були б стіною кнопок. */
$("cGenres").addEventListener("click", (e) => {
  const b = e.target.closest("[data-genre]"); if(!b) return;
  closeCard();
  ui.q = b.dataset.genre;
  renderFilters();
  render();
  window.scrollTo({top: 0, behavior: "smooth"});
});
$("cRules").addEventListener("click", (e) => {
  const b = e.target.closest("[data-rule]"); if(!b) return;
  const g = current(); if(!g || !canEdit()) return;
  g.rules = (g.rules || []).filter((п) => п.url !== b.dataset.rule);
  if(!g.rules.length) delete g.rules;
  renderRules(g);
  render();
  touch();
});
