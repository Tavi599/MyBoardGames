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
    "<button type='button' class='chip" + (ТОН_СТАТУСУ[k] ? " " + ТОН_СТАТУСУ[k] : "") +
    "' data-st='" + esc(k) + "' aria-pressed='" +
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

  // Жанри — чипами, а не рядком: кожен шукає себе по всій полиці.
  // Три шари, і саме в такому порядку: родина (широка, за нею фільтрують
  // першою стрічкою), ключові жанри (друга стрічка), і вже потім решта
  // категорій BGG — вони не в навігації й тому найтихіші.
  const ключі = keyGenres(g), ключові = keyGenreNames(g);
  const родини = familyOf(g), рідні = familyNames(g);
  const решта = genreNames(g).filter((н) => ключові.indexOf(н) < 0);
  // Чип несе не лише підпис, а й те, чим його шукати: у родини й ключового
  // жанру є власна стрічка, тож вони ставлять саме її. Пошуком за підписом
  // це не робиться: «соло» текстом знайшло б і «соло-режим», а «стратегія» —
  // будь-яку нотатку зі словом «стратегія».
  const мітки = родини.map((k, i) => [рідні[i], "рід", "family", k])
    .concat(ключі.map((k, i) => [ключові[i], "ключ", "key", k]),
            решта.map((н) => [н, "", "q", н]));
  $("cGenres").hidden = !мітки.length;
  $("cGenres").innerHTML = мітки.map(([н, к, ф, знач]) =>
    "<button type='button' class='chip tag " + к + "' data-ф='" + esc(ф) +
    "' data-v='" + esc(знач) + "' title='Знайти всі такі'>" + esc(н) +
    "</button>").join("");

  // Заповнюємо завжди, і лише потім вирішуємо, чи показувати. Ранній вихід
  // тут лишав у блоці числа попередньої гри: сховане — ще не порожнє.
  $("cBgg").innerHTML = рядки.map(([п, з]) =>
    "<div><dt>" + esc(п) + "</dt><dd>" + esc(з) + "</dd></div>").join("");
  const л = $("cBggLink");
  л.hidden = !g.bggId;
  л.href = g.bggId
    ? "https://boardgamegeek.com/boardgame/" + encodeURIComponent(g.bggId) : "";
  $("bggGrp").hidden = !рядки.length && !мітки.length;
}

/** Вибір власного жанру. Порожній варіант означає «як на BGG» і показує,
    що саме там стоїть, — щоб було видно, чи є від чого відступати. */
function renderFamily(g){
  const чуже = (g.bggFamily || []).map((k) => РОДИНИ[k] || k).join(" · ");
  const своє = (g.family || [])[0] || "";
  $("cFamily").innerHTML =
    "<option value=''>" + esc(чуже ? "як на BGG — " + чуже : "не вказано") + "</option>" +
    Object.keys(РОДИНИ).map((k) =>
      "<option value='" + esc(k) + "'" + (своє === k ? " selected" : "") + ">" +
      esc(РОДИНИ[k]) + "</option>").join("");
  $("cFamily").value = своє;
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
  ui.logAll = false;   // журнал щоразу починається згорнутим
  показатиПартії(g);
  $("cLogDate").value = "";
  $("cMin").value = g.minP == null ? "" : g.minP;
  $("cMax").value = g.maxP == null ? "" : g.maxP;
  $("cMinutes").value = g.minutes == null ? "" : g.minutes;
  $("cExp").setAttribute("aria-pressed", g.expansion ? "true" : "false");
  renderBgg(g);
  renderFamily(g);
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
$("cFamily").addEventListener("change", (e) => {
  const g = current(); if(!g) return;
  if(!canEdit()){ renderFamily(g); return; }
  if(e.target.value) g.family = [e.target.value]; else delete g.family;
  renderBgg(g);      // чипи вгорі картки показують родину першою
  render();
  touch();
});
bindField($("cNote"), (g, v) => { g.comment = v; }, "input", (g) => g.comment || "");
bindField($("cTags"), (g, v) => {
  g.tags = v.split(",").map((s) => s.trim()).filter(Boolean);
}, "input", (g) => (g.tags || []).join(", "));
$("pPlus").onclick = () => bumpPlays(1);
$("pMinus").onclick = () => bumpPlays(-1);
function bumpPlays(d){
  const g = current(); if(!g) return;
  if(!canEdit()) return;
  // Плюс записує сьогоднішню партію в журнал — це і є той «один дотик».
  // Мінус спершу з'їдає незаписані партії, і лише потім свіжий запис.
  if(d > 0) додатиПартію(g); else меншеПартій(g);
  показатиПартії(g);
  touch();
}
/** Лічильник, журнал і похідний статус — усе, що змінює одна партія. */
function показатиПартії(g){
  $("pVal").textContent = g.plays || 0;
  renderLog(g);
  renderStatus(g);   // перша партія знімає «ще не зіграна», нуль — повертає
}
/* ── журнал партій ────────────────────────────────────────────────────
   Найсвіжіші згори: саме їх дописують і саме їх виправляють. Показуємо
   шість — далі це вже не «що ми грали останнім часом», а історія, і
   вона розкривається окремо. */
const ПОКАЗУВАТИ_ПАРТІЙ = 6;
function renderLog(g){
  const ж = журнал(g);
  const усі = ui.logAll || ж.length <= ПОКАЗУВАТИ_ПАРТІЙ;
  // Номер запису — це його місце в журналі; малюємо від кінця, тож
  // тримаємо справжній номер при собі, а не рахуємо його на льоту.
  const рядки = ж.map((з, і) => [з, і]).reverse()
    .slice(0, усі ? ж.length : ПОКАЗУВАТИ_ПАРТІЙ);
  const незаписаних = Math.max(0, (+g.plays || 0) - ж.length);
  $("cLog").innerHTML = рядки.map(([з, і]) =>
    "<div class='logrow'><b>" + esc(датаКоротко(з.on)) + "</b>" +
    "<select data-logn='" + і + "' aria-label='Скільки було за столом'>" +
    "<option value=''>склад</option>" +
    COUNTS.map((c) => "<option value='" + esc(c) + "'" +
      (з.count === c ? " selected" : "") + ">" + esc(CLABEL[c]) + "</option>").join("") +
    "</select>" +
    "<input data-logt='" + і + "' value='" + esc(з.note || "") +
    "' placeholder='нотатка' aria-label='Нотатка до партії'>" +
    "<button class='icon' data-logx='" + і + "' type='button' " +
    "aria-label='Прибрати цю партію'>✕</button></div>").join("") +
    (ж.length > ПОКАЗУВАТИ_ПАРТІЙ
      ? "<button class='link' id='logMore' type='button'>" +
        (усі ? "згорнути" : "показати всі " + ж.length) + "</button>"
      : "") +
    (незаписаних
      ? "<p class='hint'>" + незаписаних + " " +
        plural(незаписаних, "партія", "партії", "партій") +
        " без дати — зіграні до журналу.</p>"
      : "") +
    (!ж.length && !незаписаних ? "<p class='hint'>Ще жодної партії.</p>" : "");
}
$("cLog").addEventListener("click", (e) => {
  if(e.target.id === "logMore"){ ui.logAll = !ui.logAll; renderLog(current()); return; }
  const b = e.target.closest("[data-logx]"); if(!b) return;
  const g = current(); if(!g || !canEdit()) return;
  прибратиПартію(g, +b.dataset.logx);
  показатиПартії(g);
  touch();
});
$("cLog").addEventListener("change", (e) => {
  const el = e.target.closest("[data-logn]"); if(!el) return;
  const g = current(); if(!g || !canEdit()) return;
  const з = журнал(g)[+el.dataset.logn]; if(!з) return;
  if(el.value) з.count = el.value; else delete з.count;
  touch();
});
$("cLog").addEventListener("input", (e) => {
  const el = e.target.closest("[data-logt]"); if(!el) return;
  const g = current(); if(!g || !canEdit()) return;
  const з = журнал(g)[+el.dataset.logt]; if(!з) return;
  const v = el.value.trim();
  if(v) з.note = v; else delete з.note;
  touch();
});
/* Партія минулим числом: грали в суботу, записуєш у понеділок. */
$("cLogAdd").addEventListener("click", () => {
  const g = current(); if(!g || !canEdit()) return;
  const коли = $("cLogDate").value;
  if(!коли){ toast("Обери день, коли грали."); return; }
  if(коли > сьогодні()){ toast("Наперед партії не записують."); return; }
  додатиПартію(g, коли);
  $("cLogDate").value = "";
  показатиПартії(g);
  touch();
});
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
    else if(!$("filtBox").hidden) closeFilters();
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
  const b = e.target.closest("#cGenres [data-ф]"); if(!b) return;
  closeCard();
  // Решту фільтрів скидаємо: підказка обіцяє «знайти всі такі», а з
  // увімкненою «стратегією» натиснуте в сімейній грі «тварини» дало б
  // порожній список — і виглядало б це як поламане, а не як перетин.
  // «Приховати» не чіпаємо: це не фільтр, а те, чого ти взагалі не
  // хочеш бачити на полиці, і жанр тут нічого не вирішує.
  ФІЛЬТРИ.forEach((ф) => { ui[ф.ключ] = ф.типово; });
  ui[b.dataset["ф"]] = b.dataset.v;
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
