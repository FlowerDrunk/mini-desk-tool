const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const strictUpdate = process.argv.includes("--strict-update");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function matchVersion(relativePath, pattern) {
  const content = readText(relativePath);
  const match = content.match(pattern);
  if (!match) {
    throw new Error(`Unable to read version from ${relativePath}`);
  }
  return match[1];
}

const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const tauriConfig = readJson("src-tauri/tauri.conf.json");
const versions = {
  "package.json": packageJson.version,
  "package-lock.json": packageLock.version,
  "package-lock root package": packageLock.packages?.[""]?.version,
  "src-tauri/Cargo.toml": matchVersion("src-tauri/Cargo.toml", /^\s*version\s*=\s*"([^"]+)"/m),
  "src-tauri/tauri.conf.json": tauriConfig.version
};

const expected = versions["package.json"];
const mismatches = Object.entries(versions).filter(([, version]) => version !== expected);

if (!expected) {
  console.error("Release check failed: package.json version is empty.");
  process.exit(1);
}

if (mismatches.length) {
  console.error("Release check failed: version numbers are not aligned.");
  for (const [source, version] of Object.entries(versions)) {
    const marker = version === expected ? "OK" : "Mismatch";
    console.error(`- ${source}: ${version || "(empty)"} ${marker}`);
  }
  process.exit(1);
}

const tag = `v${expected}`;
const installerName = `Mini Desk Tool_${expected}_x64-setup.exe`;
const releaseAssetName = installerName.replace(/\s+/g, ".");
const updaterConfig = tauriConfig.plugins?.updater;
const updaterEndpoint = "https://github.com/FlowerDrunk/mini-desk-tool/releases/latest/download/latest.json";

if (tauriConfig.bundle?.createUpdaterArtifacts !== true) {
  console.error("Release check failed: bundle.createUpdaterArtifacts must be true.");
  process.exit(1);
}

if (!updaterConfig?.endpoints?.includes(updaterEndpoint)) {
  console.error("Release check failed: updater endpoint is missing or incorrect.");
  process.exit(1);
}

if (strictUpdate) {
  validateStrictUpdaterArtifacts({ expected, installerName, releaseAssetName, updaterConfig });
}

console.log(`Release check passed for ${tag}.`);
console.log(`Expected Git tag / GitHub Release: ${tag}`);
console.log(`Expected Windows installer: ${installerName}`);
if (!strictUpdate) {
  console.log("Run `npm run check:release -- --strict-update` after signing to validate .sig and latest.json.");
  printUpdaterReadinessHints({ installerName, updaterConfig });
}

function validateStrictUpdaterArtifacts({ expected, installerName, releaseAssetName, updaterConfig }) {
  if (!updaterConfig?.pubkey || updaterConfig.pubkey === "REPLACE_WITH_TAURI_UPDATER_PUBLIC_KEY") {
    console.error("Release check failed: updater public key has not been configured.");
    process.exit(1);
  }

  const bundleDir = path.join(root, "src-tauri", "target", "release", "bundle", "nsis");
  const installerPath = path.join(bundleDir, installerName);
  const signaturePath = `${installerPath}.sig`;
  const manifestPath = path.join(bundleDir, "latest.json");

  for (const filePath of [installerPath, signaturePath, manifestPath]) {
    if (!fs.existsSync(filePath)) {
      console.error(`Release check failed: missing ${filePath}`);
      process.exit(1);
    }
  }

  const signature = fs.readFileSync(signaturePath, "utf8").trim();
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const platform = manifest.platforms?.["windows-x86_64"];

  if (String(manifest.version || "").replace(/^v/i, "") !== expected) {
    console.error("Release check failed: latest.json version does not match package version.");
    process.exit(1);
  }

  if (!platform?.url || !platform.url.includes(encodeURIComponent(releaseAssetName))) {
    console.error("Release check failed: latest.json windows-x86_64.url does not point to the expected installer.");
    process.exit(1);
  }

  if (!platform?.signature || platform.signature !== signature) {
    console.error("Release check failed: latest.json signature does not match the .sig file.");
    process.exit(1);
  }
}

function printUpdaterReadinessHints({ installerName, updaterConfig }) {
  const bundleDir = path.join(root, "src-tauri", "target", "release", "bundle", "nsis");
  const installerPath = path.join(bundleDir, installerName);
  const signaturePath = `${installerPath}.sig`;
  const manifestPath = path.join(bundleDir, "latest.json");

  if (!updaterConfig?.pubkey || updaterConfig.pubkey === "REPLACE_WITH_TAURI_UPDATER_PUBLIC_KEY") {
    console.warn("Updater warning: public key is still a placeholder; signed updates cannot be installed yet.");
  }

  if (!fs.existsSync(signaturePath) || !fs.existsSync(manifestPath)) {
    console.warn("Updater warning: publish the installer, matching .sig, and latest.json together before using in-app updates.");
  }
}
