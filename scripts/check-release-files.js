/**
 * Fast, deterministic release-file checks that complement the Solidity suite.
 * No network, key, or generated build artifact is required.
 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(`RELEASE FILE CHECK FAILED: ${message}`);
}

function walkJavaScript(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkJavaScript(fullPath);
    return entry.isFile() && entry.name.endsWith(".js") ? [fullPath] : [];
  });
}

function checkJavaScriptSyntax() {
  const files = [
    path.join(root, "hardhat.config.js"),
    ...walkJavaScript(path.join(root, "scripts")),
    ...walkJavaScript(path.join(root, "test")),
  ];
  for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], {
      cwd: root,
      encoding: "utf8",
    });
    assert(
      result.status === 0,
      `${path.relative(root, file)} has invalid JavaScript: ${
        result.stderr || result.stdout
      }`
    );
  }
  console.log(`[ok] JavaScript syntax: ${files.length} files`);
}

function checkHtml() {
  for (const name of ["index.html", "litepaper.html"]) {
    const file = path.join(root, "site", name);
    const html = fs.readFileSync(file, "utf8");
    assert(/^<!doctype html>/i.test(html), `site/${name} is not a complete HTML document`);
    assert(/<html lang="en">/i.test(html), `site/${name} has no language declaration`);
    assert(/<meta charset="utf-8">/i.test(html), `site/${name} has no UTF-8 declaration`);
    assert(/name="viewport"/i.test(html), `site/${name} has no mobile viewport`);
    assert(/<title>[^<]+<\/title>/i.test(html), `site/${name} has no title`);
    assert(
      /<script src="\.\/launch-config\.js"><\/script>/i.test(html),
      `site/${name} does not load the generated launch config`
    );

    const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
    for (const [index, match] of inlineScripts.entries()) {
      new vm.Script(match[1], { filename: `site/${name}:inline-script-${index + 1}` });
    }
  }
  console.log("[ok] Static site documents and inline scripts");
}

function checkLaunchConfig() {
  const source = fs.readFileSync(
    path.join(root, "site", "launch-config.js"),
    "utf8"
  );
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: "site/launch-config.js" });
  const config = sandbox.window.KNIFE_LAUNCH;
  assert(config && config.chainId === 56, "launch config must target BSC mainnet chain 56");

  if (config.contractAddress === null) {
    assert(
      config.controlDeadlineUnix === null,
      "pre-launch config must not show a countdown"
    );
    assert(config.pairAddress === null, "pre-launch config must not show a pair");
  } else {
    assert(
      /^0x[0-9a-fA-F]{40}$/.test(config.contractAddress),
      "live launch config has an invalid token address"
    );
    assert(
      /^0x[0-9a-fA-F]{40}$/.test(config.pairAddress),
      "live launch config has an invalid pair address"
    );
    assert(
      Number.isSafeInteger(config.controlDeadlineUnix) &&
        config.controlDeadlineUnix > 0,
      "live launch config has an invalid control deadline"
    );
    for (const key of ["sourceUrl", "explorerUrl", "swapUrl"]) {
      assert(
        typeof config[key] === "string" &&
          config[key].toLowerCase().includes(config.contractAddress.toLowerCase()),
        `live launch config ${key} does not identify the token`
      );
    }
  }
  console.log("[ok] Honest pre-launch or complete live site config");
}

function checkSecretHygiene() {
  const trackedEnv = spawnSync("git", ["ls-files", "--error-unmatch", ".env"], {
    cwd: root,
    encoding: "utf8",
  });
  assert(trackedEnv.status !== 0, ".env is tracked by git");

  for (const target of [".env", "launch-records/pending-mainnet.json"]) {
    const ignored = spawnSync("git", ["check-ignore", "-q", target], {
      cwd: root,
    });
    assert(ignored.status === 0, `${target} is not git-ignored`);
  }
  console.log("[ok] Secret and interrupted-launch file hygiene");
}

checkJavaScriptSyntax();
checkHtml();
checkLaunchConfig();
checkSecretHygiene();
console.log("\nRELEASE FILE CHECK PASSED");
