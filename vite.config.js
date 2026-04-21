const { defineConfig } = require("vite");
const path = require("path");

module.exports = defineConfig({
  root: path.resolve(__dirname, "src"),
  build: {
    outDir: path.resolve(__dirname, "renderer-dist"),
    emptyOutDir: true
  }
});
