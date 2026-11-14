/* chart.js */
const chartStates = new WeakMap();
const chartResizeObservers = new WeakMap();

export function buildKeypad(container, handlers) {
  if (!container) return;

  container.textContent = "";

  for (let value = 1; value <= 9; value += 1) {
    // numeric keys use 'scale-only' so they only scale on active (no bg/color change)
    container.append(
      createKey(String(value), () => handlers.onAdd(value), "scale-only"),
    );
  }

  // Back key uses an icon so its visual weight matches the other controls.
  const backKey = createKey("", handlers.onDelete, "clear back");
  backKey.setAttribute("aria-label", "Пок кардани баҳои охирин");
  backKey.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
    <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2Z"
      fill="currentColor" />
  </svg>`;
  container.append(backKey);
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
  container.classList.toggle("is-empty", grades.length === 0);

  if (!grades.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    const illustration = document.createElement("img");
    illustration.src = "assets/images/minai/smile.webp";
    illustration.alt = "";
    illustration.setAttribute("aria-hidden", "true");
    const message = document.createElement("span");
    message.textContent = "Ҳоло ягон балл ворид нашудааст";
    empty.append(illustration, message);
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

  requestAnimationFrame(() => {
    if (container.classList.contains("grades-expanded")) {
      container.style.height = `${Math.min(container.scrollHeight, 520)}px`;
    }
  });
}

export function renderGradeChart(container, grades) {
  if (!container) return;

  let state = chartStates.get(container);
  if (!state) {
    state = { grades, renderedWidth: null };
    chartStates.set(container, state);
  }
  state.grades = grades;

  if (
    typeof ResizeObserver === "function" &&
    !chartResizeObservers.has(container)
  ) {
    const observer = new ResizeObserver(() => {
      const currentState = chartStates.get(container);
      if (
        currentState &&
        container.clientWidth !== currentState.renderedWidth
      ) {
        renderGradeChart(container, currentState.grades);
      }
    });
    observer.observe(container);
    chartResizeObservers.set(container, observer);
  }

  const previousCount = Number(container.dataset.gradeCount || 0);
  const previousScrollLeft =
    container.querySelector(".chart-viewport")?.scrollLeft || 0;
  const viewportWidth = Math.max(0, container.clientWidth);
  state.renderedWidth = viewportWidth;
  container.dataset.gradeCount = String(grades.length);
  container.textContent = "";

  if (!grades.length) {
    const empty = document.createElement("div");
    empty.className = "chart-empty";
    empty.textContent = "Ҳоло ягон балл ворид нашудааст";
    container.append(empty);
    return;
  }

  const svgNS = "http://www.w3.org/2000/svg";
  const left = 0;
  const right = 18;
  const pointGap = 54;
  const sidePadding = 24;
  const pointSpan = Math.max(0, grades.length - 1) * pointGap;
  const edgePadding = Math.max(sidePadding, viewportWidth / 2);
  const width = Math.max(viewportWidth, edgePadding * 2 + pointSpan);
  const height = 252;
  const plotTop = 30;
  const plotBottom = 170;
  const plotHeight = plotBottom - plotTop;
  const minGrade = 1;
  const maxGrade = 10;
  const chartValue = (value) =>
    plotBottom -
    ((Math.min(maxGrade, Math.max(minGrade, Number(value))) - minGrade) /
      (maxGrade - minGrade)) *
      plotHeight;
  const points = grades.map((grade, index) => ({
    x:
      grades.length > 1
        ? edgePadding + index * pointGap
        : width / 2,
    y: chartValue(grade.val),
    value: grade.val,
  }));

  const svg = document.createElementNS(svgNS, "svg");
  svg.classList.add("trend-chart");
  svg.style.width = `${width}px`;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Диаграммаи ҳаракати баллҳо");

  const defs = document.createElementNS(svgNS, "defs");
  const fillGradient = document.createElementNS(svgNS, "linearGradient");
  fillGradient.setAttribute("id", "ios-chart-fill");
  fillGradient.setAttribute("x1", "0");
  fillGradient.setAttribute("x2", "0");
  fillGradient.setAttribute("y1", "0");
  fillGradient.setAttribute("y2", "1");
  const fillTop = document.createElementNS(svgNS, "stop");
  fillTop.setAttribute("offset", "0");
  fillTop.setAttribute("stop-color", "#38bdf8");
  fillTop.setAttribute("stop-opacity", "0.3");
  const fillBottom = document.createElementNS(svgNS, "stop");
  fillBottom.setAttribute("offset", "1");
  fillBottom.setAttribute("stop-color", "#38bdf8");
  fillBottom.setAttribute("stop-opacity", "0");
  fillGradient.append(fillTop, fillBottom);
  defs.append(fillGradient);
  svg.append(defs);

  const grid = document.createElementNS(svgNS, "g");
  grid.classList.add("trend-grid");
  for (let value = 10; value >= 1; value -= 1) {
    const y = chartValue(value);
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", String(left));
    line.setAttribute("x2", String(width - right));
    line.setAttribute("y1", String(y));
    line.setAttribute("y2", String(y));
    grid.append(line);
  }
  svg.append(grid);

  const smoothPath = points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const middleX = (previous.x + point.x) / 2;
    return `${path} C ${middleX} ${previous.y}, ${middleX} ${point.y}, ${point.x} ${point.y}`;
  }, "");

  const area = document.createElementNS(svgNS, "path");
  area.classList.add("trend-area");
  const curve = smoothPath.includes(" C ")
    ? smoothPath.slice(smoothPath.indexOf(" C ") + 1)
    : "";
  area.setAttribute(
    "d",
    `M ${points[0].x} ${plotBottom} L ${points[0].x} ${points[0].y} ${curve} L ${points.at(-1).x} ${plotBottom} Z`,
  );
  svg.append(area);

  const columnGroup = document.createElementNS(svgNS, "g");
  columnGroup.classList.add("trend-columns");
  points.forEach((point, index) => {
    const previous = points[index - 1];
    const direction =
      !previous || point.value === previous.value
        ? "trend-flat"
        : point.value > previous.value
          ? "trend-up"
          : "trend-down";
    const column = document.createElementNS(svgNS, "rect");
    column.classList.add(direction);
    const columnWidth = Math.min(18, Math.max(1, pointGap * 0.42));
    column.setAttribute("x", String(point.x - columnWidth / 2));
    column.setAttribute("y", String(point.y + 8));
    column.setAttribute("width", String(columnWidth));
    column.setAttribute(
      "height",
      String(Math.max(4, plotBottom - point.y - 8)),
    );
    column.setAttribute("rx", "4");
    columnGroup.append(column);
  });
  svg.append(columnGroup);

  const lineGroup = document.createElementNS(svgNS, "g");
  lineGroup.classList.add("trend-lines");
  points.slice(1).forEach((point, index) => {
    const previous = points[index];
    const middleX = (previous.x + point.x) / 2;
    const segment = document.createElementNS(svgNS, "path");
    const direction =
      point.value > previous.value
        ? "trend-up"
        : point.value < previous.value
          ? "trend-down"
          : "trend-flat";
    segment.classList.add(direction);
    segment.setAttribute(
      "d",
      `M ${previous.x} ${previous.y} C ${middleX} ${previous.y}, ${middleX} ${point.y}, ${point.x} ${point.y}`,
    );
    lineGroup.append(segment);
  });
  svg.append(lineGroup);

  const pointGroup = document.createElementNS(svgNS, "g");
  pointGroup.classList.add("trend-points");
  const labelStep = Math.max(1, Math.ceil(points.length / 8));
  points.forEach((point, index) => {
    const circle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    const previous = points[index - 1];
    const direction =
      !previous || point.value === previous.value
        ? "trend-flat"
        : point.value > previous.value
          ? "trend-up"
          : "trend-down";
    circle.classList.add(direction);
    circle.setAttribute("cx", String(point.x));
    circle.setAttribute("cy", String(point.y));
    const pointRadius = Math.max(1.5, Math.min(5, pointGap * 0.34));
    circle.setAttribute(
      "r",
      String(index === points.length - 1 ? Math.min(8, pointRadius * 1.6) : pointRadius),
    );
    circle.setAttribute("tabindex", "0");
    circle.setAttribute("aria-label", `Балл ${index + 1}: ${point.value}`);
    circle.dataset.index = String(index);
    circle.addEventListener("click", () => {
      pointGroup.querySelectorAll("circle").forEach((item) => {
        item.classList.remove("selected");
      });
      circle.classList.add("selected");
    });
    pointGroup.append(circle);

    if (
      pointGap >= 28 ||
      index === 0 ||
      index === points.length - 1 ||
      index % labelStep === 0
    ) {
      const label = document.createElementNS(svgNS, "text");
      label.classList.add("trend-point-value");
      label.setAttribute("x", String(point.x + 9));
      label.setAttribute("y", String(point.y - 9));
      label.setAttribute("text-anchor", "start");
      label.textContent = String(point.value);
      pointGroup.append(label);
    }
  });
  svg.append(pointGroup);

  const startLabel = document.createElementNS(svgNS, "text");
  startLabel.classList.add("trend-axis-label", "trend-axis-start");
  const isSinglePoint = points.length === 1;
  startLabel.setAttribute(
    "x",
    String(points[0].x - (isSinglePoint ? 10 : 0)),
  );
  startLabel.setAttribute("y", String(height - 8));
  if (isSinglePoint) startLabel.classList.add("trend-axis-single");
  startLabel.textContent = "Оғоз";
  svg.append(startLabel);

  const endLabel = document.createElementNS(svgNS, "text");
  endLabel.classList.add("trend-axis-label", "trend-axis-end");
  endLabel.setAttribute(
    "x",
    String(points.at(-1).x + (isSinglePoint ? 10 : 0)),
  );
  endLabel.setAttribute("y", String(height - 8));
  if (isSinglePoint) endLabel.classList.add("trend-axis-single");
  endLabel.textContent = "Ҳоло";
  svg.append(endLabel);

  const viewport = document.createElement("div");
  viewport.className = "chart-viewport";
  viewport.tabIndex = 0;
  viewport.setAttribute("role", "region");
  viewport.setAttribute(
    "aria-label",
    "Диаграммаи баллҳо",
  );
  viewport.append(svg);
  container.append(viewport);
  const maxScrollLeft = viewport.scrollWidth - viewport.clientWidth;
  viewport.scrollLeft =
    grades.length > previousCount
      ? maxScrollLeft
      : Math.min(previousScrollLeft, maxScrollLeft);
}

export function buildPercentRows(container, labels, onInput) {
  if (!container) return;

  const groupContainers = container.querySelectorAll("[data-percent-group]");
  groupContainers.forEach((groupContainer) => {
    groupContainer.textContent = "";
  });

  for (let grade = 10; grade >= 1; grade -= 1) {
    const group = grade >= 6 ? "10-6" : "5-1";
    const groupContainer = container.querySelector(
      `[data-percent-group="${group}"]`,
    );
    if (!groupContainer) continue;

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
    groupContainer.append(row);
  }

  container.addEventListener("input", (event) => {
    if (event.target.matches(".pct-count")) onInput(event.target);
  });
}
// Created by Abdughafur - Believe GOD
