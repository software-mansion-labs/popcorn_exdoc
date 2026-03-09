import * as esbuild from "esbuild";
import { popcorn } from "@swmansion/popcorn/esbuild";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const [, , outdir, bundlePath] = process.argv;

if (!outdir || !bundlePath) {
  console.error("Usage: node build.mjs <outdir> <bundlePath>");
  process.exit(1);
}

await esbuild.build({
  entryPoints: [resolve(__dirname, "popcorn_exdoc.js")],
  bundle: true,
  format: "esm",
  outdir,
  plugins: [popcorn({ bundlePath })],
});
