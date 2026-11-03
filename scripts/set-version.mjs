import { readFile, writeFile } from "node:fs/promises";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error("Version must use the x.y.z format");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function compareVersions(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function assertCurrentVersion(path, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${path} version ${actual} does not match manifest version ${expected}`);
  }
}

const [packageJson, packageLock, manifest, versions] = await Promise.all([
  readJson("package.json"),
  readJson("package-lock.json"),
  readJson("manifest.json"),
  readJson("versions.json")
]);

const currentVersion = manifest.version;
assertCurrentVersion("package.json", packageJson.version, currentVersion);
assertCurrentVersion("package-lock.json", packageLock.version, currentVersion);
assertCurrentVersion("package-lock.json root package", packageLock.packages?.[""]?.version, currentVersion);

if (compareVersions(version, currentVersion) < 0) {
  throw new Error(`Version ${version} is older than current version ${currentVersion}`);
}

packageJson.version = version;
packageLock.version = version;
packageLock.packages[""].version = version;
manifest.version = version;
versions[version] = manifest.minAppVersion;

await Promise.all([
  writeFile("package.json", `${JSON.stringify(packageJson, null, 2)}\n`),
  writeFile("package-lock.json", `${JSON.stringify(packageLock, null, 2)}\n`),
  writeFile("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`),
  writeFile("versions.json", `${JSON.stringify(versions, null, 2)}\n`)
]);

console.log(`Prepared ${manifest.name} ${version} (Obsidian >= ${manifest.minAppVersion})`);
