/* ── панель керування ────────────────────────────── */

/** Малює фільтри з реєстру. Жодного фільтра тут не названо поіменно:
    щоб додати новий, досить дописати об'єкт у ФІЛЬТРИ. */
function renderFilters(){
  $("filters").innerHTML = ФІЛЬТРИ.map((ф) => {
    const v = ui[ф.ключ];
    if(ф.вид === "пошук"){
      return "<div class='fld'><input type='search' data-ф='" + esc(ф.ключ) +
        "' value='" + esc(v) + "' placeholder='" + esc(ф.держак || "Пошук") +
        "' aria-label='" + esc(ф.держак || "Пошук") + "'></div>";
    }
    if(ф.вид === "стрічка"){
      return "<div class='seg' data-ф='" + esc(ф.ключ) + "' role='group' aria-label='" +
        esc(ф.підпис) + "'><span>" + esc(ф.підпис) + "</span>" +
        ф.варіанти().map(([знач, підпис]) =>
          "<button data-v='" + esc(знач) + "' aria-pressed='" +
          (v === знач ? "true" : "false") + "'>" + esc(підпис) + "</button>").join("") +
        "</div>";
    }
    const ід = "f-" + ф.ключ;
    return "<div class='fld'><label for='" + ід + "'>" + esc(ф.підпис) + "</label>" +
      "<select id='" + ід + "' data-ф='" + esc(ф.ключ) + "'>" +
      ф.варіанти().map(([знач, підпис]) =>
        "<option value='" + esc(знач) + "'" + (v === знач ? " selected" : "") + ">" +
        esc(підпис) + "</option>").join("") + "</select></div>";
  }).join("");
}

/** Один обробник на всі фільтри: клік по стрічці, зміна списку, набір у пошуку. */
function поставити(ключ, знач){
  ui[ключ] = знач;
  // Перемальовуємо лише стрічку — вона показує стан кнопками. Список і поле
  // пошуку тримають вибране самі, а повна перемальовка щоразу висмикувала б
  // фокус із віджета просто посеред роботи.
  const стрічка = $("filters").querySelector(".seg[data-ф='" + ключ + "']");
  if(стрічка){
    Array.prototype.forEach.call(стрічка.querySelectorAll("button"), (b) =>
      b.setAttribute("aria-pressed", b.dataset.v === знач ? "true" : "false"));
  }
  render();
}
$("filters").addEventListener("input", (e) => {
  const el = e.target.closest("input[data-ф]"); if(!el) return;
  // Пошук перемальовувати не можна — фокус вискочить із поля посеред слова.
  ui[el.dataset["ф"]] = el.value;
  render();
});
$("filters").addEventListener("change", (e) => {
  const el = e.target.closest("select[data-ф]"); if(!el) return;
  поставити(el.dataset["ф"], el.value);
});
$("filters").addEventListener("click", (e) => {
  const b = e.target.closest(".seg[data-ф] button"); if(!b) return;
  поставити(b.closest(".seg").dataset["ф"], b.dataset.v);
});

$("fSort").innerHTML = СОРТУВАННЯ.map((с) =>
  "<option value='" + esc(с.ключ) + "'>" + esc(с.підпис) + "</option>").join("");
$("fSort").value = ui.sort;
$("fSort").addEventListener("change", (e) => { ui.sort = e.target.value; підказка(); render(); });
$("fFlip").addEventListener("click", function(){
  ui.rev = !ui.rev;
  підказка();
  render();
});
/** Стрілка й підказка мають казати правду про поточне сортування. */
function підказка(){
  const с = СОРТУВАННЯ.find((x) => x.ключ === ui.sort) || СОРТУВАННЯ[0];
  const вниз = с.спадання !== !!ui.rev;
  $("fFlip").textContent = ui.rev ? "↑" : "↓";
  $("fFlip").title = с.текст && !с.спадання
    ? (ui.rev ? "Я → А" : "А → Я")
    : (вниз ? "від більшого" : "від меншого");
}
renderFilters();
підказка();
$("expBtn").addEventListener("click", function(){
  ui.noExp = !ui.noExp;
  this.setAttribute("aria-pressed", ui.noExp ? "true" : "false");
  this.textContent = ui.noExp ? "Показати доповнення" : "Без доповнень";
  render();
});
$("cWith").addEventListener("change", (e) => {
  const el = e.target.closest("[data-exp]"); if(!el) return;
  const g = current(); if(!g) return;
  if(!canEdit()){ el.checked = !el.checked; return; }
  tie(g, el.dataset.exp, el.checked);
});
/** Прив'язати або відв'язати доповнення й перемалювати чипи. */
function tie(g, id, треба){
  const набір = new Set(g.withExp || []);
  if(треба) набір.add(id); else набір.delete(id);
  g.withExp = Array.from(набір).sort();
  if(!g.withExp.length) delete g.withExp;
  renderWith(g);
  render();
  touch();
}
$("cTied").addEventListener("click", (e) => {
  const b = e.target.closest("[data-untie]"); if(!b) return;
  const g = current(); if(!g || !canEdit()) return;
  tie(g, b.dataset.untie, false);
});
$("cWithAdd").addEventListener("click", () => {
  const відкрито = $("cWithPick").hidden;
  $("cWithPick").hidden = !відкрито;
  $("cWithAdd").setAttribute("aria-expanded", відкрито ? "true" : "false");
  if(відкрито) $("cWithQ").focus();
});
$("cWithQ").addEventListener("input", () => {
  const g = current(); if(g) renderPick(g);
});
$("cExp").addEventListener("click", function(){
  const g = current(); if(!g) return;
  if(!canEdit()) return;
  g.expansion = !g.expansion;
  if(!g.expansion) delete g.expansion;
  this.setAttribute("aria-pressed", g.expansion ? "true" : "false");
  touch();
});
$("cmpBtn").addEventListener("click", function(){
  ui.cmp = !ui.cmp;
  this.setAttribute("aria-pressed", ui.cmp ? "true" : "false");
  if(!ui.cmp) ui.picked.clear();
  render();
});
$("list").addEventListener("click", (e) => {
  const o = e.target.closest("[data-open]");
  if(o){ openCard(o.dataset.open); return; }
});
$("list").addEventListener("change", (e) => {
  const p = e.target.closest("[data-pick]"); if(!p) return;
  const id = p.dataset.pick;
  if(p.checked){
    if(ui.picked.size >= 4){ p.checked = false; toast("Більше чотирьох поруч уже не читається."); return; }
    ui.picked.add(id);
  } else ui.picked.delete(id);
  render();
});
$("lockedKey").addEventListener("click", openKey);
$("addBtn").addEventListener("click", async () => {
  if(!canEdit()) return;
  const g = Object.assign(blank(""), {id:newId()});
  games.push(g);
  if(!db) localSave();
  render(); openCard(g.id);
  if(db) await persist(g);
});

