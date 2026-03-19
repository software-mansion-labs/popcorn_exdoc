import { Popcorn } from "@swmansion/popcorn";

let popcornInstance = null;
let initPromise = null;

export function initPopcorn() {
  initPromise = (async () => {
    popcornInstance = await Popcorn.init({ debug: true, bundlePath: "./bundle.avm" });
  })();

  initPromise.catch((e) => {
    console.error("Failed to initialize Popcorn runtime:", e);
  });
}

export async function getPopcorn() {
  if (popcornInstance) return popcornInstance;
  if (initPromise) await initPromise;
  if (!popcornInstance) throw new Error("Popcorn runtime failed to initialize");
  return popcornInstance;
}

export function startLogCapture(popcorn) {
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
