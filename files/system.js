const nums = document.getElementById("nums");
const blocksEl = document.getElementById("blocks");
const resultEl = document.getElementById("result");
const metaEl = document.getElementById("meta");
const countEl = document.getElementById("count");
const notifBar = document.getElementById("notifBar");
const notifBtn = document.getElementById("notifBtn");
const notifClose = document.getElementById("notifClose");
const calculatorCard = document.getElementById("calculatorCard");

const MAX = 20;
let items = [];
let nextId = 0;

let avgPurpleMem = 0;
let avgWhiteMem = 0;

for (let i = 1; i <= 9; i++) {
  const b = document.createElement("button");
  b.className = "num";
  b.textContent = i;
  b.type = "button";
  b.addEventListener("click", () => add(i));
  nums.appendChild(b);
}

notifBtn.addEventListener("click", () => {
  openNotif();
});
notifClose.addEventListener("click", () => {
  closeNotif();
});

function openNotif() {
  notifBar.classList.add("show");
  notifBar.setAttribute("aria-hidden", "false");

  calculatorCard.classList.add("overlay-disabled");
}
function closeNotif() {
  notifBar.classList.remove("show");
  notifBar.setAttribute("aria-hidden", "true");
  calculatorCard.classList.remove("overlay-disabled");
  notifClose.classList.remove("alert");
}

document.addEventListener("click", (e) => {
  if (notifBar.classList.contains("show")) {
    if (
      notifBar.contains(e.target) ||
      notifBtn.contains(e.target) ||
      notifClose.contains(e.target)
    )
      return;

    notifClose.classList.add("alert");
    setTimeout(() => notifClose.classList.remove("alert"), 500);
  }
});

function add(val) {
  if (notifBar.classList.contains("show")) return;
  if (items.length >= MAX) {
    openNotif();
    return;
  }

  const obj = { id: ++nextId, val: Number(val), color: "purple" };
  items.push(obj);

  const el = document.createElement("div");
  el.className = "block";
  el.textContent = val;
  el.dataset.id = obj.id;

  el.addEventListener("click", () => {
    obj.color = obj.color === "purple" ? "white" : "purple";

    if (obj.color === "white") el.classList.add("white");
    else el.classList.remove("white");
    calc();
  });

  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "×";
  btn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    remove(obj.id);
  });

  el.appendChild(btn);
  blocksEl.appendChild(el);
  calc();
}

function remove(id) {
  items = items.filter((it) => it.id !== id);
  const node = document.querySelector(`.block[data-id="${id}"]`);
  if (node) node.remove();
  calc();
}

function clearAll() {
  if (notifBar.classList.contains("show")) return;
  items = [];
  blocksEl.innerHTML = "";
  calc();
}
function calc() {
  const c = items.length;
  countEl.textContent = `${c} / ${MAX}`;

  let sumPurple = 0,
    sumWhite = 0;
  let countPurple = 0,
    countWhite = 0;

  items.forEach((it) => {
    if (it.color === "purple") {
      sumPurple += it.val;
      countPurple++;
    } else {
      sumWhite += it.val;
      countWhite++;
    }
  });

  const avgPurple = countPurple ? sumPurple / countPurple : 0;
  const avgWhite = countWhite ? sumWhite / countWhite : 0;

  let overallAvg = 0;

  if (countPurple > 0 && countWhite > 0) {
    overallAvg = (avgPurple + avgWhite) / 2;
  } else if (countPurple > 0) {
    overallAvg = avgPurple;
  } else if (countWhite > 0) {
    overallAvg = avgWhite;
  } else {
    overallAvg = 0;
  }
  resultEl.textContent = overallAvg.toFixed(2);
  metaEl.innerHTML = `
          Қиммати баллҳои корҳои санҷишӣ: ${avgWhite.toFixed(2)}<br>
          Қиммати баллҳо: ${avgPurple.toFixed(2)}<br>
          Натиҷа: ${overallAvg.toFixed(2)}
        `;
}

window.addEventListener("load", () => {
  const loader = document.getElementById("loader");
  loader.style.opacity = "0";
  loader.style.pointerEvents = "none";
  setTimeout(() => (loader.style.display = "none"), 500);
});
