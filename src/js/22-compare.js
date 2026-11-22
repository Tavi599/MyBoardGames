/* ── порівняння ───────────────────────────────────────────────────── */

const EMPTY_CELL = "<span style='color:var(--rule)'>—</span>";
const EMPTY_SCORE_CELL = "<b style='color:var(--rule)'>—</b>";

/** Рядки таблиці: {label, value(game), isScore}. Оцінки малюються смужкою
    й змагаються за «найкращу», решта — просто текст. */
function comparisonRows(games){
  // Рядок на кожен склад столу показуємо тільки тоді, коли бодай одна
  // з обраних коробок має там оцінку: інакше таблиця на чотири гри
  // здебільшого складається з прочерків.
  const ratedCounts = PLAYER_COUNTS.filter((count) =>
    games.some((game) => scoreForCount(game, count) != null));
  const scoreRows = [{label: "Загальна", value: (game) => game.score, isScore: true}]
    .concat(ratedCounts.map((count) => ({
      label: "На " + PLAYER_COUNT_LABELS[count],
      value: (game) => scoreForCount(game, count),
      isScore: true,
    })));
  const textRow = (label, value) => ({label: label, value: value, isScore: false});
  return scoreRows.concat([
    textRow("Оцінка BGG", (game) => (game.bggRating != null ? formatNumber(game.bggRating) : null)),
    textRow("Тип коробки", (game) => (game.expansion ? "доповнення" : "основна")),
    textRow("Завжди з", (game) => linkedExpansionNames(game, store.games).join(", ")),
    textRow("Складність", weightOf),
    textRow("Партій", playCount),
    textRow("Востаннє", (game) => (lastPlayedOn(game) ? formatShortDate(lastPlayedOn(game)) : "")),
    textRow("Гравців", playersText),
    textRow("Найкраще на", (game) => formatRanges(game.bggBest)),
    textRow("Годиться на", (game) => formatRanges(game.bggRec)),
    textRow("Час", durationText),
    textRow("Статус", (game) => statusLabels(game).join(", ")),
    textRow("Теги", (game) => (game.tags || []).join(", ")),
    textRow("Нотатка", (game) => game.comment),
  ]);
}
function scoreCellsHtml(scores){
  const best = Math.max.apply(null, scores.map((score) => (score == null ? -1 : score)));
  // «Найкраща» має сенс, лише коли хтось справді попереду: якщо в усіх
  // однаково, виділяти нікого.
  const everyoneBest = scores.filter((score) => score === best).length === scores.length;
  return scores.map((score) => {
    const isBest = score != null && score === best && best > 0 && !everyoneBest;
    return "<td class='v " + scoreBandClass(score) + (isBest ? " best" : "") + "'>" +
      (score == null ? EMPTY_SCORE_CELL
        : "<b>" + formatNumber(score) + "</b><span class='bar'><i style='width:" +
          score * 10 + "%'></i></span>") + "</td>";
  }).join("");
}
function textCellsHtml(values){
  return values.map((value) =>
    "<td>" + (value == null || value === "" ? EMPTY_CELL : escapeHtml(value)) + "</td>").join("");
}

function renderComparison(){
  const box = byId("comparison");
  const games = store.games.filter((game) => view.compared.has(game.id)).slice(0, MAX_COMPARED);
  if(!view.comparing || games.length < 2){
    box.innerHTML = view.comparing
      ? "<p class='hint' style='padding:14px 4px 0'>Познач дві–чотири гри, щоб побачити їх поруч.</p>"
      : "";
    return;
  }
  const body = comparisonRows(games).map((row) => {
    const values = games.map(row.value);
    return "<tr><th scope='row'>" + row.label + "</th>" +
      (row.isScore ? scoreCellsHtml(values) : textCellsHtml(values)) + "</tr>";
  }).join("");
  box.innerHTML =
    "<section class='cmp'><div class='cmp-head'><h2>Поруч на столі</h2>" +
    "<button class='btn' data-clear-compared>Зняти позначки</button></div>" +
    "<div class='cmp-scroll'><table><thead><tr><th></th>" +
    games.map((game) => "<th>" + escapeHtml(game.name) + "</th>").join("") +
    "</tr></thead><tbody>" + body + "</tbody></table></div></section>";
}
byId("comparison").addEventListener("click", (event) => {
  if(!event.target.closest("[data-clear-compared]")) return;
  view.compared.clear();
  renderAll();
});
