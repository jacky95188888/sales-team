import assert from "node:assert/strict";
import worker from "../sales-team-worker.js";

const TEST_DATE = "2026-11-11";
const FIXED_NOW = Date.parse("2026-11-11T01:00:00.000Z");
const draftPayload = {
  hooks: ["先說一個真實問題", "我後來換了做法", "這個細節值得注意"],
  selected: 1,
  reason: "最符合文章內容",
  post: "這是一篇完整、可供人工審核的 Threads 文字草稿。",
  topicTag: "AI實作",
  hookType: "經驗分享",
};
const candidates = [1, 2, 3, 4].map((n) => ({
  topic: `測試題目 ${n}`,
  angle: "實際經驗",
  whyNow: "近期有討論價值",
  sourceHint: "測試來源",
  risk: "避免誇大",
  discussion: { researcher: "有依據", strategist: "適合受眾", riskReviewer: "無明顯風險" },
  decision: "值得寫",
  priority: n,
}));

function apiResponse(value) {
  return new Response(JSON.stringify({
    content: [{ type: "text", text: JSON.stringify(value) }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function makeMonitor({ failDraftPutAt = 0, failFinalReportUpdate = false } = {}) {
  const data = new Map();
  let draftPutCount = 0;
  let failedOnce = false;
  return {
    data,
    async get(key) { return data.get(key) ?? null; },
    async put(key, value) {
      if (key.startsWith("threads:growth:draft:th_auto_")) {
        draftPutCount++;
        if (!failedOnce && failDraftPutAt === draftPutCount) {
          failedOnce = true;
          throw new Error("MOCK_DRAFT_PUT_FAILURE");
        }
      }
      if (key === "threads:growth:research:latest" && failFinalReportUpdate && !failedOnce) {
        const report = JSON.parse(value);
        if (Array.isArray(report.draftIds) && report.draftIds.length > 0) {
          failedOnce = true;
          throw new Error("MOCK_FINAL_REPORT_PUT_FAILURE");
        }
      }
      data.set(key, value);
    },
    async delete(key) { data.delete(key); },
  };
}

async function runResearch(options = {}) {
  const monitor = makeMonitor(options);
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let apiCalls = 0;
  globalThis.fetch = async (url) => {
    assert.equal(String(url), "https://api.anthropic.com/v1/messages");
    apiCalls++;
    return apiResponse(apiCalls === 1 ? { candidates } : draftPayload);
  };
  Date.now = () => FIXED_NOW;
  try {
    const pending = [];
    worker.scheduled(
      { cron: "0 1 * * *" },
      { MONITOR: monitor, ANTHROPIC_KEY: "mock-anthropic-key" },
      { waitUntil(promise) { pending.push(promise); } },
    );
    await Promise.all(pending);
    return { monitor, apiCalls };
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
}

function autoDraftKeys(monitor) {
  return [...monitor.data.keys()].filter((key) =>
    key.startsWith("threads:growth:draft:th_auto_"),
  );
}

function assertFailedCleanly(monitor, expectedError) {
  assert.deepEqual(autoDraftKeys(monitor), [], "failed research must leave no orphan pending drafts");
  assert.equal(monitor.data.has(`threads:growth:auto-research:${TEST_DATE}`), false,
    "failed research must not write the daily completion marker");
  const latest = JSON.parse(monitor.data.get("threads:growth:research:latest"));
  const dated = JSON.parse(monitor.data.get(`threads:growth:research:${TEST_DATE}`));
  assert.equal(latest.status, "failed");
  assert.deepEqual(latest.draftIds, []);
  assert.equal(dated.status, "failed");
  assert.deepEqual(dated.draftIds, []);
  const failure = JSON.parse(monitor.data.get("threads:growth:auto-research-error"));
  assert.equal(failure.error, expectedError);
}

// A failure on the second draft KV write must remove the first draft as well.
{
  const { monitor, apiCalls } = await runResearch({ failDraftPutAt: 2 });
  assert.equal(apiCalls, 4, "all three draft payloads are staged before KV writes begin");
  assertFailedCleanly(monitor, "MOCK_DRAFT_PUT_FAILURE");
}

// A failed final research-report update must roll back every staged draft.
{
  const { monitor, apiCalls } = await runResearch({ failFinalReportUpdate: true });
  assert.equal(apiCalls, 4);
  assertFailedCleanly(monitor, "MOCK_FINAL_REPORT_PUT_FAILURE");
}

// Success writes no more than three complete, validated pending_review drafts.
{
  const { monitor, apiCalls } = await runResearch();
  const keys = autoDraftKeys(monitor);
  assert.equal(apiCalls, 4);
  assert.equal(keys.length, 3, "daily autonomous research is capped at three drafts");
  for (const key of keys) {
    const draft = JSON.parse(monitor.data.get(key));
    assert.equal(draft.status, "pending_review");
    assert.equal(draft.hooks.length, 3);
    assert.ok(draft.post.length > 0);
  }
  const report = JSON.parse(monitor.data.get("threads:growth:research:latest"));
  assert.equal(report.status, "researched_waiting_review");
  assert.equal(report.draftIds.length, 3);
  assert.equal(monitor.data.get(`threads:growth:auto-research:${TEST_DATE}`), "done");
  assert.equal(monitor.data.has("threads:growth:auto-research-error"), false);
}

console.log("Threads autonomous research mock MONITOR KV tests passed (3 scenarios).");
