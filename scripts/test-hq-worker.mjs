import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../sales-team-worker.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const worker = (await import(moduleUrl)).default;

class MemoryKV {
  constructor() { this.data = new Map(); }
  async get(key) { return this.data.has(key) ? this.data.get(key) : null; }
  async put(key, value) { this.data.set(key, String(value)); }
}

const env = { MONITOR: new MemoryKV() };
const origin = "https://jacky95188888.github.io";
const workspaceId = "sanbao_0123456789abcdef0123456789abcdef0123";

async function request(path, body, headers = {}) {
  const response = await worker.fetch(
    new Request(`https://worker.example${path}`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
    env,
  );
  const data = await response.json();
  return { response, data };
}
async function post(path, body, headers) {
  const { response, data } = await request(path, body, headers);
  assert.equal(response.status, 200, JSON.stringify(data));
  return data;
}

const videoConfig = await post("/video-config", {});
assert.equal(videoConfig.ready, false);

await post("/hq-config", {
  action: "save",
  workspaceId,
  autoEnabled: true,
  profile: { p_name: "天衡" },
  product: { name: "天衡" },
  channels: ["thread", "fb", "invalid"],
});
const config = await post("/hq-config", { action: "list", workspaceId });
assert.equal(config.config.autoEnabled, true);
assert.deepEqual(config.config.channels, ["thread", "fb"]);

const task = {
  id: "hq_test_1",
  goal: "建立今日內容",
  state: "approval",
  channels: ["thread", "tiktok", "youtube"],
  outputs: { thread: "測試內容", tiktok: "TikTok 腳本", youtube: "YouTube 腳本" },
  createdAt: 1,
  updatedAt: 2,
};
await post("/hq-tasks", { action: "upsert", workspaceId, task });
let listed = await post("/hq-tasks", { action: "list", workspaceId });
assert.equal(listed.tasks.length, 1);
assert.equal(listed.tasks[0].state, "approval");

const stale = { ...task, state: "queued", updatedAt: 1 };
const staleResult = await post("/hq-tasks", { action: "upsert", workspaceId, task: stale });
assert.equal(staleResult.ignoredOlderUpdate, true);
listed = await post("/hq-tasks", { action: "list", workspaceId });
assert.equal(listed.tasks[0].state, "approval");

await post("/hq-tasks", { action: "delete", workspaceId, taskId: task.id });
listed = await post("/hq-tasks", { action: "list", workspaceId });
assert.equal(listed.tasks.length, 0);

assert.deepEqual(JSON.parse(await env.MONITOR.get("hq:workspaces")), [workspaceId]);

const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (String(input).endsWith("/v3/video-agents") && init?.method === "POST") {
    return new Response(JSON.stringify({ data: { session_id: "sess_test", status: "generating", video_id: null } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (String(input).endsWith("/v3/video-agents/sess_test")) {
    return new Response(JSON.stringify({ data: { session_id: "sess_test", status: "generating", video_id: "vid_test", progress: 60 } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (String(input).endsWith("/v3/videos/vid_test")) {
    return new Response(JSON.stringify({ data: { id: "vid_test", status: "completed", video_url: "https://files.heygen.ai/test.mp4", thumbnail_url: "https://files.heygen.ai/test.jpg", duration: 45 } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (String(input).includes("api.anthropic.com")) {
    const request = JSON.parse(init.body);
    const prompt = request.messages?.[0]?.content || "";
    const text = String(prompt).includes("只回 JSON")
      ? JSON.stringify({
          strategy: "今日測試策略",
          outputs: { thread: "Threads 成品", fb: "FB 成品" },
        })
      : "自動情報或覆盤測試內容";
    return new Response(JSON.stringify({ content: [{ type: "text", text }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return nativeFetch(input, init);
};
env.ANTHROPIC_KEY = "test-only-not-a-real-key";
env.HEYGEN_API_KEY = "test-only-not-a-real-heygen-key";
env.HQ_VIDEO_TOKEN = "test-video-token";

await post("/hq-tasks", { action: "upsert", workspaceId, task });
const createdVideo = await post("/video-create", {
  workspaceId,
  taskId: task.id,
  channel: "tiktok",
}, { "X-HQ-Video-Token": env.HQ_VIDEO_TOKEN });
assert.equal(createdVideo.job.sessionId, "sess_test");
const finishedVideo = await post("/video-status", {
  workspaceId,
  taskId: task.id,
  channel: "tiktok",
}, { "X-HQ-Video-Token": env.HQ_VIDEO_TOKEN });
assert.equal(finishedVideo.job.status, "completed");
assert.equal(finishedVideo.job.videoUrl, "https://files.heygen.ai/test.mp4");
await post("/hq-tasks", { action: "delete", workspaceId, taskId: task.id });

async function runCron(cron) {
  let pending;
  worker.scheduled(
    { cron },
    env,
    { waitUntil(promise) { pending = promise; } },
  );
  await pending;
}

await runCron("0 1 * * *");
await runCron("0 6 * * *");
await runCron("0 13 * * *");
listed = await post("/hq-tasks", { action: "list", workspaceId });
assert.equal(listed.tasks.length, 3);
assert.deepEqual(
  new Set(listed.tasks.map((item) => item.autoSlot)),
  new Set(["morning", "afternoon", "evening"]),
);
assert.ok(listed.tasks.every((item) => item.state === "approval"));

await runCron("0 1 * * *");
listed = await post("/hq-tasks", { action: "list", workspaceId });
assert.equal(listed.tasks.length, 3, "daily automatic tasks must be idempotent");
globalThis.fetch = nativeFetch;

console.log("HQ Worker storage and scheduled automation tests passed.");
