/* ── синхронізація: чисті правила ─────────────────────────────────────
   Злиття, черга незбережених змін, вигляд файла даних. Мережі тут немає:
   це той код, від якого залежить, чи не зникне оцінка, поставлена без
   зв'язку, — тож він окремо і під тестами. Саму мережу й пам'ять браузера
   тримає «10-store.js».

   Правило злиття («свіжіший перемагає; при однаковій мітці — той, що
   приїхав») має ще одну реалізацію на сервері. Поділити код між python і
   браузером не можна, тож поділено перелік випадків — «src/merge-cases.json»
   читають обидві сторони тестів. Правиш злиття — починай звідти. */

const APP_NAME = "полиця настілок";

/** Свіжіший запис перемагає; мітки видалення лишаються у списку. */
function mergeNewestWins(base, changes){
  const byId = {};
  base.forEach((game) => { byId[game.id] = game; });
  changes.forEach((game) => {
    const current = byId[game.id];
    if(!current || (game.updated || "") >= (current.updated || "")) byId[game.id] = game;
  });
  return Object.keys(byId).map((id) => byId[id]);
}

/** Повний стан із бази лягає на місце нинішнього; повертає нову полицю.

    Саме **повний**: наприкінці лишається тільки те, що приїхало, плюс те,
    що ще чекає в черзі, — інакше гра, викинута з іншого пристрою,
    воскресала б тут. Одну коробку сюди передавати не можна: від полиці
    лишиться одна коробка.

    Мітки видалення до полиці не доходять: вони живуть у файлі й у черзі,
    а на екрані їм робити нічого. */
function replaceShelf(current, incoming, queue){
  // Те саме правило, що й на сервері: свіжіший запис перемагає. Потрібне,
  // бо поки відповідь летіла, тут могли встигнути натиснути ще щось.
  const merged = mergeNewestWins(mergeNewestWins(current, incoming), queue);
  const known = new Set(incoming.map((game) => game.id));
  const pending = new Set(queue.map((game) => game.id));
  return merged.filter((game) =>
    !game.deleted && (known.has(game.id) || pending.has(game.id)));
}

/* ── черга ────────────────────────────────────────────────────────────
   Одна коробка чекає в черзі рівно в одному примірнику, і саме в
   останньому. Інакше сорок дотиків по «+ партія» без мережі поїхали б
   сорока записами, з яких перші тридцять дев'ять — застарілі. */
function queueWith(queue, changed){
  const ids = new Set(changed.map((game) => game.id));
  return queue.filter((game) => !ids.has(game.id)).concat(changed);
}
/** Мітки `updated` того, що зараз поїде в базу: id → мітка. */
function stampsOf(games){
  return new Map(games.map((game) => [game.id, game.updated]));
}
/** Черга після вдалого відправлення: зникає лише те, що справді поїхало.

    Відправлення триває секунду-дві, і за цей час у чергу лягають нові
    правки — тієї самої коробки чи іншої. Раніше чергу після успіху просто
    спорожнювали, і ці правки зникали з неї назавжди: у базу вони не
    потрапляли, а при наступному читанні їх перекривала стара версія.
    Тому звіряємо мітку: запис, якого не було у відправленні або який
    відтоді змінився, лишається чекати наступного разу. */
function withoutSent(queue, sentStamps){
  return queue.filter((game) =>
    !sentStamps.has(game.id) || sentStamps.get(game.id) !== game.updated);
}

/** Мітка замість зникнення: інакше стара копія в телефоні воскресила б гру. */
function tombstoneFor(game){
  const now = new Date().toISOString();
  return {id: game.id, name: game.name || "", deleted: now, updated: now};
}

/** Файл даних: те, що лягає в «ratings.json», в експорт і в буфер обміну.
    Порядок за id, щоб коміти показували зміну, а не перетасовку. */
function shelfDocument(games){
  return {
    app: APP_NAME,
    version: SCHEMA_VERSION,
    saved: new Date().toISOString(),
    games: games.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  };
}
function shelfJson(games){ return JSON.stringify(shelfDocument(games), null, 2); }

/** Повідомлення коміта. Історія має читатися як історія оцінок, а не як
    «1 зміна» — інакше git тут тримати нема сенсу. */
const COMMIT_NAMES_SHOWN = 3;
function commitMessage(pending){
  const names = pending.map((game) => {
    const name = game.name || game.id;
    if(game.deleted) return "− " + name;
    if(game.score != null) return name + " " + game.score;
    return name;
  });
  const shown = names.slice(0, COMMIT_NAMES_SHOWN).join(", ");
  const rest = names.length - COMMIT_NAMES_SHOWN;
  return "Оцінки: " + shown + (rest > 0 ? " і ще " + rest : "");
}

/* GitHub віддає й приймає вміст файла в base64, а btoa/atob знають лише
   латинку — тож кирилиця йде через байти UTF-8. */
const BASE64_CHUNK = 0x8000;
function encodeBase64Utf8(text){
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for(let i = 0; i < bytes.length; i += BASE64_CHUNK){
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + BASE64_CHUNK));
  }
  return btoa(binary);
}
function decodeBase64Utf8(base64){
  const binary = atob(String(base64).replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for(let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* ── оцінки BGG з вивантаженого файла ─────────────────────────────────
   Рядок CSV може містити коми всередині лапок, тож розбираємо вручну. */
function parseCsvRow(line){
  const fields = [];
  let field = "", inQuotes = false;
  for(let i = 0; i < line.length; i++){
    const char = line[i];
    if(inQuotes){
      if(char === '"'){
        if(line[i + 1] === '"'){ field += '"'; i++; } else inQuotes = false;
      } else field += char;
    } else if(char === '"') inQuotes = true;
    else if(char === ","){ fields.push(field); field = ""; }
    else field += char;
  }
  fields.push(field);
  return fields;
}
/** Назва без регістру, пробілів і розділових знаків — щоб «Brass: Birmingham»
    із файла BGG зійшлася з «Brass Birmingham» на полиці. */
const titleKey = (title) => String(title || "").toLowerCase().replace(/[\s–—:.,!'’"()]/g, "");

/** Проставляє коробкам середню оцінку, ранг і bggId з вивантаження BGG.
    Змінює записи на місці й повертає {changed, unmatched}; кидає, якщо
    файл не той. Зберегти змінене — справа того, хто викликав. */
function applyBggRatings(games, csvText){
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if(lines.length < 2) throw new Error("Файл порожній.");
  const header = parseCsvRow(lines[0]).map((name) => name.trim().toLowerCase());
  const idColumn = header.indexOf("id"), nameColumn = header.indexOf("name");
  const averageColumn = header.indexOf("average"), rankColumn = header.indexOf("rank");
  if(nameColumn < 0 || averageColumn < 0){
    throw new Error("Це не той файл: у ньому немає колонок name та average.");
  }
  const rowsByTitle = new Map();
  for(let i = 1; i < lines.length; i++){
    const row = parseCsvRow(lines[i]);
    const key = titleKey(row[nameColumn]);
    if(key && !rowsByTitle.has(key)) rowsByTitle.set(key, row);
  }
  const changed = [];
  let unmatched = 0;
  games.forEach((game) => {
    const row = rowsByTitle.get(titleKey(game.nameEn)) || rowsByTitle.get(titleKey(game.name));
    if(!row){ unmatched++; return; }
    const rating = Math.round(parseFloat(row[averageColumn]) * 10) / 10;
    if(!isFinite(rating)) return;
    const rank = rankColumn >= 0 ? parseInt(row[rankColumn], 10) : NaN;
    const bggId = idColumn >= 0 ? row[idColumn] : game.bggId;
    if(game.bggRating === rating && game.bggId === bggId) return;
    game.bggRating = rating;
    if(idColumn >= 0) game.bggId = bggId;
    if(isFinite(rank) && rank > 0) game.bggRank = rank; else delete game.bggRank;
    touchUpdated(game);
    changed.push(game);
  });
  return {changed: changed, unmatched: unmatched};
}
/** Прибирає з полиці все, що приїхало з вивантаження BGG. Повертає змінені. */
function clearBggRatings(games){
  const changed = games.filter((game) => game.bggRating != null);
  changed.forEach((game) => {
    delete game.bggRating; delete game.bggRank; delete game.bggId;
    touchUpdated(game);
  });
  return changed;
}
