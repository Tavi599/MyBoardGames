"use strict";
const COUNTS = ["2","3","4","5"];
const CLABEL = {"2":"2","3":"3","4":"4","5":"5+"};
const STATUS = {"хочу":"хочу зіграти","колекція":"у колекції","улюблена":"улюблена",
                "онлайн":"лише онлайн","відклав":"відклав","позбувся":"позбувся"};
// Похідний статус: його не ставлять руками, він випливає з лічильника партій
// і сам зникає після першої зіграної. Тримати його окремо від STATUS, щоб
// він ніколи не потрапив у збережені дані.
const AUTO = {"незіграна":"ще не зіграна"};
const LABEL = Object.assign({}, STATUS, AUTO);
const LSKEY = "polytsia.games.v1";

const SEED = ["Картографи","Magic Maze","Planet B","Unmatched: Битва легенд, ч. 2",
  "Кіт у коробці","Інорі","Голем","Земля","Зомбі-кошенята","Мандалорець","Палео",
  "Сплячі боги 2","Темна гавань: Гудзики та мурахи","Темна гавань: Щелепи лева",
  "Тоскана","Ходу героям нема"];

let games = [];
let db = null;
let ready = false;
// Поля фільтрів сюди дописує реєстр із «03-вибірка.js» — щоб типове
// значення кожного фільтра жило в одному місці, а не в двох.
const ui = {sort:"score", rev:false, noExp:false, cmp:false,
            picked:new Set(), open:null};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));

function band(v){ return v == null ? "" : v <= 3 ? "b-low" : v <= 6 ? "b-mid" : v <= 8 ? "b-good" : "b-top"; }
/** 6.5 → «6,5», 7 → «7». Кома, бо українською десяткова кома. */
function fmt(v){ return v == null ? "" : String(v).replace(".", ","); }
function blank(name){
  return {name:name, statuses:["колекція"], status:"колекція",
          minP:null, maxP:null, minutes:null, weight:null,
          plays:0, score:null, byCount:{}, tags:[], comment:"",
          added:new Date().toISOString().slice(0,10), updated:new Date().toISOString()};
}
function stamp(g){ g.updated = new Date().toISOString(); return g; }

/** Статусів у коробки може бути кілька. Записи давнішого зразка тримали
    рівно один — у полі `status`; читаємо і їх. */
function stats(g){
  if(Array.isArray(g.statuses)) return g.statuses;
  return g.status ? [g.status] : [];
}
/** Порядок статусів завжди той самий, що в STATUS, — щоб рядок у списку
    не стрибав від того, в якій послідовності їх натискали.
    `status` лишаємо дзеркалом першого: його ще читає сторінка, що встигла
    закешуватися на телефоні до цієї зміни. */
function setStats(g, набір){
  g.statuses = Object.keys(STATUS).filter((k) => набір.has(k));
  if(g.statuses.length) g.status = g.statuses[0]; else delete g.status;
}
function autoStats(g){ return g.plays > 0 ? [] : ["незіграна"]; }
function allStats(g){ return stats(g).concat(autoStats(g)); }
function statNames(g){ return allStats(g).map((k) => LABEL[k] || k); }
function newId(){ return "g-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,6); }

