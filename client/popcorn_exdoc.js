import { initPopcorn } from "./src/runtime.js";
import { decorateBlocks } from "./src/blocks.js";

window.addEventListener("exdoc:loaded", () => {
  initPopcorn();
  decorateBlocks();
});
