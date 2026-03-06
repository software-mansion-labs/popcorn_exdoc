  import { Popcorn } from "./package";

  let popcornInstance = null;
  let initPromise = null;

  function getPopcorn() {
    if (popcornInstance) return Promise.resolve(popcornInstance);
    if (initPromise) return initPromise;

    initPromise = Popcorn.init({
      onStdout: (msg) => console.log("[popcorn]", msg),
      onStderr: (msg) => console.warn("[popcorn stderr]", msg),
    }).then((p) => {
      popcornInstance = p;
      return p;
    });

    return initPromise;
  }

  function decorateBlocks() {
    for (const codeEl of document.querySelectorAll("pre code.popcorn-eval")) {
      if (codeEl.dataset.popcornProcessed) continue;
      codeEl.dataset.popcornProcessed = "true";

      const preEl = codeEl.parentElement;
      const code = codeEl.textContent;

      const wrapper = document.createElement("div");
      wrapper.className = "popcorn-block";
      preEl.insertAdjacentElement("afterend", wrapper);
      wrapper.appendChild(preEl);

      const btn = document.createElement("button");
      btn.className = "popcorn-run-btn";
      btn.innerHTML = "&#9654; Run";
      wrapper.appendChild(btn);

      const output = document.createElement("pre");
      output.className = "popcorn-output";
      output.textContent = "// click Run to evaluate";
      wrapper.appendChild(output);

      btn.addEventListener("click", async () => {
        output.className = "popcorn-output";
        output.textContent = "Loading runtime\u2026";
        btn.disabled = true;
        try {
          const popcorn = await getPopcorn();
          output.textContent = "Evaluating\u2026";
          const result = await popcorn.call(["eval_elixir", code], {
            timeoutMs: 30_000,
          });
          if (result.ok) {
            output.textContent = result.data;
          } else {
            output.className = "popcorn-output error";
            output.textContent = String(result.error);
          }
        } catch (e) {
          output.className = "popcorn-output error";
          output.textContent = String(e);
        } finally {
          btn.disabled = false;
        }
      });
    }
  }

  window.addEventListener("exdoc:loaded", decorateBlocks);