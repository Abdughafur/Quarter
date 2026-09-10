/* stats.js */
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
  1: "Пасттарин",
});

const goalPlanCache = new Map();

export function calculateStats(list = []) {
  const grades = Array.isArray(list) ? list : [];
  const regular = grades.filter((grade) => grade.type !== "exam");
  const exam = grades.filter((grade) => grade.type === "exam");

  const average = (items) =>
    items.length
      ? items.reduce((sum, grade) => sum + Number(grade.val || 0), 0) /
        items.length
      : 0;

  const avgR = average(regular);
  const avgE = average(exam);
  const final =
    regular.length && exam.length ? (avgR + avgE) / 2 : avgR || avgE || 0;

  return { regular, exam, avgR, avgE, final };
}

function average(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function standardDeviation(values, mean) {
  if (values.length < 2) return 0;
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function regressionSlope(values) {
  if (values.length < 2) return 0;
  const indexMean = (values.length - 1) / 2;
  const valueMean = average(values);
  const numerator = values.reduce(
    (sum, value, index) => sum + (index - indexMean) * (value - valueMean),
    0,
  );
  const denominator = values.reduce(
    (sum, _, index) => sum + (index - indexMean) ** 2,
    0,
  );
  return denominator ? numerator / denominator : 0;
}

export function getPerformanceInsights(list = []) {
  const grades = Array.isArray(list)
    ? list.filter((grade) => Number.isFinite(Number(grade?.val)))
    : [];
  const values = grades.map((grade) => Number(grade.val));
  const stats = calculateStats(grades);
  const mean = average(values);
  const recentValues = values.slice(-Math.min(5, values.length));
  const slope = regressionSlope(recentValues);
  const predicted = values.length
    ? Math.max(1, Math.min(10, average(recentValues) + slope))
    : 0;
  const lowCount = values.filter((value) => value <= 5).length;
  const highCount = values.filter((value) => value >= 8).length;
  const distribution = Object.fromEntries(
    Array.from({ length: 10 }, (_, index) => [String(index + 1), 0]),
  );

  values.forEach((value) => {
    const grade = Math.max(1, Math.min(10, Math.round(value)));
    distribution[String(grade)] += 1;
  });

  return {
    ...stats,
    count: values.length,
    mean,
    median: median(values),
    deviation: standardDeviation(values, mean),
    recentAverage: average(recentValues),
    slope,
    predicted,
    lowCount,
    highCount,
    distribution,
    confidence: Math.min(
      100,
      Math.round(35 + values.length * 8 - standardDeviation(values, mean) * 8),
    ),
  };
}

export function gradeLabel(value) {
  return GRADE_LABELS[Math.round(Number(value) || 0)] || "—";
}

export function getBalanceAdvice(stats) {
  if (stats.regular.length && stats.exam.length) {
    const gap = Math.abs(stats.avgR - stats.avgE);
    if (gap < 0.5)
      return "Фаъолияти хонанда дар дарсҳо ва корҳои санҷишӣ якхела аст.";

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
  if (grades.length < 4) return "Ҳоло маълумоти хонанда кам аст";

  const first =
    grades.slice(0, 3).reduce((sum, grade) => sum + grade.val, 0) / 3;
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
  const plan = getGoalPlan(grades, target);
  if (!plan.best)
    return `Барои расидан ба <b>${target}</b> ҳоло нақшаи маҳдуд пайдо нашуд.`;

  const alternatives = plan.alternatives.length
    ? `<br>Вариантҳои дигар:<br>• ${plan.alternatives.map((item) => item.grades.join(" + ")).join("<br>• ")}`
    : "";
  return `Барои расидан ба <b>${target}</b>:<br>• ${plan.best.grades.join(" + ")} (${plan.best.projected.toFixed(2)})${alternatives}`;
}

export function getGoalPlan(grades = [], target = 0) {
  const cacheKey = `${Number(target)}:${grades.map((grade) => `${grade.type || "regular"}:${grade.val}`).join(",")}`;
  if (goalPlanCache.has(cacheKey)) return goalPlanCache.get(cacheKey);

  const numericTarget = Number(target);
  const current = calculateStats(grades).final;
  if (
    !Number.isFinite(numericTarget) ||
    numericTarget < 1 ||
    numericTarget > 10
  ) {
    const result = { target: null, needed: 0, best: null, alternatives: [] };
    goalPlanCache.set(cacheKey, result);
    return result;
  }
  if (current >= numericTarget) {
    const result = {
      target: numericTarget,
      needed: 0,
      best: [],
      alternatives: [],
      summary: `ҳадаф аллакай иҷро шудааст (${current.toFixed(2)})`,
    };
    goalPlanCache.set(cacheKey, result);
    return result;
  }

  if (numericTarget === 10 && grades.some((grade) => Number(grade.val) < 10)) {
    const result = {
      target: numericTarget,
      needed: null,
      best: null,
      alternatives: [],
      summary:
        "Барои ҳадафи 10 ҳамаи баллҳои мавҷуда бояд 10 бошанд; натиҷаи дақиқи 10 бо баллҳои паст кафолат дода намешавад.",
    };
    goalPlanCache.set(cacheKey, result);
    return result;
  }

  const candidates = [6, 7, 8, 9, 10];
  const regularSum = grades
    .filter((grade) => grade.type !== "exam")
    .reduce((sum, grade) => sum + Number(grade.val), 0);
  const regularCount = grades.filter((grade) => grade.type !== "exam").length;
  const examStats = calculateStats(grades);
  const requiredAverage = examStats.exam.length
    ? numericTarget * 2 - examStats.avgE
    : numericTarget;
  const solutions = [];

  for (let count = 1; count <= 40 && !solutions.length; count += 1) {
    const requiredSum = requiredAverage * (regularCount + count) - regularSum;
    let combinations = new Map([[0, []]]);

    for (let step = 0; step < count; step += 1) {
      const next = new Map();
      combinations.forEach((picks, sum) => {
        candidates.forEach((value) => {
          const nextSum = sum + value;
          const nextPicks = [...picks, value];
          const existing = next.get(nextSum);
          if (
            !existing ||
            Math.max(...nextPicks) - Math.min(...nextPicks) <
              Math.max(...existing) - Math.min(...existing)
          ) {
            next.set(nextSum, nextPicks);
          }
        });
      });
      combinations = next;
    }

    [...combinations.entries()]
      .filter(([sum]) => sum >= requiredSum)
      .sort((left, right) => left[0] - right[0])
      .slice(0, 3)
      .forEach(([sum, picks]) => {
        const projectedRegular = (regularSum + sum) / (regularCount + count);
        const projected = examStats.exam.length
          ? (projectedRegular + examStats.avgE) / 2
          : projectedRegular;
        solutions.push({
          grades: picks,
          projected,
          count,
          spread: Math.max(...picks) - Math.min(...picks),
        });
      });
  }

  solutions.sort(
    (left, right) =>
      left.count - right.count ||
      left.spread - right.spread ||
      left.projected - right.projected,
  );
  const best = solutions[0] || null;
  const alternatives = solutions
    .filter((solution) => solution !== best)
    .slice(0, 2);

  const result = {
    target: numericTarget,
    needed: best?.count || null,
    best,
    alternatives,
    summary: best
      ? `${best.count} балли нав лозим: ${best.grades.join(" + ")} (натиҷаи пешбинишуда ${best.projected.toFixed(2)})`
      : "Барои ин ҳадаф нақшаи мувофиқ пайдо нашуд.",
  };
  if (goalPlanCache.size > 100)
    goalPlanCache.delete(goalPlanCache.keys().next().value);
  goalPlanCache.set(cacheKey, result);
  return result;
}
