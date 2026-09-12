import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("../sales-team-worker.js", import.meta.url), "utf8");
const config = JSON.parse(
  readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
);

const requiredRoutes = [
  "/opinions",
  "/collect",
  "/deepdive",
  "/review",
  "/execute",
  "/content",
  "/summary",
  "/finalize",
  "/vision-stats",
  "/vision-reply",
  "/algo",
  "/monitor-config",
  "/monitor-subscribe",
  "/monitor-notes",
];

for (const route of requiredRoutes) {
  assert.ok(worker.includes(`"${route}"`), `Missing Worker route: ${route}`);
}

assert.equal(config.name, "sales-team");
assert.equal(config.main, "sales-team-worker.js");
assert.equal(config.kv_namespaces?.[0]?.binding, "MONITOR");
assert.ok(config.kv_namespaces?.[0]?.id, "MONITOR namespace ID is missing");
assert.deepEqual(config.triggers?.crons, ["0 0 * * *"]);

const filesToScan = [
  worker,
  JSON.stringify(config),
  readFileSync(new URL("../WORKER-RECOVERY.md", import.meta.url), "utf8"),
];
const forbiddenPatterns = [
  /sk-ant-[A-Za-z0-9_-]{16,}/,
  /ANTHROPIC_KEY\s*[:=]\s*["'][^"']+["']/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];

for (const pattern of forbiddenPatterns) {
  assert.ok(
    filesToScan.every((content) => !pattern.test(content)),
    `Possible committed secret matched ${pattern}`,
  );
}

console.log(`Worker safety checks passed (${requiredRoutes.length} routes).`);
