import { initPopcorn } from "./src/runtime.js";
import { decorateBlocks } from "./src/blocks.js";
import { decorateIexBlocks } from "./src/iex.js";

window.addEventListener("exdoc:loaded", () => {
  initPopcorn();
  decorateBlocks();
  decorateIexBlocks();
});
