import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workerUrl = new URL("../sales-team-worker.js", import.meta.url);
const source = readFileSync(workerUrl, "utf8");
assert.match(source, /"\/reference-orchestrate"/);
assert.match(source, /REFERENCE_RUNTIME_V1/);
assert.match(source, /referenceOrchestrate/);

workerUrl.searchParams.set("test", String(Date.now()));
const worker = (await import(workerUrl.href)).default;
const origin = "https://jacky95188888.github.io";
const nativeFetch = globalThis.fetch;
let anthropicCalls = 0;
let heygenCalls = 0;

globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (url.includes("api.anthropic.com/v1/messages")) {
    anthropicCalls++;
    const body = JSON.parse(init.body || "{}");
    const content = body.messages?.[0]?.content;
    const flat = typeof content === "string" ? content : JSON.stringify(content || []);
    const synthesis = flat.includes("至少由2支不同影片共同支持");
    const text = synthesis
      ? JSON.stringify({
          commonPatterns: ["question-hook", "proof-before-cta", "reaction-cut"],
          hookPatterns: ["question-hook"],
          storyPatterns: ["problem-proof-result"],
          brollPatterns: ["product-proof"],
          effectPatterns: ["reaction-cut"],
          soundPatterns: [],
          ctaPatterns: ["single-action-cta"],
          evidenceMap: [
            { pattern: "question-hook", videoIds: ["v1", "v2", "v3"] },
            { pattern: "proof-before-cta", videoIds: ["v1", "v2"] },
            { pattern: "reaction-cut", videoIds: ["v2", "v3"] },
          ],
          confidence: 0.86,
        })
      : JSON.stringify({
          hook: "0–3秒先丟問題",
          firstCut: "observed visual change",
          firstPayoff: "產品證據畫面",
          storyBeats: ["problem", "proof", "result"],
          conflictOrTwist: "反應轉折",
          climax: "證據揭曉",
          presenterRatio: 0.4,
          brollTypes: ["product-proof"],
          productProof: ["real-ui"],
          effectBeats: ["reaction-cut"],
          soundBeats: [],
          captionRhythm: "短句",
          cta: "unknown",
          unknowns: ["creator retention"],
          evidenceNotes: ["frame evidence"],
          confidence: 0.82,
        });
    return new Response(JSON.stringify({ content: [{ type: "text", text }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (url.includes("api.heygen.com")) {
    heygenCalls++;
    throw new Error("Reference test must never call HeyGen");
  }
  return nativeFetch(input, init);
};

const env = { ANTHROPIC_KEY: "test-only-reference-key" };

function frame(timestampSec) {
  return { timestampSec, mediaType: "image/jpeg", base64: "YWJjZA==" };
}
function packet(videoId) {
  return { videoId, authorized: true, frames: [frame(0), frame(1.5), frame(3)] };
}
const discovery = {
  status: "PUBLIC_EVIDENCE_READY",
  candidates: [
    { videoId: "v1", title: "A", views: 100000, likes: 6000, metricRegime: "public-view-starts-2026-08-24+" },
    { videoId: "v2", title: "B", views: 80000, likes: 5000, metricRegime: "public-view-starts-2026-08-24+" },
    { videoId: "v3", title: "C", views: 60000, likes: 4000, metricRegime: "public-view-starts-2026-08-24+" },
  ],
};

async function post(body) {
  const response = await worker.fetch(
    new Request("https://worker.example/reference-orchestrate", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
  );
  const data = await response.json();
  return { response, data };
}

const insufficient = await post({
  task: "美女顧問團測試",
  discovery,
  references: [packet("v1"), packet("v2")],
});
assert.equal(insufficient.response.status, 200);
assert.equal(insufficient.data.status, "REFERENCE_EVIDENCE_INCOMPLETE");
assert.equal(insufficient.data.analyses.length, 2);

const passed = await post({
  task: "美女顧問團測試",
  discovery,
  references: [packet("v1"), packet("v2"), packet("v3")],
});
assert.equal(passed.response.status, 200, JSON.stringify(passed.data));
assert.equal(passed.data.status, "PASS");
assert.equal(passed.data.sampleCount, 3);
assert.ok(passed.data.commonPatterns.length >= 3);
assert.equal(passed.data.sources.length, 3);
assert.equal(passed.data.inaccessibleMetrics.includes("creatorRetention"), true);
assert.equal(heygenCalls, 0);
assert.ok(anthropicCalls >= 5, "expected visual analyses plus synthesis calls");

globalThis.fetch = nativeFetch;
console.log("Reference orchestrator runtime tests passed.");
