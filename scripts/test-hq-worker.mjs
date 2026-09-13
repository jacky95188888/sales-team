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
  approvalMode: "review",
  profile: { p_name: "天衡" },
  product: { name: "天衡" },
  channels: ["thread", "fb", "invalid"],
});
const config = await post("/hq-config", { action: "list", workspaceId });
assert.equal(config.config.autoEnabled, true);
assert.equal(config.config.approvalMode, "review");
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
let videoAgentRequest = null;
globalThis.fetch = async (input, init) => {
  if (String(input).endsWith("/v3/users/me")) {
    return new Response(JSON.stringify({ data: { id: "user_test", billing_type: "wallet", wallet: { currency: "credits", remaining_balance: 30 } } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (String(input).endsWith("/v3/avatars") && init?.method === "POST") {
    const body = JSON.parse(init.body);
    const styled = body.type === "prompt";
    return new Response(JSON.stringify({ data: { avatar_item: { id: styled ? "look_style" : "look_face", group_id: "group_sanbao", status: "processing" } } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (String(input).endsWith("/v3/assets") && init?.method === "POST") {
    return new Response(JSON.stringify({ data: { asset_id: "asset_test" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (String(input).endsWith("/v3/assets/asset_test") && (!init?.method || init.method === "GET")) {
    return new Response(JSON.stringify({ data: { id: "asset_test", url: "https://files.heygen.ai/material.jpg", type: "image/jpeg" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (String(input).endsWith("/v3/voices/clone") && init?.method === "POST") {
    return new Response(JSON.stringify({ data: { voice_clone_id: "voice_test" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (String(input).endsWith("/v3/voices/voice_test")) {
    return new Response(JSON.stringify({ data: { id: "voice_test", status: "complete" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (String(input).endsWith("/v3/avatars/looks/look_face")) {
    return new Response(JSON.stringify({ data: { id: "look_face", status: "completed", preview_image_url: "https://files.heygen.ai/face.jpg" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (String(input).endsWith("/v3/avatars/looks/look_style")) {
    return new Response(JSON.stringify({ data: { id: "look_style", status: "completed", preview_image_url: "https://files.heygen.ai/style.jpg" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (String(input).endsWith("/v3/video-agents") && init?.method === "POST") {
    videoAgentRequest = JSON.parse(init.body);
    return new Response(JSON.stringify({ data: { session_id: "sess_test", status: "generating", video_id: null } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (String(input).includes("/v3/video-agents?limit=50") && (!init?.method || init.method === "GET")) {
    return new Response(JSON.stringify({ data: [{ session_id: "sess_test", created_at: 1789261200, title: "天衡短影音" }] }), {
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
const preAvatarConfig = await post("/video-config", { workspaceId });
assert.equal(preAvatarConfig.ready, false);
assert.equal(preAvatarConfig.avatarReady, false);
assert.equal(preAvatarConfig.billing.remaining, 30);

await post("/avatar-create", {
  workspaceId,
  mediaType: "image/jpeg",
  image: "YWJjZA==",
});
let avatarStatus = await post("/avatar-status", { workspaceId });
assert.equal(avatarStatus.avatar.status, "building_style");
avatarStatus = await post("/avatar-status", { workspaceId });
assert.equal(avatarStatus.avatar.status, "ready");
assert.equal(avatarStatus.avatar.selectedLookId, "look_style");

const readyVideoConfig = await post("/video-config", { workspaceId });
assert.equal(readyVideoConfig.ready, true);
assert.equal(readyVideoConfig.avatarReady, true);
const videoUsage = await post("/video-usage", { workspaceId });
assert.equal(videoUsage.billing.remaining, 30);
assert.equal(videoUsage.sessions.length, 1);
assert.equal(videoUsage.sessions[0].title, "天衡短影音");

const uploadedAsset = await post("/media-assets", {
  action: "upload", workspaceId, scope: "persistent", name: "天衡示範.jpg", mediaType: "image/jpeg", data: "YWJjZA==",
});
assert.equal(uploadedAsset.asset.id, "asset_test");
const savedAssets = await post("/media-assets", { action: "list", workspaceId });
assert.equal(savedAssets.assets.length, 1);
await post("/voice-create", { workspaceId, mediaType: "audio/webm", audio: "YWJjZA==" });
const voiceStatus = await post("/voice-status", { workspaceId });
assert.equal(voiceStatus.voice.status, "ready");

task.contentMode = "statement";
task.statement = "我認為命理應該提供可以執行的下一步。";
task.assets = [uploadedAsset.asset];
task.updatedAt = 3;
await post("/hq-tasks", { action: "upsert", workspaceId, task });
const createdVideo = await post("/video-create", {
  workspaceId,
  taskId: task.id,
  channel: "tiktok",
});
assert.equal(createdVideo.job.sessionId, "sess_test");
assert.equal(videoAgentRequest.avatar_id, "look_style");
assert.equal(videoAgentRequest.voice_id, "voice_test");
assert.equal(videoAgentRequest.files[0].url, "https://files.heygen.ai/material.jpg");
assert.match(videoAgentRequest.prompt, /創作者親自陳述/);
assert.match(videoAgentRequest.prompt, /每 3～5 秒/);
const finishedVideo = await post("/video-status", {
  workspaceId,
  taskId: task.id,
  channel: "tiktok",
});
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
