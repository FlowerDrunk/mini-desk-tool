const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : "true";
    options[key] = value;
  }
  return options;
}

function encodeAssetName(fileName) {
  return encodeURIComponent(fileName).replaceAll("%20", "%20");
}

const options = parseArgs(process.argv.slice(2));
const version = options.version || readJson("package.json").version;
const tag = options.tag || `v${version}`;
const installerName = options.installerName || `Mini Desk Tool_${version}_x64-setup.exe`;
const assetName = options.assetName || installerName.replace(/\s+/g, ".");
const bundleDir = path.resolve(root, options.bundleDir || "src-tauri/target/release/bundle/nsis");
const installerPath = path.resolve(root, options.installer || path.join(bundleDir, installerName));
const signaturePath = path.resolve(root, options.signature || `${installerPath}.sig`);
const outputPath = path.resolve(root, options.output || path.join(bundleDir, "latest.json"));
const baseUrl = options.baseUrl || `https://github.com/FlowerDrunk/mini-desk-tool/releases/download/${tag}`;

if (!fs.existsSync(installerPath)) {
  console.error(`Missing installer: ${installerPath}`);
  process.exit(1);
}

if (!fs.existsSync(signaturePath)) {
  console.error(`Missing signature: ${signaturePath}`);
  process.exit(1);
}

const signature = normalizeUpdaterSignature(signaturePath);
if (!signature) {
  console.error(`Signature is empty: ${signaturePath}`);
  process.exit(1);
}

const manifest = {
  version,
  notes: options.notes || "",
  pub_date: options.pubDate || new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature,
      url: `${baseUrl}/${encodeAssetName(assetName)}`
    }
  }
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`Generated updater manifest: ${outputPath}`);

function normalizeUpdaterSignature(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return "";

  if (/^untrusted comment:/i.test(raw)) {
    const encoded = Buffer.from(`${raw}\n`, "utf8").toString("base64");
    fs.writeFileSync(filePath, `${encoded}\n`, "utf8");
    return encoded;
  }

  return raw.replace(/\s+/g, "");
}
