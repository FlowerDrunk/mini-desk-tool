const { spawn } = require("child_process");
const path = require("path");

const [, , command = "dev", ...extraArgs] = process.argv;
const tauriBin = path.resolve(__dirname, "..", "node_modules", ".bin", "tauri.cmd");
const cargoBin = path.join(process.env.USERPROFILE || "", ".cargo", "bin");
const pathDelimiter = process.platform === "win32" ? ";" : ":";

const env = {
  ...process.env,
  PATH: process.env.PATH ? `${cargoBin}${pathDelimiter}${process.env.PATH}` : cargoBin
};

const child = spawn(tauriBin, [command, ...extraArgs], {
  stdio: "inherit",
  env,
  shell: process.platform === "win32"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
