import { escapeHtml } from "../utils/helpers.js";
import { buildStudentContext } from "./context.js?v=chat2";
import { detectIntent } from "./intent.js?v=chat2";
import { generateAIResponse } from "./provider.js?v=quick1";
import { createMinAITools } from "./tools.js?v=beta2";
import { MINAI_ASSETS } from "./config.js?v=beta1";

let renderVersion = 0;
let welcomeTypingTimer = null;

function startWelcomeTyping(chat) {
  const typingLine = chat.querySelector(".minai-welcome-typing");
  if (!typingLine) return;

  const phrases = [
    "Дар бораи чӣ донистан мехоҳед?",
    "Чӣ гуна метавонам кӯмак кунам?",
    "Чӣ савол доред?",
    "Чиро мехоҳед бифаҳмед?",
  ];
  let phraseIndex = 0;

  const typePhrase = () => {
    const phrase = phrases[phraseIndex];
    let characterIndex = 0;
    typingLine.textContent = "";

    const typeNextCharacter = () => {
      typingLine.textContent = phrase.slice(0, characterIndex + 1);
      characterIndex += 1;
      if (characterIndex < phrase.length) {
        welcomeTypingTimer = setTimeout(typeNextCharacter, 55);
      } else {
        welcomeTypingTimer = setTimeout(erasePhrase, 5000);
      }
    };

    const erasePhrase = () => {
      const currentText = typingLine.textContent;
      if (currentText.length) {
        typingLine.textContent = currentText.slice(0, -1);
        welcomeTypingTimer = setTimeout(erasePhrase, 32);
      } else {
        phraseIndex = (phraseIndex + 1) % phrases.length;
        welcomeTypingTimer = setTimeout(typePhrase, 450);
      }
    };

    typeNextCharacter();
  };

  clearTimeout(welcomeTypingTimer);
  typePhrase();
}

function renderMessage(message) {
  const role = message.role === "assistant" ? "ai" : "user";
  const image =
    role === "ai"
      ? MINAI_ASSETS.smile
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
  userName = "",
}) {
  const chat = document.querySelector("#aiChatMessages");
  if (!chat) return;
  const clearButton = document.querySelector(".minai-chat-clear");
  if (clearButton) clearButton.hidden = !messages.length;
  const greetingName = escapeHtml(userName || "дӯст");
  clearTimeout(welcomeTypingTimer);
  if (messages.length) {
    chat.innerHTML = renderChat(
      messages.map((message) => ({
        ...message,
        avatar: message.avatar || userAvatar,
      })),
      loading,
    );
  } else {
    chat.innerHTML = `<div class="minai-empty"><img class="minai-welcome-avatar" src="${MINAI_ASSETS.smile}" alt="MinAI" /><div class="minai-welcome-copy" aria-label="Паёми истиқболи MinAI"><span class="minai-welcome-line minai-welcome-name">Салом, ${greetingName}!</span><span class="minai-welcome-line minai-welcome-typing" aria-live="polite"></span></div></div>`;
    startWelcomeTyping(chat);
  }
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
