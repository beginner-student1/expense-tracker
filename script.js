/* =========================================================
   LEDGER — data model
   Each entry: { id, date, type: "expense"|"income", cat (expense only), amt, note }
   "savings" is an expense category but is never counted as spent.
   Reuses the old storage key so existing expense history isn't lost;
   old entries (no "type") are treated as expenses.
   ========================================================= */

const KEY = "ledger_data";
const CATS = [
  ["daily", "Daily", "#5B5FEF"], ["groceries", "Groceries", "#22A06B"],
  ["rent", "Rent", "#3F72AF"], ["food", "Food", "#E4573D"],
  ["savings", "Savings", "#0F9B8E"], ["other", "Other", "#8A8F98"],
];

let data = JSON.parse(localStorage.getItem(KEY) || "[]");
data.forEach(e => { if (!e.type) e.type = "expense"; }); // migrate old entries

const save = () => localStorage.setItem(KEY, JSON.stringify(data));

// ---------- helpers ----------
const inr = n => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const catInfo = id => CATS.find(c => c[0] === id) || CATS[CATS.length - 1];
const isIncome = e => e.type === "income";
const isSaving = e => e.type === "expense" && e.cat === "savings";
const isSpend = e => e.type === "expense" && e.cat !== "savings";
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const monthOf = dateStr => dateStr.slice(0, 7);

function aggregateMonth(month) {
  const list = data.filter(e => monthOf(e.date) === month);
  return {
    list,
    earned: list.filter(isIncome).reduce((s, e) => s + e.amt, 0),
    spent: list.filter(isSpend).reduce((s, e) => s + e.amt, 0),
    saved: list.filter(isSaving).reduce((s, e) => s + e.amt, 0),
    get left() { return this.earned - this.spent; },
  };
}

function allMonths() {
  return [...new Set(data.map(e => monthOf(e.date)))].sort().reverse();
}

// one row of markup, used both for "Today" and "all entries this month"
function entryRow(e) {
  if (isIncome(e)) {
    return `<div class="row">
      <span class="dot" style="background:${'#22A06B'}"></span>
      <span class="name">${e.note || "Income"}</span>
      <span class="cat">Income</span>
      <span class="amt pos">+${inr(e.amt)}</span>
      <button class="del" data-id="${e.id}">✕</button>
    </div>`;
  }
  const c = catInfo(e.cat);
  return `<div class="row">
    <span class="dot" style="background:${c[2]}"></span>
    <span class="name">${e.note || c[1]}</span>
    <span class="cat">${c[1]}</span>
    <span class="amt">−${inr(e.amt)}</span>
    <button class="del" data-id="${e.id}">✕</button>
  </div>`;
}

function wireDeletes(container) {
  container.querySelectorAll(".del").forEach(b =>
    b.addEventListener("click", () => del(b.dataset.id))
  );
}

// ---------- DOM refs ----------
const catSelect = document.getElementById("f-cat");
CATS.forEach(([id, label]) => catSelect.add(new Option(label, id)));

const dateInput = document.getElementById("f-date");
const amtInput = document.getElementById("f-amt");
const noteInput = document.getElementById("f-note");
const catField = document.getElementById("cat-field");
const errorEl = document.getElementById("form-error");
const monthInput = document.getElementById("f-month");

// ---------- expense/income toggle ----------
let currentType = "expense";
document.querySelectorAll(".type-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    currentType = btn.dataset.type;
    document.querySelectorAll(".type-btn").forEach(b => b.classList.toggle("on", b === btn));
    catField.classList.toggle("hide", currentType === "income");
  });
});

// ---------- top-level tabs ----------
const tabs = { today: document.getElementById("tab-today"), history: document.getElementById("tab-history") };
const views = { today: document.getElementById("view-today"), history: document.getElementById("view-history") };
function showTab(name) {
  Object.keys(tabs).forEach(k => {
    tabs[k].classList.toggle("on", k === name);
    views[k].classList.toggle("hide", k !== name);
  });
}
tabs.today.addEventListener("click", () => showTab("today"));
tabs.history.addEventListener("click", () => showTab("history"));

// ---------- render: TODAY ----------
function renderToday() {
  const list = data.filter(e => e.date === today());
  const box = document.getElementById("today-list");
  document.getElementById("today-empty").classList.toggle("hide", list.length > 0);
  box.innerHTML = list.map(entryRow).join("");
  wireDeletes(box);

  const spent = list.filter(isSpend).reduce((s, e) => s + e.amt, 0);
  document.getElementById("today-spent").textContent = inr(spent);
}

// ---------- render: HISTORY (selected month) ----------
function renderHistory() {
  const month = monthInput.value || today().slice(0, 7);
  const m = aggregateMonth(month);

  document.getElementById("m-earned").textContent = inr(m.earned);
  document.getElementById("m-spent").textContent = inr(m.spent);
  document.getElementById("m-saved").textContent = inr(m.saved);
  document.getElementById("m-left").textContent = inr(m.left);

  // category bars (spend categories only, savings excluded)
  const totals = {};
  CATS.forEach(([id]) => totals[id] = 0);
  m.list.filter(isSpend).forEach(e => totals[e.cat] += e.amt);
  const spendCats = CATS.filter(([id]) => id !== "savings");
  const max = Math.max(1, ...spendCats.map(([id]) => totals[id]));
  const barsHtml = spendCats.filter(([id]) => totals[id] > 0).map(([id, label, color]) => `
    <div class="bar-label"><span>${label}</span><span>${inr(totals[id])}</span></div>
    <div class="bar-track"><div class="bar-fill" style="width:${totals[id] / max * 100}%;background:${color}"></div></div>
  `).join("");
  document.getElementById("cat-bars").innerHTML = barsHtml;
  document.getElementById("cat-empty").classList.toggle("hide", barsHtml.length > 0);

  // by day (spend only, excluding savings)
  const byDay = {};
  m.list.filter(isSpend).forEach(e => byDay[e.date] = (byDay[e.date] || 0) + e.amt);
  const days = Object.keys(byDay).sort();
  document.getElementById("day-empty").classList.toggle("hide", days.length > 0);
  document.getElementById("day-list").innerHTML = days.map(d => `
    <div class="day-row">
      <span class="d-label">${new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
      <span>${inr(byDay[d])}</span>
    </div>
  `).join("");

  // every entry this month, so mistakes can be deleted (or income added and corrected)
  const entriesBox = document.getElementById("month-entries");
  document.getElementById("entries-empty").classList.toggle("hide", m.list.length > 0);
  entriesBox.innerHTML = [...m.list].sort((a, b) => a.date < b.date ? 1 : -1).map(entryRow).join("");
  wireDeletes(entriesBox);

  // all months, most recent first
  const monthsHtml = allMonths().map(mo => {
    const s = aggregateMonth(mo);
    const label = new Date(mo + "-01").toLocaleDateString("en-IN", { month: "short", year: "numeric" });
    return `<div class="month-row">
      <span>${label}</span><span>${inr(s.earned)}</span><span>${inr(s.spent)}</span><span>${inr(s.saved)}</span><span>${inr(s.left)}</span>
    </div>`;
  }).join("");
  document.getElementById("all-months").innerHTML = `
    <div class="month-row head"><span>Month</span><span>Earned</span><span>Spent</span><span>Saved</span><span>Left</span></div>
    ${monthsHtml || '<p class="empty">No history yet.</p>'}
  `;

  // keep the quick-glance summary strip in sync with the *current* real month
  if (month === today().slice(0, 7)) {
    document.getElementById("month-spent-mini").textContent = inr(m.spent);
    document.getElementById("month-saved-mini").textContent = inr(m.saved);
    document.getElementById("month-left-mini").textContent = inr(m.left);
  }
}

function renderAll() { renderToday(); renderHistory(); }

// ---------- actions ----------
function del(id) {
  data = data.filter(e => e.id !== id);
  save(); renderAll();
}

function addEntry() {
  const amt = parseFloat(amtInput.value);
  const date = dateInput.value;

  if (!date || isNaN(amt) || amt <= 0) {
    errorEl.style.display = "block";
    return;
  }
  errorEl.style.display = "none";

  const entry = {
    id: Date.now() + "" + Math.random(),
    date,
    type: currentType,
    amt,
    note: noteInput.value.trim(),
  };
  if (currentType === "expense") entry.cat = catSelect.value;

  data.push(entry);
  save(); renderAll();

  amtInput.value = "";
  noteInput.value = "";
  amtInput.focus();
}

function clearAll() {
  if (confirm("Clear all data? This can't be undone.")) {
    data = [];
    save(); renderAll();
  }
}

// ---------- events ----------
document.getElementById("add-btn").addEventListener("click", addEntry);
amtInput.addEventListener("keydown", e => { if (e.key === "Enter") addEntry(); });
noteInput.addEventListener("keydown", e => { if (e.key === "Enter") addEntry(); });
monthInput.addEventListener("change", renderHistory);
document.getElementById("clear-btn").addEventListener("click", clearAll);

// ---------- init ----------
dateInput.value = today();
monthInput.value = today().slice(0, 7);
renderAll();