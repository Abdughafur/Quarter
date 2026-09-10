import { escapeHtml } from "../utils/helpers.js";
import { buildStudentContext } from "./context.js?v=chat2";
import { detectIntent } from "./intent.js?v=chat2";
import { generateAIResponse } from "./provider.js?v=beta2";
import { createMinAITools } from "./tools.js?v=beta2";

let renderVersion = 0;

function renderMessage(message) {
  const role = message.role === "assistant" ? "ai" : "user";
  const image =
    role === "ai"
      ? "assets/images/logoLight.png"
      : message.avatar || "assets/images/logoLight.png";
  return `<div class="minai-message minai-message--${role}"><img class="minai-message-avatar" src="${escapeHtml(image)}" alt="" /><div class="minai-message-body"><div class="minai-message-role">${role === "ai" ? "MinAI" : "Шумо"}</div><div class="minai-message-content">${escapeHtml(message.content)}</div></div></div>`;
}

function renderChat(messages, loading = false) {
  return `${messages.map(renderMessage).join("")}${loading ? '<div class="minai-message minai-message--ai minai-message--loading"><div class="minai-message-role">MinAI</div><div class="minai-typing" aria-label="MinAI ҷавоб омода мекунад"><span></span><span></span><span></span></div></div>' : ""}`;
}

export function renderMinAI({
  messages = [],
  loading = false,
  userAvatar = "",
}) {
  const chat = document.querySelector("#aiChatMessages");
  if (!chat) return;
  chat.innerHTML = messages.length
    ? renderChat(
        messages.map((message) => ({
          ...message,
          avatar: message.avatar || userAvatar,
        })),
        loading,
      )
    : '<div class="minai-empty">Салом. Ман барои таҳлили баллҳо ва беҳтар кардани натиҷаи таҳсил омодаам.</div>';
  chat.scrollTop = chat.scrollHeight;
}

export async function askMinAI({
  grades,
  profile,
  info,
  target,
  question,
  history,
  app,
}) {
  const currentVersion = ++renderVersion;
  const intent = detectIntent(question);
  const context = buildStudentContext({
    grades,
    profile,
    info,
    target: intent.target || target,
    history,
  });
  const response = await generateAIResponse({
    context,
    question,
    history: context.conversationHistory,
    intent,
    tools: createMinAITools(app),
  });
  return currentVersion === renderVersion ? response : null;
}
// MinAI v1.1: offline provider + student context + intent + reasoning.
