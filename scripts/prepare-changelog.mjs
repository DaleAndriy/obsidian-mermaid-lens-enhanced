import { readFile, writeFile } from "node:fs/promises";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error("Usage: node scripts/prepare-changelog.mjs x.y.z");
}

const changelogPath = process.env.CHANGELOG_PATH ?? "CHANGELOG.md";
const [changelog, manifestText] = await Promise.all([
  readFile(changelogPath, "utf8"),
  readFile("manifest.json", "utf8")
]);
const previousVersion = JSON.parse(manifestText).version;

if (new RegExp(`^## \\[${version.replace(/\./g, "\\.")}\\](?:\\s|$)`, "m").test(changelog)) {
  throw new Error(`CHANGELOG.md already contains version ${version}`);
}

const unreleasedHeading = /^## \[Unreleased\]\s*$/m;
const headingMatch = unreleasedHeading.exec(changelog);
if (!headingMatch) throw new Error("CHANGELOG.md is missing an [Unreleased] section");

const contentStart = headingMatch.index + headingMatch[0].length;
const remaining = changelog.slice(contentStart);
const boundaryOffsets = [remaining.search(/^## /m), remaining.search(/^\[[^\]]+\]:/m)]
  .filter((offset) => offset >= 0);
const contentEnd = boundaryOffsets.length === 0
  ? changelog.length
  : contentStart + Math.min(...boundaryOffsets);
const unreleasedContent = changelog.slice(contentStart, contentEnd).trim();
if (!unreleasedContent) throw new Error("CHANGELOG.md [Unreleased] section is empty");

const date = new Date().toISOString().slice(0, 10);
let updated = changelog.replace(
  unreleasedHeading,
  `## [Unreleased]\n\n## [${version}] - ${date}`
);

const unreleasedLink = /^\[Unreleased\]:\s+\S+\s*$/m;
if (!unreleasedLink.test(updated)) {
  throw new Error("CHANGELOG.md is missing the [Unreleased] comparison link");
}
const repositoryUrl = "https://github.com/DaleAndriy/obsidian-mermaid-lens-enhanced";
updated = updated.replace(
  unreleasedLink,
  `[Unreleased]: ${repositoryUrl}/compare/${version}...HEAD\n[${version}]: ${repositoryUrl}/compare/${previousVersion}...${version}`
);

await writeFile(changelogPath, updated, "utf8");
console.log(`Prepared CHANGELOG.md for ${version}`);
