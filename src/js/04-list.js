/* ── малювання ───────────────────────────────────── */
function render(){ оновитиСтрічки(); renderStats(); renderList(); renderCmp(); }

function renderStats(){
  const games = shelf();
  // «На полиці» — це те, що справді стоїть удома. Позбуті коробки й чужі
  // сюди не рахуються, хоч і лишаються в списку зі своїми оцінками.
  const свої = games.filter((g) => stats(g).indexOf("колекція") >= 0);
  const доповнень = свої.filter((g) => g.expansion).length;
  // Чужі коробки стоять поруч із числом полиці окремим доважком: пограти
  // в них можна, але твоїми вони не стали. Ті, що з «позбувся», сюди не
  // йдуть: це коробки, які друг уже продав, — пограти в них не вийде.
  const чужі = games.filter((g) => stats(g).indexOf("чужа") >= 0
                                && stats(g).indexOf("позбувся") < 0).length;
  // «Онлайн» рахує все, у що граєш онлайн, — і те, що стоїть удома теж.
  // Це не частка від полиці, а окреме питання «скільки ігор доступні
  // мені в мережі», тож перетин із «на полиці» тут доречний.
  const мережеві = games.filter((g) => stats(g).indexOf("онлайн") >= 0).length;
  const rated = games.filter((g) => g.score != null);
  const plays = games.reduce((s, g) => s + (+g.plays || 0), 0);
  $("stats").innerHTML =
    cell("Ігор на полиці", (свої.length - доповнень) +
      (доповнень ? " <small>+ " + доповнень + " доп.</small>" : "") +
      (чужі ? " <small>+ " + чужі + " чужих</small>" : "")) +
    // Порядок такий, щоб на телефоні у два стовпці «партій зіграно»
    // стало точно під «ігор на полиці»: обидва — про саму полицю,
    // а «онлайн» і «оцінено» — про те, що з нею робиться.
    cell("Ігор онлайн", мережеві) +
    cell("Партій зіграно", plays) +
    cell("Оцінено", rated.length + " <small>з " + games.length + "</small>");
  function cell(t, v){ return "<div><dt>" + t + "</dt><dd>" + v + "</dd></div>"; }
}

/** Скидає всі фільтри, пошук і приховані групи до типового. Сортування
    не чіпаємо: це не звуження полиці, а спосіб на неї дивитися. */
function скинутиФільтри(){
  ФІЛЬТРИ.forEach((ф) => { ui[ф.ключ] = ф.типово; });
  ui.hide.clear();
  renderFilters();
  renderHide();
  render();
}
/** Рядок над списком: скільки коробок видно й чому саме стільки.
    Фільтри тепер за кнопкою, тож кожне ввімкнене звуження стоїть тут
    плашкою — і знімається дотиком по ній. Плашки дістаються лише тим,
    що сховане в шухляді: пошук і указник за літерою видно й так. */
function renderFound(arr){
  const усього = games.length;
  // Поки полиця їде з бази, рахувати нічого: «0 коробок» злякало б дарма.
  $("found").hidden = !ready;
  if(!ready) return;
  const звужене = звуження();
  $("foundN").textContent = звужене.length
    ? arr.length + " " + plural(arr.length, "коробка", "коробки", "коробок") +
      " з " + усього
    : усього + " " + plural(усього, "коробка", "коробки", "коробок");
  $("pills").innerHTML = звужене.filter((з) => !з.місце).map((з) =>
    "<button class='pill' type='button' data-off='" + esc(з.вид) + ":" + esc(з.ключ) +
    "' title='Зняти'>" + esc(з.підпис) + ": " + esc(з.значення) +
    "<i aria-hidden='true'>✕</i></button>").join("");
  $("resetBtn").hidden = !звужене.length;
  paintFiltBtn();
}

/* ── список по частинах ───────────────────────────────────────────────
   Раніше кожен render() складав увесь список одним рядком HTML і клав
   його в innerHTML. При дев'яноста коробках це непомітно, при кількох
   сотнях — уже ні: набір слова в пошуку — це render() на кожну літеру,
   а render() — це створити наново всі рядки з усіма <img>.

   Тому вузли живуть далі, а перемальовується лише те, що змінилося.
   Ключ — id коробки. Ознака зміни — сам зліплений HTML рядка: у ньому
   вже є все, від чого рядок залежить (оцінки, статуси, позначка
   порівняння, поточний склад столу), тож окремого опису «що
   враховувати» не треба — а отже, нема чому й розійтися з дійсністю. */
const формочка = document.createElement("template");
function вузолЗ(html){
  формочка.innerHTML = html;
  const el = формочка.content.firstElementChild;
  el._html = html;
  return el;
}
/** Приводить дітей `вміст` до `arr`, чіпаючи лише те, що змінилося:
    зниклі прибирає, нові створює, наявні пересуває на місце. */
function поновити(вміст, arr, зліпити){
  const було = new Map();
  Array.prototype.forEach.call(вміст.children, (el) => {
    if(el.dataset.id) було.set(el.dataset.id, el);
  });
  let попередній = null;
  arr.forEach((g) => {
    const html = зліпити(g);
    let el = було.get(g.id);
    if(el){
      було.delete(g.id);
      // Рядок змінився — ліпимо новий цілком, а не вгадуємо, що саме
      // всередині поїхало: власного стану в рядку немає, губити нічого.
      if(el._html !== html){
        const новий = вузолЗ(html);
        вміст.replaceChild(новий, el);
        el = новий;
      }
    } else el = вузолЗ(html);
    const місце = попередній ? попередній.nextSibling : вміст.firstChild;
    if(el !== місце) вміст.insertBefore(el, місце);
    попередній = el;
  });
  // Зайве лишилося в мапі: його або прибрали з полиці, або відсіяв фільтр.
  було.forEach((el) => el.remove());
}

function renderList(){
  const list = $("list"), arr = visible();
  const сітка = ui.view === "grid";
  list.classList.toggle("grid", сітка);
  document.documentElement.style.setProperty("--pick", ui.cmp ? "26px" : "0px");
  $("hScore").textContent = ui.count === "all" ? "Оцінка" : "На " + CLABEL[ui.count];
  renderFound(arr);

  if(!ready){
    list.innerHTML = ""; $("headRow").hidden = true;
    show("Хвилинку", "Дістаю полицю з бази.");
    return;
  }
  $("headRow").hidden = arr.length === 0 || сітка;
  if(!arr.length){
    list.innerHTML = "";
    if(!games.length) show("Полиця порожня", "Натисни «Додати гру» — і почнеться.");
    else show("Нічого не підходить", "Спробуй інший склад столу, статус або пошук.");
    return;
  }
  $("blank").hidden = true;
  поновити(list, arr, сітка ? плитка : рядок);

  /* Спільне для обох виглядів: обкладинка, позначка порівняння й кнопка
     правил. Різниця між рядком і плиткою — у тому, скільки тексту навколо
     них, а не в тому, з чого вони складені. */
  function класи(g){
    // Позначки рядка йдуть від найтихішої до найгучнішої, бо саме в
    // такому порядку їх перекриває CSS: доповнення тихіше за те, чия
    // це взагалі коробка.
    return "s-" + esc(stats(g)[0] || "") + (g.expansion ? " exp" : "") +
      (stats(g).indexOf("чужа") >= 0 ? " other" : "") +
      (stats(g).indexOf("продаж") >= 0 ? " sale" : "") +
      (ui.picked.has(g.id) ? " picked" : "");
  }
  /** `поверх` лягає всередину обкладинки — так у плитці на ній тримається
      кутик з оцінкою BGG. Рядкові він не потрібен: там ця оцінка стоїть
      просто під твоєю. */
  function обкладинка(g, поверх){
    return "<span class='cov'>" + (g.cover
      ? "<img src='" + esc(посилання(g.cover)) + "' alt='' loading='lazy' referrerpolicy='no-referrer'>"
      : "<b>" + esc((g.name || "?").trim().charAt(0).toUpperCase()) + "</b>") +
      (поверх || "") + "</span>";
  }
  /* Оцінка BGG кутиком навпроти твоєї: твоя вгорі праворуч, чужа внизу
     ліворуч. Без неї плитка каже просто «8», і з двох метрів незрозуміло,
     чия то вісімка; у рядку вони стоять одна під одною й такого питання
     не виникає. */
  function бггКутик(g){
    return g.bggRating ? "<span class='cov-bgg'>BGG " + fmt(g.bggRating) + "</span>" : "";
  }
  function позначка(g){
    return ui.cmp
      ? "<label class='pick'><input type='checkbox' data-pick='" + esc(g.id) + "' " +
        (ui.picked.has(g.id) ? "checked" : "") + " aria-label='Порівняти " +
        esc(g.name) + "'></label>"
      : "<span class='pick'></span>";
  }
  // Швидкий виклик правил: суперечка за столом трапляється саме тоді,
  // коли лізти в картку ніколи.
  function кнопкаПравил(g){
    const перше = перші(g);
    if(!перше) return "<span class='rules-btn ghost'></span>";
    return "<a class='rules-btn' href='" + esc(посилання(перше.url)) + "' target='_blank'" +
      " rel='noopener noreferrer' title='" + esc(rules(g).map((п) =>
        ВИДИ_ПРАВИЛ[п.kind] || п.kind).join(" · ")) +
      "' aria-label='Правила: " + esc(g.name) + "'>П</a>";
  }
  function оцінка(g){
    const s = effScore(g);
    return "<div class='score " + band(s) + "'><span class='num" +
      (s == null ? " none" : "") + "'>" + (s == null ? "—" : fmt(s)) + "</span>" +
      "<span class='meter'><i style='width:" + (s == null ? 0 : s * 10) + "%'></i></span>" +
      (g.bggRating ? "<span class='bgg'>BGG " + fmt(g.bggRating) + "</span>" : "") + "</div>";
  }

  function рядок(g){
    const разом = withNames(g);
    const meta = [];
    const назви = statNames(g);
    if(назви.length) meta.push(назви.join(" · "));
    // Родина плюс перші три ключові жанри. Усі двадцять два в рядок не
    // влазять і не мусять — решта чекає в картці.
    const рід = familyNames(g).concat(keyGenreNames(g).slice(0, 3));
    if(рід.length) meta.push(рід.join(" · "));
    const хто = playersText(g); if(хто) meta.push(хто);
    const коли = timeText(g); if(коли) meta.push(коли);
    if(g.plays){
      // Дата останньої партії стоїть тут же, при лічильнику: заради неї
      // журнал і заводили, а окремої колонки вона не варта.
      const коли = остання(g);
      meta.push(g.plays + " " + plural(g.plays, "партія", "партії", "партій") +
        (коли ? ", востаннє " + датаКоротко(коли) : ""));
    }
    const вага = складність(g); if(вага) meta.push("складність " + fmt(вага));
    if(g.tags && g.tags.length) meta.push(g.tags.join(" · "));
    // У рядку — тільки ті склади, за які оцінка вже стоїть. Порожні
    // клітинки з'їдали половину ширини й відсували назву гри; решта
    // складів чекає в картці, і щойно там з'явиться оцінка — клітинка
    // сама вигулькне тут.
    const cells = ratedCounts(g).map((c) => {
      const v = g.byCount[c];
      return "<span class='cnt " + band(v) + (ui.count === c ? " now" : "") +
        "'><b>" + fmt(v) + "</b><i>" + esc(countLabel(g, c)) + "</i></span>";
    }).join("");
    // Крапка біля назви фарбується за першим статусом — він же найважливіший.
    return "<li class='row " + класи(g) + "' data-id='" + esc(g.id) + "'>" +
      позначка(g) + обкладинка(g) +
      "<button class='open' data-open='" + esc(g.id) + "'>" +
        "<span class='nm'><i class='dot'></i><span class='txt'>" + esc(g.name) + "</span>" +
          (g.expansion ? "<span class='badge'>доп.</span>" : "") +
          (разом.length ? "<span class='badge plus' title='Завжди з: " + esc(разом.join(", ")) +
            "'>+" + разом.length + " доп.</span>" : "") + "</span>" +
        (g.nameEn ? "<span class='alt'>" + esc(g.nameEn) + "</span>" : "") +
        "<span class='meta'>" + esc(meta.filter(Boolean).join(" · ")) + "</span>" +
        (g.comment ? "<span class='note'>" + esc(g.comment) + "</span>" : "") +
      "</button>" +
      кнопкаПравил(g) +
      "<div class='counts'>" + cells + "</div>" +
      // Оцінка BGG живе в колонці оцінки, а не в кінці рядка метаданих:
      // там її з'їдало обрізання, щойно перед нею набиралося досить тексту.
      // Тут вона стоїть просто під твоєю оцінкою — і видно, чи ви згодні.
      оцінка(g) +
    "</li>";
  }

  /* Плитка: обкладинка на всю ширину, оцінка кутиком на ній, назва під
     нею — і більше нічого. Решта дізнається дотиком по самій плитці.
     Саме тому все, крім назви, лежить поверх обкладинки: інакше «мінімум
     тексту» перетворюється на той самий рядок, лише вужчий. */
  function плитка(g){
    return "<li class='tile " + класи(g) + "' data-id='" + esc(g.id) + "'>" +
      "<button class='open' data-open='" + esc(g.id) + "' title='" + esc(g.name) + "'>" +
        обкладинка(g, бггКутик(g)) +
        "<span class='nm'><i class='dot'></i><span class='txt'>" + esc(g.name) + "</span>" +
          (g.expansion ? "<span class='badge'>доп.</span>" : "") + "</span>" +
      "</button>" +
      оцінка(g) + кнопкаПравил(g) + позначка(g) +
    "</li>";
  }

  function show(t, sub){
    const el = $("blank"); el.hidden = false;
    el.innerHTML = "<b>" + t + "</b>" + sub;
  }
}

