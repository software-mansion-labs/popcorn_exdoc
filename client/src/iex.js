import { getPopcorn, startLogCapture } from "./runtime.js";
import {
  renderOutput,
  renderCompilerError,
  renderEvaluationStatus,
} from "./render.js";

function parseInputContents(rawText) {
  const inputs = [];
  let current = null;

  for (const line of rawText.split("\n")) {
    if (line.startsWith("iex> ")) {
      if (current !== null) inputs.push(current);
      current = line.slice(5);
    } else if (line.startsWith("...> ") && current !== null) {
      current += "\n" + line.slice(5);
    } else if (current !== null) {
      inputs.push(current);
      current = null;
    }
  }
  if (current !== null) inputs.push(current);

  return inputs;
}

function findOrCreateOutputForPrompt(promptSpan) {
  const lineWrapper = promptSpan.closest(".popcorn-iex-line");
  if (!lineWrapper) return null;

  // Skip ...> continuation lines
  let sibling = lineWrapper.nextElementSibling;
  while (sibling && sibling.classList.contains("popcorn-iex-continuation")) {
    sibling = sibling.nextElementSibling;
  }

  // Collect consecutive .output siblings after continuations
  const outputSiblings = [];
  while (sibling && sibling.classList.contains("output")) {
    outputSiblings.push(sibling);
    sibling = sibling.nextElementSibling;
  }

  if (outputSiblings.length > 0) {
    // Remove all but the first, use the first as the result container
    for (let i = 1; i < outputSiblings.length; i++) {
      outputSiblings[i].remove();
    }
    return outputSiblings[0];
  }

  // No output block exists — create one after the last continuation line (or the prompt line)
  let insertAfter = lineWrapper;
  let next = lineWrapper.nextElementSibling;
  while (next && next.classList.contains("popcorn-iex-continuation")) {
    insertAfter = next;
    next = next.nextElementSibling;
  }
  const outputEl = document.createElement("span");
  outputEl.className = "output";
  outputEl.style.display = "block";
  insertAfter.insertAdjacentElement("afterend", outputEl);
  return outputEl;
}

async function runIexInput(code, promptSpan, blockId) {
  if (
    promptSpan.dataset.codeState === "EVALUATING" ||
    promptSpan.dataset.codeState === "EVALUATED"
  )
    return;

  promptSpan.dataset.codeState = "EVALUATING";

  const outputEl = findOrCreateOutputForPrompt(promptSpan);
  if (!outputEl) return;

  const cancelStatus = renderEvaluationStatus(outputEl, "Evaluating\u2026");

  try {
    const popcorn = await getPopcorn();

    const stopLogCapture = startLogCapture(popcorn);
    const result = await popcorn.call(["eval_elixir", code, blockId], {
      timeoutMs: 30_000,
    });
    const { stdout, stderr } = stopLogCapture();

    outputEl.style.visibility = "visible";
    cancelStatus();
    renderOutput(outputEl, {
      data: result.ok ? result.data : null,
      error: result.ok ? null : result.error,
      stdout,
      stderr,
    });

    promptSpan.dataset.codeState = result.ok ? "EVALUATED" : "NOT_EVALUATED";
  } catch (e) {
    cancelStatus();
    outputEl.innerHTML = "";
    outputEl.appendChild(renderCompilerError(String(e)));
    promptSpan.dataset.codeState = "NOT_EVALUATED";
  }
}

function isIexPrompt(node) {
  return node.classList?.contains("gp") && node.textContent.trim() === "iex>";
}

function isIexContinuation(node) {
  return node.classList?.contains("gp") && node.textContent.trim() === "...>";
}

export function decorateIexBlocks() {
  for (const codeEl of document.querySelectorAll("pre.popcorn-iex code")) {
    if (codeEl.dataset.popcornProcessed) continue;
    codeEl.dataset.popcornProcessed = "true";

    const blockId = crypto.randomUUID();
    const inputContents = parseInputContents(codeEl.textContent);

    // Group child nodes into lines by splitting after each newline-containing node
    const lines = [];
    let currentLine = [];
    for (const node of Array.from(codeEl.childNodes)) {
      currentLine.push(node);
      if (node.textContent.includes("\n")) {
        lines.push(currentLine);
        currentLine = [];
      }
    }

    if (currentLine.length > 0) lines.push(currentLine);

    // Rebuild the code element with each line wrapped in a span
    codeEl.innerHTML = "";
    for (const line of lines) {
      const hasPrompt = line.some(isIexPrompt);
      const hasContinuation = line.some(isIexContinuation);
      const wrapper = document.createElement("span");
      wrapper.className = hasPrompt
        ? "popcorn-iex-line"
        : hasContinuation
          ? "popcorn-iex-continuation"
          : "output";
      wrapper.append(...line);
      codeEl.appendChild(wrapper);
    }

    // Attach click handlers to iex> prompt spans
    codeEl.querySelectorAll(".gp").forEach((promptSpan, idx) => {
      if (promptSpan.textContent.trim() !== "iex>") return;

      promptSpan.dataset.codeState = "NOT_EVALUATED";
      promptSpan.style.cursor = "pointer";
      promptSpan.addEventListener("click", () =>
        runIexInput(inputContents[idx] ?? "", promptSpan, blockId),
      );
    });
  }
}
