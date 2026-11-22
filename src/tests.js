/* Тести на чисту логіку: модель запису, вибірка, сортування, злиття, черга.
   Живуть у власній сторінці «tests.html», яку збирає та сама «build.py» з
   тих самих файлів коду. Відкрий її в браузері — зелене означає, що все,
   від чого залежать оцінки, працює. */
"use strict";

let passed = 0, failed = 0;
const results = [];

function check(name, condition, details){
  if(condition){ passed++; results.push(["ok", name, ""]); }
  else { failed++; results.push(["no", name, details == null ? "" : String(details)]); }
}
function checkEqual(name, actual, expected){
  const actualJson = JSON.stringify(actual), expectedJson = JSON.stringify(expected);
  check(name, actualJson === expectedJson, "маю " + actualJson + ", чекав " + expectedJson);
}

/** Коробка зі зразка: усе, чого не назвав, — типове. */
function sampleGame(overrides){
  return Object.assign({
    id: "g-" + (overrides.name || "х"), name: "Гра", nameEn: "", statuses: ["колекція"],
    status: "колекція", score: null, byCount: {}, plays: 0, tags: [], comment: "",
    minP: null, maxP: null, updated: "2026-01-01T00:00:00.000Z",
  }, overrides);
}
/** Стан перегляду з типовими фільтрами й названими відхиленнями: `sort`,
    `reversed` і `hidden` — це поля самого стану, решта — значення фільтрів.
    Типове береться з реєстру, а не переписується тут: додасться фільтр —
    тести самі почнуть його скидати. */
function viewWith(state){
  const view = defaultView();
  Object.keys(state || {}).forEach((key) => {
    if(key === "sort" || key === "reversed") view[key] = state[key];
    else if(key === "hidden") view.hidden = new Set(state.hidden);
    else view.filters[key] = state[key];
  });
  return view;
}
/* Остання показана полиця та її стан — щоб спитати, чим саме її звужено. */
let lastShelf = [], lastView = defaultView();
/** Назви того, що видно на полиці `games` у стані `state`. */
function shownNames(games, state){
  lastShelf = games;
  lastView = viewWith(state);
  return visibleGames(games, lastView).map((game) => game.name);
}
const narrowings = () => activeNarrowings(lastShelf, lastView);
const isNarrowed = () => narrowings().length > 0;

/* ── статуси ───────────────────────────────────────── */
checkEqual("старий одиничний status читається",
      statusesOf({status:"улюблена"}), ["улюблена"]);
checkEqual("порожня коробка не має статусів", statusesOf({}), []);
{
  const game = sampleGame({});
  setStatuses(game, new Set(["позбувся", "улюблена"]));
  checkEqual("порядок статусів завжди як у STATUS", game.statuses, ["улюблена", "позбувся"]);
  checkEqual("status лишається дзеркалом першого", game.status, "улюблена");
  setStatuses(game, new Set());
  check("порожній набір прибирає status", !("status" in game), JSON.stringify(game.statuses));
}
checkEqual("незіграна виводиться з партій", derivedStatuses(sampleGame({plays:0})), ["незіграна"]);
checkEqual("зіграна не має похідного статусу", derivedStatuses(sampleGame({plays:1})), []);
checkEqual("похідний статус не потрапляє в збережені",
      statusesOf(sampleGame({plays:0})), ["колекція"]);

/* ── міграції ──────────────────────────────────────── */
{
  const legacy = migrateGame({id:"g-1", name:"Давня", status:"улюблена"});
  checkEqual("давній запис отримує список статусів", legacy.statuses, ["улюблена"]);
  checkEqual("дзеркало status лишається", legacy.status, "улюблена");
}
checkEqual("запис без статусу взагалі стає «у колекції»",
      migrateGame({id:"g-2", name:"Гола"}).statuses, ["колекція"]);
{
  const fresh = {id:"g-3", name:"Свіжа", statuses:["онлайн"], status:"онлайн"};
  checkEqual("міграція нічого не псує в сучасному записі",
        migrateGame(JSON.parse(JSON.stringify(fresh))), fresh);
  const twice = migrateGame(migrateGame(JSON.parse(JSON.stringify(fresh))));
  checkEqual("міграцію можна прогнати двічі поспіль", twice, fresh);
}
checkEqual("надгробок міграція не чіпає",
      migrateGame({id:"g-4", deleted:true, updated:"2026-01-01T00:00:00.000Z"}),
      {id:"g-4", deleted:true, updated:"2026-01-01T00:00:00.000Z"});

/* ── скасовані статуси ─────────────────────────────── */
{
  const legacyRecord = migrateGame({id:"g-6", name:"Давнє", statuses:["хочу","колекція"],
                         status:"хочу"});
  checkEqual("скасований статус випадає", legacyRecord.statuses, ["колекція"]);
  checkEqual("дзеркало переїжджає на того, хто лишився", legacyRecord.status, "колекція");
  const emptied = migrateGame({id:"g-7", name:"Саме хочу", statuses:["відклав"], status:"відклав"});
  checkEqual("коли не лишилось нічого — порожній список", emptied.statuses, []);
  check("і дзеркало прибирається", !("status" in emptied), JSON.stringify(emptied));
  checkEqual("сучасний запис міграція не чіпає",
        migrateGame({id:"g-8", name:"Свій", statuses:["чужа"], status:"чужа"}).statuses,
        ["чужа"]);
  // Найважливіше тут: сторінка, що застаріла на один статус, не сміє
  // стирати з чужого запису те, чого ще не знає, — інакше вона розішле
  // обрізане далі, і статус зникне в усіх.
  checkEqual("незнайомий статус переживає міграцію",
        migrateGame({id:"g-9", name:"З майбутнього",
                 statuses:["колекція","щеНеВигаданий"], status:"колекція"}).statuses,
        ["колекція", "щеНеВигаданий"]);
}

/* ── де коробка ────────────────────────────────────── */
{
  const game = sampleGame({statuses:["колекція"], status:"колекція"});
  setStatuses(game, resolveStatusConflicts(new Set(statusesOf(game)).add("чужа"), "чужа"));
  checkEqual("«друзів» гасить «у колекції»", game.statuses, ["чужа"]);
  setStatuses(game, resolveStatusConflicts(new Set(statusesOf(game)).add("колекція"), "колекція"));
  checkEqual("і навпаки", game.statuses, ["колекція"]);
  setStatuses(game, resolveStatusConflicts(new Set(statusesOf(game)).add("позбувся"), "позбувся"));
  checkEqual("«позбувся» теж гасить «у колекції»", game.statuses, ["позбувся"]);
  // Друг, у якого ти грав, продав свою коробку: вона й далі чужа і вже
  // недосяжна. Саме це поєднання показує, що продали друзі.
  setStatuses(game, resolveStatusConflicts(new Set(statusesOf(game)).add("чужа"), "чужа"));
  checkEqual("«чужа» і «позбувся» стоять разом", game.statuses, ["чужа", "позбувся"]);
  setStatuses(game, resolveStatusConflicts(new Set(statusesOf(game)).add("колекція"), "колекція"));
  checkEqual("«у колекції» гасить обидва разом", game.statuses, ["колекція"]);
}

/* ── кандидат на продаж ────────────────────────────── */
{
  const game = sampleGame({statuses:["колекція"], status:"колекція"});
  setStatuses(game, resolveStatusConflicts(new Set(statusesOf(game)).add("продаж"), "продаж"));
  checkEqual("продаж стає поруч із «у колекції»", game.statuses, ["колекція", "продаж"]);
  setStatuses(game, resolveStatusConflicts(new Set(statusesOf(game)).add("улюблена"), "улюблена"));
  checkEqual("улюблену теж можна продавати",
        game.statuses, ["колекція", "улюблена", "продаж"]);
  setStatuses(game, resolveStatusConflicts(new Set(statusesOf(game)).add("позбувся"), "позбувся"));
  checkEqual("коробка пішла — позначка про продаж іде разом із нею",
        game.statuses, ["улюблена", "позбувся"]);
  const otherGame = sampleGame({statuses:["колекція", "продаж"], status:"колекція"});
  setStatuses(otherGame, resolveStatusConflicts(new Set(statusesOf(otherGame)).add("чужа"), "чужа"));
  checkEqual("до іншого власника — так само", otherGame.statuses, ["чужа"]);
  checkEqual("продаж не заважає лишатися своєю",
        statusesOf(sampleGame({statuses:["колекція","продаж"]})), ["колекція", "продаж"]);
  const forSaleOnly = sampleGame({statuses:["продаж"], status:"продаж"});
  setStatuses(forSaleOnly, resolveStatusConflicts(new Set(statusesOf(forSaleOnly)).add("улюблена"), "улюблена"));
  checkEqual("а решта статусів позначку про продаж не чіпає",
        forSaleOnly.statuses, ["улюблена", "продаж"]);
}

/* ── форматування ──────────────────────────────────── */
checkEqual("десяткова кома", formatNumber(6.5), "6,5");
checkEqual("ціле без коми", formatNumber(7), "7");
checkEqual("порожнє лишається порожнім", formatNumber(null), "");
checkEqual("смуга за оцінкою", [scoreBandClass(2), scoreBandClass(5), scoreBandClass(8), scoreBandClass(9.5), scoreBandClass(null)],
      ["b-low", "b-mid", "b-good", "b-top", ""]);

/* ── оцінка за складом столу ───────────────────────── */
{
  const game = sampleGame({score: 8, byCount: {"2": 6.5}});
  const viewAt = (playerCount) => viewWith({playerCount: playerCount});
  checkEqual("на «усі» береться загальна", scoreInView(game, viewAt(ANY)), 8);
  checkEqual("на двох береться оцінка складу", scoreInView(game, viewAt("2")), 6.5);
  checkEqual("немає оцінки складу — порожньо", scoreInView(game, viewAt("4")), null);
}

/* ── чи пасує склад столу ──────────────────────────── */
{
  check("влазить у діапазон", fitsPlayerCount(sampleGame({minP:2, maxP:4}), "3"));
  check("не влазить у діапазон", !fitsPlayerCount(sampleGame({minP:4, maxP:6}), "3"));
  check("без діапазону пасує всім", fitsPlayerCount(sampleGame({}), "3"));
  check("оцінка складу важливіша за діапазон",
        fitsPlayerCount(sampleGame({minP:4, maxP:6, byCount:{"3": 7}}), "3"));
  check("межі з BGG працюють так само, як свої",
        fitsPlayerCount(sampleGame({minP:null, maxP:null, bggMin:2, bggMax:4}), "3"));
  check("свої межі перекривають BGG",
        !fitsPlayerCount(sampleGame({minP:4, maxP:6, bggMin:1, bggMax:8}), "3"));
  check("рівно п'ятеро: гра на 2–7 підходить",
        fitsPlayerCount(sampleGame({minP:2, maxP:7}), "5"));
  check("рівно п'ятеро: гра на 2–4 не підходить",
        !fitsPlayerCount(sampleGame({minP:2, maxP:4}), "5"));
  check("«5+» — це більше за п'ятьох", fitsPlayerCount(sampleGame({minP:2, maxP:7}), "5+"));
  check("гра рівно на п'ятьох у «5+» не потрапляє",
        !fitsPlayerCount(sampleGame({minP:2, maxP:5}), "5+"));
  check("без верхньої межі потрапляє в «5+»",
        fitsPlayerCount(sampleGame({minP:2, maxP:null}), "5+"));
  check("«усі» не відсіює нікого", fitsPlayerCount(sampleGame({minP:4, maxP:6}), ANY));
}

/* ── які клітинки складу є в коробки ───────────────── */
{
  checkEqual("коробка на 2–4 має три клітинки",
        playerCountsFor(sampleGame({bggMin:2, bggMax:4})), ["2","3","4"]);
  checkEqual("соло-коробка має саму одиничку",
        playerCountsFor(sampleGame({bggMin:1, bggMax:1})), ["1"]);
  checkEqual("коробка на 2–10 отримує «5+»",
        playerCountsFor(sampleGame({bggMin:2, bggMax:10})), ["2","3","4","5","5+"]);
  checkEqual("рівно п'ятеро — «5+» не потрібне",
        playerCountsFor(sampleGame({bggMin:2, bggMax:5})), ["2","3","4","5"]);
  checkEqual("без жодних меж показуємо один–п'ять",
        playerCountsFor(sampleGame({})), ["1","2","3","4","5"]);
  checkEqual("поставлена оцінка не зникає, хоч би що казали межі",
        playerCountsFor(sampleGame({bggMin:2, bggMax:2, byCount:{"4": 7}})), ["2","4"]);
  checkEqual("у рядок ідуть тільки заповнені",
        ratedPlayerCounts(sampleGame({bggMin:1, bggMax:6, byCount:{"2": 8, "5+": 6}})),
        ["2","5+"]);
  checkEqual("без оцінок у рядку немає нічого", ratedPlayerCounts(sampleGame({})), []);
}

/* ── підпис клітинки «5+» ──────────────────────────── */
{
  checkEqual("стеля відома — пишемо її", playerCountLabel(sampleGame({bggMax:6}), "5+"), "до 6");
  checkEqual("стеля з десяти", playerCountLabel(sampleGame({bggMax:10}), "5+"), "до 10");
  checkEqual("сотня гравців у клітинку не влазить і сенсу не має",
        playerCountLabel(sampleGame({bggMax:100}), "5+"), "6+");
  checkEqual("стелі немає — лишається загальний підпис",
        playerCountLabel(sampleGame({}), "5+"), "6+");
  checkEqual("звичайні склади підписані цифрою", playerCountLabel(sampleGame({bggMax:9}), "3"), "3");
}

/* ── опитування спільноти ──────────────────────────── */
{
  checkEqual("суцільний відрізок склеюється", formatRanges([2,3,4,5]), "2–5");
  checkEqual("одинак лишається цифрою", formatRanges([4]), "4");
  checkEqual("дірка розриває відрізок", formatRanges([2,3,5,6]), "2–3 · 5–6");
  checkEqual("порожнє опитування — порожній рядок", formatRanges([]), "");
  checkEqual("немає поля взагалі", formatRanges(undefined), "");
}

/* ── свої числа поверх чужих ───────────────────────── */
{
  checkEqual("склад беремо з BGG, коли свого немає",
        playerRange(sampleGame({bggMin:2, bggMax:6})), {min:2, max:6});
  checkEqual("своє число перекриває чуже",
        playerRange(sampleGame({minP:3, bggMin:1, bggMax:6})), {min:3, max:6});
  checkEqual("час із BGG діапазоном", durationText(sampleGame({bggTimeMin:60, bggTimeMax:90})),
        "60–90 хв");
  checkEqual("свій час — одне число", durationText(sampleGame({minutes:45, bggTimeMin:60, bggTimeMax:90})),
        "45 хв");
  checkEqual("однаковий час не подвоюємо", durationText(sampleGame({bggTimeMin:20, bggTimeMax:20})), "20 хв");
  checkEqual("часу немає зовсім", durationText(sampleGame({})), "");
  checkEqual("складність своя важливіша", weightOf(sampleGame({weight:4, bggWeight:2.3})), 4);
  checkEqual("складність із BGG, коли своєї немає", weightOf(sampleGame({bggWeight:2.3})), 2.3);
  checkEqual("гравці словами", playersText(sampleGame({bggMin:2, bggMax:4})), "2–4 гравці");
  checkEqual("один гравець", playersText(sampleGame({bggMin:1, bggMax:1})), "1 гравець");
  checkEqual("п'ятеро", playersText(sampleGame({bggMin:5, bggMax:5})), "5 гравців");
  checkEqual("нічого не знаємо", playersText(sampleGame({})), "");
}

/* ── несумісні статуси ─────────────────────────────── */
{
  const game = sampleGame({statuses:["колекція"], status:"колекція"});
  setStatuses(game, resolveStatusConflicts(new Set(statusesOf(game)).add("позбувся"), "позбувся"));
  checkEqual("«позбувся» гасить «у колекції»", game.statuses, ["позбувся"]);
  setStatuses(game, resolveStatusConflicts(new Set(statusesOf(game)).add("колекція"), "колекція"));
  checkEqual("і навпаки", game.statuses, ["колекція"]);
  setStatuses(game, resolveStatusConflicts(new Set(statusesOf(game)).add("онлайн"), "онлайн"));
  checkEqual("«онлайн» нікого не гасить", game.statuses, ["колекція", "онлайн"]);
  setStatuses(game, resolveStatusConflicts(new Set(statusesOf(game)).add("позбувся"), "позбувся"));
  checkEqual("позбувся коробки, а онлайн лишився", game.statuses, ["онлайн", "позбувся"]);
  setStatuses(game, resolveStatusConflicts(new Set(statusesOf(game)).add("улюблена"), "улюблена"));
  checkEqual("улюблена вживається з чим завгодно",
        game.statuses, ["улюблена", "онлайн", "позбувся"]);
}

/* ── пошук ─────────────────────────────────────────── */
{
  const shelf = [sampleGame({name:"Палео", nameEn:"Paleo"}),
                  sampleGame({name:"Земля", nameEn:"Earth", tags:["двигун"]}),
                  sampleGame({name:"Голем", nameEn:"Golem", comment:"важка"})];
  checkEqual("пошук українською", shownNames(shelf, {search:"пале"}), ["Палео"]);
  checkEqual("пошук оригінальною", shownNames(shelf, {search:"earth"}), ["Земля"]);
  checkEqual("пошук за тегом", shownNames(shelf, {search:"двигун"}), ["Земля"]);
  checkEqual("пошук у нотатці", shownNames(shelf, {search:"важка"}), ["Голем"]);
  checkEqual("нічого не знайшлось", shownNames(shelf, {search:"ъ"}), []);
}

/* ── приховані групи ───────────────────────────────── */
{
  const shelf = [
    sampleGame({name:"База"}),
    sampleGame({name:"Доп", expansion:true}),
    sampleGame({name:"Здихався", statuses:["позбувся"], status:"позбувся"}),
    sampleGame({name:"Мережева", statuses:["онлайн"], status:"онлайн"}),
    sampleGame({name:"Здихався й мережева", statuses:["онлайн","позбувся"], status:"онлайн"}),
  ];
  checkEqual("типово видно всі коробки", shownNames(shelf, {sort:"name"}).length, 5);
  checkEqual("сховати доповнення",
        shownNames(shelf, {sort:"name", hidden:["expansions"]}).indexOf("Доп"), -1);
  checkEqual("сховати позбуті",
        shownNames(shelf, {sort:"name", hidden:["gone"]}),
        ["База", "Доп", "Мережева"]);
  checkEqual("сховати лише-онлайн: ховається тільки те, чого ніде немає",
        shownNames(shelf, {sort:"name", hidden:["onlineOnly"]}),
        ["База", "Доп", "Здихався"]);
  // Коробка стоїть удома або в друга — те, що в неї грають ще й онлайн,
  // не робить її менш досяжною за столом, і ховати її не можна.
  {
    const ownAndFriends = [
      sampleGame({name:"Вдома", statuses:["колекція","онлайн"], status:"колекція"}),
      sampleGame({name:"У друга", statuses:["чужа","онлайн"], status:"чужа"}),
      sampleGame({name:"Тільки в мережі", statuses:["онлайн"], status:"онлайн"}),
    ];
    checkEqual("своя й чужа переживають «лише онлайн»",
          shownNames(ownAndFriends, {sort:"name", hidden:["onlineOnly"]}), ["Вдома", "У друга"]);
  }
  checkEqual("сховати маленькі філери",
        shownNames(shelf.concat([sampleGame({name:"Філер", statuses:["колекція","філер"],
                                      status:"колекція"})]),
              {sort:"name", hidden:["fillers"]}).indexOf("Філер"), -1);
  checkEqual("кілька позначок разом",
        shownNames(shelf, {sort:"name", hidden:["expansions", "gone", "onlineOnly"]}), ["База"]);
  checkEqual("порожній набір нічого не ховає",
        shownNames(shelf, {sort:"name", hidden:[]}).length, 5);
}

/* ── фільтр за статусом ────────────────────────────── */
{
  const shelf = [
    sampleGame({name:"Улюблена", statuses:["колекція","улюблена"], status:"колекція", plays:3}),
    sampleGame({name:"Онлайн", statuses:["онлайн"], status:"онлайн", plays:2}),
    sampleGame({name:"Незіграна", statuses:["чужа"], status:"чужа", plays:0}),
  ];
  checkEqual("кілька статусів: знаходиться за другим",
        shownNames(shelf, {status:"улюблена"}), ["Улюблена"]);
  checkEqual("знаходиться і за першим",
        shownNames(shelf, {status:"колекція"}), ["Улюблена"]);
  checkEqual("фільтр за похідним статусом",
        shownNames(shelf, {status:"незіграна"}), ["Незіграна"]);
  checkEqual("фільтр за новим статусом «друзів»",
        shownNames(shelf, {status:"чужа"}), ["Незіграна"]);
  checkEqual("лише онлайн", shownNames(shelf, {status:"онлайн"}), ["Онлайн"]);
}

/* ── правила ───────────────────────────────────────── */
{
  const game = sampleGame({name:"З правилами", rules:[
    {title:"Наш переклад", url:"https://d/1", kind:"переклад"},
    {title:"Правила", url:"https://d/2", kind:"офіційні"},
    {title:"Соло", url:"https://d/3", kind:"соло"},
  ]});
  checkEqual("офіційні правила стають першими",
        sortedRules(game).map((rule) => rule.kind), ["офіційні", "соло", "переклад"]);
  checkEqual("кнопка в рядку веде на офіційні", firstRule(game).url, "https://d/2");
  checkEqual("без правил нема на що вести", firstRule(sampleGame({})), null);

  const shelf = [game, sampleGame({name:"Без правил"})];
  checkEqual("фільтр: є правила", shownNames(shelf, {rules:"has"}), ["З правилами"]);
  checkEqual("фільтр: без правил", shownNames(shelf, {rules:NONE}), ["Без правил"]);
  checkEqual("фільтр вимкнено — видно обидві", shownNames(shelf, {}).length, 2);
}

/* ── жанри ─────────────────────────────────────────── */
{
  const game = sampleGame({name:"Жанрова", bggFamily:["strategy-games"],
                     bggGenres:["card-game","fantasy"]});
  checkEqual("родина підписується українською", familyLabels(game), ["стратегія"]);
  checkEqual("своя родина перекриває чужу",
        familyLabels(sampleGame({bggFamily:["strategy-games"], family:["party-games"]})),
        ["вечіркова"]);
  checkEqual("порожня своя родина не заступає чужу",
        familyKeys(sampleGame({bggFamily:["strategy-games"], family:[]})),
        ["strategy-games"]);
  checkEqual("своя родина там, де BGG мовчить",
        familyLabels(sampleGame({family:["thematic-games"]})), ["тематична"]);
  checkEqual("жанри підписуються українською", genreLabels(game), ["карткова","фентезі"]);
  checkEqual("слуг без підпису лишається собою",
        genreLabels(sampleGame({bggGenres:["quantum-ballet"]})), ["quantum-ballet"]);
  checkEqual("без жанрів — порожньо", genreLabels(sampleGame({})), []);

  const shelf = [game,
    sampleGame({name:"Сімейна", bggFamily:["family-games"], bggGenres:["animals"]}),
    sampleGame({name:"Безрідна"})];
  checkEqual("фільтр за родиною", shownNames(shelf, {family:"strategy-games"}), ["Жанрова"]);
  checkEqual("фільтр «без жанру»", shownNames(shelf, {family:NONE}), ["Безрідна"]);
  checkEqual("своя родина знаходиться фільтром так само, як чужа",
        shownNames([sampleGame({name:"Своя", family:["party-games"]})],
              {family:"party-games"}), ["Своя"]);
  checkEqual("коробка зі своєю родиною більше не «без жанру»",
        shownNames([sampleGame({name:"Своя", family:["party-games"]})], {family:NONE}), []);
  checkEqual("типово видно всіх", shownNames(shelf, {sort:"name"}).length, 3);
  checkEqual("пошук знаходить за підписом жанру",
        shownNames(shelf, {search:"фентезі"}), ["Жанрова"]);
  checkEqual("пошук знаходить і за слугом", shownNames(shelf, {search:"animals"}), ["Сімейна"]);
  checkEqual("пошук за родиною", shownNames(shelf, {search:"сімейна"}), ["Сімейна"]);
}

/* ── «звужено» знає про всі фільтри одразу ─────────── */
{
  const shelf = [sampleGame({name:"Одна"}), sampleGame({name:"Друга", expansion:true})];
  shownNames(shelf, {});
  check("нічого не обрано — не звужено", !isNarrowed());
  shownNames(shelf, {search:"од"});
  check("пошук звужує", isNarrowed());
  shownNames(shelf, {status:EXPANSION_OPTION});
  check("фільтр звужує", isNarrowed());
  checkEqual("фільтр «доповнення» знаходить саме їх",
        shownNames(shelf, {status:EXPANSION_OPTION}), ["Друга"]);
  shownNames(shelf, {hidden:["expansions"]});
  check("«приховати» теж звужує", isNarrowed());
  shownNames(shelf, {sort:"name", reversed:true});
  check("сортування звуженням не рахується", !isNarrowed());
}

/* ── ключові жанри ─────────────────────────────────── */
{
  const coop = sampleGame({name:"Кооп", bggMech:["cooperative-game","hand-management"]});
  const dark = sampleGame({name:"Темна", bggGenres:["horror","card-game"]});
  const both = sampleGame({name:"Обидва", bggGenres:["fantasy"],
                          bggMech:["worker-placement"]});
  const bare = sampleGame({name:"Голе"});

  check("механіка дає ключовий жанр", keyGenreKeys(coop).indexOf("кооп") >= 0);
  check("категорія дає ключовий жанр", keyGenreKeys(dark).indexOf("жахи") >= 0);
  checkEqual("зайвого не вигадуємо", keyGenreKeys(bare), []);
  check("категорія й механіка складаються",
     keyGenreKeys(both).indexOf("фентезі") >= 0 && keyGenreKeys(both).indexOf("робітники") >= 0);
  checkEqual("порядок як у словнику, а не як у даних",
        keyGenreKeys(sampleGame({bggGenres:["fantasy"], bggMech:["cooperative-game"]})),
        ["кооп", "фентезі"]);
  checkEqual("підписи українською", keyGenreLabels(coop), ["кооперативна"]);
  check("невідома механіка нічого не ламає",
     keyGenreKeys(sampleGame({bggMech:["quantum-ballet"]})).length === 0);

  const shelf = [coop, dark, both, bare];
  checkEqual("фільтр за ключовим жанром", shownNames(shelf, {keyGenre:"кооп"}), ["Кооп"]);
  checkEqual("фільтр за темою з категорії", shownNames(shelf, {keyGenre:"жахи"}), ["Темна"]);
  checkEqual("типово видно всіх", shownNames(shelf, {sort:"name", keyGenre:"all"}).length, 4);
  checkEqual("пошук знаходить за підписом ключового жанру",
        shownNames(shelf, {search:"кооперативна"}), ["Кооп"]);
  checkEqual("пошук знаходить і за слугом механіки",
        shownNames(shelf, {search:"worker-placement"}), ["Обидва"]);
  shownNames(shelf, {keyGenre:"кооп"});
  check("ключовий жанр рахується звуженням", isNarrowed());
}

/* ── «соло»: жанр за складом столу, а не за механікою ─────────────────
   Різниця, через яку жанр і з'явився: механіка BGG «solo-solitaire-game»
   стоїть у кожної третьої коробки на полиці, зокрема в ігор на шістьох.
   «Соло» — це коробка рівно на одного, і нічого більше. */
{
  const soloOnly = sampleGame({name:"Сама", bggMin:1, bggMax:1,
                        bggMech:["solo-solitaire-game"]});
  const withSoloMode = sampleGame({name:"Режим", bggMin:1, bggMax:4,
                         bggMech:["solo-solitaire-game"]});
  const plain = sampleGame({name:"Нічого", bggMin:2, bggMax:4});
  const unknownRange = sampleGame({name:"Незнана", bggMech:["solo-solitaire-game"]});
  const own = sampleGame({name:"Своя", bggMin:1, bggMax:4, maxP:1});

  check("коробка на одного — це «соло»", keyGenreKeys(soloOnly).indexOf("соло") >= 0);
  check("гра з соло-режимом — не «соло»", keyGenreKeys(withSoloMode).indexOf("соло") < 0);
  check("зате має «соло-режим»", keyGenreKeys(withSoloMode).indexOf("соло-режим") >= 0);
  check("і сама теж має «соло-режим»", keyGenreKeys(soloOnly).indexOf("соло-режим") >= 0);
  check("без механіки й без меж — жодного соло", keyGenreKeys(plain).length === 0);
  check("невідома стеля не робить коробку соло",
     keyGenreKeys(unknownRange).indexOf("соло") < 0);
  check("своя стеля важить більше за чужу", keyGenreKeys(own).indexOf("соло") >= 0);

  const shelf = [soloOnly, withSoloMode, plain];
  checkEqual("стрічка «соло» дає лише коробку на одного",
        shownNames(shelf, {keyGenre:"соло"}), ["Сама"]);
  checkEqual("стрічка «соло-режим» дає обидві",
        shownNames(shelf, {keyGenre:"соло-режим", sort:"name"}), ["Режим", "Сама"]);
}

/* ── цілість самого словника ──────────────────────────────────────────
   Словник — це дані, і він приїжджає з окремого файла. Жанр без жодної
   умови мовчки не спрацював би ніде, а два однакові ключі зробили б
   другу кнопку в стрічці недосяжною. */
{
  const withoutCondition = KEY_GENRES.filter((keyGenre) =>
    !keyGenre.categories && !keyGenre.mechanics && !keyGenre.players);
  checkEqual("кожен ключовий жанр має умову", withoutCondition.map((keyGenre) => keyGenre.key), []);
  const keys = KEY_GENRES.map((keyGenre) => keyGenre.key);
  check("ключі не повторюються", keys.length === new Set(keys).size);
  check("у кожного є підпис", KEY_GENRES.every((keyGenre) => !!keyGenre.label));
  check("«усі» не можна взяти за ключ жанру", keys.indexOf(ANY) < 0);
}

/* ── журнал партій ─────────────────────────────────────────────────────
   Головна вимога: «+1 партія» має працювати без жодного заповнювання.
   Друга: записів у журналі ніколи не більше, ніж самих партій. */
{
  const game = sampleGame({name:"Проба", plays:0});
  addPlay(game, "2026-09-10");
  addPlay(game, "2026-09-13");
  checkEqual("партії лягли за датами", playLog(game).map((entry) => entry.on),
        ["2026-09-10", "2026-09-13"]);
  checkEqual("лічильник іде слідом", game.plays, 2);
  addPlay(game, "2026-09-11");
  checkEqual("записана заднім числом стає на своє місце", playLog(game).map((entry) => entry.on),
        ["2026-09-10", "2026-09-11", "2026-09-13"]);
  checkEqual("остання — найсвіжіша", lastPlayedOn(game), "2026-09-13");
  checkEqual("склад столу записується", (addPlay(game, "2026-09-14", "3"), playLog(game)[3].count), "3");

  removePlay(game, 0);
  checkEqual("прибрана партія зникає", playLog(game).map((entry) => entry.on),
        ["2026-09-11", "2026-09-13", "2026-09-14"]);
  checkEqual("і лічильник з нею", game.plays, 3);
}
{
  // «−» скасовує саме останню партію — найсвіжіший запис журналу, а вже
  // потім те, що лежало в лічильнику без дат.
  const game = sampleGame({name:"Давня", plays:5});
  addPlay(game, "2026-09-12");
  checkEqual("лічильник додає до давніх", game.plays, 6);
  undoLastPlay(game);
  checkEqual("мінус скасував щойно записану", game.plays, 5);
  checkEqual("журнал спорожнів", playLog(game).length, 0);
  for(let i = 0; i < 5; i++) undoLastPlay(game);
  checkEqual("далі йдуть партії без дат", game.plays, 0);
  undoLastPlay(game);
  checkEqual("нижче нуля не буває", game.plays, 0);
}
{
  // Той самий випадок, на якому це й спіймалося: дві партії без дат,
  // кілька «+» і «−» — і повернутися до того, що було, стало неможливо,
  // бо мінус з'їдав давні партії, а плюс вертав уже з сьогоднішнім днем.
  // «+» і «−» мусять бути точною парою.
  const game = sampleGame({name:"Дуель", plays:2, bggMin:2, bggMax:2});
  addPlay(game);
  addPlay(game);
  checkEqual("двічі записали", [game.plays, playLog(game).length], [4, 2]);
  undoLastPlay(game);
  undoLastPlay(game);
  checkEqual("двічі скасували — і все як було", [game.plays, playLog(game).length], [2, 0]);
  check("журнал зник зовсім", !("log" in game));
}
{
  // Склад столу, який нема сенсу питати.
  checkEqual("дуельна коробка — двоє", fixedPlayerCount(sampleGame({bggMin:2, bggMax:2})), "2");
  checkEqual("соло — один", fixedPlayerCount(sampleGame({bggMin:1, bggMax:1})), "1");
  checkEqual("рівно шестеро — це «5+»", fixedPlayerCount(sampleGame({bggMin:6, bggMax:6})), "5+");
  check("коробці на 2–4 нічого не вигадуємо",
     fixedPlayerCount(sampleGame({bggMin:2, bggMax:4})) == null);
  check("і мовчазній теж", fixedPlayerCount(sampleGame({})) == null);
  check("своє число сильніше за чуже",
     fixedPlayerCount(sampleGame({bggMin:1, bggMax:4, minP:2, maxP:2})) === "2");

  const duel = sampleGame({name:"Дуель", plays:0, bggMin:2, bggMax:2});
  checkEqual("записана партія одразу знає склад",
        addPlay(duel).count, "2");
  checkEqual("але сказане руками важить більше",
        addPlay(duel, "2026-09-01", "1").count, "1");
}
{
  const game = sampleGame({name:"Переїзд", plays:0});
  addPlay(game, "2026-09-10");
  addPlay(game, "2026-09-13");
  movePlay(game, 1, "2026-09-01");
  checkEqual("переставлена партія стає на своє місце",
        playLog(game).map((entry) => entry.on), ["2026-09-01", "2026-09-10"]);
  checkEqual("лічильник від переїзду не змінюється", game.plays, 2);
  check("неіснуючий запис не переставиш", !movePlay(game, 9, "2026-09-01"));
  check("і в нікуди теж", !movePlay(game, 0, ""));
}
{
  const now = Date.parse("2026-09-13T12:00:00");
  const fresh = sampleGame({name:"Свіжа", plays:1, log:[{on:"2026-09-11"}]});
  const stale = sampleGame({name:"Стара", plays:1, log:[{on:"2026-03-01"}]});
  const undated = sampleGame({name:"Без дат", plays:7});
  const neverPlayed = sampleGame({name:"Жодної", plays:0});
  checkEqual("простій рахується в днях", daysSinceLastPlay(fresh, now), 2);
  check("давня коробка простоює довше", daysSinceLastPlay(stale, now) > daysSinceLastPlay(fresh, now));
  checkEqual("партії без дат — це «давно»", daysSinceLastPlay(undated, now), NEVER_PLAYED_DAYS);
  checkEqual("і жодної партії — теж", daysSinceLastPlay(neverPlayed, now), NEVER_PLAYED_DAYS);

  const shelf = [fresh, stale, undated, neverPlayed];
  const order = shownNames(shelf, {sort:"idle"});
  checkEqual("угорі те, що давно не діставали",
        order, ["Без дат", "Жодної", "Стара", "Свіжа"]);
}
{
  checkEqual("дата цього року — без року",
        formatShortDate("2026-09-13", Date.parse("2026-12-01T00:00:00")), "13 вер");
  checkEqual("торішня — з роком",
        formatShortDate("2025-11-03", Date.parse("2026-12-01T00:00:00")), "3 лист 2025");
  checkEqual("сміття лишається собою", formatShortDate("отакої"), "отакої");
}
{
  // Міграція: сторінка давнішого зразка могла збити лічильник, лишивши
  // записи на місці. Читання це виправляє.
  const game = migrateGame({id:"g-1", name:"Збита", statuses:["колекція"], status:"колекція",
                     plays:0, log:[{on:"2026-09-13"}, {on:"2026-09-01"}]});
  checkEqual("журнал упорядковується", playLog(game).map((entry) => entry.on),
        ["2026-09-01", "2026-09-13"]);
  checkEqual("лічильник вертається до числа записів", game.plays, 2);
  const emptyLog = migrateGame({id:"g-2", name:"Порожній", statuses:["колекція"],
                            status:"колекція", plays:3, log:[]});
  check("порожній журнал не зберігається", !("log" in emptyLog));
  checkEqual("а лічильник не чіпається", emptyLog.plays, 3);
  const garbage = migrateGame({id:"g-3", name:"Сміття", statuses:["колекція"],
                          status:"колекція", plays:2, log:[{on:"2026-09-01"}, {what:"?"}]});
  checkEqual("запис без дати викидається", playLog(garbage).length, 1);
}

/* ── час, складність, теги ─────────────────────────────────────────────
   Три фільтри одного вечора: скільки нас, скільки часу, наскільки важке.
   Час міряємо стелею — «влазить у годину», а не «десь близько години». */
{
  const filler = sampleGame({name:"Філер", bggTimeMin:15, bggTimeMax:20, bggWeight:1.2});
  const hourLong = sampleGame({name:"Година", bggTimeMin:45, bggTimeMax:60, bggWeight:2.5});
  const longGame = sampleGame({name:"Довга", bggTimeMin:90, bggTimeMax:150, bggWeight:4.1});
  const silent = sampleGame({name:"Мовчазна"});
  const own = sampleGame({name:"Своя", bggTimeMax:200, minutes:25, weight:1.5});
  const shelf = [filler, hourLong, longGame, silent, own];

  checkEqual("до 30 хв — тільки короткі",
        shownNames(shelf, {duration:"30", sort:"name"}), ["Своя", "Філер"]);
  checkEqual("у годину влазить і філер",
        shownNames(shelf, {duration:"60", sort:"name"}), ["Година", "Своя", "Філер"]);
  checkEqual("довші — саме довші", shownNames(shelf, {duration:"90+"}), ["Довга"]);
  check("коробка без чисел у кошики часу не потрапляє",
     shownNames(shelf, {duration:"60"}).indexOf("Мовчазна") < 0);
  check("зате в «усі» вона є", shownNames(shelf, {duration:"all"}).indexOf("Мовчазна") >= 0);

  checkEqual("легка — до двійки", shownNames(shelf, {weight:"light", sort:"name"}), ["Своя", "Філер"]);
  checkEqual("середня — до трійки", shownNames(shelf, {weight:"mid"}), ["Година"]);
  checkEqual("важка — понад трійку", shownNames(shelf, {weight:"heavy"}), ["Довга"]);
  checkEqual("час і складність складаються",
        shownNames(shelf, {duration:"60", weight:"light", sort:"name"}), ["Своя", "Філер"]);

  // Свої числа сильніші за чужі — і тут теж.
  check("свій «minutes» перекриває стелю BGG",
     shownNames(shelf, {duration:"30"}).indexOf("Своя") >= 0);
}
{
  const tagged = sampleGame({name:"З тегом", tags:["сімейна", "вечірня"]});
  const untagged = sampleGame({name:"Без"});
  checkEqual("тег відбирає своє", shownNames([tagged, untagged], {tags:"вечірня"}), ["З тегом"]);
  const tagOptions = filterByKey("tags").options([tagged, untagged]).map((option) => option[0]);
  checkEqual("теги в абетковому порядку", tagOptions, ["all", "вечірня", "сімейна"]);
  checkEqual("без тегів — нема з чого вибирати",
        filterByKey("tags").options([untagged]).length, 1);
}

/* ── абетковий указник ─────────────────────────────── */
{
  checkEqual("літера з української назви", indexLetter({name:"Картографи"}), "К");
  checkEqual("латинка збирається в одну купку", indexLetter({name:"Magic Maze"}), "A-Z");
  checkEqual("цифри в другу", indexLetter({name:"7 чудес. Дуель"}), "0-9");
  checkEqual("мала літера теж рахується", indexLetter({name:"нова гра"}), "Н");
  checkEqual("без назви — без літери", indexLetter({name:"  "}), "");

  const shelf = [sampleGame({name:"Уно"}), sampleGame({name:"Інорі"}),
                  sampleGame({name:"Magic Maze"}), sampleGame({name:"7 чудес"}),
                  sampleGame({name:"Картографи"})];
  const letters = filterByKey("letter").options(shelf).map((option) => option[0]);
  checkEqual("указник в українській абетці, латинка й цифри в кінці",
        letters, ["all", "І", "К", "У", "A-Z", "0-9"]);
  checkEqual("літера відбирає своє", shownNames(shelf, {letter:"К"}), ["Картографи"]);
  checkEqual("латинська купка відбирає всю латинку",
        shownNames(shelf, {letter:"A-Z"}), ["Magic Maze"]);
  checkEqual("типово указник нічого не відсіює",
        shownNames(shelf, {letter:"all"}).length, 5);
}

/* ── перелік того, що звужує полицю ────────────────────────────────────
   Фільтри переїхали в шухляду, і цей перелік — єдине, з чого видно, що
   вони ввімкнені: з нього живуть і плашки, і лічильник на кнопці. */
{
  const shelf = [sampleGame({name:"Перша", statuses:["улюблена"]}),
                  sampleGame({name:"Друга", expansion:true})];
  shownNames(shelf, {});
  checkEqual("нічого не ввімкнено — нічого й не перелічено", narrowings(), []);

  shownNames(shelf, {status:"улюблена", letter:"П", hidden:["expansions"]});
  const listed = narrowings();
  checkEqual("перелічено все троє", listed.length, 3);
  checkEqual("фільтр називає себе людською мовою",
        listed.filter((narrowing) => narrowing.key === "status").map((narrowing) => narrowing.label + ": " + narrowing.value),
        ["Статус: улюблена"]);
  checkEqual("хованка теж", listed.filter((narrowing) => narrowing.kind === NARROWING.HIDE)
        .map((narrowing) => narrowing.label + ": " + narrowing.value), ["Приховано: доповнення"]);
  // Плашку заробляє лише сховане в шухляді: указник за літерою і стрічку
  // статусів видно й так, а плашка над ними повторювала б те саме вдвох
  // місцях. У лічильник і в «скинути все» вони входять і далі.
  checkEqual("те, що стоїть на головній, плашки не отримує",
        listed.filter((narrowing) => !narrowing.slot).map((narrowing) => narrowing.key), ["expansions"]);

  clearNarrowing(lastView, NARROWING.FILTER, "status");
  checkEqual("зняли одне — решта на місці",
        narrowings().map((narrowing) => narrowing.key), ["letter", "expansions"]);
  clearNarrowing(lastView, NARROWING.HIDE, "expansions");
  checkEqual("і хованку теж", narrowings().map((narrowing) => narrowing.key), ["letter"]);
  check("поки щось лишилось — полиця звужена", isNarrowed());
  clearNarrowing(lastView, NARROWING.FILTER, "letter");
  check("а тепер ні", !isNarrowed());
}

/* ── список по частинах ────────────────────────────────────────────────
   Тут помилка тиха: нічого не падає, просто лишається зайвий рядок або
   двоє міняються місцями. Тому перевіряємо не «намалювалось», а самі
   вузли — чи ті самі об'єкти лишились на місці. */
{
  const container = document.createElement("ol");
  const childIds = () => Array.prototype.map.call(container.children, (node) => node.dataset.id);
  const itemsOf = (ids) => ids.split(" ").map((id) => ({id: id, name: id}));
  const toHtml = (game) => "<li data-id='" + game.id + "'>" + game.name + "</li>";
  const toChangedHtml = (game) => "<li data-id='" + game.id + "'>" + game.name + "!</li>";

  reconcileChildren(container, itemsOf("а б в"), toHtml);
  checkEqual("нове малюється", childIds(), ["а", "б", "в"]);
  const secondNode = container.children[1];
  reconcileChildren(container, itemsOf("а б в"), toHtml);
  check("незмінене не пересотворюється", container.children[1] === secondNode);
  reconcileChildren(container, itemsOf("в б а"), toHtml);
  checkEqual("порядок міняється", childIds(), ["в", "б", "а"]);
  check("і все ще ті самі вузли", container.children[1] === secondNode);
  reconcileChildren(container, itemsOf("в а"), toHtml);
  checkEqual("зникле прибирається", childIds(), ["в", "а"]);
  reconcileChildren(container, itemsOf("в г а"), toHtml);
  checkEqual("нове стає посеред наявних", childIds(), ["в", "г", "а"]);
  check("сусіди при цьому цілі", container.children[2] !== secondNode && childIds().length === 3);
  reconcileChildren(container, itemsOf("в г а"), toChangedHtml);
  checkEqual("змінений рядок оновлюється", container.children[0].textContent, "в!");
  reconcileChildren(container, itemsOf("д"), toHtml);
  checkEqual("повна заміна теж працює", childIds(), ["д"]);
  reconcileChildren(container, [], toHtml);
  checkEqual("порожній список чистить усе", childIds(), []);
}

/* ── жереб «що зіграти» ────────────────────────────────────────────────
   Випадковість перевіряємо не по одному киданню, а по тому, що жереб
   узагалі не має права робити: тягнути чуже, повторюватися й радити те,
   у що грали позавчора. */
{
  const own = sampleGame({name:"Своя", score:7, plays:2, bggMin:1, bggMax:4,
                          bggTimeMin:30, bggTimeMax:45});
  const friends = sampleGame({name:"Чужа", score:9, statuses:["чужа"], status:"чужа"});
  const expansion = sampleGame({name:"Доповнення", score:9, expansion:true});
  const playedToday = sampleGame({name:"Свіжа", score:9, plays:1, log:[{on: todayIso()}]});
  // Межі складу тут не для краси: коробка, яка мовчить про число
  // гравців, пасує будь-якому столу — так вирішено у fitsPlayerCount.
  const playedLongAgo = sampleGame({name:"Давня", score:5, plays:1, bggMin:2, bggMax:3,
                                    log:[{on:"2020-01-01"}]});
  const shelf = [own, friends, expansion, playedToday, playedLongAgo];
  const candidateNames = (evening) =>
    lotteryCandidates(shelf, Object.assign(defaultEvening(), evening)).map((game) => game.name);

  checkEqual("у жереб ідуть лише свої, не доповнення й не щойно зіграні",
             candidateNames({}).sort(), ["Давня", "Своя"]);
  checkEqual("склад столу звужує жереб", candidateNames({playerCount:"4"}), ["Своя"]);
  checkEqual("час теж", candidateNames({duration:"30"}), []);

  checkEqual("неоцінена важить як міцна сімка", lotteryWeight(sampleGame({plays:1})), 6);
  checkEqual("ще не грана дістає надбавку", lotteryWeight(sampleGame({score:7, plays:0})), 9);
  checkEqual("оцінка — це і є вага", lotteryWeight(sampleGame({score:8, plays:3})), 8);

  const candidates = lotteryCandidates(shelf, defaultEvening());
  const drawn = drawLottery(candidates);
  checkEqual("типово радить п'ятьох", LOTTERY_SIZE, 5);
  checkEqual("але більше, ніж є, не вигадає", drawn.length, 2);
  check("і не повторюється", drawn[0] !== drawn[1]);
  check("усі кинуті — з кандидатів", drawn.every((game) => candidates.indexOf(game) >= 0));
  checkEqual("можна попросити одну", drawLottery(candidates, 1).length, 1);
  checkEqual("самих кандидатів жереб не чіпає", candidates.length, 2);
}
{
  // Вага має схиляти жереб, а не вирішувати за нього.
  const favorite = sampleGame({name:"Люба", score:10, plays:3, log:[{on:"2020-01-01"}]});
  const mediocre = sampleGame({name:"Так собі", score:1, plays:3, log:[{on:"2020-01-01"}]});
  const candidates = lotteryCandidates([favorite, mediocre], defaultEvening());
  let favoriteDraws = 0;
  for(let i = 0; i < 300; i++) if(drawLottery(candidates, 1)[0] === favorite) favoriteDraws++;
  check("десятка випадає частіше за одиницю", favoriteDraws > 200, favoriteDraws + " з 300");
  check("але не завжди", favoriteDraws < 300, favoriteDraws + " з 300");
  // Підмінена випадковість: нуль тягне першого, майже одиниця — останнього.
  checkEqual("жереб слухається переданої випадковості",
             [drawLottery(candidates, 1, () => 0)[0].name,
              drawLottery(candidates, 1, () => 0.999)[0].name], ["Люба", "Так собі"]);
}
{
  checkEqual("ще не грана каже саме це", lastPlayedText(sampleGame({plays:0})), "ще не грали");
  checkEqual("партії без дат — чесно",
             lastPlayedText(sampleGame({plays:4})), "партії були до журналу");
  check("а з датою — дата",
        lastPlayedText(sampleGame({plays:1, log:[{on:"2026-09-13"}]})).indexOf("востаннє") === 0);
}

/* ── сортування ────────────────────────────────────── */
{
  const shelf = [sampleGame({name:"Сім", score:7}), sampleGame({name:"Без оцінки"}),
                  sampleGame({name:"Девʼять", score:9})];
  checkEqual("за оцінкою: більша вгорі, порожня внизу",
        shownNames(shelf, {sort:"score"}), ["Девʼять", "Сім", "Без оцінки"]);
  checkEqual("перевернуте: порожня все одно внизу",
        shownNames(shelf, {sort:"score", reversed:true}), ["Сім", "Девʼять", "Без оцінки"]);
}
{
  const shelf = [sampleGame({name:"Magic Maze"}), sampleGame({name:"Яблуко"}),
                  sampleGame({name:"Абрикос"}), sampleGame({name:"7 чудес"})];
  checkEqual("абетка: цифри, кирилиця, і аж потім латинка",
        shownNames(shelf, {sort:"name"}),
        ["7 чудес", "Абрикос", "Яблуко", "Magic Maze"]);
}
{
  const shelf = [sampleGame({name:"Мало", plays:1}), sampleGame({name:"Багато", plays:9})];
  checkEqual("за партіями", shownNames(shelf, {sort:"plays"}), ["Багато", "Мало"]);
}
{
  const shelf = [sampleGame({name:"Стара", added:"2026-01-01"}),
                  sampleGame({name:"Нова", added:"2026-09-01"})];
  checkEqual("за датою: свіжа вгорі", shownNames(shelf, {sort:"added"}), ["Нова", "Стара"]);
}

/* ── що приходить ззовні ───────────────────────────────
   «Даних немає» і «дані зіпсовані» мусять виглядати по-різному. Доки
   acceptGames() на будь-яке сміття віддавало порожній список, зламаний кеш
   чи чужа відповідь показувалися як порожня полиця — і сторінка потім
   щиро записала б цю порожнечу в репозиторій як правду. */
function rejects(value){
  try{ acceptGames(value); return false; }catch(e){ return true; }
}
check("порожній список — це список", acceptGames([]).length === 0);
checkEqual("коробки проходять і піднімаються",
      acceptGames([{id:"g-1", name:"Гра", status:"колекція"}]).map((game) => game.statuses),
      [["колекція"]]);
check("нічого не прийшло — це не порожня полиця", rejects(undefined));
check("null — теж", rejects(null));
check("об'єкт замість списку", rejects({games:[]}));
check("рядок", rejects("[]"));
check("число", rejects(0));

/* ── адреси, які йдуть у сторінку ──────────────────────
   Посилання на правила вписують руками, обкладинки приїжджають із BGG, а
   імпорт JSON приймає взагалі будь-що. Усе це потім опиняється в href або
   src, тож «javascript:» тут — не дивина, а чужий код у сторінці, де лежить
   ключ доступу до репозиторію. */
checkEqual("звичайне посилання лишається", safeUrl("https://bgg.test/a.pdf"),
      "https://bgg.test/a.pdf");
checkEqual("http теж", safeUrl("http://bgg.test/a.pdf"), "http://bgg.test/a.pdf");
checkEqual("пошта", safeUrl("mailto:hi@bgg.test"), "mailto:hi@bgg.test");
checkEqual("відносне лишається", safeUrl("icon-192.png"), "icon-192.png");
checkEqual("javascript: не проходить", safeUrl("javascript:alert(1)"), "");
checkEqual("велика літера не рятує", safeUrl("JavaScript:alert(1)"), "");
checkEqual("пробіл перед схемою не рятує", safeUrl("  javascript:alert(1)"), "");
checkEqual("керівний символ усередині схеми не рятує",
      safeUrl("java\tscript:alert(1)"), "");
checkEqual("новий рядок усередині схеми не рятує",
      safeUrl("java\nscript:alert(1)"), "");
// Без «</script>» у рядку: цей файл склеюється всередину <script>
// сторінки тестів, і закриваючий тег обірвав би її просто тут.
checkEqual("data: не проходить", safeUrl("data:text/html,<b>x</b>"), "");
checkEqual("vbscript: не проходить", safeUrl("vbscript:msgbox"), "");
checkEqual("порожнє — порожнє", safeUrl(null), "");

/* ── злиття: чия правка виживе ─────────────────────────
   Найдорожчий код у проєкті й донедавна єдиний зовсім без тестів. Правило
   одне на три реалізації — mergeNewestWins() і replaceShelf() тут та merge_games()
   на сервері, — тому самі випадки лежать окремим файлом, «src/merge-cases.json»,
   і той самий перелік ганяє «tests.py» по python-реалізації. Розійдуться
   реалізації — розійдеться котрась зі сторін. */
function sortedById(games){
  return games.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
MERGE_CASES.forEach((mergeCase) => {
  checkEqual("злиття: " + mergeCase.name,
        sortedById(mergeNewestWins(mergeCase.base, mergeCase.incoming)), sortedById(mergeCase.expected));
});

/* Повна полиця з бази підмітає за собою: гру, викинуту з іншого
   пристрою, тут воскрешати нічим. Але незбережене не чіпає — інакше
   правка, зроблена без зв'язку, зникла б у мить, коли зв'язок з'явився. */
{
  const stamp = (month) => "2026-0" + month + "-01T00:00:00.000Z";
  const fromBase = () => [{id:"a", name:"А", updated:stamp(2)}];
  const ids = (games) => sortedById(games).map((game) => game.id);

  checkEqual("повна полиця: чого нема в приході — того нема й тут",
             ids(replaceShelf([{id:"a", name:"А", updated:stamp(1)},
                               {id:"z", name:"Зайва", updated:stamp(1)}], fromBase(), [])),
             ["a"]);

  const unsaved = {id:"q", name:"Незбережена", updated:stamp(3)};
  checkEqual("а те, що чекає в черзі, лишається",
             ids(replaceShelf([{id:"a", name:"А", updated:stamp(1)}, unsaved],
                              fromBase(), [unsaved])),
             ["a", "q"]);
  // Сторінку перезавантажили без зв'язку: полиця приїхала з бази заново,
  // а нова коробка існує тільки в черзі.
  checkEqual("коробка, що живе лише в черзі, вертається на полицю",
             ids(replaceShelf([], fromBase(), [unsaved])), ["a", "q"]);

  checkEqual("свіжіше з бази перекриває тутешнє",
             replaceShelf([{id:"a", name:"А", updated:stamp(1)}],
                          [{id:"a", name:"Перейменована", updated:stamp(2)}], [])[0].name,
             "Перейменована");
  checkEqual("а давніше — ні",
             replaceShelf([{id:"a", name:"Тутешня", updated:stamp(3)}],
                          [{id:"a", name:"Давня", updated:stamp(1)}], [])[0].name,
             "Тутешня");

  // Видалення, яке ще не доїхало: база досі віддає коробку, але тут її
  // вже викинули, і мітка чекає в черзі. Воскресати вона не має.
  const tombstone = {id:"a", name:"А", deleted:stamp(3), updated:stamp(3)};
  checkEqual("мітка видалення з черги не дає коробці воскреснути",
             ids(replaceShelf([], fromBase(), [tombstone])), []);
  checkEqual("мітки з файла на полицю не потрапляють",
             ids(replaceShelf([{id:"a", name:"А", updated:stamp(1)}], [tombstone], [])), []);
}

/* Черга: одна коробка чекає в ній рівно в одному примірнику, і саме в
   останньому. Інакше сорок дотиків по «+ партія» без мережі поїхали б
   сорока записами, з яких перші тридцять дев'ять — застарілі. */
{
  let queue = [];
  queue = queueWith(queue, [{id:"a", plays:1}]);
  queue = queueWith(queue, [{id:"a", plays:2}]);
  queue = queueWith(queue, [{id:"b", plays:1}]);
  checkEqual("у черзі кожна коробка раз", queue.map((game) => game.id), ["a", "b"]);
  checkEqual("і в найсвіжішому вигляді", queue[0].plays, 2);
}

/* Черга після відправлення. Тут була втрата даних: відправлення триває
   секунду-дві, а після успіху чергу спорожнювали цілком — разом із
   правками, що лягли в неї, поки летіла відповідь. */
{
  const sent = [{id:"a", updated:"2026-01-01T10:00:00.000Z"},
                {id:"b", updated:"2026-01-01T10:00:00.000Z"}];
  const sentStamps = stampsOf(sent);
  checkEqual("нічого не змінилося — черга порожня", withoutSent(sent, sentStamps), []);
  const duringFlight = [{id:"a", updated:"2026-01-01T10:00:01.000Z"},   // правили ще раз
                        {id:"b", updated:"2026-01-01T10:00:00.000Z"},   // поїхала як є
                        {id:"c", updated:"2026-01-01T10:00:01.000Z"}];  // нова
  checkEqual("правка під час відправлення лишається чекати",
             withoutSent(duringFlight, sentStamps).map((game) => game.id), ["a", "c"]);
  // У черзі лежать ті самі об'єкти, що й на полиці: правка міняє запис на
  // місці, а не кладе копію. Мітки тому й знімаються до відправлення.
  const live = {id:"x", updated:"2026-01-01T10:00:00.000Z"};
  const liveStamps = stampsOf([live]);
  live.updated = "2026-01-01T10:00:05.000Z";
  checkEqual("той самий об'єкт, змінений на місці, теж лишається",
             withoutSent([live], liveStamps).length, 1);
}

/* ── мітка видалення, файл даних, повідомлення коміта ─── */
{
  const tombstone = tombstoneFor({id:"g-1", name:"Викинута", score:9});
  checkEqual("мітка несе лише id і назву",
             Object.keys(tombstone).sort(), ["deleted", "id", "name", "updated"]);
  check("мітка свіжіша за будь-яку давню правку", tombstone.updated > "2026-01-01");

  const document = shelfDocument([{id:"b"}, {id:"a"}]);
  checkEqual("файл даних упорядкований за id", document.games.map((game) => game.id), ["a", "b"]);
  checkEqual("і знає свою версію", document.version, SCHEMA_VERSION);

  checkEqual("коміт називає гру й оцінку",
             commitMessage([{id:"1", name:"Палео", score:8.5}]), "Оцінки: Палео 8.5");
  checkEqual("видалення — з мінусом",
             commitMessage([{id:"1", name:"Палео", deleted:"2026-01-01"}]), "Оцінки: − Палео");
  checkEqual("четверта й далі — числом",
             commitMessage(["А", "Б", "В", "Г", "Ґ"].map((name) => ({id:name, name:name}))),
             "Оцінки: А, Б, В і ще 2");
}
checkEqual("кирилиця переживає base64 туди й назад",
           decodeBase64Utf8(encodeBase64Utf8("Полиця настілок — «Кам'яна доба»")),
           "Полиця настілок — «Кам'яна доба»");

/* ── оцінки BGG з вивантаженого файла ──────────────────── */
{
  checkEqual("кома в лапках не ріже поле",
             parseCsvRow('1,"Brass: Birmingham, Deluxe",8.6'),
             ["1", "Brass: Birmingham, Deluxe", "8.6"]);
  checkEqual("подвоєна лапка — це лапка", parseCsvRow('"a ""b"" c",2'), ['a "b" c', "2"]);

  const csv = "id,name,yearpublished,rank,average\n" +
              "224517,Brass: Birmingham,2018,1,8.58\n" +
              "999,Unranked Game,2020,0,6.04\n";
  const brass = sampleGame({name:"Брасс", nameEn:"Brass Birmingham"});
  const unranked = sampleGame({name:"Unranked Game", bggRank:50});
  const stranger = sampleGame({name:"Нема такої"});
  const result = applyBggRatings([brass, unranked, stranger], csv);
  checkEqual("оцінка округлюється до десятих", brass.bggRating, 8.6);
  checkEqual("ранг і bggId приїжджають разом", [brass.bggRank, brass.bggId], [1, "224517"]);
  check("гра без рангу його втрачає", !("bggRank" in unranked));
  checkEqual("змінені названо поіменно", result.changed.map((game) => game.name),
             ["Брасс", "Unranked Game"]);
  checkEqual("незнайдені пораховано", result.unmatched, 1);
  check("змінена коробка дістає свіжу мітку", brass.updated > "2026-01-01T00:00:00.000Z");
  checkEqual("удруге міняти нічого",
             applyBggRatings([brass, unranked], csv).changed.length, 0);
  let refused = false;
  try{ applyBggRatings([brass], "foo,bar\n1,2\n"); }catch(e){ refused = true; }
  check("чужий файл не приймається", refused);

  checkEqual("прибирання знімає оцінку, ранг і bggId",
             clearBggRatings([brass, stranger]).map((game) => game.name), ["Брасс"]);
  check("і в записі їх більше немає",
        !("bggRating" in brass) && !("bggRank" in brass) && !("bggId" in brass));
}

/* ── доповнення ────────────────────────────────────────── */
{
  const base = sampleGame({id:"base", name:"База"});
  const shelf = [base, sampleGame({id:"e2", name:"Друге"}), sampleGame({id:"e1", name:"Перше"})];
  setExpansionLinked(base, "e2", true);
  setExpansionLinked(base, "e1", true);
  setExpansionLinked(base, "e1", true);
  checkEqual("прив'язані лежать упорядковано й без повторів", base.withExp, ["e1", "e2"]);
  setExpansionLinked(base, "gone", true);
  checkEqual("зникла коробка з назв випадає",
             linkedExpansionNames(base, shelf), ["Перше", "Друге"]);
  ["e1", "e2", "gone"].forEach((id) => setExpansionLinked(base, id, false));
  check("останнє відв'язане прибирає саме поле", !("withExp" in base));
}

/* Атрибути в розмітці стоять в одинарних лапках, тож апостроф у назві
   («Кам'яна доба») мусить екрануватися так само, як подвійна лапка:
   інакше він закриває атрибут, а решта назви стає розміткою. */
checkEqual("апостроф не виходить з атрибута", escapeHtml("Кам'яна доба"), "Кам&#39;яна доба");
checkEqual("і подвійна лапка теж", escapeHtml('a"b'), "a&quot;b");
checkEqual("порожнє — порожній рядок", escapeHtml(null), "");
/* Число в розмітку йде без екранування, тож formatNumber мусить віддавати
   лише числа: оцінка-рядок з імпортованого файла — це чужа розмітка. */
checkEqual("рядок на місці оцінки не стає розміткою",
           formatNumber("<img src=x onerror=alert(1)>"), "");
checkEqual("числовий рядок читається як число", formatNumber("7.5"), "7,5");
checkEqual("нескінченність і не-число — порожньо",
           [formatNumber(Infinity), formatNumber(NaN), formatNumber({})], ["", "", ""]);
checkEqual("нуль — це число, а не порожнеча", formatNumber(0), "0");

/* ── вивід ─────────────────────────────────────────── */
addEventListener("DOMContentLoaded", () => {
  document.getElementById("summary").textContent =
    failed ? `${failed} впало, ${passed} склалось` : `Усі ${passed} тестів пройдено`;
  document.body.classList.toggle("failed", failed > 0);
  document.getElementById("results").innerHTML = results.map(([state, name, details]) =>
    `<li class="${state}"><b>${state === "ok" ? "✓" : "✗"}</b> ${escapeHtml(name)}` +
    (details ? `<i>${escapeHtml(details)}</i>` : "") + "</li>").join("");
});
