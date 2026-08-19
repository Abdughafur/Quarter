/* chart.js */
export function buildKeypad(container, handlers) {
  if (!container) return;

  container.textContent = "";

  for (let value = 1; value <= 9; value += 1) {
    // numeric keys use 'scale-only' so they only scale on active (no bg/color change)
    container.append(createKey(String(value), () => handlers.onAdd(value), "scale-only"));
  }

  // back key should look like clear button
  container.append(createKey("←", handlers.onDelete, "clear back"));
  container.append(createKey("10", () => handlers.onAdd(10), "scale-only"));
  container.append(createKey("Тоза", handlers.onClear, "clear"));
}

function createKey(text, onClick, extraClass = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `key ${extraClass}`.trim();
  button.textContent = text;
  button.addEventListener("click", onClick);
  return button;
}

export function renderGradeBlocks(container, grades, labels, onToggle) {
  if (!container) return;

  container.textContent = "";

  if (!grades.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Ҳоло ягон балл нест";
    container.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  grades.forEach((grade) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `block ${grade.type === "exam" ? "exam" : ""}`.trim();
    button.textContent = grade.val;
    button.title = `${grade.val} ${labels[grade.val] || ""}${grade.type === "exam" ? " · Корҳои санҷишӣ" : ""}`;
    button.addEventListener("click", () => onToggle(grade.id));
    fragment.append(button);
  });

  container.append(fragment);
}

export function renderGradeChart(container, grades) {
  if (!container) return;

  const dist = Object.fromEntries(
    Array.from({ length: 10 }, (_, index) => [index + 1, 0]),
  );

  grades.forEach((grade) => {
    if (dist[grade.val] != null) dist[grade.val] += 1;
  });

  const max = Math.max(1, ...Object.values(dist));
  const fragment = document.createDocumentFragment();

  container.textContent = "";

  for (let grade = 10; grade >= 1; grade -= 1) {
    const wrap = document.createElement("div");
    wrap.className = "bar-wrap";
    wrap.dataset.label = String(grade);

    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = `${grades.length ? Math.max(5, (dist[grade] / max) * 105) : 5}px`;

    wrap.append(bar);
    fragment.append(wrap);
  }

  container.append(fragment);
}

export function buildPercentRows(container, labels, onInput) {
  if (!container) return;

  container.textContent = "";
  const fragment = document.createDocumentFragment();

  for (let grade = 10; grade >= 1; grade -= 1) {
    const row = document.createElement("div");
    row.className = "percent-row";

    const title = document.createElement("div");
    title.className = "grade-title";
    title.textContent = grade;

    const label = document.createElement("span");
    label.textContent = labels[grade] || "";
    title.append(label);

    const input = document.createElement("input");
    input.className = "input-field pct-count";
    input.id = `gradeCount${grade}`;
    input.type = "number";
    input.inputMode = "numeric";
    input.min = "0";
    input.placeholder = "0";
    input.dataset.grade = String(grade);

    const output = document.createElement("div");
    output.className = "pct-out";
    output.id = `gradePct${grade}`;
    output.textContent = "0%";

    row.append(title, input, output);
    fragment.append(row);
  }

  container.append(fragment);
  container.addEventListener("input", (event) => {
    if (event.target.matches(".pct-count")) onInput(event.target);
  });
}
