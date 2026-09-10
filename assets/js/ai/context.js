import {
  calculateStats,
  getBalanceAdvice,
  getGoalPlan,
  getPerformanceInsights,
  getTrend,
} from "../core/stats.js?v=chat1";

export function buildStudentContext({
  grades = [],
  profile = {},
  info = {},
  target = null,
  history = [],
} = {}) {
  const stats = calculateStats(grades);
  const insights = getPerformanceInsights(grades);
  const numericTarget = Number(target);
  const goal =
    Number.isFinite(numericTarget) && numericTarget >= 1 && numericTarget <= 10
      ? numericTarget
      : null;

  return {
    student: {
      name: [profile.name, profile.surname].filter(Boolean).join(" ") || null,
      className: info.grade || null,
      subject: info.subject || null,
    },
    grades: grades.map((grade) => ({
      value: Number(grade.val),
      type: grade.type === "exam" ? "exam" : "regular",
    })),
    recentGrades: grades.slice(-5).map((grade) => ({
      value: Number(grade.val),
      type: grade.type === "exam" ? "exam" : "regular",
    })),
    statistics: {
      current: stats.final,
      regularAverage: stats.avgR,
      examAverage: stats.avgE,
      mean: insights.mean,
      median: insights.median,
      deviation: insights.deviation,
      slope: insights.slope,
      recentAverage: insights.recentAverage,
      prediction: insights.predicted,
      confidence: insights.confidence,
      trend: getTrend(grades),
      stability:
        insights.deviation < 0.75
          ? "устувор"
          : insights.deviation < 1.4
            ? "миёна"
            : "ноустувор",
      distribution: insights.distribution,
      low: insights.lowCount,
      middle: grades.filter(
        (grade) => Number(grade.val) >= 6 && Number(grade.val) <= 7,
      ).length,
      high: insights.highCount,
      balance: getBalanceAdvice(stats),
    },
    weakAreas: null,
    strongAreas: null,
    progress: {
      direction: getTrend(grades),
      recent: insights.recentAverage,
    },
    conversationHistory: history.slice(-12).map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: String(message.content || "").slice(0, 500),
    })),
    goal: goal
      ? {
          target: goal,
          plan: getGoalPlan(grades, goal),
        }
      : null,
  };
}
