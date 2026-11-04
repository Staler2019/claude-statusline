const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const INSTALL_SCRIPT = path.resolve(__dirname, "..", "bin", "install.js");
const COMMAND = 'bash "$HOME/.claude/statusline.sh"';

function installWith(settings) {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "claude-statusline-test-"));
  try {
    const settingsPath = path.join(fakeHome, ".claude", "settings.json");
    if (settings) {
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
    }
    execFileSync(process.execPath, [INSTALL_SCRIPT], {
      env: { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome },
      stdio: "pipe",
    });
    return JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  } finally {
    fs.rmSync(fakeHome, { recursive: true, force: true });
  }
}

const unixOnly = { skip: process.platform === "win32" && "command differs on Windows" };

test("fresh install sets a 10 second refresh interval", () => {
  assert.equal(installWith(undefined).statusLine.refreshInterval, 10);
});

test("replacing another statusline sets the refresh interval", () => {
  const result = installWith({ statusLine: { type: "command", command: "other" } });
  assert.equal(result.statusLine.refreshInterval, 10);
});

test("upgrade adds the interval and keeps other statusLine fields", unixOnly, () => {
  const result = installWith({ statusLine: { type: "command", command: COMMAND, padding: 2 } });
  assert.deepEqual(result.statusLine, {
    type: "command",
    command: COMMAND,
    padding: 2,
    refreshInterval: 10,
  });
});

test("reinstall keeps a refresh interval the user already chose", unixOnly, () => {
  const result = installWith({
    statusLine: { type: "command", command: COMMAND, refreshInterval: 30 },
  });
  assert.equal(result.statusLine.refreshInterval, 30);
});
