import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("../sales-team-worker.js", import.meta.url), "utf8");
const hq = readFileSync(new URL("../hq-patch.js", import.meta.url), "utf8");
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
  "/threads-growth/config",
  "/threads-growth/discover",
  "/threads-growth/draft",
  "/threads-growth/approve",
  "/threads-growth/test-publish",
  "/threads-growth/publish",
  "/threads-growth/metrics",
  "/threads-growth/learn",
  "/threads-growth/oauth-start",
  "/threads-growth/oauth/callback",
  "/hq-config",
  "/hq-tasks",
  "/video-config",
  "/video-usage",
  "/avatar-create",
  "/avatar-status",
  "/media-assets",
  "/voice-create",
  "/voice-status",
  "/video-preflight",
  "/video-preflight-approve",
  "/video-create",
  "/video-status",
  "/video-quality",
  "/internal/video-quality-trusted",
  "/reference-orchestrate",
  "/publish-config",
  "/oauth-start",
  "/oauth-disconnect",
  "/oauth/youtube/callback",
  "/oauth/tiktok/callback",
  "/publish-video",
  "/publish-status",
];

for (const route of requiredRoutes) {
  assert.ok(worker.includes(`"${route}"`), `Missing Worker route: ${route}`);
}

assert.match(hq, /hq-mode input\[type=radio\].*width:20px!important/);
assert.match(hq, /目前第 .*／7 步/);
assert.match(hq, /江星瑤正在編排鏡頭/);
assert.match(hq, /lineup\.hq-hidden/);
assert.match(hq, /現在輪到 .*・第 .*／7 步/);
assert.match(hq, /進行中的任務/);
assert.match(hq, /真正發布按鈕只會在成品驗收後出現/);
assert.match(hq, /我已驗收成品・啟用 YouTube 發布/);
assert.match(hq, /completedVideoForPublisher/);
assert.match(hq, /\["approval", "video_review", "done"\]\.indexOf\(x\.state\) < 0/);
assert.match(hq, /YouTube／TikTok 發布連線/);
assert.match(hq, /連接帳號不會發布影片/);
assert.match(hq, /允許免批准模式自動發布/);
assert.match(worker, /youtubePublish/);
assert.match(worker, /task\.videoJobs\?\.video/);
assert.match(worker, /tiktokPublish/);
assert.match(worker, /hqProcessAutoPublish/);
assert.match(worker, /youtube\.upload/);
assert.match(worker, /video\.publish/);
assert.match(hq, /以我的陳述為主/);
assert.match(hq, /存入常用素材庫/);
assert.match(hq, /建立長期專屬聲音/);
assert.match(hq, /id="hqProductSelect"/);
assert.match(hq, /id="hqPresenterSelect"/);
assert.match(hq, /id="hqBrandStyle"/);
assert.match(hq, /id="hqPresenterSeconds"/);
assert.match(worker, /creatorProfileId/);
assert.match(worker, /task\.presenter/);
assert.doesNotMatch(worker, /品牌視覺：天衡深藍金/);
assert.match(hq, /目前會建立 .* 支付費 MP4/);
assert.match(hq, /影片固定不超過 35 秒/);
assert.match(hq, /固定七段分鏡/);
assert.match(hq, /目前人物尚未完成 HeyGen 人物／影片設定/);
assert.match(hq, /richOutput/);
assert.match(hq, /允許排程自動使用付費產片/);
assert.match(worker, /config\.autoVideoEnabled === true/);
assert.match(worker, /request\.voice_id = voice\.id/);
assert.match(worker, /request\.files = files/);
assert.match(worker, /嚴禁超過35秒/);
assert.match(worker, /REFERENCE_RUNTIME_V1/);
assert.match(worker, /referenceOrchestrate/);
assert.match(worker, /dryRun: true/);
assert.match(worker, /THREADS_LIVE_PUBLISH_DISABLED/);
assert.match(worker, /threads_content_publish/);

assert.equal(config.name, "sales-team");
assert.equal(config.main, "sales-team-worker.js");
assert.equal(config.kv_namespaces?.[0]?.binding, "MONITOR");
assert.ok(config.kv_namespaces?.[0]?.id, "MONITOR namespace ID is missing");
assert.deepEqual(config.triggers?.crons, [
  "0 1 * * *",
  "0 6 * * *",
  "0 13 * * *",
]);
assert.deepEqual(config.secrets?.required, ["ANTHROPIC_KEY"]);
assert.deepEqual(config.secrets?.optional, [
  "HEYGEN_API_KEY",
  "VIDEO_QC_INTERNAL_TOKEN",
  "PUBLISH_TOKEN_KEY",
  "YOUTUBE_API_KEY",
  "YOUTUBE_CLIENT_ID",
  "YOUTUBE_CLIENT_SECRET",
  "TIKTOK_CLIENT_KEY",
  "TIKTOK_CLIENT_SECRET",
  "THREADS_APP_ID",
  "THREADS_APP_SECRET",
  "THREADS_REDIRECT_URI",
  "THREADS_ACCESS_TOKEN",
  "THREADS_USER_ID",
]);

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
