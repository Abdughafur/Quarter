import { loadState, saveState } from "./storage.js";

const themeButtons = [...document.querySelectorAll("[data-theme-choice]")];
const continueButton = document.querySelector("#startupContinue");
const welcome = document.querySelector("#startupWelcome");
const themeStep = document.querySelector("#startupTheme");
let selectedTheme = "light";

function setTheme(theme) {
  selectedTheme = theme === "dark" ? "dark" : "light";
  document.body.dataset.theme = selectedTheme;
  document.documentElement.dataset.theme = selectedTheme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", selectedTheme === "dark" ? "#07131f" : "#0ea5e9");
  themeButtons.forEach((button) => {
    const selected = button.dataset.themeChoice === selectedTheme;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-checked", String(selected));
  });
}

async function init() {
  const state = await loadState();
  setTheme(state.settings.theme);

  themeButtons.forEach((button) => {
    button.addEventListener("click", () =>
      setTheme(button.dataset.themeChoice),
    );
  });

  continueButton?.addEventListener("click", async () => {
    const nextSettings = { ...state.settings, theme: selectedTheme };
    await saveState({ ...state, settings: nextSettings });
    themeStep?.setAttribute("hidden", "true");
    welcome?.removeAttribute("hidden");
  });

  document.querySelector("#startupEnter")?.addEventListener("click", () => {
    localStorage.setItem("choryak_onboarding_done", "true");
    window.location.replace("index.html");
  });
}

void init();
