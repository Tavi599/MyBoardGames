/* ── сховище ──────────────────────────────────────────────────────────
   Єдине місце, яке знає, де лежить полиця й як її туди покласти. Сторінка
   сама розуміє, де вона запущена:
     "github" — віддана GitHub Pages, пише «ratings.json» просто в репозиторій;
     "server" — віддана локальним сервером, правда лежить в «ratings.json»;
     "cloud"  — опублікована сторінка-артефакт, правда в її базі;
     "local"  — файл відкрито з диска, правда в пам'яті цього браузера.

   Решта сторінки про режими не знає: вона кличе saveSoon(), addGame(),
   removeGame() і слухає події. Сховище, своєю чергою, не знає про
   сторінку — не малює, не показує сповіщень, не відкриває діалогів, а
   лише повідомляє підписникам:
     {type: "change"}            змінилася полиця, черга, режим або ключ;
     {type: "message", text}     є що сказати людині.

   У режимах "github" і "server" незбережене не губиться: лягає в чергу
   в пам'яті браузера й доїздить, щойно база знову відповідає. */

const STORAGE_MODE = {GITHUB: "github", SERVER: "server", CLOUD: "cloud", LOCAL: "local"};
/* Ключі в пам'яті браузера. Значення міняти не можна: під ними вже лежать
   полиці, черги й ключі доступу на справжніх пристроях. */
const STORAGE_KEYS = {
  localGames: "polytsia.games.v1",
  queue: "polytsia.queue.v1",
  token: "polytsia.token.v1",
  githubCache: "polytsia.cache.v1",
  layout: "polytsia.view",
};
const GITHUB_FILE = {owner: "Tavi599", repo: "MyBoardGames", path: "ratings.json", branch: "main"};
const GITHUB_PUSH_DELAY_MS = 8000;     // тиша перед комітом: серія правок — один коміт
const GITHUB_PUSH_ATTEMPTS = 3;
const SERVER_RETRY_MS = 30000;
/* Пауза між правкою й записом: набір слова в нотатці — це не десять
   збережень, а одне. */
const SAVE_DEBOUNCE_MS = 350;

/* Приватне вікно й заборонені куки кидають виняток просто на читанні,
   тож без try тут не обійтися — сторінка мусить відкритися і в них. */
function readStored(key){
  try{ return localStorage.getItem(key); }catch(e){ return null; }
}
function writeStored(key, value){
  try{
    if(value == null || value === "") localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  }catch(e){}
}
/** Список коробок із пам'яті браузера; null, якщо там порожньо або зіпсовано. */
function readStoredGames(key){
  const raw = readStored(key);
  if(!raw) return null;
  try{ return acceptGames(JSON.parse(raw)); }catch(e){ return null; }
}

const store = (function createStore(){
  let mode = STORAGE_MODE.LOCAL;
  let games = [];
  let queue = [];
  let token = "";
  let ready = false;
  let cloudDb = null;

  const listeners = [];
  function emit(event){ listeners.forEach((listener) => listener(event)); }
  const notifyChanged = () => emit({type: "change"});
  const say = (text) => emit({type: "message", text: text});

  const usesQueue = () => mode === STORAGE_MODE.GITHUB || mode === STORAGE_MODE.SERVER;
  /** Без ключа правка в репозиторій не долетить, тож краще одразу
      показати, чого бракує, ніж прийняти її й тихо загубити. */
  const isReadOnly = () => mode === STORAGE_MODE.GITHUB && !token;

  function persistQueue(){ writeStored(STORAGE_KEYS.queue, JSON.stringify(queue)); }
  function enqueue(changed){
    queue = queueWith(queue, changed);
    persistQueue();
  }
  function persistLocalCopy(){ writeStored(STORAGE_KEYS.localGames, JSON.stringify(games)); }
  function persistGithubCache(){ writeStored(STORAGE_KEYS.githubCache, JSON.stringify(games)); }

  /* ── GitHub як база ────────────────────────────────────────────────
     Сторінка, віддана GitHub Pages, пише «ratings.json» просто в
     репозиторій через API. Кожне збереження — коміт, тобто історія й
     резервна копія це одне й те саме. Комп'ютер удома для цього не потрібен. */
  let githubFileSha = null;
  let githubPushTimer = null;
  let githubPushInFlight = null;

  function githubHeaders(){
    const headers = {"Accept": "application/vnd.github+json"};
    if(token) headers["Authorization"] = "Bearer " + token;
    return headers;
  }
  function githubFileUrl(){
    return "https://api.github.com/repos/" + GITHUB_FILE.owner + "/" + GITHUB_FILE.repo +
           "/contents/" + encodeURIComponent(GITHUB_FILE.path);
  }
  async function githubRead(){
    const response = await fetch(githubFileUrl() + "?ref=" + GITHUB_FILE.branch,
                                 {headers: githubHeaders(), cache: "no-store"});
    if(response.status === 404){
      githubFileSha = null;
      // Приватний репозиторій без ключа виглядає точно так само, як відсутній файл.
      if(!token) throw new Error("Потрібен ключ доступу: «···» → «Ключ доступу»");
      return [];
    }
    if(!response.ok) throw new Error("GitHub " + response.status);
    const file = await response.json();
    githubFileSha = file.sha;
    return acceptGames(JSON.parse(decodeBase64Utf8(file.content)).games);
  }
  /** true — записано; false — хтось випередив, і sha застарів. */
  async function githubWrite(allGames, message){
    const body = {message: message, branch: GITHUB_FILE.branch,
                  content: encodeBase64Utf8(shelfJson(allGames) + "\n")};
    if(githubFileSha) body.sha = githubFileSha;
    const response = await fetch(githubFileUrl(), {
      method: "PUT",
      headers: Object.assign({"Content-Type": "application/json"}, githubHeaders()),
      body: JSON.stringify(body),
    });
    if(response.status === 409 || response.status === 422) return false;
    if(response.status === 401 || response.status === 403){
      throw new Error("ключ не приймають (" + response.status + ")");
    }
    if(!response.ok) throw new Error("GitHub " + response.status);
    const result = await response.json();
    githubFileSha = (result.content && result.content.sha) || null;
    return true;
  }
  /** Читає репозиторій, доливає чергу й записує. Без черги — просто освіжає
      полицю. Два виклики водночас зливаються в один: інакше вони читали б
      той самий sha й заважали одне одному. */
  function pushToGithub(){
    if(mode !== STORAGE_MODE.GITHUB || !token) return Promise.resolve(false);
    if(!githubPushInFlight){
      githubPushInFlight = runGithubPush().finally(() => { githubPushInFlight = null; });
    }
    return githubPushInFlight;
  }
  async function runGithubPush(){
    for(let attempt = 0; attempt < GITHUB_PUSH_ATTEMPTS; attempt++){
      let remote;
      try{ remote = await githubRead(); }
      catch(e){ notifyChanged(); return false; }
      const pending = queue.slice();
      const merged = mergeNewestWins(remote, pending);
      if(pending.length){
        const sentStamps = stampsOf(pending);
        let written;
        try{ written = await githubWrite(merged, commitMessage(pending)); }
        catch(e){ say(String(e.message || e)); notifyChanged(); return false; }
        if(!written) continue;      // sha застарів — перечитуємо й пробуємо ще раз
        queue = withoutSent(queue, sentStamps);
        persistQueue();
      }
      games = replaceShelf(games, merged, queue);
      persistGithubCache();
      notifyChanged();
      // Правки, що встигли лягти в чергу під час запису, їдуть наступним разом.
      if(queue.length) scheduleGithubPush();
      return true;
    }
    say("Не вдалося записати: репозиторій змінюється швидше, ніж я встигаю.");
    return false;
  }
  function scheduleGithubPush(){
    clearTimeout(githubPushTimer);
    githubPushTimer = setTimeout(pushToGithub, GITHUB_PUSH_DELAY_MS);
  }
  async function startGithub(){
    mode = STORAGE_MODE.GITHUB;
    const cached = readStoredGames(STORAGE_KEYS.githubCache);
    if(cached && cached.length){ games = cached; ready = true; }
    notifyChanged();
    try{
      const remote = await githubRead();
      games = replaceShelf(games, remote, queue);
      ready = true;
      persistGithubCache();
      notifyChanged();
    }catch(e){
      ready = true;
      notifyChanged();
      if(!cached) say("Не дістав дані з GitHub. Показую те, що лишилось у пам'яті.");
    }
    if(queue.length) pushToGithub();
    window.addEventListener("online", pushToGithub);
    document.addEventListener("visibilitychange", () => {
      // Повернулися на вкладку — освіжаємо; пішли з неї — віддаємо чергу.
      if(!document.hidden || queue.length) pushToGithub();
    });
  }

  /* ── локальний сервер ──────────────────────────────────────────────── */
  let serverSyncInFlight = false;

  /** Відправляє чергу серверу й кладе його відповідь на місце полиці.
      false — не вдалося або відправлення вже триває; зміни чекають у черзі. */
  async function syncWithServer(changed){
    if(changed && changed.length){
      enqueue(changed);
      notifyChanged();          // плашка одразу каже, скільки чекає
    }
    if(serverSyncInFlight) return false;
    if(!queue.length) return true;
    serverSyncInFlight = true;
    let synced = false;
    try{
      const sent = queue.slice();
      const sentStamps = stampsOf(sent);
      const response = await fetch("api/save", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({games: sent}),
      });
      if(!response.ok) throw new Error("HTTP " + response.status);
      const reply = await response.json();
      const incoming = acceptGames(reply.games);
      queue = withoutSent(queue, sentStamps);
      persistQueue();
      games = replaceShelf(games, incoming, queue);
      synced = true;
      // Сервер зберіг правку на диск, але його перевірка даних знайшла ваду —
      // і доки її не полагодять, у репозиторій нічого не поїде.
      if(reply.warning) say("Збережено, але в даних вада: " + reply.warning);
    }catch(e){
      // Нічого не втрачено: усе надіслане досі лежить у черзі.
    }finally{
      serverSyncInFlight = false;
    }
    notifyChanged();
    // Те, що лягло в чергу, поки летіла відповідь, їде одразу наступним заходом.
    if(synced && queue.length) setTimeout(syncWithServer, 0);
    return synced;
  }
  /** true — сторінку справді віддав наш сервер, і полиця з нього взята. */
  async function startServer(){
    let state = null;
    try{
      const response = await fetch("api/state", {cache: "no-store"});
      if(response.ok) state = await response.json();
    }catch(e){}
    // Відповідь буває несхожою на полицю (звичайний веб-сервер віддасть
    // свою сторінку 404) — тоді це не наш сервер, і лишаємося при своїй
    // копії: acceptGames() від такого кидає.
    let serverGames = null;
    try{ serverGames = state ? acceptGames(state.games) : null; }catch(e){}
    if(!serverGames) return false;
    mode = STORAGE_MODE.SERVER;
    games = replaceShelf([], serverGames, queue);
    ready = true;
    notifyChanged();
    if(queue.length) syncWithServer();
    setInterval(() => { if(queue.length) syncWithServer(); }, SERVER_RETRY_MS);
    window.addEventListener("online", () => syncWithServer());
    document.addEventListener("visibilitychange", () => {
      if(!document.hidden) syncWithServer();
    });
    return true;
  }
  /** Просить сервер добрати одній коробці числа з BGG просто зараз.
      Повертає {game, fields}; кидає з поясненням, якщо не вийшло. */
  async function refreshFromBgg(id){
    const response = await fetch("api/bgg", {
      method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({id: id}),
    });
    let body = {};
    try{ body = await response.json(); }catch(e){}
    if(!response.ok) throw new Error(body.error || ("сервер відповів " + response.status));
    if(!body.game) throw new Error("сервер не віддав коробку");
    // Сервер віддає запис уже зі своїми правками — кладемо його на місце
    // старого, а не зливаємо: правда про чужі числа тепер там.
    const fresh = acceptGames([body.game])[0];
    const index = games.findIndex((game) => game.id === fresh.id);
    if(index >= 0) games[index] = fresh; else games.push(fresh);
    notifyChanged();
    return {game: fresh, fields: body.fields || []};
  }

  /* ── база опублікованої сторінки ───────────────────────────────────── */
  const cloudError = (error) => (error && error.code ? error.code : "збій зв'язку");

  async function startCloud(){
    let db = null;
    try{ db = await window.claude.use("db"); }catch(e){}
    if(!db){ ready = true; notifyChanged(); return; }
    cloudDb = db;
    mode = STORAGE_MODE.CLOUD;
    notifyChanged();
    cloudDb.collection("games").onSnapshot(
      (snapshot) => {
        games = acceptGames(snapshot.docs.map((doc) => Object.assign({id: doc.id}, doc.data())));
        ready = true;
        notifyChanged();
      },
      (error) => {
        ready = true;
        notifyChanged();
        say("База недоступна (" + error.code + "). Правки не збережуться.");
      });
  }
  async function saveToCloud(changed){
    try{
      await Promise.all(changed.map((game) => {
        const body = Object.assign({}, game);
        delete body.id;
        return cloudDb.doc("games/" + game.id).set(body);
      }));
    }catch(e){ say("Не вдалося зберегти: " + cloudError(e)); }
  }

  /* ── копія в цьому браузері ────────────────────────────────────────── */
  function startLocal(){
    const stored = readStoredGames(STORAGE_KEYS.localGames);
    if(stored && stored.length){ games = stored; ready = true; }
    else if(!window.claude){
      games = seedGames();
      ready = true;
      persistLocalCopy();
    }
    notifyChanged();
  }

  /* ── запис, спільний для всіх режимів ──────────────────────────────── */

  /** Кладе змінені коробки туди, де живе полиця. Самі записи вже змінені
      на місці й мають свіжу мітку `updated`. */
  async function saveGames(changed){
    if(!changed.length) return;
    if(mode === STORAGE_MODE.GITHUB){
      if(!token){ say("Спершу постав ключ доступу: «···» → «Ключ доступу»."); return; }
      enqueue(changed);
      persistGithubCache();
      notifyChanged();
      scheduleGithubPush();
    }
    else if(mode === STORAGE_MODE.SERVER) await syncWithServer(changed);
    else if(mode === STORAGE_MODE.CLOUD) await saveToCloud(changed);
    else persistLocalCopy();
  }

  /* Відкладений запис — свій на кожну коробку. Один спільний таймер
     губив правку: зміниш одну гру, за пів секунди другу — і таймер
     першої вже скинуто, вона не збережеться ніколи. */
  const pendingSaves = new Map();     // id → {timer, promise, resolve}
  /** Зберегти коробку трохи згодом; обіцянка здійсниться, коли збережено. */
  function saveSoon(game){
    let pending = pendingSaves.get(game.id);
    if(pending) clearTimeout(pending.timer);
    else{
      pending = {};
      pending.promise = new Promise((resolve) => { pending.resolve = resolve; });
      pendingSaves.set(game.id, pending);
    }
    pending.timer = setTimeout(() => flushSave(game.id), SAVE_DEBOUNCE_MS);
    return pending.promise;
  }
  async function flushSave(id){
    const pending = pendingSaves.get(id);
    if(!pending) return;
    clearTimeout(pending.timer);
    pendingSaves.delete(id);
    const game = games.find((candidate) => candidate.id === id);
    if(game) await saveGames([game]);
    pending.resolve();
  }
  /** Усе відкладене — негайно: сторінку ховають або закривають. */
  function flushPendingSaves(){
    return Promise.all(Array.from(pendingSaves.keys()).map(flushSave));
  }

  /** Нова коробка на полиці. У репозиторій і на сервер порожня заготовка
      не їде — поїде з першою ж правкою; своя копія й хмара пишуть одразу. */
  async function addGame(game){
    games.push(game);
    notifyChanged();
    if(!usesQueue()) await saveGames([game]);
  }
  /** Знімає коробку з полиці. false — у режимі читання нічого не зроблено. */
  async function removeGame(id){
    const game = games.find((candidate) => candidate.id === id);
    if(!game) return false;
    if(isReadOnly()){ say("Без ключа доступу видалити не вийде."); return false; }
    pendingSaves.delete(id);
    games = games.filter((candidate) => candidate.id !== id);
    notifyChanged();
    if(usesQueue()) await saveGames([tombstoneFor(game)]);
    else if(mode === STORAGE_MODE.CLOUD){
      try{ await cloudDb.doc("games/" + id).delete(); }
      catch(e){ say("Не вдалося видалити: " + cloudError(e)); }
    }
    else persistLocalCopy();
    return true;
  }
  /** Вливає коробки з файла експорту: знайома (за id або назвою) оновлюється,
      незнайома додається. Повертає, скільки яких. */
  async function importGames(imported){
    const touched = [];
    let added = 0, updated = 0;
    imported.forEach((raw) => {
      if(!raw || !raw.name) return;
      const incoming = Object.assign(newGame(raw.name), raw);
      const existing = games.find((game) => game.id === raw.id || game.name === raw.name);
      if(existing){
        Object.assign(existing, incoming, {id: existing.id});
        touched.push(existing);
        updated++;
      } else {
        incoming.id = raw.id || newGameId();
        games.push(incoming);
        touched.push(incoming);
        added++;
      }
    });
    notifyChanged();
    await saveGames(touched);
    return {added: added, updated: updated};
  }

  function setToken(value){
    token = value || "";
    writeStored(STORAGE_KEYS.token, token);
    notifyChanged();
  }

  async function start(){
    queue = readStoredGames(STORAGE_KEYS.queue) || [];
    token = readStored(STORAGE_KEYS.token) || "";
    // Першим, раніше за обробники режимів: відкладені правки мають лягти
    // в чергу до того, як її почнуть відправляти.
    document.addEventListener("visibilitychange", () => {
      if(document.hidden) flushPendingSaves();
    });
    window.addEventListener("pagehide", flushPendingSaves);

    if(!window.claude){
      // Сторінка з GitHub Pages працює з репозиторієм напряму.
      if(/github\.io$/.test(location.hostname)) return startGithub();
      if(location.protocol.startsWith("http") && await startServer()) return;
    }
    startLocal();
    if(window.claude) await startCloud();
  }

  return {
    subscribe(listener){ listeners.push(listener); },
    start: start,
    get mode(){ return mode; },
    get games(){ return games; },
    get ready(){ return ready; },
    get token(){ return token; },
    get queueLength(){ return queue.length; },
    get repoName(){ return GITHUB_FILE.owner + "/" + GITHUB_FILE.repo; },
    isReadOnly: isReadOnly,
    findGame(id){ return games.find((game) => game.id === id) || null; },
    saveSoon: saveSoon,
    saveGames: saveGames,
    flushPendingSaves: flushPendingSaves,
    addGame: addGame,
    removeGame: removeGame,
    importGames: importGames,
    setToken: setToken,
    pushNow: pushToGithub,
    refreshFromBgg: refreshFromBgg,
  };
})();
