export const GRADE_LABELS = Object.freeze({
  10: "Аъло",
  9: "Олӣ",
  8: "Хубтар",
  7: "Хуб",
  6: "Қаноатбахш",
  5: "Кофӣ",
  4: "Кам",
  3: "Нокифоя",
  2: "Паст",
  1: "Пасттар",
});

export function calculateStats(list = []) {
  const grades = Array.isArray(list) ? list : [];
  const regular = grades.filter((grade) => grade.type !== "exam");
  const exam = grades.filter((grade) => grade.type === "exam");

  const average = (items) =>
    items.length ? items.reduce((sum, grade) => sum + Number(grade.val || 0), 0) / items.length : 0;

  const avgR = average(regular);
  const avgE = average(exam);
  const final = regular.length && exam.length ? (avgR + avgE) / 2 : avgR || avgE || 0;

  return { regular, exam, avgR, avgE, final };
}

export function gradeLabel(value) {
  return GRADE_LABELS[Math.round(Number(value) || 0)] || "—";
}

export function getBalanceAdvice(stats) {
  if (stats.regular.length && stats.exam.length) {
    const gap = Math.abs(stats.avgR - stats.avgE);
    if (gap < 0.5) return "Тавозуни дарсӣ ва корҳои санҷишӣ хуб аст.";

    return stats.avgR > stats.avgE
      ? "Баллҳои корҳои санҷишӣ аз баллҳои дарсӣ пасттаранд — хонанда бояд ба корҳои санҷишӣ бештар аҳаммият диҳад."
      : "Баллҳои дарсӣ аз баллҳои корҳои санҷишӣ пасттаранд — фаъолияти хонанда дар дарсҳо бояд беҳтар шавад.";
  }

  if (!stats.exam.length) {
    return "Ҳоло баллҳои корҳои санҷишӣ нест; натиҷа танҳо аз баллҳои дарсӣ ҳисоб шудааст.";
  }

  return "Ҳоло балли дарсӣ нест; натиҷа танҳо аз баллҳои корҳои санҷишӣ ҳисоб шудааст.";
}

export function getTrend(grades = []) {
  if (grades.length < 4) return "ҳоло маълумоти хонанда кам аст";

  const first = grades.slice(0, 3).reduce((sum, grade) => sum + grade.val, 0) / 3;
  const last = grades.slice(-3).reduce((sum, grade) => sum + grade.val, 0) / 3;

  if (last - first >= 0.7) return "беҳтар шуда истодааст";
  if (first - last >= 0.7) return "паст шуда истодааст";
  return "устувор аст";
}

export function getNeededPlan(grades = []) {
  const current = calculateStats(grades);

  if (current.final >= 9.5) {
    return "Натиҷа қариб аъло аст. Барои нигоҳ доштан 9 ё 10 гиред.";
  }

  const target = Math.min(10, Math.ceil(current.final + 0.01));
  const parts = [10, 9, 8].map((value) => {
    for (let count = 1; count <= 40; count += 1) {
      const projected = [
        ...grades,
        ...Array.from({ length: count }, () => ({ val: value, type: "regular" })),
      ];

      if (calculateStats(projected).final >= target) {
        return `бо ${value} — ${count} маротиба`;
      }
    }

    return `бо ${value} — зиёд лозим`;
  });

  return `Барои расидан ба <b>${target}</b>:<br>• ${parts.join("<br>• ")}`;
}
