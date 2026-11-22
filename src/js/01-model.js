/* ── коробка: сталі й чисті функції над одним записом ────────────────
   Тут немає ні сторінки, ні мережі, ні спільного стану: кожна функція
   бере запис гри й повертає відповідь. Сталі формату (версія, статуси,
   склади столу, види правил) вкладає збірка з «src/schema.json» константою
   SCHEMA — той самий файл читає «check.py», тож копія одна.

   Назви полів у записі (minP, byCount, withExp…) і ключі статусів — це
   дані: вони лежать у «ratings.json» і в пам'яті телефонів. Перейменувати
   їх — означає мігрувати всі пристрої, тож вони лишаються як є. */

/* Склади столу, за які можна поставити окрему оцінку. «5+» — це «більше
   за п'ятьох, скільки коробка дозволяє»; ключ навмисне сталий, а підпис
   до нього кожна гра бере зі своєї стелі («до 6», «до 10»). Якби ключ
   залежав від стелі, зміна даних на BGG перейменовувала б чужі оцінки. */
const PLAYER_COUNTS = SCHEMA.playerCounts;
const OPEN_ENDED_COUNT = "5+";
const PLAYER_COUNT_LABELS = {"1":"1", "2":"2", "3":"3", "4":"4", "5":"5", "5+":"6+"};

/* Порядок статусів — це порядок чипів у картці й порядок у самому записі.
   «чужа» — коробка є, але не твоя: граєш у неї в друзів. Підписується
   «друзів»; ключ лишився давній навмисно — ним позначені записи на всіх
   пристроях, а підпис можна міняти скільки завгодно без жодної міграції.
   «продаж» — ще твоя, але вже на виході. «філер» — коробка на
   чверть години, яку витягають між великими партіями. */
const STATUS_LABELS = SCHEMA.statuses;
const STATUS = {OWNED: "колекція", FAVORITE: "улюблена", FILLER: "філер",
                FOR_SALE: "продаж", ONLINE: "онлайн", FRIENDS: "чужа", GONE: "позбувся"};
/* Статуси, яких більше немає. Міграція знає їх поіменно — див. MIGRATIONS. */
const RETIRED_STATUSES = SCHEMA.retiredStatuses;
/* «У колекції» означає «коробка стоїть у мене», і це не поєднується ні
   з «друзів», ні з «позбувся»: вмикання одного гасить друге.
   А от «друзів» і «позбувся» разом — цілком звичайна річ: друг,
   у якого ти грав, продав свою коробку. Гра лишається чужою і водночас
   уже недосяжною, і саме це поєднання те й показує. */
const EXCLUSIVE_STATUS_PAIRS = [[STATUS.OWNED, STATUS.FRIENDS], [STATUS.OWNED, STATUS.GONE]];
/* Статуси, що фарбують рядок у списку. Той самий колір несе й чип у
   картці: інакше список каже, що «кандидат на продаж» червоний, а
   картка малює його як будь-який інший — і позначка перестає читатись
   як позначка. Значення — це ті самі класи, що вже є в стилях рядка. */
const STATUS_TONE_CLASS = {[STATUS.FOR_SALE]: "sale", [STATUS.FRIENDS]: "other"};
// Похідний статус: його не ставлять руками, він випливає з лічильника партій
// і сам зникає після першої зіграної. Тримати його окремо від STATUS_LABELS,
// щоб він ніколи не потрапив у збережені дані.
const UNPLAYED = "незіграна";
const DERIVED_STATUS_LABELS = {[UNPLAYED]: "ще не зіграна"};
const ALL_STATUS_LABELS = Object.assign({}, STATUS_LABELS, DERIVED_STATUS_LABELS);
/* Ті самі статуси, але підписами в кнопку. Стрічка «Статус» стоїть на
   головній сторінці постійно, а «кандидат на продаж» у кнопці розпирає її
   на пів екрана телефона; повні підписи лишаються там, де для них є місце —
   у картці й у плашках. Ключі ті самі, що в STATUS_LABELS, тож у даних від
   цього не змінюється нічого. Забудеш дописати новий статус — він
   покажеться повним підписом, а не зникне. */
const SHORT_STATUS_LABELS = {
  [STATUS.OWNED]: "колекція", [STATUS.FAVORITE]: "улюблена", [STATUS.FILLER]: "філер",
  [STATUS.FOR_SALE]: "на продаж", [STATUS.ONLINE]: "онлайн", [STATUS.FRIENDS]: "друзів",
  [STATUS.GONE]: "позбувся", [UNPLAYED]: "незіграна",
};

/* Правила зберігаються посиланнями: файли лишаються у видавця, у
   репозиторії — тільки адреси. Порядок видів тут же й порядок показу:
   офіційні правила мають відкриватися першими. */
const RULE_KIND_LABELS = SCHEMA.ruleKinds;
/** Правила гри, впорядковані так, як їх варто відкривати. */
function sortedRules(game){
  const order = Object.keys(RULE_KIND_LABELS);
  return (game.rules || []).slice().sort(
    (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}
/** Ті, що відкриються з рядка списку одним дотиком. */
function firstRule(game){ return sortedRules(game)[0] || null; }

/** Перша літера назви великою — замість обкладинки, якої немає. */
function nameInitial(game){ return (game.name || "?").trim().charAt(0).toUpperCase(); }

/* ── жанри ────────────────────────────────────────────────────────────
   Три константи — FAMILY_LABELS, GENRE_LABELS і KEY_GENRES — вкладає збірка
   з «src/genres.json», того самого файла, яким звіряється перевірка даних.
   У самих записах лежать слуги BGG («card-game»), а не підписи: підпис
   можна переписати українською заново, і жоден запис від цього не зміниться.

   Родин на весь BGG вісім, тому вони й стали навігацією. Жанрів вісім
   десятків — вони живуть у картці й знаходяться пошуком. */

/** Родина коробки: своя, якщо поставлена, інакше та, що каже BGG.

    Своє поле тут потрібне не про запас. Підрозділ на BGG проставляють
    адміністратори руками, і це не залежить ні від віку гри, ні від
    кількості голосів: «Кіт у коробці» зібрав понад тисячу оцінок і досі
    не має родини, а «Арідник» зі 169 має. Без власного поля такі коробки
    назавжди лишалися б поза жанровою навігацією. */
function familyKeys(game){
  return (game.family && game.family.length) ? game.family : (game.bggFamily || []);
}
/** Слуг без підпису показуємо як є: незвичне слово краще за порожнє місце. */
function familyLabels(game){ return familyKeys(game).map((slug) => FAMILY_LABELS[slug] || slug); }
function genreLabels(game){ return (game.bggGenres || []).map((slug) => GENRE_LABELS[slug] || slug); }

/* Ключові жанри — те, за чим справді обирають гру на вечір. BGG тримає це
   в двох різних списках: категорія каже, про що гра (фентезі, тварини),
   механіка — як вона грається (кооперативна, драфт, колодобудівна). За
   другим обирають не менше, ніж за першим, тож ключовий жанр збирає
   обидва: гра пасує, якщо має бодай один зі своїх слугів.

   Ніде не зберігаються: виводяться щоразу з bggGenres і bggMech. Тому
   зміна визначення в «genres.json» діє одразу, без проходу по даних. */
function matchesKeyGenre(game, keyGenre){
  const categories = game.bggGenres || [], mechanics = game.bggMech || [];
  if(keyGenre.players && !fitsPlayerLimits(game, keyGenre.players)) return false;
  // Жанр лише з межами столу й без слугів — це умова про саму коробку,
  // і вона вже перевірена вище.
  if(keyGenre.players && !(keyGenre.categories || keyGenre.mechanics)) return true;
  return (keyGenre.categories || []).some((slug) => categories.indexOf(slug) >= 0)
      || (keyGenre.mechanics || []).some((slug) => mechanics.indexOf(slug) >= 0);
}
/** Умова «players» зі словника: {min, max} — межі, у які мусить влізти
    коробка. Так описано «соло»: рівно на одного гравця, «max: 1».

    Механіка BGG для цього не годиться: «solo-solitaire-game» там стоїть у
    всього, у що можна зіграти самому, — на полиці це 28 коробок із 92,
    зокрема ігри на шістьох. Соло-режим і гра-соло — різні речі, тож і
    жанри різні: «соло» рахує склад столу, «соло-режим» — ту механіку. */
function fitsPlayerLimits(game, limits){
  const {min, max} = playerRange(game);
  if(limits.min != null && (min == null || min < limits.min)) return false;
  if(limits.max != null && (max == null || max > limits.max)) return false;
  return true;
}
/** Ключі жанрів цієї коробки, у порядку словника. */
function keyGenreKeys(game){
  return KEY_GENRES.filter((keyGenre) => matchesKeyGenre(game, keyGenre)).map((keyGenre) => keyGenre.key);
}
function keyGenreLabels(game){
  return KEY_GENRES.filter((keyGenre) => matchesKeyGenre(game, keyGenre)).map((keyGenre) => keyGenre.label);
}

/* ── числа з BGG ──────────────────────────────────────────────────────
   Склад столу, тривалість і «вагу» тягне з BGG етап збору даних; свої
   поля (minP/maxP/minutes/weight) лишаються поверх них. Правило скрізь
   одне: своє число важить більше за чуже. BGG підказує, ти виправляєш. */
const firstKnown = (own, fromBgg) => (own != null ? own : (fromBgg != null ? fromBgg : null));

/** {min, max} — на скількох гра розрахована. Будь-яка половина може бути null. */
function playerRange(game){
  return {min: firstKnown(game.minP, game.bggMin), max: firstKnown(game.maxP, game.bggMax)};
}
/** {min, max} у хвилинах. Свій `minutes` — це одне число, і воно перекриває обидві межі. */
function durationRange(game){
  if(game.minutes != null) return {min: game.minutes, max: game.minutes};
  return {min: firstKnown(null, game.bggTimeMin), max: firstKnown(null, game.bggTimeMax)};
}
function weightOf(game){ return firstKnown(game.weight, game.bggWeight); }

/** Підпис клітинки «5+» знає стелю саме цієї коробки: «до 6», «до 10».
    Понад дюжину підпис не має сенсу: «Картографи» офіційно грають сотнею
    людей, і «до 100» у клітинці на 34 пікселі нічого не пояснює. */
function playerCountLabel(game, count){
  if(count !== OPEN_ENDED_COUNT) return PLAYER_COUNT_LABELS[count];
  const max = playerRange(game).max;
  return max != null && max > 5 && max <= 12 ? "до " + max : PLAYER_COUNT_LABELS[OPEN_ENDED_COUNT];
}
/** Клітинки складу столу, доречні саме цій коробці. Оцінка, що вже стоїть,
    показується завжди — навіть якщо межі кажуть інакше: те, що людина
    ввела руками, ніколи не зникає через довідник. */
function playerCountsFor(game){
  const {min, max} = playerRange(game);
  const lowest = min == null ? 1 : min;
  const scores = game.byCount || {};
  return PLAYER_COUNTS.filter((count) => {
    if(scores[count] != null) return true;
    if(count === OPEN_ENDED_COUNT) return max != null && max > 5;
    const players = +count;
    return players >= lowest && (max == null || players <= max);
  });
}
/** Оцінка за конкретний склад столу або null. */
function scoreForCount(game, count){
  const score = game.byCount ? game.byCount[count] : null;
  return score == null ? null : score;
}
/** Тільки ті склади, за які оцінка вже стоїть, — це те, що йде в рядок списку. */
function ratedPlayerCounts(game){
  return PLAYER_COUNTS.filter((count) => scoreForCount(game, count) != null);
}
/** «2–4 гравці», «від 3», «1 гравець». Порожньо, якщо не знати нічого. */
function playersText(game){
  const {min, max} = playerRange(game);
  if(min == null && max == null) return "";
  if(min == null) return "до " + max + " " + pluralize(max, "гравця", "гравців", "гравців");
  if(max == null) return "від " + min;
  if(min === max) return min + " " + pluralize(min, "гравець", "гравці", "гравців");
  return min + "–" + max + " " + pluralize(max, "гравець", "гравці", "гравців");
}
/** «45 хв» або «60–90 хв». */
function durationText(game){
  const {min, max} = durationRange(game);
  if(min == null && max == null) return "";
  if(min == null || max == null || min === max) return (min == null ? max : min) + " хв";
  return min + "–" + max + " хв";
}

/* ── журнал партій ────────────────────────────────────────────────────
   Лічильник `plays` лишається головним числом: «+1 партія» має бути
   одним дотиком і нічого не питати. Журнал `log` — те, що з тих партій
   удалося записати з датою: кожен дотик по «+» кладе туди сьогоднішній
   день, а склад столу й нотатку дописують потім, коли є охота.

   Тому записів у журналі ніколи не більше, ніж партій: партії, зіграні
   до появи журналу, так і лишаються самим числом. Порядок у журналі —
   від давнішої до свіжішої. */
function playLog(game){ return Array.isArray(game.log) ? game.log : []; }
function playCount(game){ return +game.plays || 0; }
/** Дата останньої записаної партії або null. */
function lastPlayedOn(game){
  const log = playLog(game);
  return log.length ? log[log.length - 1].on : null;
}
/* «Давно» — це більше за будь-який справжній простій. Сюди потрапляють
   і коробки, які ще не бачили столу, і партії, зіграні до журналу: коли
   дати нема, чесно казати «давно», а не вигадувати число. */
const NEVER_PLAYED_DAYS = 1e6;
const MS_PER_DAY = 86400000;
/** Скільки днів коробка не була на столі. */
function daysSinceLastPlay(game, now){
  const lastDate = lastPlayedOn(game);
  if(!lastDate) return NEVER_PLAYED_DAYS;
  const elapsedMs = (now == null ? Date.now() : now) - Date.parse(lastDate + "T00:00:00");
  return Math.max(0, Math.floor(elapsedMs / MS_PER_DAY));
}
/** Чому саме вона: коли цю коробку востаннє діставали. */
function lastPlayedText(game){
  if(!game.plays) return "ще не грали";
  const lastDate = lastPlayedOn(game);
  return lastDate ? "востаннє " + formatShortDate(lastDate) : "партії були до журналу";
}
/** Склад столу, якого не треба питати: коробка розрахована рівно на
    стількох. Соло — це завжди один, дуель — завжди двоє, і клацати це
    щоразу руками означало б питати про те, що вже відомо. */
function fixedPlayerCount(game){
  const {min, max} = playerRange(game);
  if(min == null || max == null || min !== max) return null;
  return min <= 5 ? String(min) : OPEN_ENDED_COUNT;
}
/** Журнал завжди йде від давнішої партії до свіжішої. */
function sortPlayLog(log){
  return log.slice().sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
}
/** Записує партію. День без дати — сьогоднішній; лічильник іде слідом. */
function addPlay(game, isoDate, playerCount){
  const entry = {on: isoDate || todayIso()};
  const count = playerCount || fixedPlayerCount(game);
  if(count) entry.count = count;
  game.log = sortPlayLog(playLog(game).concat([entry]));
  game.plays = Math.max(playCount(game) + 1, game.log.length);
  return entry;
}
/** Переставляє записану партію на інший день. Порядок журналу тримається
    сам: дата — єдине, за чим він упорядкований. */
function movePlay(game, index, isoDate){
  const log = playLog(game);
  if(!(index >= 0 && index < log.length) || !isoDate) return false;
  log[index].on = isoDate;
  game.log = sortPlayLog(log);
  return true;
}
/** Прибирає запис під номером index — разом із партією, яку він рахував.
    Номер, а не дата: за один день партій буває й дві. */
function removePlay(game, index){
  const log = playLog(game).slice();
  if(!(index >= 0 && index < log.length)) return false;
  log.splice(index, 1);
  game.plays = Math.max(log.length, playCount(game) - 1);
  if(log.length) game.log = log; else delete game.log;
  return true;
}
/** Мінус — це «скасувати останню партію», і саме в такому порядку:
    спершу найсвіжіший запис журналу, і лише коли журнал порожній —
    незаписані партії, зіграні до його появи.

    Перша редакція робила навпаки, щоб не стирати дату, якої ти не чіпав, —
    і виходило гірше за те, від чого берегло: «+» ставив сьогоднішній день,
    «−» з'їдав натомість давню партію без дати, і повернутися до того, що
    було, ставало неможливо. Скасування мусить скасовувати. */
function undoLastPlay(game){
  const plays = playCount(game);
  if(plays <= 0) return;
  const log = playLog(game);
  if(log.length) removePlay(game, log.length - 1);
  else game.plays = plays - 1;
}

/* ── абетковий указник ────────────────────────────────────────────────
   Дві купки поза українською абеткою: латинка й цифри. Власних кнопок
   вони не варті — «Magic Maze» і «7 чудес. Дуель» на полиці по одній,
   а місце в рядку указника коштує дорого. */
const LATIN_BUCKET = "A-Z", DIGIT_BUCKET = "0-9";
/** Літера, під якою гра стоїть в указнику. Порожньо, якщо назви ще немає:
    щойно додана коробка не мусить створювати кнопку-привида. */
function indexLetter(game){
  const first = String(game.name || "").trim().charAt(0).toUpperCase();
  if(!first) return "";
  if(first >= "0" && first <= "9") return DIGIT_BUCKET;
  if(first >= "A" && first <= "Z") return LATIN_BUCKET;
  return first;
}

/* ── статуси ──────────────────────────────────────────────────────── */

/** Статусів у коробки може бути кілька. Записи давнішого зразка тримали
    рівно один — у полі `status`; читаємо і їх. */
function statusesOf(game){
  if(Array.isArray(game.statuses)) return game.statuses;
  return game.status ? [game.status] : [];
}
function hasStatus(game, status){ return statusesOf(game).indexOf(status) >= 0; }
/** `status` лишаємо дзеркалом першого зі списку: його ще читає сторінка,
    що встигла закешуватися на телефоні до появи списку статусів. */
function mirrorFirstStatus(game){
  if(game.statuses.length) game.status = game.statuses[0]; else delete game.status;
}
/** Порядок статусів завжди той самий, що в STATUS_LABELS, — щоб рядок у
    списку не стрибав від того, в якій послідовності їх натискали. */
function setStatuses(game, chosen){
  game.statuses = Object.keys(STATUS_LABELS).filter((status) => chosen.has(status));
  mirrorFirstStatus(game);
}
/** Гасить статуси, несумісні з щойно ввімкненим. Повертає той самий набір. */
function resolveStatusConflicts(chosen, added){
  EXCLUSIVE_STATUS_PAIRS.forEach((pair) => {
    const position = pair.indexOf(added);
    if(position >= 0) chosen.delete(pair[1 - position]);
  });
  // Виставити на продаж можна лише те, що в тебе є: коробка пішла до
  // когось або зникла — позначка йде разом із нею. Перевіряємо саме
  // доданий статус, а не наявність «у колекції»: інакше «на продаж»
  // не вдалося б поставити коробці, якій той статус просто не проставили.
  if(added === STATUS.FRIENDS || added === STATUS.GONE) chosen.delete(STATUS.FOR_SALE);
  return chosen;
}
function derivedStatuses(game){ return game.plays > 0 ? [] : [UNPLAYED]; }
function allStatuses(game){ return statusesOf(game).concat(derivedStatuses(game)); }
function statusLabels(game){ return allStatuses(game).map((status) => ALL_STATUS_LABELS[status] || status); }

/* ── доповнення ───────────────────────────────────────────────────── */

/** Назви доповнень, прив'язаних до гри; зниклі коробки просто випадають. */
function linkedExpansionNames(game, games){
  return (game.withExp || [])
    .map((id) => (games.find((other) => other.id === id) || {}).name)
    .filter(Boolean);
}
/** Прив'язує або відв'язує доповнення. Список тримається впорядкованим,
    щоб два пристрої, які прив'язали те саме, записали однаково. */
function setExpansionLinked(game, expansionId, linked){
  const ids = new Set(game.withExp || []);
  if(linked) ids.add(expansionId); else ids.delete(expansionId);
  if(ids.size) game.withExp = Array.from(ids).sort(); else delete game.withExp;
}

/* ── новий запис ──────────────────────────────────────────────────── */

const SEED_GAME_NAMES = ["Картографи","Magic Maze","Planet B","Unmatched: Битва легенд, ч. 2",
  "Кіт у коробці","Інорі","Голем","Земля","Зомбі-кошенята","Мандалорець","Палео",
  "Сплячі боги 2","Темна гавань: Гудзики та мурахи","Темна гавань: Щелепи лева",
  "Тоскана","Ходу героям нема"];

function newGameId(){
  return "g-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
}
function newGame(name){
  const now = new Date().toISOString();
  return {name: name, statuses: [STATUS.OWNED], status: STATUS.OWNED,
          minP: null, maxP: null, minutes: null, weight: null,
          plays: 0, score: null, byCount: {}, tags: [], comment: "",
          added: now.slice(0, 10), updated: now};
}
/** Стартова полиця для копії, відкритої з диска вперше. */
function seedGames(){
  return SEED_GAME_NAMES.map((name, index) =>
    Object.assign(newGame(name), {id: "g-seed-" + (index + 1)}));
}
/** Мітка зміни: за нею вирішується, чия правка свіжіша. */
function touchUpdated(game){ game.updated = new Date().toISOString(); return game; }

/* ── міграції даних ───────────────────────────────────────────────────
   Формат запису змінюється, а дані живуть довго й лежать одразу в
   кількох місцях: у репозиторії, в кеші телефона, в черзі незбережених
   змін. Тому кожна міграція — це функція над однією коробкою, і вона
   мусить бути безпечною для повторного запуску: коробка давнішого
   зразка може приїхати з іншого пристрою будь-коли, а не лише при
   першому завантаженні файла.

   Додаючи поле: підніми version у «src/schema.json», допиши сюди функцію,
   яка доводить давній запис до нового вигляду, і не чіпай нічого більше. */
const SCHEMA_VERSION = SCHEMA.version;
const MIGRATIONS = [
  // 1 → 2: один статус став списком статусів.
  function statusesAsList(game){
    if(!Array.isArray(game.statuses)){
      game.statuses = game.status ? [game.status] : (game.deleted ? [] : [STATUS.OWNED]);
    }
    mirrorFirstStatus(game);
  },
  // 2 → 3: «хочу зіграти» й «відклав» прибрано з полиці. Записи з ними
  // приїжджають і далі — з кеша телефона, з давнього експорту.
  //
  // Скасовані названі поіменно, і це принципово. Перша редакція викидала
  // все, чого немає в STATUS_LABELS, — і тоді сторінка, що застаріла на
  // один статус, тихо стирала б із чужих записів той статус, якого ще не
  // знає, а потім розсилала обрізане далі. Міграція має прибирати те,
  // що ти скасував, а не все, чого вона не впізнала.
  function dropRetiredStatuses(game){
    if(!Array.isArray(game.statuses)) return;
    const kept = game.statuses.filter((status) => RETIRED_STATUSES.indexOf(status) < 0);
    if(kept.length === game.statuses.length) return;
    game.statuses = kept;
    mirrorFirstStatus(game);
  },
  // 3 → 4: у коробки з'явився журнал партій. Перетворювати нічого — старі
  // записи просто не мають журналу, і це правильно: дат тих партій ніхто
  // не пам'ятає, а вигадувати їх — це псувати дані.
  //
  // Натомість тут тримається сам зв'язок між журналом і лічильником.
  // Сторінка, що застаріла на цю версію, про журнал не знає й може
  // зменшити `plays` до нуля, лишивши записи на місці; при наступному
  // читанні лічильник вертається принаймні до числа записаних партій.
  function playLogWithinCounter(game){
    if(!Array.isArray(game.log)) return;
    game.log = sortPlayLog(game.log.filter((entry) => entry && typeof entry.on === "string"));
    if(!game.log.length){ delete game.log; return; }
    if(playCount(game) < game.log.length) game.plays = game.log.length;
  },
];

/** Одна коробка, доведена до поточного формату. */
function migrateGame(game){
  if(!game || typeof game !== "object") return game;
  if(!game.deleted) MIGRATIONS.forEach((migrate) => migrate(game));
  return game;
}
/** Усе, що приходить ззовні — з мережі, з кеша, з файла, — проходить сюди.

    Кидає, а не повертає порожньо. Різниця вирішальна: «даних немає» і
    «дані зіпсовані» мусять виглядати по-різному. Доки вони виглядали
    однаково, зламаний кеш чи чужа відповідь показувалися як порожня
    полиця — а порожню полицю сторінка щиро записала б у репозиторій як
    правду. Кожен, хто сюди звертається, уже стоїть у try: там і місце
    вирішувати, показати збережену копію чи попросити ключ. */
function acceptGames(list){
  if(!Array.isArray(list)){
    throw new Error("чекав список коробок, а маю " +
      (list === null ? "null" : typeof list));
  }
  return list.map(migrateGame);
}
