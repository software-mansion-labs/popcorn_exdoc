// node_modules/@swmansion/popcorn/dist/types.mjs
var INIT_VM_TIMEOUT_MS = 3e4;
var CALL_TIMEOUT_MS = 6e4;
var HEARTBEAT_TIMEOUT_MS = 6e4;
var MAX_RELOAD_N = 3;
var MESSAGES = {
  INIT: "popcorn-init",
  START_VM: "popcorn-startVm",
  CALL: "popcorn-call",
  CAST: "popcorn-cast",
  CALL_ACK: "popcorn-callAck",
  STDOUT: "popcorn-stdout",
  STDERR: "popcorn-stderr",
  HEARTBEAT: "popcorn-heartbeat",
  RELOAD: "popcorn-reload"
};
var MESSAGES_TYPES = new Set(Object.values(MESSAGES));
function isMessageType(type) {
  return MESSAGES_TYPES.has(type);
}

// node_modules/@swmansion/popcorn/dist/errors.mjs
var defaultErrorMessages = {
  timeout: "Promise timeout",
  deinitialized: "Call cancelled due to instance deinit",
  reload: "Call cancelled due to iframe reload"
};
var PopcornError = class extends Error {
  code;
  constructor(code, message) {
    super(message ?? defaultErrorMessages[code]);
    this.code = code;
    this.name = "PopcornError";
  }
};
var PopcornInternalError = class extends Error {
  code;
  constructor(code, message) {
    super(message ?? `Internal error: ${code}`);
    this.code = code;
    this.name = "PopcornInternalError";
  }
};
function throwError(error) {
  switch (error.t) {
    case "assert":
      throw new PopcornInternalError("assert", "Assertion error");
    case "private_constructor":
      throw new PopcornInternalError("private_constructor", "Don't construct the Popcorn object directly, use Popcorn.init() instead");
    case "bad_call":
      throw new PopcornInternalError("bad_call", "Response for non-existent call");
    case "no_acked_call":
      throw new PopcornInternalError("no_acked_call", "Response for non-acknowledged call");
    case "bad_ack":
      throw new PopcornInternalError("bad_ack", "Ack for non-existent call");
    case "already_awaited":
      throw new PopcornInternalError("already_awaited", `Cannot await message "${error.messageType}" when message "${error.awaitedMessageType}" is already awaited`);
    case "already_mounted":
      throw new PopcornInternalError("already_mounted", "Iframe already mounted");
    case "unmounted":
      throw new PopcornInternalError("unmounted", "WASM iframe not mounted");
    case "bad_target":
      throw new PopcornInternalError("bad_target", "Unspecified target process");
    case "bad_status":
      throw new PopcornInternalError("bad_status", `Operation not allowed: instance in "${error.status}" state, expected "${error.expectedStatus}"`);
    case "bundle_not_found":
      throw new PopcornInternalError("bundle_not_found", `Could not find a valid .avm bundle at "${error.primary}" or fallback "${error.fallback}"`);
  }
}

// node_modules/@swmansion/popcorn/dist/bridge.mjs
var STYLE_HIDDEN = "visibility: hidden; width: 0px; height: 0px; border: none";
var IframeBridge = class {
  iframe;
  handlerRef;
  // @ts-expect-error TODO: use for tracing
  debug;
  onMessage;
  constructor(args) {
    const { container, config, script, debug, onMessage } = args;
    this.debug = debug;
    this.onMessage = onMessage;
    this.iframe = document.createElement("iframe");
    this.iframe.srcdoc = `
      <html lang="en" dir="ltr">
          <head>
          ${metaTagsFrom(config)}
          </head>
          <body>
            <script type="module" defer>
              import { ${script.entrypoint} } from "${script.url}";
              ${script.entrypoint}();
            <\/script>
          </body>
      </html>`;
    this.iframe.style = STYLE_HIDDEN;
    this.handlerRef = this.messageHandler.bind(this);
    window.addEventListener("message", this.handlerRef);
    container.appendChild(this.iframe);
  }
  sendIframeRequest(data) {
    const w = this.iframe.contentWindow;
    if (w === null)
      throwError({ t: "assert" });
    w.postMessage(data);
  }
  deinit() {
    window.removeEventListener("message", this.handlerRef);
    this.iframe.remove();
  }
  messageHandler({ data }) {
    if (isIframeResponse(data)) {
      this.onMessage(data);
    }
  }
};
function isIframeResponse(payload) {
  if (typeof payload !== "object" || payload === null)
    return false;
  if (!Object.hasOwn(payload, "type") || !Object.hasOwn(payload, "value"))
    return false;
  if (typeof payload.type !== "string")
    return false;
  return isMessageType(payload.type);
}
function metaTagsFrom(config) {
  return Object.entries(config).map(([key, value]) => `<meta name="${key}" content="${value}" />`).join("\n");
}

// node_modules/@swmansion/popcorn/dist/popcorn.mjs
var INIT_TOKEN = Symbol();
var IFRAME_URL = new URL("./iframe.mjs", import.meta.url).href;
var Popcorn = class _Popcorn {
  heartbeatTimeoutMs = null;
  onReloadCallback;
  bridge = null;
  bridgeConfig;
  debug = false;
  bundleURLs;
  state = { status: "uninitialized" };
  initProcess = null;
  requestId = 0;
  calls = /* @__PURE__ */ new Map();
  logListeners = {
    stdout: /* @__PURE__ */ new Set(),
    stderr: /* @__PURE__ */ new Set()
  };
  awaitedMessage = null;
  heartbeatTimeout = null;
  reloadN = 0;
  constructor(params, token) {
    if (token !== INIT_TOKEN)
      throwError({ t: "private_constructor" });
    const bundlePaths = params.bundlePaths ?? ["/bundle.avm"];
    this.bundleURLs = bundlePaths.map((p) => new URL(p, import.meta.url).href);
    this.onReloadCallback = params.onReload ?? noop;
    this.debug = params.debug ?? false;
    this.bridgeConfig = {
      container: params.container,
      script: { url: IFRAME_URL, entrypoint: "runIFrame" },
      config: Object.fromEntries(
        this.bundleURLs.map((url, i) => [`bundle-path-${i}`, url])
      ),
      debug: true,
      onMessage: this.iframeHandler.bind(this)
    };
    this.logListeners.stdout.add(params.onStdout ?? console.log);
    this.logListeners.stderr.add(params.onStderr ?? console.warn);
    this.heartbeatTimeoutMs = params.heartbeatTimeoutMs ?? HEARTBEAT_TIMEOUT_MS;
  }
  /**
   * Creates an iframe and sets up communication channels.
   * Returns after Elixir code calls `Popcorn.Wasm.register/1`.
   *
   * @example
   * import { Popcorn } from "@swmansion/popcorn";
   * const popcorn = await Popcorn.init({
   *   onStdout: console.log,
   *   onStderr: console.error,
   *   debug: true,
   * });
   */
  static async init(options) {
    const { container, ...constructorParams } = options;
    const containerWithDefault = container ?? document.documentElement;
    const bundlePaths = constructorParams.bundlePaths && constructorParams.bundlePaths.length > 0 ? constructorParams.bundlePaths : [await resolveBundleURL("/bundle.avm", "/assets/bundle.avm")];
    const popcorn = new _Popcorn({ ...constructorParams, bundlePaths, container: containerWithDefault }, INIT_TOKEN);
    popcorn.trace("Main: init, params: ", { container, ...constructorParams });
    await popcorn.mount();
    return popcorn;
  }
  async mount() {
    if (this.bridge !== null)
      throwError({ t: "already_mounted" });
    this.assertStatus(["uninitialized", "reload"]);
    this.transition({ status: "mount" });
    this.trace("Main: mount, container: ", this.bridgeConfig.container);
    this.bridge = new IframeBridge(this.bridgeConfig);
    try {
      await this.awaitMessage(MESSAGES.INIT);
      this.transition({ status: "await_vm" });
      this.trace("Main: iframe loaded");
      const startTime = performance.now();
      const startVmResult = await withTimeout(this.awaitMessage(MESSAGES.START_VM).then((data) => ({
        ok: true,
        data,
        durationMs: performance.now() - startTime
      })), INIT_VM_TIMEOUT_MS);
      if (!startVmResult.ok)
        throwError({ t: "assert" });
      this.initProcess = startVmResult.data;
      this.transition({ status: "ready" });
      this.trace("Main: mounted, main process: ", this.initProcess);
      this.onHeartbeat();
    } catch (error) {
      this.deinit();
      throw error;
    }
  }
  /**
   * Sends a message to an Elixir process and awaits for the response.
   *
   * If Elixir doesn't respond in configured timeout, the returned promise will be rejected with "process timeout" error.
   *
   * Unless passed via options, the name passed in `Popcorn.Wasm.register/1` on the Elixir side is used.
   * Throws "Unspecified target process" if default process is not set and no process is specified.
   *
   * @example
   * const result = await popcorn.call(
   *   { action: "get_user", id: 123 },
   *   { process: "user_server", timeoutMs: 5_000 },
   * );
   * console.log(result.data); // Deserialized Elixir response
   * console.log(result.durationMs); // Entire call duration
   */
  async call(args, { process, timeoutMs } = {}) {
    this.assertStatus(["ready"]);
    const targetProcess = process ?? this.initProcess;
    if (this.bridge === null)
      throwError({ t: "unmounted" });
    if (targetProcess === null)
      throwError({ t: "bad_target" });
    const requestId = this.requestId++;
    const startTimeMs = performance.now();
    const callPromise = new Promise((resolve) => {
      if (this.bridge === null)
        throwError({ t: "unmounted" });
      this.trace("Main: call: ", { requestId, process, args });
      this.bridge.sendIframeRequest({
        type: MESSAGES.CALL,
        value: { requestId, process: targetProcess, args }
      });
      this.calls.set(requestId, {
        acknowledged: false,
        startTimeMs,
        resolve
      });
    });
    const result = await withTimeout(callPromise, timeoutMs ?? CALL_TIMEOUT_MS);
    this.calls.delete(requestId);
    return result;
  }
  /**
   * Sends a message to an Elixir process (default or from options) and returns immediately.
   *
   * Unless passed via options, the name passed in `Popcorn.Wasm.register/1` on the Elixir side is used.
   * Throws "Unspecified target process" if default process is not set and no process is specified.
   */
  cast(args, { process } = {}) {
    this.assertStatus(["ready"]);
    const targetProcess = process ?? this.initProcess;
    if (this.bridge === null)
      throwError({ t: "unmounted" });
    if (targetProcess === null)
      throwError({ t: "bad_target" });
    const requestId = this.requestId++;
    this.trace("Main: cast: ", { requestId, process, args });
    this.bridge.sendIframeRequest({
      type: MESSAGES.CAST,
      value: { requestId, process: targetProcess, args }
    });
  }
  /**
   * Destroys an iframe and resets the instance.
   */
  deinit() {
    if (this.bridge === null)
      throwError({ t: "unmounted" });
    this.trace("Main: deinit");
    this.transition({ status: "deinit" });
    this.bridge.deinit();
    this.bridge = null;
    this.awaitedMessage = null;
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
    this.logListeners.stdout.clear();
    this.logListeners.stderr.clear();
    for (const callData of this.calls.values()) {
      const durationMs = performance.now() - callData.startTimeMs;
      callData.resolve({
        ok: false,
        error: new PopcornError("deinitialized"),
        durationMs
      });
    }
    this.calls.clear();
  }
  /**
   * Registers a log listener that will be called when output of the specified type is received.
   */
  registerLogListener(listener, type) {
    this.logListeners[type].add(listener);
  }
  /**
   * Unregisters a previously registered log listener.
   */
  unregisterLogListener(listener, type) {
    this.logListeners[type].delete(listener);
  }
  notifyLogListeners(type, message) {
    this.logListeners[type].forEach((listener) => {
      listener(message);
    });
  }
  iframeHandler(data) {
    const awaitedMessage = this.awaitedMessage;
    if (awaitedMessage && data.type == awaitedMessage.type) {
      this.awaitedMessage = null;
      awaitedMessage.resolve?.(data.value);
      return;
    }
    if (data.type === MESSAGES.STDOUT) {
      this.notifyLogListeners("stdout", data.value);
    } else if (data.type === MESSAGES.STDERR) {
      this.notifyLogListeners("stderr", data.value);
    } else if (data.type === MESSAGES.CALL) {
      this.onCall(data.value);
    } else if (data.type === MESSAGES.CALL_ACK) {
      this.onCallAck(data.value);
    } else if (data.type === MESSAGES.HEARTBEAT) {
      this.onHeartbeat();
    } else if (data.type === MESSAGES.RELOAD) {
      this.reloadIframe();
    } else {
      throwError({ t: "assert" });
    }
  }
  onCallAck({ requestId }) {
    this.assertStatus(["ready"]);
    this.trace("Main: onCallAck: ", { requestId });
    const callData = this.calls.get(requestId);
    if (callData === void 0)
      throwError({ t: "bad_ack" });
    this.calls.set(requestId, { ...callData, acknowledged: true });
  }
  onCall({ requestId, error, data }) {
    this.assertStatus(["ready"]);
    this.trace("Main: onCall: ", { requestId, error, data });
    const callData = this.calls.get(requestId);
    if (callData === void 0)
      throwError({ t: "bad_call" });
    if (!callData.acknowledged)
      throwError({ t: "no_acked_call" });
    this.calls.delete(requestId);
    const durationMs = performance.now() - callData.startTimeMs;
    if (error !== void 0) {
      callData.resolve({ ok: false, error, durationMs });
    } else {
      callData.resolve({ ok: true, data, durationMs });
    }
  }
  onHeartbeat() {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
    }
    this.heartbeatTimeout = setTimeout(() => {
      this.trace("Main: heartbeat lost");
      this.reloadIframe("heartbeat_lost");
    }, this.heartbeatTimeoutMs);
  }
  reloadIframe(reason = "other") {
    if (this.bridge === null) {
      throwError({ t: "unmounted" });
    }
    if (document.hidden) {
      this.trace("Main: reloading iframe skipped, window not visible");
      return;
    }
    this.reloadN++;
    if (this.reloadN > MAX_RELOAD_N) {
      this.trace("Main: exceeded max reload number");
      return;
    }
    this.trace("Main: reloading iframe");
    this.transition({ status: "reload" });
    this.bridge.deinit();
    this.bridge = null;
    this.awaitedMessage = null;
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
    for (const callData of this.calls.values()) {
      const durationMs = performance.now() - callData.startTimeMs;
      callData.resolve({
        ok: false,
        error: new PopcornError("reload"),
        durationMs
      });
    }
    this.calls.clear();
    this.onReloadCallback(reason);
    this.mount();
  }
  awaitMessage(type) {
    if (this.awaitedMessage) {
      throwError({
        t: "already_awaited",
        messageType: this.awaitedMessage.type,
        awaitedMessageType: type
      });
    }
    this.awaitedMessage = { type };
    return new Promise((resolve) => {
      if (!this.awaitedMessage)
        throwError({ t: "assert" });
      this.awaitedMessage.resolve = resolve;
    });
  }
  trace(...messages) {
    if (this.debug) {
      console.debug(...messages);
    }
  }
  transition(to) {
    this.trace(`State: ${this.state.status} -> ${to.status}`);
    this.state = to;
  }
  assertStatus(validStatuses) {
    const currentStatus = this.state.status;
    if (!validStatuses.includes(currentStatus)) {
      throwError({
        t: "bad_status",
        status: currentStatus,
        expectedStatus: validStatuses.join(" | ")
      });
    }
  }
};
async function withTimeout(promise, ms) {
  let timeout = null;
  const timeoutPromise = new Promise((resolve) => {
    timeout = setTimeout(() => {
      resolve({
        ok: false,
        error: new PopcornError("timeout"),
        durationMs: ms
      });
    }, ms);
  });
  const result = await Promise.race([promise, timeoutPromise]);
  if (!timeout)
    throwError({ t: "assert" });
  clearTimeout(timeout);
  return result;
}
function noop() {
}
async function resolveBundleURL(primary, fallback) {
  const fetchBundle = async (path) => {
    const url = new URL(path, import.meta.url).href;
    const response = await fetch(url, { method: "HEAD" });
    const contentType = response.headers.get("Content-Type") ?? "";
    if (!response.ok || contentType.includes("text/html")) {
      throw new Error(`Bundle not found at "${path}"`);
    }
    return path;
  };
  try {
    return await Promise.any([fetchBundle(primary), fetchBundle(fallback)]);
  } catch {
    throwError({ t: "bundle_not_found", primary, fallback });
  }
}

// src/runtime.js
var popcornInstance = null;
var initPromise = null;
function initPopcorn() {
  if (initPromise) return;
  const userBundleMeta = document.querySelector('meta[name="popcorn-user-bundle"]');
  const bundlePaths = ["./bundle.avm"];
  if (userBundleMeta) bundlePaths.push(userBundleMeta.content);
  initPromise = (async () => {
    popcornInstance = await Popcorn.init({ debug: true, bundlePaths });
  })();
  initPromise.catch((e) => {
    console.error("Failed to initialize Popcorn runtime:", e);
  });
}
async function getPopcorn() {
  if (popcornInstance) return popcornInstance;
  if (initPromise) await initPromise;
  if (!popcornInstance) throw new Error("Popcorn runtime failed to initialize");
  return popcornInstance;
}
function startLogCapture(popcorn) {
  const stdout = [];
  const stderr = [];
  const stdoutListener = (msg) => stdout.push(msg);
  const stderrListener = (msg) => stderr.push(msg);
  popcorn.registerLogListener(stdoutListener, "stdout");
  popcorn.registerLogListener(stderrListener, "stderr");
  return () => {
    popcorn.unregisterLogListener(stdoutListener, "stdout");
    popcorn.unregisterLogListener(stderrListener, "stderr");
    return { stdout, stderr };
  };
}

// src/render.js
function renderCompilerError(message) {
  const wrapper = document.createElement("div");
  wrapper.className = "popcorn-message popcorn-message--error";
  const pre = document.createElement("pre");
  pre.className = "popcorn-compiler-error";
  pre.textContent = message;
  wrapper.appendChild(pre);
  return wrapper;
}
function renderStderr(lines) {
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
function renderStdout(lines) {
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
function renderReturnValue(data) {
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
function renderOutput(output, { data, error, stdout, stderr }) {
  const frag = document.createDocumentFragment();
  if (stdout.length > 0) frag.appendChild(renderStdout(stdout));
  if (stderr.length > 0) frag.appendChild(renderStderr(stderr));
  if (error != null) frag.appendChild(renderCompilerError(String(error)));
  else if (data != null) frag.appendChild(renderReturnValue(data));
  output.replaceChildren(frag);
}
function renderEvaluationStatus(output, status, delayMs = 300) {
  const timer = setTimeout(() => {
    output.style.visibility = "visible";
    const statusEl = document.createElement("div");
    statusEl.textContent = status;
    output.replaceChildren(statusEl);
  }, delayMs);
  return () => clearTimeout(timer);
}

// src/blocks.js
async function runCode(code, btn, output) {
  if (output.dataset.evaluated === "true") return;
  btn.disabled = true;
  const cancelStatus = renderEvaluationStatus(output, "Evaluating\u2026");
  const popcorn = await getPopcorn();
  const stopLogCapture = startLogCapture(popcorn);
  const result = await popcorn.call(["eval_elixir", code], { timeoutMs: 3e4 });
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
function decorateBlocks() {
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

// popcorn_exdoc.js
window.addEventListener("exdoc:loaded", () => {
  initPopcorn();
  decorateBlocks();
});
