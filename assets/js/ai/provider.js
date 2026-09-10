import { analyzeStudent } from "./reasoning.js?v=chat2";
import { MINAI_CONTACT } from "./config.js?v=beta1";
import { isMinAIDomainQuestion } from "./intent.js?v=chat2";
import { detectToolCall } from "./tools.js?v=beta2";

const OUT_OF_DOMAIN_RESPONSE =
  "Ман барои таҳлили натиҷаи таҳсил, баллҳо ва нақшаи беҳтаршавӣ сохта шудаам. Ин савол ба вазифаи асосии MinAI дохил намешавад.";
const UNKNOWN_RESPONSE = `Ман ҳоло маълумоти кофӣ барои ҷавоби дақиқ ба ин савол надорам. Агар мехоҳед MinAI дар оянда қавитар шавад, бо таҳиягари барнома тамос гиред: ${MINAI_CONTACT.email}`;

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
