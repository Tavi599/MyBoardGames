/* ── картка гри ───────────────────────────────────────────────────── */

const SAVED_NOTE_MS = 1600;
const CONFIRM_DELETE_LABEL = "Точно видалити?";

/** Правку зроблено: ставимо мітку, перемальовуємо й віддаємо сховищу.
    Запис відкладений і свій на кожну коробку — див. store.saveSoon(). */
function commitEdit(game){
  touchUpdated(game);
  renderAll();
  const note = byId("cardSaveState");
  note.textContent = "…";
  store.saveSoon(game).then(() => {
    note.textContent = "збережено";
    setTimeout(() => { if(note.textContent === "збережено") note.textContent = ""; }, SAVED_NOTE_MS);
  });
}
/** Коробка з відкритої картки, якщо її зараз можна правити. */
function editableOpenGame(){
  const game = openGame();
  return game && ensureEditable() ? game : null;
}

/* ── драбинка оцінки ──────────────────────────────────────────────── */
function paintScale(host, max, score){
  const bandClass = max === 10 ? scoreBandClass(score) : "b-top";
  host.className = host.className.replace(/\bb-(low|mid|good|top)\b/g, "").trim() +
    " " + (score == null ? "" : bandClass);
  Array.prototype.forEach.call(host.children, (button, index) => {
    const step = index + 1;
    const full = score != null && score >= step;
    const half = score != null && !full && score > step - 1;
    button.classList.toggle("on", full);
    button.classList.toggle("half", half);
    button.setAttribute("aria-pressed", full || half ? "true" : "false");
  });
}
/** Малює драбинку від 1 до max. `read` повертає поточну оцінку, `write`
    кладе нову в запис відкритої коробки. */
function mountScale(host, max, read, write){
  host.innerHTML = "";
  for(let step = 1; step <= max; step++){
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = step;
    button.dataset.score = step;
    button.setAttribute("aria-label", "оцінка " + step);
    host.appendChild(button);
  }
  host.onclick = (event) => {
    const button = event.target.closest("button");
    if(!button) return;
    const game = editableOpenGame();
    if(!game) return;
    const step = +button.dataset.score, current = read(game);
    // Три стани на одній цифрі: ціле → пів бала менше → порожньо.
    // Так півбали доступні і мишею, і пальцем, без крихітних мішеней.
    const next = current === step ? step - 0.5 : (current === step - 0.5 ? null : step);
    write(game, next);
    paintScale(host, max, next);
    commitEdit(game);
  };
  const game = openGame();
  paintScale(host, max, game ? read(game) : null);
}

/** Статуси картки. Похідний «ще не зіграна» показуємо разом із рештою, але
    мертвим підписом: його вимикає перша партія, а не палець. */
function renderCardStatuses(game){
  const chosen = new Set(statusesOf(game));
  byId("cardStatuses").innerHTML = Object.keys(STATUS_LABELS).map((status) =>
    "<button type='button' class='chip" +
    (STATUS_TONE_CLASS[status] ? " " + STATUS_TONE_CLASS[status] : "") +
    "' data-status='" + escapeHtml(status) + "' aria-pressed='" +
    (chosen.has(status) ? "true" : "false") + "'>" + escapeHtml(STATUS_LABELS[status]) +
    "</button>").join("");
  const derived = derivedStatuses(game).map((status) => DERIVED_STATUS_LABELS[status]);
  byId("cardDerivedStatus").hidden = !derived.length;
  byId("cardDerivedStatus").textContent = derived.length
    ? derived.join(" · ") + " — зникне саме після першої партії"
    : "";
}

/** Драбинки оцінок за складом столу. У картці показуємо всі склади, на які
    коробка розрахована, — порожні теж, бо саме тут оцінку й ставлять.
    Перемальовується щоразу, коли міняються межі «Від»/«До»: інакше
    клітинка на п'ятьох не з'явиться, доки картку не закрити й не відкрити. */
function renderCountScores(game){
  const host = byId("cardCountScores");
  host.innerHTML = "";
  playerCountsFor(game).forEach((count) => {
    const label = document.createElement("div");
    label.className = "who";
    label.innerHTML = escapeHtml(playerCountLabel(game, count)) + "<small>ГР.</small>";
    const scale = document.createElement("div");
    scale.className = "scale s10";
    host.appendChild(label);
    host.appendChild(scale);
    mountScale(scale, 10,
      (current) => scoreForCount(current, count),
      (current, score) => {
        current.byCount = current.byCount || {};
        if(score == null) delete current.byCount[count]; else current.byCount[count] = score;
      });
  });
}

/* ── що каже BGG ──────────────────────────────────────────────────── */

/** [підпис, значення] для блоку чужих чисел; порожні рядки випадають. */
function bggFacts(game){
  const playersRange = game.bggMin || game.bggMax
    ? (game.bggMin || "?") + "–" + (game.bggMax || "?") : "";
  let duration = "";
  if(game.bggTimeMin || game.bggTimeMax){
    duration = game.bggTimeMin === game.bggTimeMax || !game.bggTimeMax
      ? (game.bggTimeMin || game.bggTimeMax) + " хв"
      : game.bggTimeMin + "–" + game.bggTimeMax + " хв";
  }
  return [
    ["Оцінка", game.bggRating ? formatNumber(game.bggRating) : ""],
    ["Місце в рейтингу", game.bggRank ? "№ " + game.bggRank : ""],
    ["Гравців", playersRange],
    ["Найкраще на", formatRanges(game.bggBest)],
    ["Годиться на", formatRanges(game.bggRec)],
    ["Партія", duration],
    ["Складність", game.bggWeight ? formatNumber(game.bggWeight) + " з 5" : ""],
  ].filter((fact) => fact[1]);
}
/** Жанри чипами: {label, className, filterKey, value}.

    Три шари, і саме в такому порядку: родина (широка, за нею фільтрують
    першою стрічкою), ключові жанри (друга стрічка), і вже потім решта
    категорій BGG — вони не в навігації й тому найтихіші.

    Чип несе не лише підпис, а й те, чим його шукати: у родини й ключового
    жанру є власна стрічка, тож вони ставлять саме її. Пошуком за підписом
    це не робиться: «соло» текстом знайшло б і «соло-режим», а «стратегія» —
    будь-яку нотатку зі словом «стратегія». */
function genreChips(game){
  const keyLabels = keyGenreLabels(game);
  const familyLabelList = familyLabels(game);
  const chip = (label, className, filterKey, value) =>
    ({label: label, className: className, filterKey: filterKey, value: value});
  return familyKeys(game).map((slug, index) => chip(familyLabelList[index], "family", "family", slug))
    .concat(
      keyGenreKeys(game).map((key, index) => chip(keyLabels[index], "key-genre", "keyGenre", key)),
      genreLabels(game).filter((label) => keyLabels.indexOf(label) < 0)
        .map((label) => chip(label, "", "search", label)));
}
/** Що про цю коробку каже BGG. Нічого з цього не редагується: це чужі
    числа, і правити їх тут означало б удавати, ніби вони твої. Свої —
    у полях «Від», «До», «Хвилин» і «Складність»: вони лягають зверху. */
function renderBggSection(game){
  const facts = bggFacts(game);
  const chips = genreChips(game);
  // Жанри — чипами, а не рядком: кожен шукає себе по всій полиці.
  byId("cardGenres").hidden = !chips.length;
  byId("cardGenres").innerHTML = chips.map((chip) =>
    "<button type='button' class='chip tag " + chip.className + "' data-filter='" +
    escapeHtml(chip.filterKey) + "' data-value='" + escapeHtml(chip.value) +
    "' title='Знайти всі такі'>" + escapeHtml(chip.label) + "</button>").join("");

  // Заповнюємо завжди, і лише потім вирішуємо, чи показувати. Ранній вихід
  // тут лишав у блоці числа попередньої гри: сховане — ще не порожнє.
  byId("cardBggFacts").innerHTML = facts.map(([label, value]) =>
    "<div><dt>" + escapeHtml(label) + "</dt><dd>" + escapeHtml(value) + "</dd></div>").join("");
  const link = byId("cardBggLink");
  link.hidden = !game.bggId;
  link.href = game.bggId
    ? "https://boardgamegeek.com/boardgame/" + encodeURIComponent(game.bggId) : "";
  // Кнопка є лише там, де є кому питати. На GitHub Pages те саме щоночі
  // робить дія в репозиторії, а з диска до BGG не дійти зовсім: він не
  // пускає до себе браузерну сторінку (CORS) і пошуку за назвою не віддає
  // нікому — тільки звернення за числовим id з боку сервера.
  byId("cardBggRefreshButton").hidden =
    !(store.mode === STORAGE_MODE.SERVER && /^[0-9]+$/.test(String(game.bggId || "")));
  byId("cardBggSection").hidden = !facts.length && !chips.length;
}

/* Назви полів у відповіді сервера — наші внутрішні; у сповіщенні вони
   мають бути такими самими, як підписи в блоці «Що каже BGG». Мінус
   спереду означає, що поле не з'явилося, а зникло (так буває з рангом:
   гра вибула з рейтингу). */
const BGG_FIELD_LABELS = {
  bggMin: "гравців", bggMax: "гравців", bggTimeMin: "тривалість",
  bggTimeMax: "тривалість", bggRating: "оцінка", bggRank: "місце в рейтингу",
  bggWeight: "складність", bggBest: "найкраще на", bggRec: "годиться на",
  bggFamily: "підрозділ", bggGenres: "жанри", bggMech: "механіки",
  cover: "обкладинка",
};
function bggFieldLabels(fields){
  const labels = [];
  fields.forEach((field) => {
    const removed = field.charAt(0) === "−" || field.charAt(0) === "-";
    const name = BGG_FIELD_LABELS[removed ? field.slice(1) : field] || field;
    const label = removed ? name + " (зникло)" : name;
    if(labels.indexOf(label) < 0) labels.push(label);
  });
  return labels;
}
/** Запитати BGG про цю коробку просто зараз. Своїх полів це не торкається —
    добираються тільки чужі числа; мітку updated сервер не піднімає, щоб не
    перебити правку, яка чекає в черзі на телефоні. */
async function refreshOpenGameFromBgg(){
  const game = editableOpenGame();
  if(!game) return;
  const button = byId("cardBggRefreshButton"), label = button.textContent;
  button.disabled = true;
  button.textContent = "Питаю BGG…";
  try{
    const result = await store.refreshFromBgg(game.id);
    if(view.openGameId === result.game.id){
      renderBggSection(result.game);
      renderFamilySelect(result.game);     // порожній варіант показує, що стоїть на BGG
      byId("cardCover").value = result.game.cover || "";
      renderCoverPreview(result.game);
      renderCountScores(result.game);      // межі BGG вирішують, які склади показати
    }
    toast(result.fields.length
      ? "З BGG: " + bggFieldLabels(result.fields).join(", ") + "."
      : "На BGG те саме: міняти нічого.");
  }catch(error){
    toast("Не вдалося: " + (error.message || error));
  }finally{
    button.disabled = false;
    button.textContent = label;
  }
}
byId("cardBggRefreshButton").addEventListener("click", refreshOpenGameFromBgg);

/** Вибір власного жанру. Порожній варіант означає «як на BGG» і показує,
    що саме там стоїть, — щоб було видно, чи є від чого відступати. */
function renderFamilySelect(game){
  const fromBgg = (game.bggFamily || []).map((slug) => FAMILY_LABELS[slug] || slug).join(" · ");
  const own = (game.family || [])[0] || "";
  const options = [["", fromBgg ? "як на BGG — " + fromBgg : "не вказано"]]
    .concat(Object.keys(FAMILY_LABELS).map((slug) => [slug, FAMILY_LABELS[slug]]));
  byId("cardFamily").innerHTML = selectOptionsHtml(options, own);
  byId("cardFamily").value = own;
}

/** Правила гри: список посилань із хрестиком і рядок для нового. */
function renderRules(game){
  const rules = sortedRules(game);
  byId("cardRules").innerHTML = rules.length
    ? rules.map((rule) =>
        "<div class='rule'>" +
        "<a href='" + escapeHtml(safeUrl(rule.url)) + "' target='_blank' rel='noopener noreferrer'>" +
        escapeHtml(rule.title || RULE_KIND_LABELS[rule.kind] || "правила") + "</a>" +
        "<i>" + escapeHtml(RULE_KIND_LABELS[rule.kind] || rule.kind || "") + "</i>" +
        "<button type='button' class='rm' data-remove-rule='" + escapeHtml(rule.url) +
        "' aria-label='Прибрати'>✕</button></div>").join("")
    : "<p class='hint'>Правил ще немає.</p>";
}

/* ── доповнення ───────────────────────────────────────────────────── */

/** Доповнення, які ця база завжди тягне за собою. Прив'язані видно чипами,
    а весь перелік ховається за кнопкою: коли доповнень на полиці півтора
    десятка, показувати їх усі в кожній картці — знущання.
    У картці самого доповнення блок не потрібен, тому ховається. */
function renderLinkedExpansions(game){
  byId("cardExpansionsSection").hidden = !!game.expansion;
  if(game.expansion) return;
  byId("cardLinkedExpansions").innerHTML = (game.withExp || [])
    .map((id) => store.findGame(id))
    .filter(Boolean)
    .map((expansion) =>
      "<button type='button' class='chip tied' data-unlink='" + escapeHtml(expansion.id) +
      "' aria-label='Відв’язати " + escapeHtml(expansion.name) + "'>" +
      escapeHtml(expansion.name) + "<b>✕</b></button>")
    .join("") || "<span class='hint'>Жодного не прив'язано.</span>";
  renderExpansionOptions(game);
}
/** Перелік у розкривачці. Спершу ті, чия назва починається так само, як
    у базової гри, — «Ходу героям нема. Великий сплячий» має бути під рукою
    саме в «Ходу героям нема». */
function renderExpansionOptions(game){
  const host = byId("expansionOptions");
  const query = byId("expansionSearch").value.trim().toLowerCase();
  const baseTitle = (game.name || "").split(/[.:–—(]/)[0].trim().toLowerCase();
  const kinship = (candidate) =>
    baseTitle && (candidate.name || "").toLowerCase().startsWith(baseTitle) ? 0 : 1;
  const expansions = store.games
    .filter((candidate) => candidate.expansion && candidate.id !== game.id)
    .filter((candidate) => !query ||
      [candidate.name, candidate.nameEn].join(" ").toLowerCase().includes(query))
    .sort((a, b) => kinship(a) - kinship(b) || compareByName(a, b));
  if(!expansions.length){
    host.innerHTML = "<p class='hint'>" + (query
      ? "Нічого не знайшлося."
      : "Жодної коробки ще не позначено як доповнення. Відкрий доповнення й " +
        "натисни там «Це доповнення» — після цього воно з'явиться тут.") + "</p>";
    return;
  }
  const linked = new Set(game.withExp || []);
  host.innerHTML = expansions.map((expansion) =>
    "<label class='pickrow'><input type='checkbox' data-expansion='" + escapeHtml(expansion.id) +
    "'" + (linked.has(expansion.id) ? " checked" : "") + "><span>" +
    escapeHtml(expansion.name) + "</span></label>").join("");
}
/** Прив'язати або відв'язати доповнення й перемалювати чипи. */
function linkExpansion(game, expansionId, linked){
  setExpansionLinked(game, expansionId, linked);
  renderLinkedExpansions(game);
  commitEdit(game);
}
byId("expansionOptions").addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-expansion]");
  if(!checkbox) return;
  const game = openGame();
  if(!game) return;
  if(!ensureEditable()){ checkbox.checked = !checkbox.checked; return; }
  linkExpansion(game, checkbox.dataset.expansion, checkbox.checked);
});
byId("cardLinkedExpansions").addEventListener("click", (event) => {
  const chip = event.target.closest("[data-unlink]");
  if(!chip) return;
  const game = editableOpenGame();
  if(game) linkExpansion(game, chip.dataset.unlink, false);
});
byId("expansionPickerToggle").addEventListener("click", () => {
  const opening = byId("expansionPicker").hidden;
  byId("expansionPicker").hidden = !opening;
  byId("expansionPickerToggle").setAttribute("aria-expanded", opening ? "true" : "false");
  if(opening) byId("expansionSearch").focus();
});
byId("expansionSearch").addEventListener("input", () => {
  const game = openGame();
  if(game) renderExpansionOptions(game);
});
byId("cardExpansionToggle").addEventListener("click", function(){
  const game = editableOpenGame();
  if(!game) return;
  if(game.expansion) delete game.expansion; else game.expansion = true;
  this.setAttribute("aria-pressed", game.expansion ? "true" : "false");
  commitEdit(game);
});

/* ── відкрити й закрити ───────────────────────────────────────────── */
const blankIfNull = (value) => (value == null ? "" : value);

function renderCoverPreview(game){
  byId("cardCoverPreview").innerHTML = coverImageHtml(game, false);
}
function openCard(id){
  view.openGameId = id;
  const game = openGame();
  if(!game) return;
  byId("cardName").value = game.name || "";
  byId("cardOriginalName").value = game.nameEn || "";
  view.showFullPlayLog = false;      // журнал щоразу починається згорнутим
  renderPlays(game);                 // малює й статуси: вони залежать від партій
  byId("playDateInput").value = "";
  byId("cardMinPlayers").value = blankIfNull(game.minP);
  byId("cardMaxPlayers").value = blankIfNull(game.maxP);
  byId("cardMinutes").value = blankIfNull(game.minutes);
  byId("cardExpansionToggle").setAttribute("aria-pressed", game.expansion ? "true" : "false");
  renderBggSection(game);
  renderFamilySelect(game);
  renderRules(game);
  byId("ruleUrlInput").value = "";
  // Розкривачка доповнень щоразу починається згорнутою й без старого пошуку.
  byId("expansionSearch").value = "";
  byId("expansionPicker").hidden = true;
  byId("expansionPickerToggle").setAttribute("aria-expanded", "false");
  renderLinkedExpansions(game);
  byId("cardCover").value = game.cover || "";
  renderCoverPreview(game);
  byId("cardTags").value = (game.tags || []).join(", ");
  byId("cardNote").value = game.comment || "";
  byId("cardSaveState").textContent = "";
  byId("cardDeleteButton").textContent = "Видалити";

  mountScale(byId("cardScoreScale"), 10,
    (current) => current.score, (current, score) => { current.score = score; });
  mountScale(byId("cardWeightScale"), 5,
    (current) => current.weight, (current, weight) => { current.weight = weight; });
  renderCountScores(game);

  byId("cardScrim").hidden = false;
  byId("gameCard").hidden = false;
  requestAnimationFrame(() => byId("gameCard").classList.add("on"));
  byId("cardName").focus();
}
function closeCard(){
  view.openGameId = null;
  byId("gameCard").classList.remove("on");
  byId("gameCard").hidden = true;
  byId("cardScrim").hidden = true;
}
byId("cardDoneButton").addEventListener("click", closeCard);
byId("cardCloseButton").addEventListener("click", closeCard);
byId("cardScrim").addEventListener("click", closeCard);
byId("cardDeleteButton").addEventListener("click", function(){
  const game = editableOpenGame();
  if(!game) return;
  if(this.textContent !== CONFIRM_DELETE_LABEL){ this.textContent = CONFIRM_DELETE_LABEL; return; }
  closeCard();
  store.removeGame(game.id).then((removed) => {
    if(removed) toast("«" + game.name + "» знято з полиці.");
  });
});

/* ── прості поля ──────────────────────────────────────────────────── */

/** Прив'язує поле картки до запису: `apply` кладе введене в коробку,
    `restore` повертає полю попереднє значення, якщо правити не можна. */
function bindField(id, apply, restore){
  const field = byId(id);
  field.addEventListener("input", () => {
    const game = openGame();
    if(!game) return;
    if(!ensureEditable()){ field.value = restore(game); return; }
    apply(game, field.value);
    commitEdit(game);
  });
}
const numberOrNull = (text) => (text === "" ? null : +text);

bindField("cardName", (game, text) => { game.name = text; }, (game) => game.name || "");
bindField("cardOriginalName", (game, text) => { game.nameEn = text; }, (game) => game.nameEn || "");
bindField("cardCover", (game, text) => {
  const url = text.trim();
  if(url) game.cover = url; else delete game.cover;
  renderCoverPreview(game);
}, (game) => game.cover || "");
// Межі столу вирішують, які клітинки складу взагалі є, — тож після правки
// драбинки перемальовуються.
bindField("cardMinPlayers", (game, text) => { game.minP = numberOrNull(text); renderCountScores(game); },
  (game) => blankIfNull(game.minP));
bindField("cardMaxPlayers", (game, text) => { game.maxP = numberOrNull(text); renderCountScores(game); },
  (game) => blankIfNull(game.maxP));
bindField("cardMinutes", (game, text) => { game.minutes = numberOrNull(text); },
  (game) => blankIfNull(game.minutes));
bindField("cardNote", (game, text) => { game.comment = text; }, (game) => game.comment || "");
bindField("cardTags", (game, text) => {
  game.tags = text.split(",").map((tag) => tag.trim()).filter(Boolean);
}, (game) => (game.tags || []).join(", "));

byId("cardStatuses").addEventListener("click", (event) => {
  const chip = event.target.closest("[data-status]");
  if(!chip) return;
  const game = editableOpenGame();
  if(!game) return;
  const status = chip.dataset.status, chosen = new Set(statusesOf(game));
  if(chosen.has(status)) chosen.delete(status);
  else resolveStatusConflicts(chosen.add(status), status);
  setStatuses(game, chosen);
  renderCardStatuses(game);
  commitEdit(game);
});
byId("cardFamily").addEventListener("change", (event) => {
  const game = openGame();
  if(!game) return;
  if(!ensureEditable()){ renderFamilySelect(game); return; }
  if(event.target.value) game.family = [event.target.value]; else delete game.family;
  renderBggSection(game);      // чипи вгорі картки показують родину першою
  commitEdit(game);
});
/* Жанр у картці — це не позначка, а запит: натиснув «фентезі» — закрилась
   картка, у списку лише воно. Це та навігація по жанрах, якої бракувало:
   дрібних жанрів вісім десятків, і фільтром вони були б стіною кнопок. */
byId("cardGenres").addEventListener("click", (event) => {
  const chip = event.target.closest("[data-filter]");
  if(!chip) return;
  closeCard();
  // Решту фільтрів скидаємо: підказка обіцяє «знайти всі такі», а з
  // увімкненою «стратегією» натиснуте в сімейній грі «тварини» дало б
  // порожній список — і виглядало б це як поламане, а не як перетин.
  // «Приховати» не чіпаємо: це не фільтр, а те, чого ти взагалі не
  // хочеш бачити на полиці, і жанр тут нічого не вирішує.
  view.filters = defaultFilterValues();
  view.filters[chip.dataset.filter] = chip.dataset.value;
  renderFilterPanel();
  renderAll();
  window.scrollTo({top: 0, behavior: "smooth"});
});

/* ── партії ───────────────────────────────────────────────────────── */

/** Лічильник, журнал і похідний статус — усе, що змінює одна партія. */
function renderPlays(game){
  byId("playsCount").textContent = game.plays || 0;
  renderPlayLog(game);
  renderCardStatuses(game);   // перша партія знімає «ще не зіграна», нуль — повертає
}
/** Плюс записує сьогоднішню партію в журнал — це і є той «один дотик». */
byId("playsPlusButton").addEventListener("click", () => {
  const game = editableOpenGame();
  if(!game) return;
  addPlay(game);
  renderPlays(game);
  commitEdit(game);
});
/** Скасовує останню партію відкритої коробки. `explainEmpty` — сказати
    вголос, якщо скасовувати нічого: «−» біля лічильника мовчить, кнопка
    при журналі пояснює. */
function undoLastPlayInCard(explainEmpty){
  const game = editableOpenGame();
  if(!game) return;
  if(!playCount(game)){
    if(explainEmpty) toast("Скасовувати нічого.");
    return;
  }
  undoLastPlay(game);
  renderPlays(game);
  commitEdit(game);
}
byId("playsMinusButton").addEventListener("click", () => undoLastPlayInCard(false));
/* Скасувати останнє: те саме, що «−» угорі, але тут, при журналі, де
   й видно, що саме зникне. */
byId("playUndoButton").addEventListener("click", () => undoLastPlayInCard(true));
/* Партія минулим числом: грали в суботу, записуєш у понеділок. */
byId("playAddButton").addEventListener("click", () => {
  const game = editableOpenGame();
  if(!game) return;
  const isoDate = byId("playDateInput").value;
  if(!isoDate){ toast("Обери день, коли грали."); return; }
  if(isoDate > todayIso()){ toast("Наперед партії не записують."); return; }
  addPlay(game, isoDate);
  byId("playDateInput").value = "";
  renderPlays(game);
  commitEdit(game);
});

/* Журнал партій: найсвіжіші згори — саме їх дописують і саме їх
   виправляють. Показуємо шість — далі це вже не «що ми грали останнім
   часом», а історія, і вона розкривається окремо. */
const PLAY_LOG_PREVIEW = 6;
function playLogRowHtml(entry, index){
  return "<div class='logrow'>" +
    // Дата — поле, а не підпис: партію записують і наступного дня, і в
    // понеділок за суботу, і помилитися тут легше, ніж деінде.
    "<input class='date-in' type='date' data-play-date='" + index + "' value='" +
    escapeHtml(entry.on) + "' max='" + escapeHtml(todayIso()) + "' aria-label='День партії'>" +
    "<select data-play-count='" + index + "' aria-label='Скільки було за столом'>" +
    selectOptionsHtml([["", "склад"]].concat(
      PLAYER_COUNTS.map((count) => [count, PLAYER_COUNT_LABELS[count]])), entry.count || "") +
    "</select>" +
    "<input class='note-in' data-play-note='" + index + "' value='" + escapeHtml(entry.note || "") +
    "' placeholder='нотатка' aria-label='Нотатка до партії'>" +
    "<button class='icon' data-play-remove='" + index + "' type='button' " +
    "aria-label='Прибрати цю партію'>✕</button></div>";
}
function renderPlayLog(game){
  const log = playLog(game);
  const showAll = view.showFullPlayLog || log.length <= PLAY_LOG_PREVIEW;
  // Номер запису — це його місце в журналі; малюємо від кінця, тож
  // тримаємо справжній номер при собі, а не рахуємо його на льоту.
  const rows = log.map((entry, index) => [entry, index]).reverse()
    .slice(0, showAll ? log.length : PLAY_LOG_PREVIEW);
  const undated = Math.max(0, playCount(game) - log.length);
  byId("cardPlayLog").innerHTML =
    rows.map(([entry, index]) => playLogRowHtml(entry, index)).join("") +
    (log.length > PLAY_LOG_PREVIEW
      ? "<button class='link' data-toggle-play-log type='button'>" +
        (showAll ? "згорнути" : "показати всі " + log.length) + "</button>"
      : "") +
    (undated
      ? "<p class='hint'>" + undated + " " + pluralize(undated, "партія", "партії", "партій") +
        " без дати — зіграні до журналу.</p>"
      : "") +
    (!log.length && !undated ? "<p class='hint'>Ще жодної партії.</p>" : "");
}
byId("cardPlayLog").addEventListener("click", (event) => {
  if(event.target.closest("[data-toggle-play-log]")){
    view.showFullPlayLog = !view.showFullPlayLog;
    const game = openGame();
    if(game) renderPlayLog(game);
    return;
  }
  const removeButton = event.target.closest("[data-play-remove]");
  if(!removeButton) return;
  const game = editableOpenGame();
  if(!game) return;
  removePlay(game, +removeButton.dataset.playRemove);
  renderPlays(game);
  commitEdit(game);
});
byId("cardPlayLog").addEventListener("change", (event) => {
  const countSelect = event.target.closest("[data-play-count]");
  const dateInput = event.target.closest("[data-play-date]");
  if(!countSelect && !dateInput) return;
  const game = editableOpenGame();
  if(!game) return;
  if(countSelect){
    const entry = playLog(game)[+countSelect.dataset.playCount];
    if(!entry) return;
    if(countSelect.value) entry.count = countSelect.value; else delete entry.count;
    commitEdit(game);
    return;
  }
  if(!dateInput.value || dateInput.value > todayIso()){
    // Порожнє поле й день наперед лишаємо без змін: партія, яка ще не
    // відбулася, — це не запис, а обіцянка.
    renderPlayLog(game);
    if(dateInput.value) toast("Наперед партії не записують.");
    return;
  }
  movePlay(game, +dateInput.dataset.playDate, dateInput.value);
  renderPlayLog(game);
  commitEdit(game);
});
byId("cardPlayLog").addEventListener("input", (event) => {
  const noteInput = event.target.closest("[data-play-note]");
  if(!noteInput) return;
  const game = editableOpenGame();
  if(!game) return;
  const entry = playLog(game)[+noteInput.dataset.playNote];
  if(!entry) return;
  const note = noteInput.value.trim();
  if(note) entry.note = note; else delete entry.note;
  commitEdit(game);
});

/* ── правила ──────────────────────────────────────────────────────── */
byId("ruleKindSelect").innerHTML = selectOptionsHtml(
  Object.keys(RULE_KIND_LABELS).map((kind) => [kind, RULE_KIND_LABELS[kind]]), null);

byId("ruleAddButton").addEventListener("click", () => {
  const game = editableOpenGame();
  if(!game) return;
  const url = byId("ruleUrlInput").value.trim();
  if(!/^https?:\/\//i.test(url)){
    toast("Потрібне посилання, що починається з http");
    return;
  }
  const kind = byId("ruleKindSelect").value;
  game.rules = (game.rules || []).filter((rule) => rule.url !== url);
  game.rules.push({title: RULE_KIND_LABELS[kind], url: url, kind: kind});
  byId("ruleUrlInput").value = "";
  renderRules(game);
  commitEdit(game);
});
byId("ruleUrlInput").addEventListener("keydown", (event) => {
  if(event.key === "Enter"){ event.preventDefault(); byId("ruleAddButton").click(); }
});
byId("cardRules").addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-rule]");
  if(!removeButton) return;
  const game = editableOpenGame();
  if(!game) return;
  game.rules = (game.rules || []).filter((rule) => rule.url !== removeButton.dataset.removeRule);
  if(!game.rules.length) delete game.rules;
  renderRules(game);
  commitEdit(game);
});
