const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

exports.default = async function afterPack(context) {
  const resourcesDir =
    context.packager.platform.name === "mac"
      ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
      : path.join(context.appOutDir, "resources");

  const standaloneDir = path.join(resourcesDir, "standalone");
  const nodeModulesDir = path.join(standaloneDir, "node_modules");

  // Remove pnpm symlink-based node_modules (doesn't work outside pnpm store)
  if (fs.existsSync(nodeModulesDir)) {
    fs.rmSync(nodeModulesDir, { recursive: true, force: true });
  }

  console.log(`  • installing standalone dependencies with npm (flat node_modules)`);
  execSync("npm install --production --no-package-lock", {
    cwd: standaloneDir,
    stdio: "inherit",
  });
};
