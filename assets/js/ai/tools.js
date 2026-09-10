import { clean, uid } from "../utils/helpers.js";

function tokenize(expression) {
  const tokens = String(expression)
    .replace(/\s+/g, "")
    .match(/\d+(?:\.\d+)?|[()+\-*/]/g);
  if (!tokens || tokens.join("") !== String(expression).replace(/\s+/g, "")) {
    throw new Error("Unsupported expression");
  }
  return tokens;
}

export function calculateExpression(expression) {
  const output = [];
  const operators = [];
  const precedence = { "+": 1, "-": 1, "*": 2, "/": 2 };
  let previous = "operator";

  tokenize(expression).forEach((token) => {
    if (/^\d/.test(token)) {
      output.push(Number(token));
      previous = "number";
      return;
    }
    if (token === "(") {
      operators.push(token);
      previous = "operator";
      return;
    }
    if (token === ")") {
      while (operators.length && operators.at(-1) !== "(")
        output.push(operators.pop());
      if (operators.pop() !== "(") throw new Error("Unbalanced parentheses");
      previous = "number";
      return;
    }
    if (previous === "operator" || previous === "(") {
      if (token === "-" && previous !== "number") {
        output.push(0);
      } else {
        throw new Error("Invalid operator sequence");
      }
    }
    while (
      operators.length &&
      operators.at(-1) !== "(" &&
      precedence[operators.at(-1)] >= precedence[token]
    )
      output.push(operators.pop());
    operators.push(token);
    previous = "operator";
  });

  while (operators.length) {
    const operator = operators.pop();
    if (operator === "(") throw new Error("Unbalanced parentheses");
    output.push(operator);
  }

  const values = [];
  output.forEach((token) => {
    if (typeof token === "number") values.push(token);
    else {
      const right = values.pop();
      const left = values.pop();
      if (
        left === undefined ||
        right === undefined ||
        (token === "/" && right === 0)
      )
        throw new Error("Invalid expression");
      values.push(
        {
          "+": left + right,
          "-": left - right,
          "*": left * right,
          "/": left / right,
        }[token],
      );
    }
  });
  if (values.length !== 1 || !Number.isFinite(values[0]))
    throw new Error("Invalid expression");
  return values[0];
}

function findExpression(question) {
  const match = String(question).match(
    /(?:^|\s)((?:\d|[()+\-*/.]){3,})(?:\s|$)/,
  );
  return match?.[1] || null;
}

export function createMinAITools(app) {
  return {
    knowledge: {
      description: "Ҷавоб ба маълумоти одии дохили донишномаи offline",
      execute({ topic }) {
        const facts = { "пойтахти фаронсавия": "Пойтахти Фаронса Париж аст." };
        const answer = facts[String(topic || "").toLowerCase()];
        if (!answer) throw new Error("Unknown local fact");
        return { answer };
      },
    },
    calculator: {
      description: "Ҳисоби арифметикаи оддӣ бе eval",
      execute({ expression }) {
        const value = calculateExpression(expression);
        return { expression, value };
      },
    },
    create_note: {
      description: "Сохтани ёддошти воқеӣ дар Notes",
      execute({ title, body, category = "other" }) {
        const safeTitle = clean(title, 128);
        const safeBody = clean(body, 1024);
        if (!safeTitle && !safeBody) throw new Error("Empty note");
        const note = {
          id: uid(),
          title: safeTitle || "Ёддошт",
          body: safeBody,
          category: clean(category, 32) || "other",
          important: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        app.notes.unshift(note);
        app.save();
        app.renderNotes();
        return {
          created: true,
          note: { title: note.title, category: note.category },
        };
      },
    },
    search_notes: {
      description: "Ҷустуҷӯи ёддоштҳои мавҷуда",
      execute({ query }) {
        const normalized = String(query || "").toLowerCase();
        return {
          notes: app.notes
            .filter((note) =>
              `${note.title} ${note.body} ${note.category}`
                .toLowerCase()
                .includes(normalized),
            )
            .slice(0, 10),
        };
      },
    },
    export_result: {
      description: "Экспорти воқеии натиҷаи хонанда",
      async execute() {
        await app.exportResult();
        return { exported: true };
      },
    },
  };
}

export function detectToolCall(question = "") {
  const normalized = String(question).toLowerCase();
  if (/пойтахт.{0,20}фарон|фарон.{0,20}пойтахт/.test(normalized))
    return { name: "knowledge", args: { topic: "пойтахти фаронсавия" } };
  const expression = findExpression(question);
  if (expression && !/[a-zа-яё]/i.test(expression))
    return { name: "calculator", args: { expression } };
  if (
    /(ёддошт|заметка|note).*(соз|навис|илова)|соз.*(ёддошт|заметка|note)/i.test(
      normalized,
    )
  ) {
    const quoted = [
      ...String(question).matchAll(/["“”«»]([^"“”«»]+)["“”«»]/g),
    ].map((match) => match[1]);
    return {
      name: "create_note",
      args: {
        title: quoted[0] || "Ёддошт",
        body: quoted[1] || String(question),
        category: "lesson",
      },
    };
  }
  if (/(ҷустуҷӯ|пайдо кун).*(ёддошт|заметка|note)/i.test(normalized))
    return {
      name: "search_notes",
      args: {
        query: String(question)
          .replace(/.*(?:ёддошт|заметка|note)/i, "")
          .trim(),
      },
    };
  if (
    /(export|экспорт|зеркашӣ).*(натиҷа|result)|натиҷа.*(export|экспорт)/i.test(
      normalized,
    )
  )
    return { name: "export_result", args: {} };
  return null;
}
