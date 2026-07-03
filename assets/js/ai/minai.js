import {
  calculateStats,
  getBalanceAdvice,
  getNeededPlan,
  getTrend,
  gradeLabel,
} from "../core/stats.js";

export function renderMinAI({ box, text, grades }) {
  if (!box || !text) return;

  const stats = calculateStats(grades);

  if (!grades.length) {
    text.textContent = "Барои гирифтани таҳлил аввал баллҳоро ворид кунед.";
    box.style.display = "none";
    return;
  }

  const final = stats.final;
  const trend = getTrend(grades);
  const needed = getNeededPlan(grades);
  const balance = getBalanceAdvice(stats);
  const low = grades.filter((grade) => grade.val <= 5).length;
  const mid = grades.filter((grade) => grade.val >= 6 && grade.val <= 7).length;
  const high = grades.filter((grade) => grade.val >= 8).length;

  let advice =
    "-----------------";

  if (final < 6.5) {
    advice =
      "Натиҷа паст аст. Аввал хонанда бояд баллҳои 5 ва аз 5 поёнро кам кунед, баъд баллҳои 8–10 бештар гиред.";
  } else if (low > 0 && low >= high) {
    advice =
      "Баллҳои паст ба баллҳои миёна таъсири калон доранд. Ҳатто 2–3 балли 8 ё 9 метавонад натиҷаро боло барад.";
  }

  box.style.display = "block";
  text.innerHTML = `<b>MinAI:</b><br>Натиҷаи ҳозира <b>${final.toFixed(2)}</b> — <b>${gradeLabel(final)}</b>.<br>Сатҳи таҳсил: <b>${trend}</b>.<br>${balance}<br>${advice}<br><br>${needed}`;
}
