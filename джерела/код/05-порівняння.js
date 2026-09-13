/* ── порівняння ──────────────────────────────────── */
function renderCmp(){
  const box = $("cmpBox");
  const picked = games.filter((g) => ui.picked.has(g.id));
  if(!ui.cmp || picked.length < 2){
    box.innerHTML = ui.cmp
      ? "<p class='hint' style='padding:14px 4px 0'>Познач дві–чотири гри, щоб побачити їх поруч.</p>"
      : "";
    return;
  }
  const gs = picked.slice(0, 4);
  // Рядок на кожен склад столу показуємо тільки тоді, коли бодай одна
  // з обраних коробок має там оцінку: інакше таблиця на чотири гри
  // здебільшого складається з прочерків.
  const склади = COUNTS.filter((c) => gs.some((g) => pick(g, c) != null));
  const rows = [
    ["Загальна", (g) => g.score, true],
  ].concat(склади.map((c) => ["На " + CLABEL[c], (g) => pick(g, c), true])).concat([
    ["Оцінка BGG", (g) => (g.bggRating != null ? fmt(g.bggRating) : null), false],
    ["Тип коробки", (g) => (g.expansion ? "доповнення" : "основна"), false],
    ["Завжди з", (g) => withNames(g).join(", "), false],
    ["Складність", (g) => складність(g), false],
    ["Партій", (g) => g.plays || 0, false],
    ["Востаннє", (g) => (остання(g) ? датаКоротко(остання(g)) : ""), false],
    ["Гравців", (g) => playersText(g), false],
    ["Найкраще на", (g) => ranges(g.bggBest), false],
    ["Годиться на", (g) => ranges(g.bggRec), false],
    ["Час", (g) => timeText(g), false],
    ["Статус", (g) => statNames(g).join(", "), false],
    ["Теги", (g) => (g.tags || []).join(", "), false],
    ["Нотатка", (g) => g.comment, false]
  ]);
  function pick(g, c){ return g.byCount ? g.byCount[c] : null; }

  const body = rows.map((r) => {
    const vals = gs.map(r[1]);
    const best = r[2] ? Math.max.apply(null, vals.map((v) => (v == null ? -1 : v))) : -1;
    const tds = vals.map((v) => {
      if(r[2]){
        const cls = band(v) + (v != null && v === best && best > 0 && vals.filter((x) => x === best).length < gs.length ? " best" : "");
        return "<td class='v " + cls + "'>" + (v == null ? "<b style='color:var(--rule)'>—</b>" :
          "<b>" + fmt(v) + "</b><span class='bar'><i style='width:" + v * 10 + "%'></i></span>") + "</td>";
      }
      return "<td>" + (v == null || v === "" ? "<span style='color:var(--rule)'>—</span>" : esc(v)) + "</td>";
    }).join("");
    return "<tr><th scope='row'>" + r[0] + "</th>" + tds + "</tr>";
  }).join("");

  $("cmpBox").innerHTML =
    "<section class='cmp'><div class='cmp-head'><h2>Поруч на столі</h2>" +
    "<button class='btn' id='cmpClear'>Зняти позначки</button></div>" +
    "<div class='cmp-scroll'><table><thead><tr><th></th>" +
    gs.map((g) => "<th>" + esc(g.name) + "</th>").join("") +
    "</tr></thead><tbody>" + body + "</tbody></table></div></section>";
  $("cmpClear").onclick = () => { ui.picked.clear(); render(); };
}

