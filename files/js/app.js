/*
  Abdughafur Khujzoda
  Copyright (c) 2026 Abdughafur Khujzoda. All rights reserved.
*/


/**
 * -----------------------------------------------------------
 * БАХШИ JS: МАНТИҚИ БАРНОМА
 * -----------------------------------------------------------
 */
const app = {
  grades: JSON.parse(localStorage.getItem("elite_grades")) || [],
  settings: JSON.parse(localStorage.getItem("elite_settings")) || {
    theme: "light",
    sound: true,
    fs: true,
  },
  init() {
    document.body.setAttribute("data-theme", this.settings.theme);
    document.getElementById("themeToggle").checked =
      this.settings.theme === "dark";
    document.getElementById("soundToggle").checked = this.settings.sound;
    document.getElementById("fsToggle").checked = this.settings.fs;
    this.updateUI();
    window.addEventListener(
      "click",
      () => {
        if (this.settings.fs && !document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      },
      { once: true },
    );
  },
  add(val) {
    if (this.grades.length >= 40) {
      this.showAlert();
      this.playTone(160, "sawtooth", 0.55);
      return;
    }
    this.grades.push({
      val,
      type: "regular",
      id: Date.now() + Math.random(),
    });
    this.playTone(450 + val * 45);
    this.updateUI();
  },
  clear() {
    this.grades = [];
    this.playTone(200, "sine", 0.3);
    this.updateUI();
  },
  toggleGrade(id) {
    const g = this.grades.find((x) => x.id === id);
    if (g) {
      g.type = g.type === "regular" ? "exam" : "regular";
      this.playTone(800, "square", 0.05);
      this.updateUI();
    }
  },
  removeGrade(id) {
    this.grades = this.grades.filter((g) => g.id !== id);
    this.playTone(250, "sawtooth", 0.25);
    this.updateUI();
  },
  updateUI() {
    localStorage.setItem("elite_grades", JSON.stringify(this.grades));
    const container = document.getElementById("blocksContainer");
    container.innerHTML = "";
    let sReg = 0,
      cReg = 0,
      sEx = 0,
      cEx = 0;
    const dist = {
      10: 0,
      9: 0,
      8: 0,
      7: 0,
      6: 0,
      5: 0,
      4: 0,
      3: 0,
      2: 0,
      1: 0,
    };
    this.grades.forEach((g) => {
      const el = document.createElement("div");
      el.className = `block ${g.type === "exam" ? "exam" : ""}`;
      el.textContent = g.val;

      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-btn";
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.removeGrade(g.id);
      });
      el.appendChild(removeBtn);

      el.onclick = () => this.toggleGrade(g.id);
      container.appendChild(el);

      if (g.type === "regular") {
        sReg += g.val;
        cReg++;
      } else {
        sEx += g.val;
        cEx++;
      }
      if (dist[g.val] !== undefined) dist[g.val]++;
    });
    document.getElementById("countUI").textContent = this.grades.length;
    const avgReg = cReg ? sReg / cReg : 0;
    const avgEx = cEx ? sEx / cEx : 0;
    const final = cReg && cEx ? (avgReg + avgEx) / 2 : avgReg || avgEx || 0;
    const avgEl = document.getElementById("avgLarge");
    avgEl.textContent = final.toFixed(2);

    avgEl.classList.remove(
      "avg-gold",
      "avg-gradient",
      "avg-shiny",
      "avg-purple",
    );
    if (final <= 6) {
      avgEl.classList.add("avg-purple");
    } else if (final >= 10) {
      avgEl.classList.add("avg-shiny");
    } else if (final >= 7) {
      avgEl.classList.add("avg-gradient");
    } else {
      avgEl.classList.add("avg-gold");
    }

    document.getElementById("avgDetail").textContent = this.grades.length
      ? `Дарсҳо: ${avgReg.toFixed(2)} | анҷишӣ: ${avgEx.toFixed(2)}`
      : "Баллҳоро ворид кунед";
    this.drawChart(dist);
    this.runAI(final, avgReg, avgEx, cReg, cEx);
  },
  drawChart(dist) {
    const chart = document.getElementById("gradeChart");
    chart.innerHTML = "";
    const maxVal = Math.max(...Object.values(dist)) || 1;
    let delay = 0;
    for (let i = 10; i >= 1; i--) {
      const h = (dist[i] / maxVal) * 120;
      const bar = document.createElement("div");
      bar.className = "bar";
      bar.style.height = "0px";
      bar.style.transitionDelay = `${delay}ms`;
      bar.setAttribute("data-label", i);
      chart.appendChild(bar);
      setTimeout(() => {
        bar.style.height = `${h + 5}px`;
      }, 30 + delay);
      delay += 55;
    }
  },
  // ИИ — ТАҚВИЯТ ЁФТА
  runAI(avg, avgReg, avgEx, cReg, cEx) {
    const aiText = document.getElementById("aiText");
    const aiBox = document.getElementById("aiAnalysisBox");
    const riskText = document.getElementById("aiRiskText");

    if (this.grades.length === 0) {
      aiText.innerHTML =
        "Барои гирифтани маслиҳат аз мушовир аввал бояд баллҳоро ворид кунед.";
      aiBox.style.display = "none";
      return;
    }
    aiBox.style.display = "block";

    const isPerfect = avg >= 10;
    let positiveHTML = "";

    if (isPerfect) {
      positiveHTML = `🎉 Хонанда чоряки <b>10</b> (аъло) дорад!<br>Шумо ҳама чизро комил анҷом додед! Барои нигоҳ доштани ин натиҷа ҳама баллҳои нав бояд 10 бошанд.`;
    } else {
      let target = Math.floor(avg) + 0.5;
      if (avg >= target) target += 0.5;
      let nextGrade = Math.min(10, Math.ceil(target));

      let neededRegAvg;
      if (cEx > 0) {
        neededRegAvg = target * 2 - avgEx;
      } else if (cReg > 0) {
        neededRegAvg = target;
      } else {
        neededRegAvg = target;
      }

      let n10 = 0,
        n9 = 0,
        n8 = 0;
      if (neededRegAvg > avgReg && cReg > 0) {
        const diff = cReg * (neededRegAvg - avgReg);
        if (neededRegAvg < 10) n10 = Math.ceil(diff / (10 - neededRegAvg));
        if (neededRegAvg < 9) n9 = Math.ceil(diff / (9 - neededRegAvg));
        if (neededRegAvg < 8) n8 = Math.ceil(diff / (8 - neededRegAvg));
      }
      if (n10 <= 0) n10 = 1;
      if (n9 <= 0) n9 = "-";
      if (n8 <= 0) n8 = "-";

      positiveHTML = `Барои ба <b>${nextGrade}</b> расонидан:<br>
              • 10: <b>${n10}</b> маротиба<br>
              • 9: <b>${n9}</b> маротиба<br>
              • 8: <b>${n8}</b> маротиба`;
    }
    aiText.innerHTML = positiveHTML;

    //(ҳангоми 10 — роҳи паст шудан ба 9)
    let dropPoint = Math.floor(avg) - 0.5;
    let neededRegDrop;
    if (cEx > 0) {
      neededRegDrop = dropPoint * 2 - avgEx;
    } else if (cReg > 0) {
      neededRegDrop = dropPoint;
    } else {
      neededRegDrop = dropPoint;
    }

    let nBad = 0,
      n3 = 0,
      n4 = 0;
    if (neededRegDrop < avgReg && neededRegDrop > 2 && cReg > 0) {
      const diffDrop = cReg * (avgReg - neededRegDrop);
      nBad = Math.ceil(diffDrop / (neededRegDrop - 2));
      if (neededRegDrop > 3) n3 = Math.ceil(diffDrop / (neededRegDrop - 3));
      if (neededRegDrop > 4) n4 = Math.ceil(diffDrop / (neededRegDrop - 4));
    }
    if (nBad <= 0) nBad = 0;
    if (n3 <= 0) n3 = "-";
    if (n4 <= 0) n4 = "-";

    riskText.innerHTML =
      nBad > 0 && nBad < 20
        ? `Агар паст шавад (ба <b>${Math.floor(avg) - 1}</b>):<br>
                 • 2: <b>${nBad}</b> маротиба<br>
                 • 3: <b>${n3}</b> маротиба<br>
                 • 4: <b>${n4}</b> маротиба`
        : "Баллҳо дар ҳолати устувор қарор дорад.";
  },
  nav(id, btn) {
    document
      .querySelectorAll(".tab-content")
      .forEach((t) => t.classList.remove("active"));
    document.getElementById(id).classList.add("active");
    document
      .querySelectorAll(".nav-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    this.playTone(600, "sine", 0.05);
  },
  toggleTheme() {
    this.settings.theme = this.settings.theme === "light" ? "dark" : "light";
    document.body.setAttribute("data-theme", this.settings.theme);
    this.save();
  },
  toggleSound() {
    this.settings.sound = document.getElementById("soundToggle").checked;
    this.save();
  },
  toggleFS() {
    this.settings.fs = document.getElementById("fsToggle").checked;
    this.save();
  },
  save() {
    localStorage.setItem("elite_settings", JSON.stringify(this.settings));
  },
  playTone(freq, type = "sine", dur = 0.1) {
    if (!this.settings.sound) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      g.gain.setValueAtTime(0.1, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch (e) {}
  },
  showAlert() {
    document.getElementById("customAlert").style.display = "flex";
  },
  hideAlert() {
    document.getElementById("customAlert").style.display = "none";
  },
};
window.onload = () => app.init();
