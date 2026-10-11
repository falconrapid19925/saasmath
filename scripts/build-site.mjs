/**
 * Static-site build for GitHub Pages (site/ -> site-dist/).
 *
 * The landing page is plain HTML; the demo drill is one esbuild bundle that
 * pulls the real drill engine, skill catalog, and authored-params bridge out
 * of src/ — pure modules only, so nothing server-side leaks into the bundle.
 * Everything is referenced with relative paths so the site works under the
 * /saasmath/ project-pages base path.
 */
import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

await rm("site-dist", { recursive: true, force: true });
await mkdir("site-dist");

await build({
  entryPoints: ["site/demo.ts"],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2019"],
  outfile: "site-dist/demo.js",
  legalComments: "none",
  logLevel: "info",
});

await cp("site/index.html", "site-dist/index.html");
await cp("public/icon.svg", "site-dist/icon.svg");
console.log("site-dist ready");
