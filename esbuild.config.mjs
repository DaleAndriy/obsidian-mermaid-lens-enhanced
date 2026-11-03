import esbuild from "esbuild";
import process from "process";
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { builtinModules } from "node:module";

const production = process.argv[2] === "production";
const outputDir = "dist";
const notices = await Promise.all([
  [".", "LICENSE"],
  ["node_modules/beautiful-mermaid", "LICENSE"],
  ["node_modules/elkjs", "LICENSE.md"],
  ["node_modules/entities", "LICENSE"]
].map(async ([directory, licenseFile]) => {
  const metadata = JSON.parse(await readFile(`${directory}/package.json`, "utf8"));
  const repository = typeof metadata.repository === "string" ? metadata.repository : metadata.repository?.url;
  const license = await readFile(`${directory}/${licenseFile}`, "utf8");
  return `${metadata.name} ${metadata.version}\nSource: ${repository}\n\n${license}`;
}));

if (production) {
  await rm(outputDir, { recursive: true, force: true });
}
await mkdir(outputDir, { recursive: true });
await Promise.all([
  copyFile("manifest.json", `${outputDir}/manifest.json`),
  copyFile("styles.css", `${outputDir}/styles.css`)
]);

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/autocomplete", "@codemirror/collab", "@codemirror/commands", "@codemirror/language", "@codemirror/lint", "@codemirror/search", "@codemirror/state", "@codemirror/view", "@lezer/common", "@lezer/highlight", "@lezer/lr", ...builtinModules, ...builtinModules.map((module) => `node:${module}`)],
  format: "cjs",
  // Keep licenses with the installable bundle, including transitive dependencies.
  banner: { js: `/*!\n${notices.join("\n\n---\n\n").replace(/\*\//g, "* /")}\n*/` },
  target: "es2018",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile: `${outputDir}/main.js`
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
