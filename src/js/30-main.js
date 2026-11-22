/* ── запуск ───────────────────────────────────────────────────────────
   Єдине місце, де сховище зустрічається зі сторінкою: сховище повідомляє,
   що змінилося, а сторінка перемальовує себе. Більше вони одне про одного
   не знають. */

/** Перемальовує все, що залежить від полиці й стану перегляду. Картку не
    чіпає: у ній набирають текст, і перемальовування збило б курсор. */
function renderAll(){
  refreshStripOptions();
  renderSummary();
  renderList();
  renderComparison();
}

store.subscribe((event) => {
  if(event.type === "message"){ toast(event.text); return; }
  renderStorageBadge();
  renderAll();
  // Коробку могли прибрати з іншого пристрою, поки тут відкрита її картка.
  if(view.openGameId && !openGame()) closeCard();
});

renderFilterPanel();
renderSortDirection();
renderLayoutButton();
store.start();
