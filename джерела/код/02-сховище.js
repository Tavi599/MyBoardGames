/* ── зберігання ─────────────────────────────────────────────────────
   Три місця, і сторінка сама розуміє, де вона запущена:
     "server" — віддана локальним сервером, правда лежить в «оцінки.json»;
     "cloud"  — опублікована сторінка, правда в базі артефакта;
     "local"  — файл відкрито з диска, правда в пам'яті цього браузера.
   У режимі сервера незбережене не губиться: лягає в чергу й доїздить,
   щойно сервер знову відповідає.                                     */
let mode = "local";
const QKEY = "polytsia.queue.v1";
let queue = [];
let syncing = false;

function localSave(){
  try{ localStorage.setItem(LSKEY, JSON.stringify(games)); }catch(e){}
}
function localLoad(){
  try{
    const raw = localStorage.getItem(LSKEY);
    if(raw) return JSON.parse(raw);
  }catch(e){}
  return null;
}
function queueSave(){
  try{ localStorage.setItem(QKEY, JSON.stringify(queue)); }catch(e){}
}
function queueLoad(){
  try{
    const raw = localStorage.getItem(QKEY);
    queue = raw ? (JSON.parse(raw) || []) : [];
  }catch(e){ queue = []; }
}
function enqueue(list){
  list.forEach((g) => {
    queue = queue.filter((x) => x.id !== g.id);
    queue.push(g);
  });
  queueSave();
}

/* ── GitHub як база ──────────────────────────────────────────────────
   Сторінка, віддана GitHub Pages, пише «оцінки.json» просто в репозиторій
   через API. Кожне збереження — коміт, тобто історія й резервна копія це
   одне й те саме. Комп'ютер удома для цього не потрібен.               */
const GH = {owner:"Tavi599", repo:"MyBoardGames", path:"оцінки.json", branch:"main"};
const TKEY = "polytsia.token.v1";
const CKEY = "polytsia.cache.v1";
const ПАУЗА = 8000;            // мс тиші перед комітом
let token = "";
let ghSha = null;
let pushTimer = null;

function cacheSave(){ try{ localStorage.setItem(CKEY, JSON.stringify(games)); }catch(e){} }
function cacheLoad(){
  try{
    const raw = localStorage.getItem(CKEY);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}
function tokenLoad(){ try{ token = localStorage.getItem(TKEY) || ""; }catch(e){ token = ""; } }
function tokenSave(v){
  token = v || "";
  try{ v ? localStorage.setItem(TKEY, v) : localStorage.removeItem(TKEY); }catch(e){}
  badge();
}

function b64enc(str){
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for(let i = 0; i < bytes.length; i += 0x8000){
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}
function b64dec(b64){
  const bin = atob(String(b64).replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function ghHead(){
  const h = {"Accept":"application/vnd.github+json"};
  if(token) h["Authorization"] = "Bearer " + token;
  return h;
}
function ghUrl(){
  return "https://api.github.com/repos/" + GH.owner + "/" + GH.repo +
         "/contents/" + encodeURIComponent(GH.path);
}
async function ghRead(){
  const res = await fetch(ghUrl() + "?ref=" + GH.branch, {headers:ghHead(), cache:"no-store"});
  if(res.status === 404){
    ghSha = null;
    // Приватний репозиторій без ключа виглядає точно так само, як відсутній файл.
    if(!token) throw new Error("Потрібен ключ доступу: «···» → «Ключ доступу»");
    return [];
  }
  if(!res.ok) throw new Error("GitHub " + res.status);
  const body = await res.json();
  ghSha = body.sha;
  const state = JSON.parse(b64dec(body.content));
  return state.games || [];
}
async function ghWrite(all, note){
  const state = {
    app:"полиця настілок",
    saved:new Date().toISOString(),
    games: all.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  };
  const body = {message:note, branch:GH.branch,
                content:b64enc(JSON.stringify(state, null, 2) + "\n")};
  if(ghSha) body.sha = ghSha;
  const res = await fetch(ghUrl(), {method:"PUT",
    headers:Object.assign({"Content-Type":"application/json"}, ghHead()),
    body:JSON.stringify(body)});
  if(res.status === 409 || res.status === 422) return false;   // хтось випередив
  if(res.status === 401 || res.status === 403){
    throw new Error("ключ не приймають (" + res.status + ")");
  }
  if(!res.ok) throw new Error("GitHub " + res.status);
  const out = await res.json();
  ghSha = (out.content && out.content.sha) || null;
  return true;
}

/** Свіжіший запис перемагає; мітки видалення лишаються у файлі. */
function lww(base, changes){
  const byId = {};
  base.forEach((g) => { byId[g.id] = g; });
  changes.forEach((g) => {
    const cur = byId[g.id];
    if(!cur || (g.updated || "") >= (cur.updated || "")) byId[g.id] = g;
  });
  return Object.keys(byId).map((id) => byId[id]);
}

/** Повідомлення коміта. Історія має читатися як історія оцінок, а не як
    «1 зміна» — інакше git тут тримати нема сенсу. */
function підсумок(pending){
  const назви = pending.map((g) => {
    const ім = g.name || g.id;
    if(g.deleted) return "− " + ім;
    if(g.score != null) return ім + " " + g.score;
    return ім;
  });
  const видно = назви.slice(0, 3).join(", ");
  const решта = назви.length - 3;
  return "Оцінки: " + видно + (решта > 0 ? " і ще " + решта : "");
}

async function ghPush(){
  if(mode !== "github" || !token) return false;
  for(let спроба = 0; спроба < 3; спроба++){
    let remote;
    try{ remote = await ghRead(); }
    catch(e){ badge(); return false; }
    const pending = queue.slice();
    const merged = lww(remote, pending);
    if(!pending.length){
      games = merged.filter((g) => !g.deleted);
      cacheSave(); badge(); render();
      return true;
    }
    let ok;
    try{ ok = await ghWrite(merged, підсумок(pending)); }
    catch(e){ toast(String(e.message || e)); badge(); return false; }
    if(ok){
      queue = []; queueSave();
      games = merged.filter((g) => !g.deleted);
      if(ui.open && !games.some((g) => g.id === ui.open)) closeCard();
      cacheSave(); badge(); render();
      return true;
    }
    // sha застарів — перечитуємо й пробуємо ще раз
  }
  toast("Не вдалося записати: репозиторій змінюється швидше, ніж я встигаю.");
  return false;
}
function schedulePush(){
  clearTimeout(pushTimer);
  pushTimer = setTimeout(ghPush, ПАУЗА);
}

/** Чи можна зараз щось міняти. Без ключа правка нікуди не долетить, тож
    краще одразу показати, чого бракує, ніж прийняти її й тихо загубити. */
function canEdit(){
  if(mode === "github" && !token){ openKey(); return false; }
  return true;
}

function badge(){
  const chip = $("chip");
  const locked = $("locked");
  if(locked) locked.hidden = !(mode === "github" && !token);
  if(mode === "github"){
    if(!token){
      chip.className = "chip"; chip.textContent = "тільки читання";
      chip.title = "Без ключа доступу оцінки видно, але змінити їх не вийде. «···» → «Ключ доступу»";
    } else if(queue.length){
      chip.className = "chip wait"; chip.textContent = "чекає " + queue.length;
      chip.title = queue.length + " змін ще не в репозиторії — відправлю, щойно буде зв'язок";
    } else {
      chip.className = "chip ok"; chip.textContent = "github";
      chip.title = "Кожне збереження лягає комітом у " + GH.owner + "/" + GH.repo;
    }
    return;
  }
  if(mode === "server"){
    chip.className = queue.length ? "chip wait" : "chip ok";
    chip.textContent = queue.length ? "чекає " + queue.length : "сервер";
    chip.title = queue.length
      ? queue.length + " змін чекають на зв'язок із сервером — не закривай сторінку надовго"
      : "Оцінки лежать в «оцінки.json» на комп'ютері й комітяться в git";
  } else if(mode === "cloud"){
    chip.className = "chip ok"; chip.textContent = "хмара";
    chip.title = "Оцінки в базі опублікованої сторінки";
  } else {
    chip.className = "chip"; chip.textContent = "ця копія";
    chip.title = "Окрема копія в пам'яті цього браузера. Щоб потрапила в основну базу — експортуй JSON";
  }
}

function mergeIn(incoming){
  // Те саме правило, що й на сервері: свіжіший запис перемагає. Потрібне,
  // бо поки відповідь летіла, тут могли встигнути натиснути ще щось.
  const byId = {};
  games.forEach((g) => { byId[g.id] = g; });
  incoming.forEach((g) => {
    const cur = byId[g.id];
    if(!cur || (g.updated || "") >= (cur.updated || "")) byId[g.id] = g;
  });
  const known = new Set(incoming.map((g) => g.id));
  const pending = new Set(queue.map((g) => g.id));
  games = Object.keys(byId).map((id) => byId[id])
    .filter((g) => known.has(g.id) || pending.has(g.id));
}

async function sync(list){
  if(syncing){ if(list && list.length) enqueue(list); return false; }
  const send = queue.concat(list || []);
  if(!send.length) return true;
  syncing = true;
  try{
    const res = await fetch("api/save", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({games:send})
    });
    if(!res.ok) throw new Error("HTTP " + res.status);
    const state = await res.json();
    queue = []; queueSave();
    mergeIn(state.games || []);
    if(ui.open && !games.some((g) => g.id === ui.open)) closeCard();
    badge(); render();
    return true;
  }catch(e){
    if(list && list.length) enqueue(list);
    badge();
    return false;
  }finally{ syncing = false; }
}

async function persist(g){
  if(mode === "github"){
    if(!token){ toast("Спершу постав ключ доступу: «···» → «Ключ доступу»."); return; }
    enqueue([g]); cacheSave(); badge(); schedulePush(); return;
  }
  if(mode === "server"){ await sync([g]); return; }
  if(mode === "cloud"){
    const body = Object.assign({}, g); delete body.id;
    try{ await db.doc("games/" + g.id).set(body); }
    catch(e){ toast("Не вдалося зберегти: " + (e && e.code ? e.code : "збій зв'язку")); }
    return;
  }
  localSave();
}

async function drop(id){
  const g = games.find((x) => x.id === id);
  games = games.filter((x) => x.id !== id);
  const мітка = {id:id, name:(g && g.name) || "", deleted:new Date().toISOString(),
                 updated:new Date().toISOString()};
  if(mode === "github"){
    if(!token){ toast("Без ключа доступу видалити не вийде."); games.push(g); return; }
    enqueue([мітка]); cacheSave(); badge(); render(); schedulePush(); return;
  }
  if(mode === "server"){
    // Мітка замість зникнення: інакше стара копія в телефоні воскресила б гру.
    await sync([мітка]);
    return;
  }
  if(mode === "cloud"){
    try{ await db.doc("games/" + id).delete(); }
    catch(e){ toast("Не вдалося видалити: " + (e && e.code ? e.code : "збій зв'язку")); }
  } else localSave();
  render();
}

async function boot(){
  queueLoad();
  tokenLoad();

  // Сторінка з GitHub Pages працює з репозиторієм напряму.
  if(!window.claude && /github\.io$/.test(location.hostname)){
    mode = "github";
    const cached = cacheLoad();
    if(cached && cached.length){ games = cached; ready = true; }
    badge(); render();
    try{
      const remote = await ghRead();
      games = lww(remote, queue).filter((g) => !g.deleted);
      ready = true; cacheSave(); badge(); render();
    }catch(e){
      ready = true; render();
      if(!cached) toast("Не дістав дані з GitHub. Показую те, що лишилось у пам'яті.");
    }
    if(queue.length) ghPush();
    window.addEventListener("online", ghPush);
    document.addEventListener("visibilitychange", () => {
      if(document.hidden){ if(queue.length) ghPush(); }
      else ghPush();
    });
    return;
  }

  if(!window.claude && location.protocol.startsWith("http")){
    let state = null;
    try{
      const res = await fetch("api/state", {cache:"no-store"});
      if(res.ok) state = await res.json();
    }catch(e){}
    if(state){
      mode = "server";
      games = state.games || [];
      ready = true; badge(); render();
      if(queue.length) sync([]);
      setInterval(() => { if(queue.length) sync([]); }, 30000);
      window.addEventListener("online", () => sync([]));
      document.addEventListener("visibilitychange", () => {
        if(!document.hidden) sync([]);
      });
      return;
    }
  }

  const stored = localLoad();
  if(stored && stored.length){ games = stored; ready = true; badge(); render(); }
  else if(!window.claude){
    games = SEED.map((n, i) => Object.assign(blank(n), {id:"g-seed-" + (i + 1)}));
    ready = true; localSave(); badge(); render();
  } else { badge(); render(); }

  if(!window.claude) return;
  let d = null;
  try{ d = await window.claude.use("db"); }catch(e){ d = null; }
  if(!d){ if(!ready){ ready = true; render(); } return; }
  db = d; mode = "cloud"; badge();
  db.collection("games").onSnapshot(
    (snap) => {
      games = snap.docs.map((doc) => Object.assign({id:doc.id}, doc.data()));
      ready = true; render();
      if(ui.open && !games.some((g) => g.id === ui.open)) closeCard();
    },
    (err) => { ready = true; render(); toast("База недоступна (" + err.code + "). Правки не збережуться."); }
  );
}

