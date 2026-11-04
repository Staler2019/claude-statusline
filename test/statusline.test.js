const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const BIN_DIR = path.resolve(__dirname, "..", "bin");

const GREEN = "\x1b[38;2;0;175;80m";
const ORANGE = "\x1b[38;2;255;176;85m";
const YELLOW = "\x1b[38;2;230;200;0m";
const RED = "\x1b[38;2;255;85;85m";

const RUNNERS = [
  { name: "statusline.sh", command: "bash", args: [path.join(BIN_DIR, "statusline.sh")] },
  {
    name: "statusline.ps1",
    command: "pwsh",
    args: ["-NoProfile", "-File", path.join(BIN_DIR, "statusline.ps1")],
    skip: spawnSync("pwsh", ["-Version"]).status !== 0 && "pwsh not installed",
  },
];

function now() {
  return Math.floor(Date.now() / 1000);
}

function render(runner, promptCache) {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "claude-statusline-test-"));
  try {
    const input = {
      model: { display_name: "Opus" },
      cwd: fakeHome,
      rate_limits: { five_hour: { used_percentage: 30, resets_at: now() + 3600 } },
      ...(promptCache && { prompt_cache: promptCache }),
    };
    return execFileSync(runner.command, runner.args, {
      input: JSON.stringify(input),
      env: { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome },
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } finally {
    fs.rmSync(fakeHome, { recursive: true, force: true });
  }
}

function warmCache(ttl, secondsLeft) {
  return { warm: true, caching_observed: true, ttl, expires_at: now() + secondsLeft };
}

for (const runner of RUNNERS) {
  const options = { skip: runner.skip };

  test(`${runner.name}: warm 1h cache shows minutes left in green early on`, options, () => {
    assert.ok(render(runner, warmCache("1h", 2550)).includes(`🧊 ${GREEN}42m`));
  });

  test(`${runner.name}: warm 1h cache turns red near expiry`, options, () => {
    assert.ok(render(runner, warmCache("1h", 315)).includes(`🧊 ${RED}5m`));
  });

  test(`${runner.name}: warm 5m cache uses its own ttl for the colour`, options, () => {
    assert.ok(render(runner, warmCache("5m", 135)).includes(`🧊 ${ORANGE}2m`));
  });

  test(`${runner.name}: under a minute left shows seconds`, options, () => {
    const output = render(runner, warmCache("5m", 45));
    assert.ok(output.includes(`🧊 ${YELLOW}4`), output);
    assert.match(output, /4\ds/);
  });

  test(`${runner.name}: warm false shows cold even with a future expires_at`, options, () => {
    const output = render(runner, { ...warmCache("1h", 600), warm: false });
    assert.ok(output.includes(`🧊 ${RED}cold`), output);
  });

  test(`${runner.name}: null expires_at shows cold`, options, () => {
    const output = render(runner, {
      warm: false,
      caching_observed: true,
      ttl: "5m",
      expires_at: null,
    });
    assert.ok(output.includes(`🧊 ${RED}cold`), output);
  });

  test(`${runner.name}: past expires_at shows cold while warm is stale`, options, () => {
    const output = render(runner, warmCache("1h", -10));
    assert.ok(output.includes(`🧊 ${RED}cold`), output);
  });

  test(`${runner.name}: no prompt_cache hides the segment`, options, () => {
    assert.ok(!render(runner, undefined).includes("🧊"));
  });

  test(`${runner.name}: caching not observed hides the segment`, options, () => {
    const output = render(runner, {
      warm: false,
      caching_observed: false,
      ttl: "5m",
      expires_at: null,
    });
    assert.ok(!output.includes("🧊"));
  });

  test(`${runner.name}: segment sits on line 1 after the effort`, options, () => {
    const firstLine = render(runner, warmCache("1h", 2550)).split("\n")[0];
    assert.match(firstLine, /default.*🧊/);
  });
}
