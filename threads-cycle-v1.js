/* Threads Cultivation Cycle V1
 * AI draft + review layer. It never publishes or replies publicly.
 */
import { loadGrowthContext, buildResearchBrief, buildReviewBrief, savePlaybook } from "./growth-engine-v1.js";

function text(v, n = 12000) { return String(v || "").trim().slice(0, n); }
function parseJson(v) {
  const raw = text(v);
  try { return JSON.parse(raw); } catch {}
  const hit = raw.match(/\{[\s\S]*\}/);
  if (!hit) return null;
  try { return JSON.parse(hit[0]); } catch { return null; }
}
function cycleKey(workspaceId, day, slot) { return `threads:cycle:${workspaceId}:${day}:${slot}`; }
async function readCycle(env, workspaceId, day, slot) {
  try { return JSON.parse((await env.MONITOR.get(cycleKey(workspaceId, day, slot))) || "null"); } catch { return null; }
}

export async function buildThreadsDraftCycle(env, workspaceId, day, askAi) {
  const ctx = await loadGrowthContext(env, workspaceId);
  if (!ctx.profile?.industry) throw Object.assign(new Error("BUSINESS_PROFILE_REQUIRED"), { status: 409 });
  const research = await readCycle(env, workspaceId, day, "research");
  const brief = buildResearchBrief(ctx.profile, ctx.history || [], ctx.playbook || null);
  const prompt = `${brief}\n\n【今天 Threads 搜尋候選】\n${JSON.stringify((research?.candidates || []).slice(0, 20))}\n\n你現在是 Threads 內容總編。請產出 JSON，不要 markdown：{"drafts":[{"topic":"","hookType":"","text":"","why":"","risk":""}],"interactionTargets":[{"threadId":"","reason":""}],"experiment":""}。drafts 最多3篇；文字要像真人、有觀點、有具體內容，不准抄候選貼文，不准捏造親身經驗。interactionTargets 最多5個，只挑真的值得加入討論的；此階段禁止發布、禁止回覆。`;
  const answer = await askAi(prompt);
  const parsed = parseJson(answer?.text ?? answer);
  if (!parsed?.drafts) throw Object.assign(new Error("THREADS_DRAFT_FORMAT_INVALID"), { status: 502 });
  const result = {
    workspaceId, day, slot: "draft", at: Date.now(), mode: "safe-review", autoPublish: false, autoReply: false,
    drafts: parsed.drafts.slice(0, 3).map(x => ({ topic: text(x.topic, 200), hookType: text(x.hookType, 80), text: text(x.text, 5000), why: text(x.why, 800), risk: text(x.risk, 500) })).filter(x => x.text),
    interactionTargets: Array.isArray(parsed.interactionTargets) ? parsed.interactionTargets.slice(0, 5) : [],
    experiment: text(parsed.experiment, 1200),
  };
  await env.MONITOR.put(cycleKey(workspaceId, day, "draft"), JSON.stringify(result), { expirationTtl: 60 * 60 * 24 * 14 });
  return result;
}

export async function buildThreadsReviewCycle(env, workspaceId, day, askAi) {
  const ctx = await loadGrowthContext(env, workspaceId);
  if (!ctx.profile?.industry) throw Object.assign(new Error("BUSINESS_PROFILE_REQUIRED"), { status: 409 });
  const [research, draft] = await Promise.all([readCycle(env, workspaceId, day, "research"), readCycle(env, workspaceId, day, "draft")]);
  const current = { research: research || null, draft: draft || null, recentHistory: (ctx.history || []).slice(0, 12) };
  const prompt = `${buildReviewBrief(ctx.profile, ctx.history || [], current)}\n\n請輸出 JSON，不要 markdown：{"supportedSignals":[],"hypotheses":[],"unknowns":[],"keep":[],"stop":[],"nextExperiment":"","playbook":{"hooks":[],"topics":[],"avoid":[],"notes":""}}。沒有真實 Insights 數據時，必須把判斷放在 hypotheses 或 unknowns，不能假裝有效。`;
  const answer = await askAi(prompt);
  const parsed = parseJson(answer?.text ?? answer);
  if (!parsed) throw Object.assign(new Error("THREADS_REVIEW_FORMAT_INVALID"), { status: 502 });
  const review = {
    workspaceId, day, slot: "review", at: Date.now(),
    supportedSignals: Array.isArray(parsed.supportedSignals) ? parsed.supportedSignals.slice(0, 8) : [],
    hypotheses: Array.isArray(parsed.hypotheses) ? parsed.hypotheses.slice(0, 8) : [],
    unknowns: Array.isArray(parsed.unknowns) ? parsed.unknowns.slice(0, 8) : [],
    keep: Array.isArray(parsed.keep) ? parsed.keep.slice(0, 8) : [],
    stop: Array.isArray(parsed.stop) ? parsed.stop.slice(0, 8) : [],
    nextExperiment: text(parsed.nextExperiment, 1200),
  };
  await env.MONITOR.put(cycleKey(workspaceId, day, "review"), JSON.stringify(review), { expirationTtl: 60 * 60 * 24 * 30 });
  if (parsed.playbook && typeof parsed.playbook === "object") await savePlaybook(env, workspaceId, { ...parsed.playbook, evidenceDay: day, nextExperiment: review.nextExperiment });
  return review;
}
