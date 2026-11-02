import assert from "node:assert/strict";
import { preflightDirectorPlan, scoreRenderedVideo } from "../video-quality-v2.js";

const scenes = Array.from({ length: 7 }, (_, i) => ({
  id: `s${i + 1}`,
  start: i * 4,
  end: i === 0 ? 3 : i * 4 + 4,
  purpose: i === 0 ? "前三秒鉤子" : "推進內容",
  visual: i % 2 ? "產品操作/B-roll" : "主持人中景",
  narration: "具體旁白",
  subtitle: "關鍵字幕",
  assetType: i % 2 ? "product" : "presenter",
  transition: "cut",
}));

const preflight = preflightDirectorPlan({ hook: "你可能一直看錯了", thesis: "給觀眾一個完整可執行觀點", cta: "想看完整結果再點進去", scenes });
assert.equal(preflight.pass, true, preflight.issues.join("；"));

const good = scoreRenderedVideo({ hook: 14, substance: 18, visualRhythm: 13, faceNaturalness: 13, voiceNaturalness: 13, captions: 9, brandFit: 9 });
assert.equal(good.total, 89);
assert.equal(good.pass, true);
assert.equal(good.action, "publish_queue");

const bad = scoreRenderedVideo({ hook: 10, substance: 12, visualRhythm: 8, faceNaturalness: 8, voiceNaturalness: 8, captions: 7, brandFit: 7 });
assert.equal(bad.pass, false);
assert.equal(bad.action, "regenerate");

const hardFail = scoreRenderedVideo({ hook: 15, substance: 20, visualRhythm: 15, faceNaturalness: 15, voiceNaturalness: 15, captions: 10, brandFit: 10, hardFailures: ["嘴型明顯錯位"] });
assert.equal(hardFail.total, 100);
assert.equal(hardFail.pass, false);

console.log("video-quality-v2: ok");
