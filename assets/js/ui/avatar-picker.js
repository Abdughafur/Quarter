const AVATAR_COUNT = 10;

function buildModal() {
  let modal = document.querySelector("#avatarPickerModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "avatarPickerModal";
  modal.className = "modal-backdrop avatar-picker-backdrop";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.innerHTML = `
    <div class="ios-modal avatar-picker-modal">
      <div class="avatar-picker-header">
        <div>
          <span class="avatar-picker-kicker">Profile identity</span>
          <h3>Аватари худро интихоб кунед</h3>
          <p>Яке аз аватарҳои омодаро интихоб кунед ё аксро аз галерея гиред.</p>
        </div>
        <button class="avatar-picker-close" type="button" aria-label="Пӯшидан">&times;</button>
      </div>
      <div class="avatar-picker-meta"><span>Аватарҳои системавӣ</span><span>${AVATAR_COUNT} интихоб</span></div>
      <div class="avatar-picker-grid" aria-label="Аватарҳои системавӣ">
        <button class="avatar-option avatar-gallery-btn" type="button" aria-label="Гирифтан аз галерия">
          <span aria-hidden="true">+</span>
        </button>
      </div>
    </div>`;
  document.body.append(modal);

  const grid = modal.querySelector(".avatar-picker-grid");
  for (let index = 0; index < AVATAR_COUNT; index += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "avatar-option";
    button.dataset.avatar = `assets/images/avatars/${String(index + 1).padStart(2, "0")}.jpeg`;
    button.setAttribute("aria-label", `Аватари системавӣ ${index + 1}`);
    button.innerHTML = `<img src="${button.dataset.avatar}" alt="" />`;
    grid.append(button);
  }
  return modal;
}

function shuffleAvatars(modal) {
  const grid = modal.querySelector(".avatar-picker-grid");
  const avatars = [
    ...grid.querySelectorAll(".avatar-option:not(.avatar-gallery-btn)"),
  ];

  for (let index = avatars.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [avatars[index], avatars[randomIndex]] = [
      avatars[randomIndex],
      avatars[index],
    ];
  }

  avatars.forEach((avatar) => grid.append(avatar));
}

export function bindAvatarPicker({ inputId, triggerSelector, onSelect }) {
  const input = document.getElementById(inputId);
  const trigger = document.querySelector(triggerSelector);
  if (!input || !trigger) return;

  const modal = buildModal();
  const close = () => modal.classList.remove("open");
  const selectPreset = (value) => {
    onSelect(value);
    close();
  };

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    shuffleAvatars(modal);
    modal.classList.add("open");
  });
  modal.querySelector(".avatar-picker-close").addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
    if (event.target.closest(".avatar-gallery-btn")) {
      close();
      input.click();
      return;
    }
    const option = event.target.closest(".avatar-option");
    if (option) selectPreset(option.dataset.avatar);
  });
}
