import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../sales-team-worker.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const worker = (await import(moduleUrl)).default;

class MemoryKV {
  constructor() { this.data = new Map(); }
  async get(key) { return this.data.has(key) ? this.data.get(key) : null; }
  async put(key, value) { this.data.set(key, String(value)); }
  async delete(key) { this.data.delete(key); }
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
  autoPublishEnabled: false,
  approvalMode: "review",
  profile: { p_name: "天衡" },
  product: { name: "天衡" },
  presenter: { id: "default", name: "目前人物" },
  production: { brandStyle: "品牌藍與暖金", totalSeconds: 45, presenterSeconds: 12 },
  channels: ["thread", "fb", "invalid"],
});
const config = await post("/hq-config", { action: "list", workspaceId });
assert.equal(config.config.autoEnabled, true);
assert.equal(config.config.approvalMode, "review");
assert.equal(config.config.autoPublishEnabled, false);
assert.deepEqual(config.config.channels, ["thread", "fb"]);
assert.equal(config.config.presenter.id, "default");
assert.equal(config.config.production.presenterSeconds, 12);

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
let heygenVideoCreateCalls = 0;
let directorMode = "valid";
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
    heygenVideoCreateCalls++;
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
    const isVideoDirector = String(request.system || "").includes("短影音導演");
    const director = {
      route: "B",
      hook: "三秒提出關鍵問題",
      thesis: "展示自動化真正節省的步驟",
      twist: "顧問提出反方疑問",
      climax: "用產品操作證明結果",
      cta: "看完預審再決定是否產片",
      scenes: [
        { id: "s1", start: 0, end: 3, storyBeat: "hook", purpose: "提出問題", visual: "問題字卡", narration: "先別急著花影片額度", subtitle: "先審再產", assetType: "title", effects: ["push_zoom"] },
        { id: "s2", start: 3, end: 7, storyBeat: "setup", purpose: "主持人說明", visual: "主持人中景", narration: "先把故事和分鏡審清楚", subtitle: "文字預審", assetType: "presenter", presenter: "王小明", effects: ["caption_pop"] },
        { id: "s3", start: 7, end: 11, storyBeat: "proof", purpose: "展示流程", visual: "流程卡片", narration: "不合格就直接退回", subtitle: "退件不產片", assetType: "ui", effects: ["ui_fly_in"] },
        { id: "s4", start: 11, end: 15, storyBeat: "debate", purpose: "顧問觀點交換", visual: "左右分割討論", narration: "真的能避免浪費嗎", subtitle: "先驗證", assetType: "dialogue", effects: ["split_screen"] },
        { id: "s5", start: 15, end: 19, storyBeat: "twist", purpose: "揭露零呼叫", visual: "HeyGen 計數為零", narration: "測試會證明沒有呼叫 HeyGen", subtitle: "HeyGen 0 次", assetType: "metric" },
        { id: "s6", start: 19, end: 23, storyBeat: "proof", purpose: "展示產品畫面", visual: "真實操作畫面", narration: "通過後仍先等待批准", subtitle: "等待批准", assetType: "product_ui" },
        { id: "s7", start: 23, end: 27, storyBeat: "climax", purpose: "顯示決策", visual: "批准或退回按鈕", narration: "由你決定是否消耗額度", subtitle: "你來決定", assetType: "decision" },
        { id: "s8", start: 27, end: 31, storyBeat: "cta", purpose: "行動收尾", visual: "品牌收尾卡", narration: "確認後才開始產片", subtitle: "確認後產片", assetType: "brand" },
      ],
    };
    const text = isVideoDirector
      ? directorMode === "valid" ? JSON.stringify(director) : "not-json"
      : String(prompt).includes("只回 JSON")
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
env.VIDEO_QC_INTERNAL_TOKEN = "test-only-qc-token";
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
const publishConfig = await post("/publish-config", { workspaceId });
assert.equal(publishConfig.platforms.youtube.credentialsReady, false);
assert.equal(publishConfig.platforms.youtube.connected, false);
assert.equal(publishConfig.platforms.tiktok.connected, false);
const unusedPresenterConfig = await post("/video-config", { workspaceId, profileId: "guest" });
assert.equal(unusedPresenterConfig.avatarReady, false);
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
task.presenter = { id: "default", name: "王小明" };
task.production = { brandStyle: "品牌藍與暖金、清楚圖解", callToAction: "前往產品頁了解", totalSeconds: 50, presenterSeconds: 10 };
task.assets = [uploadedAsset.asset];
task.updatedAt = 3;
await post("/hq-tasks", { action: "upsert", workspaceId, task });

directorMode = "invalid";
const rejectedPreflight = await request("/video-preflight", {
  workspaceId,
  taskId: task.id,
  channel: "tiktok",
});
assert.equal(rejectedPreflight.response.status, 409);
assert.match(rejectedPreflight.data.error, /VIDEO_V3_PREFLIGHT_FAILED/);
assert.equal(heygenVideoCreateCalls, 0, "rejected preflight must not call HeyGen");
assert.equal(await env.MONITOR.get(`hq:video-usage:${new Date().toISOString().slice(0, 10)}:${workspaceId}`), null);

directorMode = "valid";
const passedPreflight = await post("/video-preflight", {
  workspaceId,
  taskId: task.id,
  channel: "tiktok",
});
assert.equal(passedPreflight.pass, true);
assert.equal(passedPreflight.stage, "video_preflight");
assert.equal(passedPreflight.directorPlan.scenes.length, 8);
assert.equal(passedPreflight.heygenCalled, false);
assert.equal(passedPreflight.estimatedHeygenSpend, false);
assert.match(passedPreflight.preflightId, /^preflight_/);
assert.equal(passedPreflight.nextAction, "awaiting_render_approval");
assert.equal(heygenVideoCreateCalls, 0, "passed preflight must still not call HeyGen");
assert.equal(await env.MONITOR.get(`hq:video-usage:${new Date().toISOString().slice(0, 10)}:${workspaceId}`), null);

const youtubePreflight = await post("/video-preflight", {
  workspaceId,
  taskId: task.id,
  channel: "youtube",
});
assert.equal(youtubePreflight.pass, true);
assert.equal(youtubePreflight.channel, "youtube");
assert.equal(youtubePreflight.stage, "video_preflight");
assert.match(youtubePreflight.preflightId, /^preflight_/);
assert.equal(youtubePreflight.nextAction, "awaiting_render_approval");
assert.equal(youtubePreflight.heygenCalled, false);
assert.equal(youtubePreflight.estimatedHeygenSpend, false);
assert.equal(heygenVideoCreateCalls, 0, "YouTube preflight must not call HeyGen");
assert.equal(await env.MONITOR.get(`hq:video-usage:${new Date().toISOString().slice(0, 10)}:${workspaceId}`), null);

const bypassedCreate = await request("/video-create", {
  workspaceId,
  taskId: task.id,
  channel: "tiktok",
});
assert.equal(bypassedCreate.response.status, 409);
assert.match(bypassedCreate.data.error, /請先批准/);
assert.equal(heygenVideoCreateCalls, 0, "direct video-create must not call HeyGen");

const approvedPreflight = await post("/video-preflight-approve", {
  workspaceId,
  taskId: task.id,
  channel: "tiktok",
  preflightId: passedPreflight.preflightId,
});
assert.match(approvedPreflight.approvalId, /^approval_/);
assert.equal(approvedPreflight.heygenCalled, false);
assert.equal(heygenVideoCreateCalls, 0, "approval must not call HeyGen");

const createdVideo = await post("/video-create", {
  workspaceId,
  taskId: task.id,
  channel: "tiktok",
  approvalId: approvedPreflight.approvalId,
});
assert.equal(createdVideo.job.sessionId, "sess_test");
assert.equal(createdVideo.job.preflight.pass, true);
assert.equal(createdVideo.job.directorPlan.scenes.length, 8);
assert.equal(createdVideo.job.quality.status, "awaiting_render_review");
assert.equal(heygenVideoCreateCalls, 1);
assert.equal(videoAgentRequest.avatar_id, "look_style");
assert.equal(videoAgentRequest.voice_id, "voice_test");
assert.equal(videoAgentRequest.files[0].url, "https://files.heygen.ai/material.jpg");
assert.match(videoAgentRequest.prompt, /已通過V3 Preflight/);
assert.match(videoAgentRequest.prompt, /先別急著花影片額度/);
assert.match(videoAgentRequest.prompt, /HeyGen 計數為零/);
assert.doesNotMatch(videoAgentRequest.prompt, /天衡深藍金/);
const finishedVideo = await post("/video-status", {
  workspaceId,
  taskId: task.id,
  channel: "tiktok",
});
assert.equal(finishedVideo.job.status, "completed");
assert.equal(finishedVideo.job.videoUrl, "https://files.heygen.ai/test.mp4");
const forgedTrustedQc = await request("/internal/video-quality-trusted", {
  workspaceId, taskId: task.id, channel: "tiktok", report: {},
});
assert.equal(forgedTrustedQc.response.status, 403);
const trustedQc = await post("/internal/video-quality-trusted", {
  workspaceId,
  taskId: task.id,
  channel: "tiktok",
  report: {
    production: { hook: 96, story: 96, effects: 96, substance: 96, visualRhythm: 96, faceNaturalness: 96, voiceNaturalness: 96, captions: 96, brandFit: 96 },
    visual: { photorealism: 96, textureDetail: 96, lighting: 96, motionCoherence: 96, physicalPlausibility: 96, identityConsistency: 96, cinematicComposition: 96, artifactControl: 96, sampleCount: 4, model: "test-visual-qc" },
  },
}, { "X-Video-QC-Token": "test-only-qc-token" });
assert.equal(trustedQc.quality.reviewSource, "trusted_server");
assert.equal(trustedQc.quality.visual.trusted, true);
assert.equal(trustedQc.gate.pass, true);
assert.equal(heygenVideoCreateCalls, 1, "trusted QC must not create another HeyGen video");
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
