import { analyzeStudent } from "./reasoning.js?v=chat2";
import { MINAI_CONTACT } from "./config.js?v=beta1";
import { isMinAIDomainQuestion } from "./intent.js?v=chat2";
import { detectToolCall } from "./tools.js?v=beta2";

const OUT_OF_DOMAIN_RESPONSE =
  "Ман барои таҳлили натиҷаи таҳсил, баллҳо ва нақшаи беҳтаршавӣ сохта шудаам. Ин савол ба вазифаи асосии MinAI дохил намешавад.";
const UNKNOWN_RESPONSE = `Ман ҳоло маълумоти кофӣ барои ҷавоби дақиқ ба ин савол надорам. Агар мехоҳед MinAI дар оянда қавитар шавад, бо таҳиягари барнома тамос гиред: ${MINAI_CONTACT.email}`;

function quickQuestionAnswer(question, context) {
  const normalized = String(question || "")
    .toLowerCase()
    .replace(/[?!.,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const stats = context.statistics;
  const count = context.grades.length;

  if (normalized.includes("статистика")) {
    if (!count)
      return "Ҳоло статистика нест. Аввал баллҳои хонандагонро ворид кунед, баъд миёна, тақсимот ва тамоюлро нишон медиҳам.";
    const distribution = Object.entries(stats.distribution)
      .filter(([, value]) => value)
      .map(([grade, value]) => `${grade}: ${value}`)
      .join(", ");
    return `Статистика: ${count} балл, миёна ${stats.mean.toFixed(2)}, медиана ${stats.median.toFixed(2)}, балли паст 1–5: ${stats.low}, балли баланд 8–10: ${stats.high}. Тақсимот: ${distribution}.`;
  }

  if (
    normalized.includes("баланд кардан") ||
    normalized.includes("баланд шавад")
  )
    return "Барои баланд кардани натиҷа: мавзӯъҳои балли 1–5-ро ҷудо кунед, барои ҳар мавзӯъ машқи кӯтоҳ диҳед, баъд бо кори санҷишӣ пешрафтро муқоиса кунед. Натиҷаҳои охиринро мунтазам сабт кунед.";

  if (normalized.includes("чаро натиҷа паст")) {
    if (!count)
      return "Барои фаҳмидани сабаби паст будани натиҷа аввал ҳадди ақал 3 балл ворид кунед.";
    return stats.low
      ? `Сабаби асосӣ эҳтимол баллҳои паст аст: ${stats.low} натиҷа дар гурӯҳи 1–5. ${stats.slope < -0.25 ? "Натиҷаҳои охирин ҳам коҳиш ёфта истодаанд." : "Мавзӯъҳои ҳамин натиҷаҳоро аввал такрор кунед."}`
      : "Дар маълумоти ҷорӣ балли 1–5 нест. Сабаби эҳтимолӣ метавонад кам будани машқ ё ноустувории натиҷаҳо бошад; натиҷаҳои охиринро муқоиса кунед.";
  }

  if (normalized.includes("ба хонанда") || normalized.includes("баҳо гузорам"))
    return "Ба хонанда аз рӯйи натиҷаи воқеии дониш, малака ва маҳораташ баҳо диҳед. Пеш аз баҳогузорӣ муайян кунед, ки супориш кадом натиҷаи таълимиро талаб мекунад, сипас ҷавоб ва кори хонандаро бо ҳамин меъёр муқоиса кунед. Дар низоми 10-хола ҳар хол сатҳи муайяни азхудкунӣ ва татбиқи донишро нишон медиҳад: 10 — аъло, 9 — олӣ, 8 — хубтар, 7 — хуб, 6 — кофӣ, 5 — қаноатбахш, 4 — кам, 3 — нокифоя, 2 — паст ва 1 — пасттар. Баҳо бояд воқеӣ, шаффоф ва ба натиҷаи кор асос ёбад, на ба тахмин. Дар охир тавсияи мушаххас диҳед: кадом ҷиҳати кор хуб аст ва барои беҳтар шудани натиҷа кадом дониш, малака ё хатогиро бояд такмил диҳад.";

  if (normalized.includes("журнал"))
    return "Дар журнал хонандаро интихоб кунед, натиҷаҳои дарсӣ ва корҳои санҷиширо ворид кунед, баъд натиҷаи чорякро бинед. Маълумотро мунтазам сабт кунед, то тамоюли пешрафт дуруст ҳисоб шавад.";

  if (normalized.includes("фоиз"))
    return "Барои ҳисоб кардани фоиз ба бахши «Фоизҳо» гузаред, шумораи умумии хонандагонро ворид кунед ва шумораи ҳар баҳоро нависед. Барнома фоизи гурӯҳҳо ва натиҷаи умумиро худкор ҳисоб мекунад.";

  if (normalized.includes("дар бораи худат"))
    return "Ман MinAI — ёвари зеҳнии офлайнӣ барои омӯзгорон ҳастам. Ман ба таҳлил ва баҳодиҳии натиҷаҳои хонандагон кӯмак мекунам ва барои беҳтар кардани таълим тавсия медиҳам. Ман барои омӯзиш ё рушди худ маълумоти корбаронро истифода намебарам. Маълумоти охирин, ки дар ман дастрас аст, то 1-10-2026 мебошад.";

  if (normalized.includes("низоми баҳогузорӣ"))
    return "Низоми баҳогузорӣ аз 1 то 10 аст: 10 — аъло, 9 — олӣ, 8 — хубтар, 7 — хуб, 6 — кофӣ, 5 — қаноатбахш, 4 — кам, 3 — нокифоя, 2 — паст ва 1 — пасттар. Барои баҳои одилона натиҷаҳои корҳои дарсӣ ва санҷиширо якҷоя ба назар гиред.";

  if (normalized.includes("барнома беҳтар"))
    return "Албатта. Барои беҳтар кардани барнома метавон имкониятҳои нав илова кард, кори мавҷударо осонтар намуд ва дақиқии ҷавобҳоро беҳтар кард. Агар идея ё пешниҳоди мушаххас дошта бошед, онро ба почтаи электронии таҳиягар нависед: abdughafur.2010.khujzoda@gmail.com.";

  return null;
}

export const offlineProvider = Object.freeze({
  name: "offline-reasoning",
  available: true,
  async generate({ context, intent }) {
    return analyzeStudent(context, intent);
  },
});

export const localLLMProvider = Object.freeze({
  name: "local-llm-runtime",
  get available() {
    const runtime = globalThis.MinAIModel || globalThis.minaiRuntime;
    return typeof runtime?.generate === "function";
  },
  async generate(request) {
    const runtime = globalThis.MinAIModel || globalThis.minaiRuntime;
    if (typeof runtime?.generate !== "function") {
      throw new Error("No local MinAI model runtime is installed");
    }
    const result = await runtime.generate({
      context: request.context,
      question: request.question,
      history: request.history,
    });
    return typeof result === "string" ? { answer: result } : result;
  },
});

let activeProvider = offlineProvider;

export function setAIProvider(provider) {
  if (!provider || typeof provider.generate !== "function") return;
  activeProvider = provider;
}

export async function generateAIResponse(request) {
  const normalized = String(request.question || "")
    .toLowerCase()
    .replace(/[?!.,]+/g, "")
    .trim();
  if (/^(салом|салм|hello|hi|привет|hey)$/.test(normalized)) {
    return {
      answer:
        "Салом! Ман MinAI ҳастам. Ба ман дар бораи баллҳо, натиҷа ё нақшаи таҳсил савол диҳед.",
      source: "offline-greeting",
    };
  }
  const quickAnswer = quickQuestionAnswer(request.question, request.context);
  if (quickAnswer)
    return { answer: quickAnswer, source: "offline-quick-answer" };
  const toolCall = detectToolCall(request.question);
  if (toolCall && request.tools?.[toolCall.name]) {
    try {
      const result = await request.tools[toolCall.name].execute(toolCall.args);
      if (toolCall.name === "calculator")
        return { answer: `Ҷавоб: ${result.value}`, source: "calculator-tool" };
      if (toolCall.name === "knowledge")
        return { answer: result.answer, source: "knowledge-tool" };
      if (toolCall.name === "create_note")
        return {
          answer: `Ёддошт «${result.note.title}» сохта шуд.`,
          source: "notes-tool",
        };
      if (toolCall.name === "search_notes")
        return {
          answer: result.notes.length
            ? `${result.notes.length} ёддошт ёфт шуд: ${result.notes.map((note) => note.title).join(", ")}.`
            : "Ягон ёддошт ёфт нашуд.",
          source: "notes-tool",
        };
      if (toolCall.name === "export_result")
        return {
          answer: "Натиҷа тавассути воситаи воқеии экспорт зеркашӣ шуд.",
          source: "export-tool",
        };
    } catch {
      return {
        answer:
          "Ин амал иҷро нашуд. Маълумоти воридшударо санҷед ва бори дигар кӯшиш кунед.",
        source: "tool-error",
      };
    }
  }

  if (!isMinAIDomainQuestion(request.question)) {
    return { answer: OUT_OF_DOMAIN_RESPONSE, source: "domain-guard" };
  }

  try {
    const provider = localLLMProvider.available
      ? localLLMProvider
      : activeProvider;
    const response = await provider.generate(request);
    if (!response?.answer) throw new Error("Invalid MinAI response");
    return { ...response, source: provider.name };
  } catch {
    if (!request.context?.grades?.length && request.intent?.type !== "overview")
      return { answer: UNKNOWN_RESPONSE, source: "unknown" };
    return {
      ...analyzeStudent(request.context, request.intent),
      source: "offline-fallback",
    };
  }
}
