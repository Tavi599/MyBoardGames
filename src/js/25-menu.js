/* ── пункти меню: обмін даними, оцінки BGG, ключ доступу ───────────── */

/* ── експорт ──────────────────────────────────────────────────────── */
const DOWNLOAD_URL_LIFETIME_MS = 4000;

byId("menuExport").addEventListener("click", async () => {
  hideMenu();
  const filename = "полиця-" + new Date().toISOString().slice(0, 10) + ".json";
  const json = shelfJson(store.games);
  // Опублікована сторінка-артефакт зберігає файли через власний засіб:
  // звичайне посилання з download у ній не спрацьовує.
  let downloads = null;
  try{ downloads = window.claude ? await window.claude.use("downloads") : null; }catch(e){}
  if(downloads){
    try{
      await downloads.save({filename: filename, data: json});
      toast("Файл збережено.");
    }catch(e){ toast("Збереження скасовано."); }
    return;
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([json], {type: "application/json"}));
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), DOWNLOAD_URL_LIFETIME_MS);
  toast("Файл збережено.");
});
byId("menuCopy").addEventListener("click", async () => {
  hideMenu();
  try{
    await navigator.clipboard.writeText(shelfJson(store.games));
    toast("JSON у буфері обміну.");
  }catch(e){ toast("Браузер не дав доступ до буфера. Скористайся експортом у файл."); }
});

/* ── імпорт ───────────────────────────────────────────────────────── */

/** Перший вибраний файл; поле одразу спорожнюється, щоб той самий файл
    можна було вибрати вдруге. */
function takeChosenFile(input){
  const file = input.files && input.files[0];
  input.value = "";
  return file || null;
}
byId("menuImport").addEventListener("click", () => {
  hideMenu();
  byId("importFileInput").click();
});
byId("importFileInput").addEventListener("change", async (event) => {
  const file = takeChosenFile(event.target);
  if(!file) return;
  let imported;
  try{
    const data = JSON.parse(await file.text());
    imported = acceptGames(Array.isArray(data) ? data : data.games);
  }catch(error){
    toast("Це не схоже на полицю: " + (error.message || error));
    return;
  }
  const result = await store.importGames(imported);
  toast("Додано " + result.added + ", оновлено " + result.updated + ".");
});

/* ── оцінки BGG з вивантаженого файла ─────────────────────────────── */
function openBggDialog(){ openModal("bggDialog"); }
function closeBggDialog(){ closeModal("bggDialog"); }

byId("menuBggRatings").addEventListener("click", openBggDialog);
byId("bggCloseButton").addEventListener("click", closeBggDialog);
byId("bggChooseFileButton").addEventListener("click", () => byId("bggFileInput").click());
byId("bggFileInput").addEventListener("change", async (event) => {
  const file = takeChosenFile(event.target);
  if(!file || !ensureEditable()) return;
  closeBggDialog();
  toast("Читаю файл…");
  try{
    const result = applyBggRatings(store.games, await file.text());
    if(!result.changed.length){
      toast("Нічого не змінилося: оцінки вже такі.");
      return;
    }
    await store.saveGames(result.changed);
    renderAll();
    toast("Оцінки BGG: звірено " + result.changed.length +
      ", не знайшлося " + result.unmatched + ".");
  }catch(error){
    toast("Не вдалося прочитати: " + (error.message || error));
  }
});
byId("bggClearButton").addEventListener("click", async () => {
  if(!ensureEditable()) return;
  const changed = clearBggRatings(store.games);
  closeBggDialog();
  if(!changed.length){ toast("Оцінок BGG і не було."); return; }
  await store.saveGames(changed);
  renderAll();
  toast("Оцінки BGG прибрано з " + changed.length + " ігор.");
});

/* ── ключ доступу ─────────────────────────────────────────────────── */
function openTokenDialog(){
  byId("tokenInput").value = store.token;
  openModal("tokenDialog");
  byId("tokenInput").focus();
}
function closeTokenDialog(){ closeModal("tokenDialog"); }

byId("tokenRepoName").textContent = store.repoName;
byId("menuToken").addEventListener("click", openTokenDialog);
byId("tokenCancelButton").addEventListener("click", closeTokenDialog);
byId("tokenForgetButton").addEventListener("click", () => {
  store.setToken("");
  closeTokenDialog();
  toast("Ключ прибрано з цього браузера.");
});
byId("tokenSaveButton").addEventListener("click", async () => {
  const token = byId("tokenInput").value.trim();
  store.setToken(token);
  closeTokenDialog();
  if(!token){ toast("Ключ прибрано."); return; }
  if(store.mode !== STORAGE_MODE.GITHUB){ toast("Ключ збережено."); return; }
  const accepted = await store.pushNow();
  toast(accepted ? "Ключ прийнято."
                 : "Ключ збережено, але записати не вдалося — перевір права токена.");
});
byId("tokenInput").addEventListener("keydown", (event) => {
  if(event.key === "Enter") byId("tokenSaveButton").click();
});
