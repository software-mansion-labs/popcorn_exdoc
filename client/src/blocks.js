import { getPopcorn, startLogCapture } from "./runtime.js";
import { renderOutput, renderEvaluationStatus } from "./render.js";

async function runCode(code, btn, output) {
  if (output.dataset.evaluated === "true") return;

  btn.disabled = true;
  const cancelStatus = renderEvaluationStatus(output, "Evaluating…");

  const popcorn = await getPopcorn();
  const stopLogCapture = startLogCapture(popcorn);
  const result = await popcorn.call(["eval_elixir", code], {
    timeoutMs: 30_000,
  });
  const { stdout, stderr } = stopLogCapture();

  cancelStatus();
  if (result.ok) {
    renderOutput(output, { data: result.data, error: null, stdout, stderr });
    output.dataset.evaluated = "true";
  } else {
    renderOutput(output, { data: null, error: result.error, stdout, stderr });
  }
  btn.disabled = false;
}

export function decorateBlocks() {
  for (const preEl of document.querySelectorAll("pre.popcorn-eval code")) {
    if (preEl.dataset.popcornProcessed) continue;
    preEl.dataset.popcornProcessed = "true";

    const parentEl = preEl.parentElement;
    const code = preEl.textContent;

    const wrapper = document.createElement("div");
    wrapper.className = "popcorn-block";
    parentEl.insertAdjacentElement("afterend", wrapper);
    wrapper.appendChild(parentEl);

    const btn = document.createElement("button");
    btn.className = "popcorn-run-btn";
    btn.innerHTML = "&#9654; Run";
    wrapper.insertAdjacentElement("afterbegin", btn);

    const output = document.createElement("div");
    output.className = "popcorn-output";
    output.textContent = "// click Run to evaluate";
    output.dataset.evaluated = "false";
    wrapper.appendChild(output);

    btn.addEventListener("click", () => runCode(code, btn, output));
  }
}
