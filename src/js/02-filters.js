/* ── вибірка: фільтри, сортування, приховане, жереб ───────────────────
   Усе тут чисте: полиця (`games`) і стан перегляду (`view`) приходять
   аргументами, а не беруться зі спільних змінних. Саме тому цей файл
   перевіряється тестами без жодної сторінки навколо.

   ── реєстр фільтрів ──
   Кожен фільтр описано тут один раз. Панель керування малює себе з цього
   опису, visibleGames() ходить цим самим списком, вибране лежить у
   view.filters[key]. Додати фільтр — це дописати один об'єкт і більше
   нічого не чіпати.

     key           поле у view.filters, куди лягає вибране
     kind          "search" | "strip" | "select"
     slot          де малювати: "search" (у панелі), "index" і "status"
                   (окремими рядками); без нього — у шухляді «Фільтри»
     label         що написано біля віджета
     defaultValue  значення, за якого фільтр нічого не відсіює
     options       (games) => [[значення, підпис], …] — для стрічки й списку
     matches       (game, value) => чи лишається коробка в списку
     wraps         стрічці дозволено переноситися на кілька рядків
     className     додатковий клас стрічки
*/
const ANY = "all";
const NONE = "none";
const EXPANSION_OPTION = "expansion";
const anyOption = (label) => [ANY, label || "усі"];
/** Значення, що трапляються на полиці, зібрані з кожної коробки. */
function collectValues(games, valuesOf){
  const found = new Set();
  games.forEach((game) => valuesOf(game).forEach((value) => found.add(value)));
  return found;
}
const byUkrainianAlphabet = (a, b) => a.localeCompare(b, "uk");

const FILTERS = [
  {
    key: "search", kind: "search", slot: "search", defaultValue: "",
    placeholder: "Пошук за назвою, тегом, нотаткою",
    matches(game, value){
      const query = String(value).trim().toLowerCase();
      if(!query) return true;
      // Шукаємо і за українською, і за оригінальною назвою: половина полиці
      // тримається в голові англійською. Жанри йдуть і підписом, і слугом —
      // «фентезі» й «fantasy» мають знаходити те саме.
      return [game.name, game.nameEn, game.comment, (game.tags || []).join(" "),
              familyLabels(game).join(" "), genreLabels(game).join(" "),
              keyGenreLabels(game).join(" "),
              familyKeys(game).join(" "), (game.bggGenres || []).join(" "),
              (game.bggMech || []).join(" ")]
        .join(" ").toLowerCase().includes(query);
    },
  },
  {
    // Указник за першою літерою. Коли полиця переростає екран, «де тут
    // Картографи» — питання швидше за пошук: одна кнопка замість слова.
    key: "letter", kind: "strip", slot: "index", label: "Літера",
    defaultValue: ANY, wraps: true, className: "abc",
    options(games){
      const present = collectValues(games, (game) => [indexLetter(game)]);
      const letters = Array.from(present)
        .filter((letter) => letter && letter !== LATIN_BUCKET && letter !== DIGIT_BUCKET)
        .sort(byUkrainianAlphabet);
      // Латинка й цифри — у кінці, після української абетки: там їм і
      // місце, і окремих кнопок вони не варті.
      const tail = [];
      if(present.has(LATIN_BUCKET)) tail.push([LATIN_BUCKET, "A–Z"]);
      if(present.has(DIGIT_BUCKET)) tail.push([DIGIT_BUCKET, "0–9"]);
      return [anyOption()].concat(letters.map((letter) => [letter, letter]), tail);
    },
    matches: (game, value) => value === ANY || indexLetter(game) === value,
  },
  {
    key: "family", kind: "strip", label: "Жанр", defaultValue: ANY, wraps: true,
    // Показуємо лише ті родини, які справді є на полиці: порожня кнопка
    // «воєнна» лише займала б місце й обіцяла неіснуюче.
    options(games){
      const present = collectValues(games, familyKeys);
      const families = Object.keys(FAMILY_LABELS).filter((slug) => present.has(slug))
        .sort((a, b) => byUkrainianAlphabet(FAMILY_LABELS[a], FAMILY_LABELS[b]))
        .map((slug) => [slug, FAMILY_LABELS[slug]]);
      // «Без родини» — не примха: BGG не встиг розсортувати частину новинок,
      // і без цієї кнопки вони були б недосяжні жодним жанром.
      const someWithout = games.some((game) => !familyKeys(game).length);
      return [anyOption()].concat(families, someWithout ? [[NONE, "без жанру"]] : []);
    },
    matches(game, value){
      if(value === ANY) return true;
      const families = familyKeys(game);
      return value === NONE ? !families.length : families.indexOf(value) >= 0;
    },
  },
  {
    key: "keyGenre", kind: "strip", label: "Тема", defaultValue: ANY, wraps: true,
    // Порядок як у словнику, а не за абеткою: там він осмислений —
    // спершу те, як грається, далі про що воно.
    options(games){
      const present = collectValues(games, keyGenreKeys);
      return [anyOption()].concat(KEY_GENRES
        .filter((keyGenre) => present.has(keyGenre.key))
        .map((keyGenre) => [keyGenre.key, keyGenre.label]));
    },
    matches: (game, value) => value === ANY || keyGenreKeys(game).indexOf(value) >= 0,
  },
  {
    key: "playerCount", kind: "strip", label: "Гравців", defaultValue: ANY,
    options: () => [anyOption()].concat(
      PLAYER_COUNTS.map((count) => [count, PLAYER_COUNT_LABELS[count]])),
    matches: (game, value) => fitsPlayerCount(game, value),
  },
  {
    // «Влазить у…», а не «приблизно стільки»: коли ввечері є година, з
    // коробки на 60–120 хвилин користі нема. Тому міряємо стелею, а не
    // підлогою, і кошики складаються — у годину влазить і філер.
    key: "duration", kind: "strip", label: "Час", defaultValue: ANY,
    options: () => [anyOption(), ["30", "до 30 хв"], ["60", "до години"],
                    ["90", "до півтори"], ["90+", "довші"]],
    matches(game, value){
      if(value === ANY) return true;
      const {min, max} = durationRange(game);
      const ceiling = max != null ? max : min;
      // Коробка без жодного числа мовчить, і за неї не вгадуємо: у «до 30»
      // вона обіцяла б те, чого ніхто не перевіряв.
      if(ceiling == null) return false;
      return value === "90+" ? ceiling > 90 : ceiling <= +value;
    },
  },
  {
    // Межі — ті самі, за якими BGG рахує свою «вагу»: до двійки легка,
    // до трійки середня, далі важка. На полиці це 41 / 39 / 12.
    key: "weight", kind: "strip", label: "Складність", defaultValue: ANY,
    options: () => [anyOption(), ["light", "легка"], ["mid", "середня"],
                    ["heavy", "важка"]],
    matches(game, value){
      if(value === ANY) return true;
      const weight = weightOf(game);
      if(weight == null) return false;
      return value === "light" ? weight < 2 : value === "mid" ? weight >= 2 && weight <= 3 : weight > 3;
    },
  },
  {
    // Стрічка в окремому рядку на головній, а не в шухляді: це той фільтр,
    // яким звужують щодня («покажи лише колекцію», «що з улюбленого»), і
    // два дотики замість одного тут відчутні. Підписи — короткі, а не
    // повні («кандидат на продаж» у кнопці розпирає рядок на пів екрана);
    // повні лишаються в картці, де для них є місце.
    key: "status", kind: "strip", slot: "status", label: "Статус",
    defaultValue: ANY, wraps: true, className: "stat",
    // «Доповнення» стоїть тут же, хоч і не статус: шукають його разом зі
    // статусами й у тому самому місці. У DERIVED_STATUS_LABELS його класти
    // не можна — там живе лише те, що виводиться саме, а доповнення
    // ставлять руками.
    options: () => [anyOption()].concat(
      Object.keys(ALL_STATUS_LABELS).map((status) =>
        [status, SHORT_STATUS_LABELS[status] || ALL_STATUS_LABELS[status]]),
      [[EXPANSION_OPTION, "доповнення"]]),
    matches: (game, value) => value === ANY ? true
      : value === EXPANSION_OPTION ? !!game.expansion
      : allStatuses(game).indexOf(value) >= 0,
  },
  {
    key: "rules", kind: "select", label: "Правила", defaultValue: ANY,
    options: () => [anyOption(), ["has", "є правила"], [NONE, "без правил"]],
    matches(game, value){
      if(value === ANY) return true;
      return sortedRules(game).length > 0 === (value === "has");
    },
  },
  {
    // Свої слова про коробку. Поки жодного тега не поставлено, стрічка
    // сама себе не показує — порожня кнопка «усі» лише їла б місце.
    key: "tags", kind: "strip", label: "Теги", defaultValue: ANY, wraps: true,
    options(games){
      const present = collectValues(games, (game) => game.tags || []);
      return [anyOption()].concat(Array.from(present)
        .sort(byUkrainianAlphabet).map((tag) => [tag, tag]));
    },
    matches: (game, value) => value === ANY || (game.tags || []).indexOf(value) >= 0,
  },
];
function filterByKey(key){ return FILTERS.find((filter) => filter.key === key); }

/** Типове значення кожного фільтра оголошене в реєстрі — звідси воно й
    потрапляє у стан перегляду, і ніде більше не дублюється. */
function defaultFilterValues(){
  const values = {};
  FILTERS.forEach((filter) => { values[filter.key] = filter.defaultValue; });
  return values;
}
/** Стан перегляду, від якого залежить вибірка: що шукаємо, як сортуємо,
    що приховали. Решту (відкриту картку, вигляд списку) дописує сторінка. */
function defaultView(){
  return {filters: defaultFilterValues(), sort: "score", reversed: false, hidden: new Set()};
}
/** Скидає всі фільтри, пошук і приховані групи до типового. Сортування
    не чіпаємо: це не звуження полиці, а спосіб на неї дивитися. */
function resetFilters(view){
  view.filters = defaultFilterValues();
  view.hidden.clear();
}

/** Оцінка, за якою зараз сортуємо й яку показуємо в рядку: загальна або,
    коли вибрано склад столу, саме за цей склад. */
function scoreInView(game, view){
  const count = view.filters.playerCount;
  if(count === ANY) return game.score == null ? null : game.score;
  return scoreForCount(game, count);
}
function fitsPlayerCount(game, count){
  if(count === ANY) return true;
  // Поставлена оцінка сильніша за межі: якщо ви так грали — воно грається.
  if(scoreForCount(game, count) != null) return true;
  const {min, max} = playerRange(game);
  if(min == null && max == null) return true;
  if(count === OPEN_ENDED_COUNT) return max == null || max > 5;
  const players = +count;
  return (min == null || min <= players) && (max == null || max >= players);
}

/* Сортування описані так само.
     value       (game, view) => що порівнюємо
     isText      порівнювати як рядки (з українською абеткою), а не числа
     descending  типово більше вгорі; для абетки — навпаки
*/
const SORTS = [
  {key: "score", label: "за оцінкою", descending: true, value: scoreInView},
  {key: "name", label: "за абеткою", isText: true, value: (game) => game.name || ""},
  {key: "bgg", label: "за оцінкою BGG", descending: true, value: (game) => game.bggRating},
  {key: "plays", label: "за партіями", descending: true, value: playCount},
  // Головне питання полиці: що стоїть і припадає пилом. Коробки без
  // жодної записаної партії йдуть угору всі разом — і ті, що ще не
  // бачили столу, і ті, чиї партії були до появи журналу.
  {key: "idle", label: "давно не діставали", descending: true,
   value: (game) => daysSinceLastPlay(game)},
  {key: "added", label: "за датою додавання", isText: true, descending: true,
   value: (game) => game.added || ""},
  // Час і складність беруться з BGG, коли своїх чисел ще немає, — інакше
  // ці два сортування нічого не роблять, бо руками їх майже не заповнюють.
  {key: "minutes", label: "за часом партії", descending: true,
   value: (game) => durationRange(game).min},
  {key: "weight", label: "за складністю", descending: true, value: weightOf},
];
function currentSort(view){
  return SORTS.find((sort) => sort.key === view.sort) || SORTS[0];
}

/* ── що прибрати з полиці зовсім ──────────────────────────────────────
   Це не фільтр, а звуження самої полиці, і різниця тут суттєва: підсумки
   нагорі рахуються по shelfGames(), тож прибране не потрапляє ні в «ігор
   на полиці», ні в середню оцінку. Саме цього від «приховати» й чекаєш —
   на відміну від фільтра, який лише звужує показане.

   Позначок можна поставити скільки завгодно: доповнення, позбуті коробки
   й те, у що граєш лише онлайн, — це три різні причини не хотіти бачити
   гру в списку, і вони не виключають одна одну. */
const HIDE_RULES = [
  {key: "expansions", label: "доповнення", matches: (game) => !!game.expansion},
  {key: "gone", label: "позбуті коробки", matches: (game) => hasStatus(game, STATUS.GONE)},
  // «Лише онлайн» — саме лише: коробки, до яких є доступ у мережі й
  // більше ніде. Гру, що стоїть у тебе вдома або в друга, ця позначка
  // не чіпає — те, що в неї можна зіграти ще й онлайн, не робить її
  // менш доступною за столом.
  {key: "onlineOnly", label: "лише онлайн",
   matches: (game) => hasStatus(game, STATUS.ONLINE)
                   && !hasStatus(game, STATUS.OWNED)
                   && !hasStatus(game, STATUS.FRIENDS)},
  {key: "fillers", label: "маленькі філери", matches: (game) => hasStatus(game, STATUS.FILLER)},
];
/** Полиця без прихованих груп. */
function shelfGames(games, hidden){
  if(!hidden || !hidden.size) return games;
  return games.filter((game) =>
    !HIDE_RULES.some((rule) => hidden.has(rule.key) && rule.matches(game)));
}

const compareByName = (a, b) => (a.name || "").localeCompare(b.name || "", "uk");
const isEmptyValue = (value) => value == null || value === "";

/** Порівняння двох коробок за поточним сортуванням.

    Порожні значення завжди в кінці — і при прямому порядку, і при зворотному:
    гра без оцінки не має спливати нагору лише тому, що список перевернули. */
function gameComparator(view){
  const sort = currentSort(view);
  return (a, b) => {
    const left = sort.value(a, view), right = sort.value(b, view);
    if(isEmptyValue(left) && isEmptyValue(right)) return compareByName(a, b);
    if(isEmptyValue(left)) return 1;
    if(isEmptyValue(right)) return -1;
    let order = sort.isText
      ? String(left).localeCompare(String(right), "uk") : left - right;
    if(sort.descending) order = -order;
    return (view.reversed ? -order : order) || compareByName(a, b);
  };
}

/** Те, що видно в списку: полиця без прихованого, крізь усі фільтри,
    у поточному порядку. */
function visibleGames(games, view){
  return shelfGames(games, view.hidden)
    .filter((game) => FILTERS.every((filter) =>
      filter.matches(game, view.filters[filter.key])))
    .sort(gameComparator(view));
}

/* ── що саме звужує полицю ────────────────────────────────────────────
   Фільтри переїхали за кнопку, і разом з ними зникло з очей те, чому
   коробок раптом дванадцять. Тому звуження описується не одним «так/ні»,
   а переліком: по запису на кожне ввімкнене. З нього живуть і лічильник
   на кнопці, і плашки над списком, і кнопка «скинути все».

   Живе тут, поруч із реєстром: додасться фільтр — і це саме його
   врахує, без жодної правки деінде. */
const NARROWING = {FILTER: "filter", HIDE: "hide"};
function activeNarrowings(games, view){
  const narrowings = [];
  FILTERS.forEach((filter) => {
    const value = view.filters[filter.key];
    if(value === filter.defaultValue) return;
    // `slot` їде разом із записом: плашку й лічильник на кнопці заробляє
    // лише те, що сховане в шухляді. Пошук і указник видно й так, і
    // дублювати їх плашкою — це шум там, де має бути відповідь.
    narrowings.push({kind: NARROWING.FILTER, key: filter.key, slot: filter.slot,
                     label: filter.label || "Пошук",
                     value: optionLabel(filter, value, games)});
  });
  HIDE_RULES.forEach((rule) => {
    if(view.hidden.has(rule.key)){
      narrowings.push({kind: NARROWING.HIDE, key: rule.key, label: "Приховано",
                       value: rule.label});
    }
  });
  return narrowings;
}
/** Як назвати вибране значення людською мовою: у стрічки й списку підпис
    лежить у варіантах, у пошуку значення і є підписом. */
function optionLabel(filter, value, games){
  if(!filter.options) return String(value);
  const option = filter.options(games).find((candidate) => candidate[0] === value);
  return option ? option[1] : String(value);
}
/** Знімає одне звуження — те, що назвала плашка. */
function clearNarrowing(view, kind, key){
  if(kind === NARROWING.HIDE){ view.hidden.delete(key); return; }
  const filter = filterByKey(key);
  if(filter) view.filters[filter.key] = filter.defaultValue;
}

/* ── жереб «що зіграти» ───────────────────────────────────────────────
   Вечір питає не «що в мене є», а «нас троє, маємо годину — діставати
   що?». Список із двадцяти коробок на це не відповідь: із двадцяти
   вибирати так само важко, як із дев'яноста. Тому — п'ять коробок
   жеребом: більше, ніж кинути монету, і менше, ніж знову список.

   Питання ті самі, що в панелі, і перевіряються тими самими функціями
   з реєстру: окремої «майже такої» логіки складу столу й часу тут немає
   й бути не повинно. */
/* Коробка, яку діставали цими днями, до жереба не йде: «зіграймо знову
   те саме» — це рішення, а не підказка, і воно приймається без нас. */
const RECENT_PLAY_DAYS = 14;
/* Скільки коробок радити за раз. П'ять — це ще вибір, а не список: очима
   він охоплюється цілком, і жодна не губиться. */
const LOTTERY_SIZE = 5;
/** Питання вечора, на які ще не відповіли. */
function defaultEvening(){ return {playerCount: ANY, duration: ANY}; }

/** Ті, що взагалі можуть опинитися сьогодні на столі. */
function lotteryCandidates(games, evening, now){
  const playerCountFilter = filterByKey("playerCount");
  const durationFilter = filterByKey("duration");
  return games.filter((game) =>
    !game.deleted
    // Доповнення не дістають окремо, а чужа коробка стоїть у чужій хаті:
    // порадити її на сьогодні — це порада поїхати в гості.
    && !game.expansion
    && hasStatus(game, STATUS.OWNED)
    && playerCountFilter.matches(game, evening.playerCount)
    && durationFilter.matches(game, evening.duration)
    && daysSinceLastPlay(game, now) > RECENT_PLAY_DAYS);
}
/** Наскільки охоче жереб тягне саме цю коробку.

    Оцінка тягне вибір до улюбленого, але не робить його передбачуваним:
    десятка вдвічі ймовірніша за п'ятірку, а не єдино можлива. Неоцінена
    важить як міцна сімка й дістає надбавку, якщо ще не бачила столу, —
    інакше жереб радив би вічно те саме, а нові коробки так і стояли б. */
function lotteryWeight(game){
  return (game.score == null ? 6 : game.score) + (game.plays ? 0 : 2);
}
/** Кілька різних коробок із `candidates`, вибраних вагою. Менше — якщо
    більше немає. `random` підміняють у тестах. */
function drawLottery(candidates, size, random){
  const pool = candidates.slice();
  const nextRandom = random || Math.random;
  const drawn = [];
  while(pool.length && drawn.length < (size || LOTTERY_SIZE)){
    const totalWeight = pool.reduce((sum, game) => sum + lotteryWeight(game), 0);
    let point = nextRandom() * totalWeight;
    let index = 0;
    while(index < pool.length - 1 && (point -= lotteryWeight(pool[index])) > 0) index++;
    drawn.push(pool.splice(index, 1)[0]);
  }
  return drawn;
}
