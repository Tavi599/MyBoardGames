/* ── оболонка сторінки ────────────────────────────────────────────────
   Те, чим користуються всі частини сторінки: сповіщення, плашка сховища,
   діалоги зі спільною підкладкою, меню «···» і клавіша Escape. */

const TOAST_MS = 3600;
let toastTimer = null;
function toast(message){
  let node = document.querySelector(".toast");
  if(!node){
    node = document.createElement("div");
    node.className = "toast";
    node.setAttribute("role", "status");
    document.body.appendChild(node);
  }
  node.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.remove(), TOAST_MS);
}

/** Чи можна зараз щось міняти. Якщо бракує ключа — одразу показуємо, куди
    його поставити: інакше правку довелося б прийняти й тихо загубити. */
function ensureEditable(){
  if(store.isReadOnly()){ openTokenDialog(); return false; }
  return true;
}

/* ── плашка «де зберігаються оцінки» ──────────────────────────────── */
function storageBadgeState(){
  const waiting = store.queueLength;
  if(store.mode === STORAGE_MODE.GITHUB){
    if(store.isReadOnly()){
      return {tone: "", text: "тільки читання",
              title: "Без ключа доступу оцінки видно, але змінити їх не вийде. «···» → «Ключ доступу»"};
    }
    if(waiting){
      return {tone: "wait", text: "чекає " + waiting,
              title: waiting + " змін ще не в репозиторії — відправлю, щойно буде зв'язок"};
    }
    return {tone: "ok", text: "github",
            title: "Кожне збереження лягає комітом у " + store.repoName};
  }
  if(store.mode === STORAGE_MODE.SERVER){
    return waiting
      ? {tone: "wait", text: "чекає " + waiting,
         title: waiting + " змін чекають на зв'язок із сервером — не закривай сторінку надовго"}
      : {tone: "ok", text: "сервер",
         title: "Оцінки лежать в «ratings.json» на комп'ютері й комітяться в git"};
  }
  if(store.mode === STORAGE_MODE.CLOUD){
    return {tone: "ok", text: "хмара", title: "Оцінки в базі опублікованої сторінки"};
  }
  return {tone: "", text: "ця копія",
          title: "Окрема копія в пам'яті цього браузера. Щоб потрапила в основну базу — експортуй JSON"};
}
function renderStorageBadge(){
  const state = storageBadgeState();
  const badge = byId("storageBadge");
  badge.className = "chip" + (state.tone ? " " + state.tone : "");
  badge.textContent = state.text;
  badge.title = state.title;
  byId("readOnlyNotice").hidden = !store.isReadOnly();
}

/* ── діалоги ──────────────────────────────────────────────────────────
   Ключ доступу, оцінки BGG і «Що зіграти?» ділять одну підкладку. Раніше
   кожен ховав її сам і мусив перевіряти, чи не відкритий хтось із сусідів;
   тепер підкладку тримає одне місце й ховає її, коли закрито останній. */
const MODAL_IDS = ["bggDialog", "tokenDialog", "lotteryDialog"];
function openModal(id){
  hideMenu();
  byId("dialogScrim").hidden = false;
  byId(id).hidden = false;
}
function closeModal(id){
  byId(id).hidden = true;
  byId("dialogScrim").hidden = MODAL_IDS.every((modalId) => byId(modalId).hidden);
}
function closeAllModals(){ MODAL_IDS.forEach(closeModal); }
/** Найвищий відкритий діалог або null. */
function openModalId(){ return MODAL_IDS.find((id) => !byId(id).hidden) || null; }
byId("dialogScrim").addEventListener("click", closeAllModals);

/* ── меню «···» ───────────────────────────────────────────────────── */
function hideMenu(){
  byId("menu").hidden = true;
  byId("menuButton").setAttribute("aria-expanded", "false");
}
byId("menuButton").addEventListener("click", (event) => {
  event.stopPropagation();
  const menu = byId("menu");
  menu.hidden = !menu.hidden;
  byId("menuButton").setAttribute("aria-expanded", menu.hidden ? "false" : "true");
});
document.addEventListener("click", (event) => {
  if(!byId("menu").hidden && !event.target.closest(".menu-wrap")) hideMenu();
});

/* Escape закриває те, що лежить найвище: діалог, шухляду фільтрів,
   картку, меню — по одному за натискання. */
document.addEventListener("keydown", (event) => {
  if(event.key !== "Escape") return;
  const modalId = openModalId();
  if(modalId) closeModal(modalId);
  else if(!byId("filtersDrawer").hidden) closeFiltersDrawer();
  else if(view.openGameId) closeCard();
  else if(!byId("menu").hidden) hideMenu();
});

/* Спільні шматки розмітки для списку, жеребу й картки. */

/** Обкладинка або, коли її немає, перша літера назви. */
function coverImageHtml(game, lazy){
  return game.cover
    ? "<img src='" + escapeHtml(safeUrl(game.cover)) + "' alt=''" +
      (lazy ? " loading='lazy'" : "") + " referrerpolicy='no-referrer'>"
    : "<b>" + escapeHtml(nameInitial(game)) + "</b>";
}
/** Кнопки стрічки: [[значення, підпис], …] з позначкою на вибраному. */
function stripButtonsHtml(options, selected){
  return options.map(([value, label]) =>
    "<button data-value='" + escapeHtml(value) + "' aria-pressed='" +
    (selected === value ? "true" : "false") + "'>" + escapeHtml(label) + "</button>").join("");
}
function selectOptionsHtml(options, selected){
  return options.map(([value, label]) =>
    "<option value='" + escapeHtml(value) + "'" + (selected === value ? " selected" : "") +
    ">" + escapeHtml(label) + "</option>").join("");
}
