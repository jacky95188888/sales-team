import assert from "node:assert/strict";
import { getGrowthRun, putGrowthProfile, recordGrowthPerformance, reviewGrowthDraft, runGrowthResearch } from "../growth-run-v1.js";

class MemoryKV {
  constructor() { this.data = new Map(); }
  async get(key) { return this.data.get(key) || null; }
  async put(key, value) { this.data.set(key, value); }
}

const env = { MONITOR: new MemoryKV() };
await putGrowthProfile(env, "workspace-a", {
  industry: "在地服務",
  offer: "預約制顧問服務",
  audience: "需要快速做決策的台灣使用者",
  region: "台灣",
  goals: ["增加有效互動"],
  platforms: ["threads"],
  voice: "真人、具體",
});

let receivedOptions;
const result = await runGrowthResearch(env, { workspaceId: "workspace-a" }, async (_prompt, options) => {
  receivedOptions = options;
  return {
    sources: [{ title: "官方來源", url: "https://example.com/research" }],
    text: JSON.stringify({
      researchSummary: "近期討論集中在如何降低選擇成本。",
      tiredTopics: ["空泛勵志文"],
      hypotheses: ["具體案例比口號更容易引發回覆"],
      challengedHypothesis: "熱門不等於適合這個客群。",
      candidates: Array.from({ length: 10 }, (_, i) => ({ title: `候選 ${i + 1}`, angle: `角度 ${i + 1}`, score: 90 - i, why: "與客群相關" })),
      selected: Array.from({ length: 3 }, (_, i) => ({
        title: `精選 ${i + 1}`,
        angle: `切角 ${i + 1}`,
        score: 95 - i,
        whyNow: "近期有公開討論",
        evidence: "依公開來源整理",
        hooks: [`鉤子 ${i + 1}-1`, `鉤子 ${i + 1}-2`, `鉤子 ${i + 1}-3`],
        draft: { hookType: "反常識", text: `可審核草稿 ${i + 1}`, risk: "發布前確認語氣" },
      })),
      experiment: "比較三種鉤子的回覆率",
    }),
  };
});

assert.equal(receivedOptions.webSearch, true);
assert.equal(result.status, "review_pending");
assert.equal(result.autoPublish, false);
assert.equal(result.topics.length, 3);
assert.ok(result.topics.every(topic => topic.hooks.length === 3));
assert.ok(result.topics.every(topic => topic.draft.status === "review_pending"));
assert.ok(await env.MONITOR.get(`growth:v1:workspace-a:run:${result.id}`));
assert.ok(await env.MONITOR.get("growth:v1:workspace-a:latest"));
assert.equal(await env.MONITOR.get("growth:v1:workspace-b:latest"), null);

const reviewed = await reviewGrowthDraft(env, { workspaceId: "workspace-a", runId: result.id, draftId: "draft-1", decision: "approved", reviewNote: "保留第一個鉤子" });
assert.equal(reviewed.status, "approved");
assert.equal(reviewed.autoPublish, false);
const latest = await getGrowthRun(env, "workspace-a");
assert.equal(latest.topics[0].draft.status, "approved");
const recorded = await recordGrowthPerformance(env, { workspaceId: "workspace-a", result: { platform: "threads", topic: latest.topics[0].title, hookType: latest.topics[0].draft.hookType, metrics: { impressions: 120 }, review: "人工回填", lesson: "第一句要更具體" } });
assert.equal(recorded.autoPublish, false);
assert.ok(await env.MONITOR.get("growth:v1:workspace-a:history"));

console.log("Growth run test passed (research -> review -> result record -> MONITOR, zero publish).");
