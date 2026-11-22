/* ── «Що зіграти?» ────────────────────────────────────────────────────
   Полиця відповідає на «що в мене є». Вечір питає інше: нас троє, маємо
   годину — діставати що? Фільтри на це відповідають списком із двадцяти
   коробок, а з двадцяти вибирати так само важко, як із дев'яноста.

   Тому тут не фільтр, а жереб: кілька коробок, які підходять саме зараз.
   Сам жереб — кандидати, ваги, витягування — живе у «02-filters.js»
   разом з рештою вибірки: там його перевіряють тести. Тут лишилося
   тільки те, що чіпає сторінку. */

const evening = defaultEvening();
const ANY_EVENING_OPTION = [ANY, "байдуже"];

/* Питання вечора: кожне — стрічка в діалозі й поле в `evening`. */
const EVENING_QUESTIONS = [
  {elementId: "lotteryPlayerCount", field: "playerCount", label: "Нас",
   options: () => [ANY_EVENING_OPTION].concat(
     PLAYER_COUNTS.map((count) => [count, PLAYER_COUNT_LABELS[count]]))},
  // Кошики часу ті самі, що у фільтрі: інакше «до години» тут і там
  // означало б різне.
  {elementId: "lotteryDuration", field: "duration", label: "Часу",
   options: () => filterByKey("duration").options(store.games)
     .map((option) => (option[0] === ANY ? ANY_EVENING_OPTION : option))},
];
function renderEveningQuestions(){
  EVENING_QUESTIONS.forEach((question) => {
    byId(question.elementId).innerHTML = "<span>" + escapeHtml(question.label) + "</span>" +
      stripButtonsHtml(question.options(), evening[question.field]);
  });
}
function lotteryCandidateHtml(game){
  return "<div class='cand'>" +
    "<span class='cov'>" + coverImageHtml(game, true) + "</span>" +
    "<span class='what'><b>" + escapeHtml(game.name) + "</b>" +
    "<span class='why'>" + escapeHtml([playersText(game), durationText(game), lastPlayedText(game)]
      .filter(Boolean).join(" · ")) + "</span></span>" +
    // Своя оцінка й чужа — стовпчиком, як у списку: коли збираєшся
    // грати іншою компанією, чужа середня важить не менше за свою.
    "<span class='cand-score'><span class='num " + scoreBandClass(game.score) + "'>" +
    (game.score == null ? "—" : formatNumber(game.score)) + "</span>" +
    (game.bggRating ? "<span class='bgg'>BGG " + formatNumber(game.bggRating) + "</span>" : "") +
    "</span>" +
    "<span class='cand-do'>" +
    "<button class='btn' data-record-play='" + escapeHtml(game.id) + "' type='button'>+ партія</button>" +
    "<button class='link' data-open-game='" + escapeHtml(game.id) + "' type='button'>картка</button>" +
    "</span></div>";
}
function renderLotteryResults(drawn, poolSize){
  byId("lotteryResults").innerHTML = drawn.length
    ? drawn.map(lotteryCandidateHtml).join("")
    : "<p class='hint'>Під такий стіл нічого не підходить. Спробуй інший склад " +
      "чи більше часу — або зазирни в те, що вже грали цими днями.</p>";
  byId("lotteryPoolNote").textContent = poolSize
    ? "жереб із " + poolSize + " " + pluralize(poolSize, "коробки", "коробок", "коробок")
    : "";
}
function rollLottery(){
  const candidates = lotteryCandidates(store.games, evening);
  renderLotteryResults(drawLottery(candidates), candidates.length);
}
function openLotteryDialog(){
  renderEveningQuestions();
  rollLottery();
  openModal("lotteryDialog");
}
function closeLotteryDialog(){ closeModal("lotteryDialog"); }

/* Значок — гральна кістка: питання «що діставати» саме таке. */
byId("lotteryButton").innerHTML =
  "<svg viewBox='0 0 16 16' width='15' height='15' fill='currentColor' aria-hidden='true'>" +
  "<rect x='1' y='1' width='14' height='14' rx='3.5' fill='none' stroke='currentColor'" +
  " stroke-width='1.4'/><circle cx='5' cy='5' r='1.35'/><circle cx='8' cy='8' r='1.35'/>" +
  "<circle cx='11' cy='11' r='1.35'/></svg>";
byId("lotteryButton").title = "Що зіграти? — жереб із того, що підходить";
byId("lotteryButton").setAttribute("aria-label", "Що зіграти?");
byId("lotteryButton").addEventListener("click", openLotteryDialog);
byId("menuLottery").addEventListener("click", openLotteryDialog);
byId("lotteryCloseButton").addEventListener("click", closeLotteryDialog);
byId("lotteryRerollButton").addEventListener("click", rollLottery);

byId("lotteryDialog").addEventListener("click", (event) => {
  const answer = event.target.closest("[data-value]");
  if(answer){
    const question = EVENING_QUESTIONS.find((each) => each.elementId === answer.parentNode.id);
    if(question){
      evening[question.field] = answer.dataset.value;
      renderEveningQuestions();
      rollLottery();
    }
    return;
  }
  const opener = event.target.closest("[data-open-game]");
  if(opener){
    closeLotteryDialog();
    openCard(opener.dataset.openGame);
    return;
  }
  // Записати партію просто звідси: коробку витягли зі столу за цією
  // підказкою, і йти по «+» у картку заради одного дотику — зайве.
  const recordButton = event.target.closest("[data-record-play]");
  if(!recordButton) return;
  const game = store.findGame(recordButton.dataset.recordPlay);
  if(!game || !ensureEditable()) return;
  addPlay(game);
  touchUpdated(game);
  renderAll();
  store.saveGames([game]);
  toast("«" + game.name + "» — партію записано.");
  rollLottery();
});
