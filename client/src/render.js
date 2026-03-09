export function renderCompilerError(message) {
  const wrapper = document.createElement("div");
  wrapper.className = "popcorn-message popcorn-message--error";
  const pre = document.createElement("pre");
  pre.className = "popcorn-compiler-error";
  pre.textContent = message;
  wrapper.appendChild(pre);
  return wrapper;
}

export function renderStderr(lines) {
  const wrapper = document.createElement("div");
  wrapper.className = "popcorn-message popcorn-message--warning";
  const inner = document.createElement("div");
  inner.className = "popcorn-stderr";
  for (const line of lines) {
    const span = document.createElement("span");
    span.className = "popcorn-stderr-line";
    span.textContent = line;
    inner.appendChild(span);
  }
  wrapper.appendChild(inner);
  return wrapper;
}

export function renderStdout(lines) {
  const wrapper = document.createElement("div");
  wrapper.className = "popcorn-stdout";
  for (const line of lines) {
    const span = document.createElement("span");
    span.className = "popcorn-stdout-line";
    span.textContent = line;
    wrapper.appendChild(span);
  }
  return wrapper;
}

export function renderReturnValue(data) {
  const wrapper = document.createElement("div");
  wrapper.className = "popcorn-return-value";
  const arrow = document.createElement("span");
  arrow.className = "popcorn-return-arrow";
  arrow.textContent = "\u2192";
  const value = document.createElement("span");
  value.className = "popcorn-return-data";
  value.textContent = String(data);
  wrapper.appendChild(arrow);
  wrapper.appendChild(value);
  return wrapper;
}

export function renderOutput(output, { data, error, stdout, stderr }) {
  const frag = document.createDocumentFragment();
  if (stdout.length > 0) frag.appendChild(renderStdout(stdout));
  if (stderr.length > 0) frag.appendChild(renderStderr(stderr));
  if (error != null) frag.appendChild(renderCompilerError(String(error)));
  else if (data != null) frag.appendChild(renderReturnValue(data));
  output.replaceChildren(frag);
}

export function renderEvaluationStatus(output, status, delayMs = 300) {
  const timer = setTimeout(() => {
    output.style.visibility = "visible";
    const statusEl = document.createElement("div");
    statusEl.textContent = status;
    output.replaceChildren(statusEl);
  }, delayMs);

  return () => clearTimeout(timer);
}
