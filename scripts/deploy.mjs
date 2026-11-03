import { access, cp, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";

function parseArguments(args) {
  let vault = "ObsidianTestVault";
  let includeNotes = true;
  let openObsidian = true;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--vault") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--vault 需要指定路径");
      vault = value;
      index += 1;
    } else if (argument === "--no-notes") {
      includeNotes = false;
    } else if (argument === "--no-open") {
      openObsidian = false;
    } else if (argument === "--help" || argument === "-h") {
      console.log(`用法: npm run deploy -- [选项]

选项:
  --vault <path>  Vault 路径，默认为 ./ObsidianTestVault
  --no-notes      不复制验收测试笔记
  --no-open       部署后不打开 Obsidian
  --help, -h      显示帮助`);
      process.exit(0);
    } else {
      throw new Error(`未知参数: ${argument}`);
    }
  }

  return { vault: path.resolve(vault), includeNotes, openObsidian };
}

function obsidianConfigPath() {
  if (process.platform === "win32" && process.env.APPDATA) {
    return path.join(process.env.APPDATA, "obsidian", "obsidian.json");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "obsidian", "obsidian.json");
  }
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "obsidian", "obsidian.json");
}

function comparablePath(value) {
  const normalized = path.normalize(path.resolve(value));
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

/** Register a newly-created local folder so Obsidian URI can open it as a Vault. */
async function registerVault(vault) {
  const configPath = obsidianConfigPath();
  let config = { vaults: {} };
  try {
    config = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (!config.vaults || typeof config.vaults !== "object") config.vaults = {};

  const existing = Object.entries(config.vaults).find(([, entry]) =>
    entry && typeof entry.path === "string" && comparablePath(entry.path) === comparablePath(vault)
  );
  if (existing) return existing[0];

  let vaultId = createHash("sha256").update(comparablePath(vault)).digest("hex").slice(0, 16);
  let suffix = 0;
  while (config.vaults[vaultId]) {
    suffix += 1;
    vaultId = createHash("sha256").update(`${comparablePath(vault)}:${suffix}`).digest("hex").slice(0, 16);
  }
  config.vaults[vaultId] = { path: vault, ts: Date.now() };
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config), "utf8");
  return vaultId;
}

async function launchUri(uri) {
  let command;
  let args;
  if (process.platform === "win32") {
    const candidates = [
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs", "Obsidian", "Obsidian.exe"),
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Obsidian", "Obsidian.exe")
    ].filter(Boolean);
    command = undefined;
    for (const candidate of candidates) {
      try {
        await access(candidate);
        command = candidate;
        break;
      } catch {
        // Try the next standard installation location.
      }
    }
    if (command) {
      args = [uri];
    } else {
      command = "cmd.exe";
      args = ["/d", "/s", "/c", `start "" "${uri}"`];
    }
  } else if (process.platform === "darwin") {
    command = "open";
    args = [uri];
  } else {
    command = "xdg-open";
    args = [uri];
  }
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}

const { vault, includeNotes, openObsidian } = parseArguments(process.argv.slice(2));
const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const pluginDirectory = path.join(vault, ".obsidian", "plugins", manifest.id);
const artifactNames = ["main.js", "manifest.json", "styles.css"];
const acceptanceFile = "Mermaid Lens Tests/00-验收清单";

await mkdir(pluginDirectory, { recursive: true });
await Promise.all(artifactNames.map((name) =>
  copyFile(path.join("dist", name), path.join(pluginDirectory, name))
));

if (includeNotes) {
  await cp("fixtures/acceptance", path.join(vault, "Mermaid Lens Tests"), {
    recursive: true,
    force: true
  });
}

console.log(`\n${manifest.name} 已部署到：\n${pluginDirectory}`);
if (includeNotes) console.log(`验收笔记已复制到：\n${path.join(vault, "Mermaid Lens Tests")}`);

if (openObsidian) {
  const vaultId = await registerVault(vault);
  // Obsidian requires RFC 3986 encoding here; URLSearchParams encodes spaces
  // as `+`, which Obsidian treats as a literal plus sign in note paths.
  let uri = `obsidian://open?vault=${encodeURIComponent(vaultId)}`;
  if (includeNotes) uri += `&file=${encodeURIComponent(acceptanceFile)}`;
  await launchUri(uri);
  console.log("\n已通过 Obsidian URI 打开该 Vault。若 Vault 已打开，Obsidian 会切换到验收笔记。");
} else {
  console.log(`\n请在 Obsidian 中打开该 Vault，然后启用或重新加载 ${manifest.name}。`);
}
console.log();
