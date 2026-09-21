/* Threads Service V1
 * Orchestrates the official Threads adapter with Growth + Engagement engines.
 * Does not own OAuth secrets; Worker passes the encrypted/decrypted workspace token.
 */
import { loadGrowthContext, recordGrowthResult } from "./growth-engine-v1.js";
import {
  buildReplyDecisionBrief,
  buildReplyDraftBrief,
  wasSeen,
  markSeen,
  recordEngagement,
} from "./engagement-engine-v1.js";
import {
  threadsSearch,
  threadsPostText,
  threadsInsights,
  normalizeThreadsInsights,
} from "./threads-adapter-v1.js";

function txt(v, n = 1000) { return String(v || "").trim().slice(0, n); }
function parseJson(text) {
  const raw = txt(text, 12000);
  try { return JSON.parse(raw); } catch {}
  const hit = raw.match(/\{[\s\S]*\}/);
  if (!hit) return null;
  try { return JSON.parse(hit[0]); } catch { return null; }
}

export async function threadsDiscover(env, workspaceId, token, options = {}) {
  const ctx = await loadGrowthContext(env, workspaceId);
  if (!ctx.profile?.industry) throw Object.assign(new Error("BUSINESS_PROFILE_REQUIRED"), { status: 409 });
  const queries = (Array.isArray(options.queries) ? options.queries : [options.query || ctx.profile.industry])
    .map(x => txt(x, 120)).filter(Boolean).slice(0, 5);
  const rows = [];
  for (const query of queries) {
    for (const searchType of ["TOP", "RECENT"]) {
      const found = await threadsSearch(token, { query, searchType, limit: Math.min(25, Number(options.limit || 12)) });
      for (const item of found.data || []) {
        if (!item?.id || await wasSeen(env, workspaceId, "threads", item.id)) continue;
        rows.push({ ...item, query, searchType });
      }
    }
  }
  const unique = [...new Map(rows.map(x => [x.id, x])).values()].slice(0, 60);
  return { profile: ctx.profile, candidates: unique, playbook: ctx.playbook || null };
}

export async function threadsEvaluateCandidate(env, workspaceId, candidate, askAi) {
  const ctx = await loadGrowthContext(env, workspaceId);
  if (!ctx.profile) throw Object.assign(new Error("BUSINESS_PROFILE_REQUIRED"), { status: 409 });
  if (typeof askAi !== "function") throw new Error("AI_EVALUATOR_REQUIRED");
  const brief = buildReplyDecisionBrief(ctx.profile, candidate, ctx.history || []);
  const response = await askAi(brief);
  const decision = parseJson(response?.text ?? response) || { decision: "skip", reason: "AI_FORMAT_INVALID" };
  if (decision.decision !== "reply") decision.decision = "skip";
  return decision;
}

export async function threadsDraftReply(env, workspaceId, candidate, decision, askAi) {
  const ctx = await loadGrowthContext(env, workspaceId);
  if (typeof askAi !== "function") throw new Error("AI_DRAFTER_REQUIRED");
  const brief = buildReplyDraftBrief(ctx.profile, candidate, decision);
  const response = await askAi(brief);
  const reply = txt(response?.text ?? response, 5000);
  if (!reply) throw Object.assign(new Error("EMPTY_REPLY"), { status: 502 });
  return reply;
}

export async function threadsPublishReply(env, workspaceId, token, candidate, decision, reply) {
  const externalId = txt(candidate?.id, 180);
  if (!externalId) throw Object.assign(new Error("THREAD_ID_REQUIRED"), { status: 400 });
  if (await wasSeen(env, workspaceId, "threads", externalId))
    throw Object.assign(new Error("THREAD_ALREADY_HANDLED"), { status: 409 });
  const published = await threadsPostText(token, { text: reply, replyToId: externalId });
  await markSeen(env, workspaceId, "threads", externalId);
  const record = await recordEngagement(env, workspaceId, {
    platform: "threads", externalId, topic: candidate?.text || candidate?.query || "",
    decision: "reply", reason: decision?.reason || "", reply, published: true,
  });
  return { published, record };
}

export async function threadsPublishPost(env, workspaceId, token, draft = {}) {
  const body = txt(draft.text, 5000);
  if (!body) throw Object.assign(new Error("THREADS_TEXT_REQUIRED"), { status: 400 });
  const published = await threadsPostText(token, { text: body, replyControl: draft.replyControl });
  const record = await recordGrowthResult(env, workspaceId, {
    id: published.id, platform: "threads", topic: draft.topic || body.slice(0, 160),
    hookType: draft.hookType || "", format: draft.format || "text",
    publishedAt: Date.now(), metrics: {}, lesson: "等待 Insights 回收",
  });
  return { published, record };
}

// A preflight is intentionally local-only: it validates the exact text that
// would be sent after owner approval without creating a Threads container or
// touching any Meta endpoint.
export function threadsPreviewPost(draft = {}) {
  const body = txt(draft.text, 5000);
  if (!body) throw Object.assign(new Error("THREADS_TEXT_REQUIRED"), { status: 400 });
  return {
    preview: {
      platform: "threads",
      topic: txt(draft.topic || body.slice(0, 160), 300),
      hookType: txt(draft.hookType, 100),
      format: "text",
      text: body,
      replyControl: txt(draft.replyControl, 80) || null,
    },
    safe: {
      publicPostCreated: false,
      threadsApiCalled: false,
      nextAction: "Owner confirmation is required before publish-post.",
    },
  };
}

export async function threadsCollectPostMetrics(env, workspaceId, token, threadId, meta = {}) {
  const raw = await threadsInsights(token, threadId);
  const metrics = normalizeThreadsInsights(raw);
  const record = await recordGrowthResult(env, workspaceId, {
    id: threadId, platform: "threads", topic: meta.topic || "", hookType: meta.hookType || "",
    format: meta.format || "text", publishedAt: meta.publishedAt || Date.now(), metrics,
    review: meta.review || "", lesson: meta.lesson || "Insights 已回收，等待下一輪覆盤",
  });
  return { metrics, record };
}
