import { gradeLabel } from "../core/stats.js?v=chat2";

function score(value) {
  return Number(value || 0).toFixed(2);
}

function goalSummary(plan) {
  if (!plan) return "";
  const alternatives = plan.alternatives?.length
    ? ` Вариантҳои дигар: ${plan.alternatives.map((item) => item.grades.join(" + ")).join("; ")}.`
    : "";
  return `${plan.summary}${alternatives}`;
}

export function analyzeStudent(context, intent = { type: "overview" }) {
  const stats = context.statistics;
  const priorities = [];
  const positive = [];

  if (context.grades.length < 3) {
    const insufficient =
      "Барои чунин хулоса маълумоти кофӣ надорам. Ҳадди ақал 3 балл ворид кунед, то тамоюл ва сабаби эҳтимолиро боэътимодтар таҳлил кунам.";
    return {
      answer: insufficient,
      current: `Ҳоло ${context.grades.length} балл сабт шудааст.`,
      primaryIssue: insufficient,
      positive: "Маълумоти бештар натиҷаро дақиқтар мекунад.",
      action: "Якчанд натиҷаи нав ворид кунед ва баъд саволро такрор фиристед.",
      forecast: "Пешбинӣ барои маълумоти кам эътимоднок нест.",
      goal: context.goal
        ? "Аввал маълумоти бештар ҷамъ кунед, баъд нақшаи ҳадафро ҳисоб мекунем."
        : "Ҳадаф баъд аз ҷамъ шудани маълумоти кофӣ ҳисоб карда мешавад.",
      priorities: [],
    };
  }

  if (stats.low >= Math.max(2, Math.ceil(context.grades.length * 0.3))) {
    priorities.push({
      priority: "HIGH",
      text: `${stats.low} балли паст (1–5) ҳаст; ин сабаби асосии паст шудани натиҷа аст.`,
    });
  }
  if (stats.slope <= -0.25) {
    priorities.push({
      priority: "HIGH",
      text: "Натиҷаҳои охирин рӯ ба коҳиш доранд.",
    });
  }
  if (stats.stability === "ноустувор") {
    priorities.push({
      priority: "HIGH",
      text: `Натиҷаҳо ноустуворанд (инҳироф ${score(stats.deviation)}).`,
    });
  }
  if (stats.high < Math.max(1, Math.ceil(context.grades.length * 0.2))) {
    priorities.push({
      priority: "MEDIUM",
      text: "Баллҳои 8–10 каманд ва барои боло бурдани миёна имконият ҳаст.",
    });
  }
  if (stats.slope > 0.25) {
    positive.push("Натиҷаҳои охирин беҳтар шуда истодаанд.");
  }
  if (stats.high >= stats.low && stats.high > 0) {
    positive.push(
      "Баллҳои баланд нишон медиҳанд, ки сатҳи хуб гирифтан имконпазир аст.",
    );
  }
  if (!positive.length && stats.stability === "устувор") {
    positive.push(
      "Натиҷаҳо ҳоло устуворанд ва барои нақшаи мунтазам заминаи хуб медиҳанд.",
    );
  }

  const primaryIssue =
    priorities[0]?.text ||
    "Мушкилоти калон муайян нашуд; натиҷаро мунтазам нигоҳ доред.";
  const action =
    stats.low > 0
      ? "Аввал мавзӯъҳои баллҳои 1–5-ро такрор кунед ва баъд як кори кӯтоҳи назоратӣ иҷро кунед."
      : stats.slope < -0.25
        ? "Сабаби ду натиҷаи охиринро нависед ва барои дарси оянда як машқи кӯтоҳи ҳадафнок интихоб кунед."
        : "Барои натиҷаи оянда як ҳадафи равшан гузоред ва баъд аз машқ натиҷаро муқоиса кунед.";

  const goal = context.goal?.plan;
  const answers = {
    overview: `Натиҷаи ҷорӣ ${score(stats.current)} аст — ${gradeLabel(stats.current)}. ${primaryIssue}`,
    cause: primaryIssue,
    action,
    progress: `${stats.trend}. ${forecastText(stats)}`,
    goal: goal
      ? `Барои ҳадафи ${score(context.goal.target)}: ${goalSummary(goal)}`
      : "Ҳадафи рақамиро дар майдони «Ҳадаф» ворид кунед.",
    weak: stats.low
      ? `Баллҳои заиф: ${stats.low} адад дар гурӯҳи 1–5. Аввал ҳамин мавзӯъҳоро такрор кунед.`
      : "Балли хеле паст нест; бештар ба устуворӣ ва нигоҳ доштани натиҷа диққат диҳед.",
  };

  return {
    answer: answers[intent.type] || answers.overview,
    current: `Натиҷаи ҷорӣ ${score(stats.current)} аст — ${gradeLabel(stats.current)}.`,
    primaryIssue,
    positive: positive[0] || "Ҳоло барои хулосаи мусбат маълумоти кофӣ нест.",
    action,
    forecast: `Балли эҳтимолии навбатӣ ${score(stats.prediction)} аст. Ин кафолат нест; эътимоднокӣ ${stats.confidence}% мебошад.`,
    goal: goal
      ? `Барои ҳадафи ${score(context.goal.target)}: ${goalSummary(goal)}`
      : "Ҳадафи рақамӣ гузошта нашудааст; метавонед ҳадафи 1–10 ворид кунед.",
    priorities: priorities.slice(0, 3),
  };
}

function forecastText(stats) {
  return `пешбинии балли навбатӣ ${score(stats.prediction)} мебошад, бо эътимоднокии ${stats.confidence}%.`;
}
