import assert from "node:assert/strict";
import worker from "../sales-team-worker-v2.js";

class MemoryKV {
  constructor() { this.data = new Map(); }
  async get(key) { return this.data.get(key) || null; }
  async put(key, value) { this.data.set(key, value); }
}

const answer = {
  researchSummary: "近期使用者更在意可立即採用的決策方法。",
  tiredTopics: ["只有口號的趨勢文"],
  hypotheses: ["具體情境更容易引發討論"],
  challengedHypothesis: "熱門題目不一定適合目標客群。",
  candidates: Array.from({ length: 10 }, (_, i) => ({ title: `候選題目 ${i + 1}`, angle: "具體問題", score: 90 - i, why: "客群相關" })),
  selected: Array.from({ length: 3 }, (_, i) => ({ title: `待審題目 ${i + 1}`, angle: "不同切角", score: 95 - i, whyNow: "近期討論增加", evidence: "來源支持", hooks: [`鉤子 ${i + 1}-A`, `鉤子 ${i + 1}-B`, `鉤子 ${i + 1}-C`], draft: { hookType: "情境", text: `待審草稿 ${i + 1}`, risk: "發布前確認措辭" } })),
  experiment: "比較三種開場的互動差異",
};
const oldFetch = globalThis.fetch;
let anthropicCalls = 0;
globalThis.fetch = async (url) => {
  assert.equal(String(url), "https://api.anthropic.com/v1/messages");
  anthropicCalls += 1;
  return new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(answer) }, { type: "web_search_result", title: "公開研究來源", url: "https://example.com/research" }] }), { status: 200 });
};
const env = { MONITOR: new MemoryKV(), ANTHROPIC_KEY: "test-key" };
const call = async (path, body) => {
  const request = new Request(`https://sales-team.rhtm9y855y.workers.dev${path}`, { method: "POST", headers: { Origin: "https://jacky95188888.github.io", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const response = await worker.fetch(request, env, { waitUntil() {} });
  return { status: response.status, body: await response.json() };
};

const profile = await call("/growth-profile", { workspaceId: "safe-test", profile: { industry: "在地服務", offer: "顧問服務", audience: "台灣小商家", goals: ["增加互動"], platforms: ["threads"] } });
assert.equal(profile.status, 200);
const run = await call("/growth-run", { workspaceId: "safe-test" });
assert.equal(run.status, 200);
assert.equal(run.body.status, "review_pending");
assert.equal(run.body.autoPublish, false);
assert.equal(run.body.topics.length, 3);
assert.equal(anthropicCalls, 1);
const loaded = await call("/growth-run-get", { workspaceId: "safe-test", runId: run.body.id });
assert.equal(loaded.status, 200);
const reviewed = await call("/growth-review", { workspaceId: "safe-test", runId: run.body.id, draftId: "draft-1", decision: "approved" });
assert.equal(reviewed.body.status, "approved");
assert.equal(reviewed.body.autoPublish, false);
const result = await call("/growth-result", { workspaceId: "safe-test", result: { platform: "threads", topic: "待審題目 1", hookType: "情境", metrics: { impressions: 0 }, lesson: "僅測試，尚未發布" } });
assert.equal(result.status, 200);
assert.equal(result.body.autoPublish, false);
assert.equal(anthropicCalls, 1);
globalThis.fetch = oldFetch;
console.log("Growth Worker V2 route test passed (manual research -> review -> result, zero publish).");
