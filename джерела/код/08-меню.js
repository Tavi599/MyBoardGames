/* ── меню, обмін даними ──────────────────────────── */
function hideMenu(){ $("menu").hidden = true; $("menuBtn").setAttribute("aria-expanded", "false"); }
$("menuBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  const m = $("menu"); m.hidden = !m.hidden;
  $("menuBtn").setAttribute("aria-expanded", m.hidden ? "false" : "true");
});
document.addEventListener("click", (e) => {
  if(!$("menu").hidden && !e.target.closest(".menu-wrap")) hideMenu();
});
function dump(){ return JSON.stringify({app:"полиця настілок", saved:new Date().toISOString(), games:games}, null, 2); }
$("mExport").addEventListener("click", async () => {
  hideMenu();
  const name = "полиця-" + new Date().toISOString().slice(0, 10) + ".json";
  const data = dump();
  let saver = null;
  try{ saver = window.claude ? await window.claude.use("downloads") : null; }catch(e){ saver = null; }
  if(saver){
    try{ await saver.save({filename:name, data:data}); toast("Файл збережено."); }
    catch(e){ toast("Збереження скасовано."); }
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], {type:"application/json"}));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast("Файл збережено.");
});
$("mCopy").addEventListener("click", async () => {
  hideMenu();
  try{ await navigator.clipboard.writeText(dump()); toast("JSON у буфері обміну."); }
  catch(e){ toast("Браузер не дав доступ до буфера. Скористайся експортом у файл."); }
});
$("mImport").addEventListener("click", () => { hideMenu(); $("fileIn").click(); });

/* ── оцінки BGG з вивантаженого файлу ───────────────────────────────
   Рядок CSV може містити коми всередині лапок, тож розбираємо вручну. */
function csvRow(рядок){
  const поля = []; let буфер = "", вЛапках = false;
  for(let i = 0; i < рядок.length; i++){
    const c = рядок[i];
    if(вЛапках){
      if(c === '"'){ if(рядок[i + 1] === '"'){ буфер += '"'; i++; } else вЛапках = false; }
      else буфер += c;
    } else if(c === '"') вЛапках = true;
    else if(c === ","){ поля.push(буфер); буфер = ""; }
    else буфер += c;
  }
  поля.push(буфер);
  return поля;
}
const ключ = (s) => String(s || "").toLowerCase().replace(/[\s–—–—:.,!'’"()]/g, "");

async function bggImport(file){
  const текст = await file.text();
  const рядки = текст.split(/\r?\n/).filter(Boolean);
  if(рядки.length < 2){ toast("Файл порожній."); return; }
  const шапка = csvRow(рядки[0]).map((s) => s.trim().toLowerCase());
  const iId = шапка.indexOf("id"), iName = шапка.indexOf("name");
  const iAvg = шапка.indexOf("average"), iRank = шапка.indexOf("rank");
  if(iName < 0 || iAvg < 0){
    toast("Це не той файл: у ньому немає колонок name та average.");
    return;
  }
  const довідник = new Map();
  for(let i = 1; i < рядки.length; i++){
    const п = csvRow(рядки[i]);
    const к = ключ(п[iName]);
    if(к && !довідник.has(к)) довідник.set(к, п);
  }
  const змінені = [];
  let не = 0;
  games.forEach((g) => {
    const п = довідник.get(ключ(g.nameEn)) || довідник.get(ключ(g.name));
    if(!п){ не++; return; }
    const оцінка = Math.round(parseFloat(п[iAvg]) * 10) / 10;
    if(!isFinite(оцінка)) return;
    const ранг = iRank >= 0 ? parseInt(п[iRank], 10) : NaN;
    if(g.bggRating === оцінка && g.bggId === (iId >= 0 ? п[iId] : g.bggId)) return;
    g.bggRating = оцінка;
    if(iId >= 0) g.bggId = п[iId];
    if(isFinite(ранг) && ранг > 0) g.bggRank = ранг; else delete g.bggRank;
    stamp(g);
    змінені.push(g);
  });
  if(!змінені.length){ toast("Нічого не змінилося: оцінки вже такі."); render(); return; }
  if(mode === "github"){ enqueue(змінені); cacheSave(); badge(); ghPush(); }
  else if(mode === "server") await sync(змінені);
  else localSave();
  render();
  toast("Оцінки BGG: звірено " + змінені.length + ", не знайшлося " + не + ".");
}

function openBgg(){ $("keyScrim").hidden = false; $("bggBox").hidden = false; }
function closeBgg(){ $("keyScrim").hidden = true; $("bggBox").hidden = true; }
$("mBgg").addEventListener("click", () => { hideMenu(); openBgg(); });
$("bggCancel").addEventListener("click", closeBgg);
$("bggPick").addEventListener("click", () => $("bggIn").click());
$("bggIn").addEventListener("change", async (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = "";
  if(!f) return;
  if(!canEdit()) return;
  closeBgg();
  toast("Читаю файл…");
  try{ await bggImport(f); }
  catch(err){ toast("Не вдалося прочитати: " + (err.message || err)); }
});
$("bggClear").addEventListener("click", async () => {
  if(!canEdit()) return;
  const змінені = games.filter((g) => g.bggRating != null);
  змінені.forEach((g) => { delete g.bggRating; delete g.bggRank; delete g.bggId; stamp(g); });
  closeBgg();
  if(!змінені.length){ toast("Оцінок BGG і не було."); return; }
  if(mode === "github"){ enqueue(змінені); cacheSave(); badge(); ghPush(); }
  else if(mode === "server") await sync(змінені);
  else localSave();
  render();
  toast("Оцінки BGG прибрано з " + змінені.length + " ігор.");
});

$("keyRepo").textContent = GH.owner + "/" + GH.repo;
function openKey(){
  $("keyIn").value = token;
  $("keyScrim").hidden = false; $("keyBox").hidden = false;
  $("keyIn").focus();
}
function closeKey(){ $("keyScrim").hidden = true; $("keyBox").hidden = true; }
$("mToken").addEventListener("click", () => { hideMenu(); openKey(); });
$("keyCancel").addEventListener("click", closeKey);
$("keyScrim").addEventListener("click", () => { closeKey(); closeBgg(); });
$("keyForget").addEventListener("click", () => {
  tokenSave(""); closeKey(); toast("Ключ прибрано з цього браузера.");
});
$("keySave").addEventListener("click", async () => {
  const v = $("keyIn").value.trim();
  tokenSave(v); closeKey();
  if(!v){ toast("Ключ прибрано."); return; }
  if(mode === "github"){
    const ок = await ghPush();
    toast(ок ? "Ключ прийнято." : "Ключ збережено, але записати не вдалося — перевір права токена.");
  } else toast("Ключ збережено.");
});
$("keyIn").addEventListener("keydown", (e) => { if(e.key === "Enter") $("keySave").click(); });
$("fileIn").addEventListener("change", async (e) => {
  const f = e.target.files && e.target.files[0]; if(!f) return;
  e.target.value = "";
  let data;
  try{ data = JSON.parse(await f.text()); }
  catch(err){ toast("Це не схоже на JSON із полиці."); return; }
  const arr = Array.isArray(data) ? data : data.games;
  if(!Array.isArray(arr)){ toast("У файлі немає списку ігор."); return; }
  let added = 0, upd = 0;
  for(const raw of arr){
    if(!raw || !raw.name) continue;
    const g = Object.assign(blank(raw.name), raw);
    const same = games.find((x) => x.id === raw.id || x.name === raw.name);
    if(same){ Object.assign(same, g, {id:same.id}); upd++; await persist(same); }
    else { g.id = raw.id || newId(); games.push(g); added++; await persist(g); }
  }
  if(!db) localSave();
  render();
  toast("Додано " + added + ", оновлено " + upd + ".");
});

let toastTimer = null;
function toast(msg){
  let t = document.querySelector(".toast");
  if(!t){ t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 3600);
}

boot();
