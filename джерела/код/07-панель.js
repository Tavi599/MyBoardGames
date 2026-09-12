/* ── панель керування ────────────────────────────── */
$("q").addEventListener("input", (e) => { ui.q = e.target.value; render(); });
$("fStatus").addEventListener("change", (e) => { ui.status = e.target.value; render(); });
$("fSort").addEventListener("change", (e) => { ui.sort = e.target.value; render(); });
$("fFlip").addEventListener("click", function(){
  ui.rev = !ui.rev;
  this.textContent = ui.rev ? "↑" : "↓";
  this.title = ui.sort === "name"
    ? (ui.rev ? "Я → А" : "А → Я")
    : (ui.rev ? "від меншого" : "від більшого");
  render();
});
$("segCount").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if(!b) return;
  ui.count = b.dataset.c;
  Array.prototype.forEach.call($("segCount").querySelectorAll("button"),
    (x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
  render();
});
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

