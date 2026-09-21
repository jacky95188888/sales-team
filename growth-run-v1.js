/* Universal Growth Run V1
 * One safe, testable path: web research -> ranked topics -> review-pending drafts.
 * It never publishes content.
 */
import {
  buildResearchBrief,
  loadGrowthContext,
  recordGrowthResult,
  saveBusinessProfile,
} from "./growth-engine-v1.js";

const RUN_TTL = 60 * 60 * 24 * 30;

function text(value, max = 4000) {
  return String(value || "").trim().slice(0, max);
}

function workspaceId(value) {
  const id = text(value, 80).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!id) throw Object.assign(new Error("WORKSPACE_ID_REQUIRED"), { status: 400 });
  return id;
}

function parseJson(value) {
  const raw = text(value, 60000);
  try { return JSON.parse(raw); } catch {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  const hit = raw.match(/\{[\s\S]*\}/);
  if (!hit) return null;
  try { return JSON.parse(hit[0]); } catch { return null; }
}

function uniqueStrings(values, max, length = 800) {
  return [...new Set((Array.isArray(values) ? values : []).map(x => text(x, length)).filter(Boolean))].slice(0, max);
}

function normalizeSources(sources) {
  const seen = new Set();
  return (Array.isArray(sources) ? sources : []).flatMap(source => {
    const url = text(source?.url, 1800);
    if (!/^https?:\/\//i.test(url) || seen.has(url)) return [];
    seen.add(url);
    return [{ title: text(source?.title || url, 300), url }];
  }).slice(0, 30);
}

function normalizeTopic(topic, index, sourceUrls) {
  const hooks = uniqueStrings(topic?.hooks, 3, 500);
  const draftText = text(topic?.draft?.text || topic?.draftText, 5000);
  if (!text(topic?.title, 240) || hooks.length < 3 || !draftText) return null;
  return {
    id: `draft-${index + 1}`,
    rank: index + 1,
    title: text(topic.title, 240),
    angle: text(topic.angle, 1000),
    whyNow: text(topic.whyNow, 1000),
    evidence: text(topic.evidence, 1600),
    score: Math.max(0, Math.min(100, Number(topic.score) || 0)),
    hooks,
    sources: sourceUrls,
    draft: {
      text: draftText,
      hookType: text(topic?.draft?.hookType || topic?.hookType, 100),
      risk: text(topic?.draft?.risk || topic?.risk, 600),
      status: "review_pending",
      approvedAt: null,
      publishedAt: null,
    },
  };
}

export async function getGrowthProfile(env, inputWorkspaceId) {
  const id = workspaceId(inputWorkspaceId);
  const context = await loadGrowthContext(env, id);
  return { workspaceId: id, profile: context.profile };
}

export async function putGrowthProfile(env, inputWorkspaceId, profile) {
  const id = workspaceId(inputWorkspaceId);
  if (!text(profile?.industry, 160))
    throw Object.assign(new Error("PROFILE_INDUSTRY_REQUIRED"), { status: 400 });
  const saved = await saveBusinessProfile(env, id, profile);
  return { workspaceId: id, profile: saved };
}

export async function runGrowthResearch(env, body, askAi) {
  if (!env.MONITOR) throw Object.assign(new Error("MONITOR_NOT_CONFIGURED"), { status: 503 });
  const id = workspaceId(body?.workspaceId);
  if (body?.profile && typeof body.profile === "object") await saveBusinessProfile(env, id, body.profile);
  const context = await loadGrowthContext(env, id);
  if (!context.profile?.industry) throw Object.assign(new Error("BUSINESS_PROFILE_REQUIRED"), { status: 409 });

  const brief = buildResearchBrief(context.profile, context.history || [], context.playbook || null);
  const prompt = `${brief}

【這次任務】
先用 web_search 搜尋近期公開資料，再產生可人工審核的 Threads 純文字內容。不要做影片、不要發布、不要回覆留言。

搜尋與選題規則：
1. 先列出 10 個候選題目，依近期性、客群相關性、可形成觀點、非罐頭程度評分。
2. 選出最高分 3 題；每題必須有不同角度、3 個不同鉤子，以及 1 篇完整 Threads 草稿。
3. 不得抄寫來源，不得捏造親身經驗、成效、數字或引用。
4. 每個外部事實必須能由本次 web_search 的來源支持；沒有證據就標成推測。
5. 草稿使用繁體中文、台灣自然口語，內容要具體，結尾可引導討論但不硬銷。

只輸出有效 JSON，不要 markdown：
{"researchSummary":"","tiredTopics":[],"hypotheses":[],"challengedHypothesis":"","candidates":[{"title":"","angle":"","score":0,"why":""}],"selected":[{"title":"","angle":"","score":0,"whyNow":"","evidence":"","hooks":["","",""] ,"draft":{"hookType":"","text":"","risk":""}}],"experiment":""}`;

  const answer = await askAi(prompt, { webSearch: true, maxTokens: 5200, maxUses: 8 });
  const parsed = parseJson(answer?.text ?? answer);
  if (!parsed || !Array.isArray(parsed.selected))
    throw Object.assign(new Error("GROWTH_RESEARCH_FORMAT_INVALID"), { status: 502 });

  const sources = normalizeSources(answer?.sources);
  if (!sources.length)
    throw Object.assign(new Error("GROWTH_RESEARCH_SOURCES_REQUIRED"), { status: 502 });
  const sourceUrls = sources.map(source => source.url);
  const topics = parsed.selected.slice(0, 3).map((topic, index) => normalizeTopic(topic, index, sourceUrls)).filter(Boolean);
  if (topics.length !== 3)
    throw Object.assign(new Error("GROWTH_RESEARCH_THREE_DRAFTS_REQUIRED"), { status: 502 });

  const runId = crypto.randomUUID();
  const run = {
    id: runId,
    workspaceId: id,
    createdAt: Date.now(),
    status: "review_pending",
    mode: "research_and_draft",
    autoPublish: false,
    profileUpdatedAt: context.profile.updatedAt || null,
    research: {
      summary: text(parsed.researchSummary, 3000),
      tiredTopics: uniqueStrings(parsed.tiredTopics, 10, 500),
      hypotheses: uniqueStrings(parsed.hypotheses, 10, 800),
      challengedHypothesis: text(parsed.challengedHypothesis, 1200),
      candidates: (Array.isArray(parsed.candidates) ? parsed.candidates : []).slice(0, 10).map(candidate => ({
        title: text(candidate?.title, 240),
        angle: text(candidate?.angle, 800),
        score: Math.max(0, Math.min(100, Number(candidate?.score) || 0)),
        why: text(candidate?.why, 800),
      })).filter(candidate => candidate.title),
      sources,
    },
    topics,
    experiment: text(parsed.experiment, 1600),
  };
  const baseKey = `growth:v1:${id}`;
  await Promise.all([
    env.MONITOR.put(`${baseKey}:run:${runId}`, JSON.stringify(run), { expirationTtl: RUN_TTL }),
    env.MONITOR.put(`${baseKey}:latest`, JSON.stringify(run), { expirationTtl: RUN_TTL }),
  ]);
  return run;
}

async function readRun(env, id, runId) {
  if (!env.MONITOR) throw Object.assign(new Error("MONITOR_NOT_CONFIGURED"), { status: 503 });
  const key = runId
    ? `growth:v1:${id}:run:${text(runId, 100)}`
    : `growth:v1:${id}:latest`;
  const value = await env.MONITOR.get(key);
  if (!value) throw Object.assign(new Error(runId ? "GROWTH_RUN_NOT_FOUND" : "GROWTH_RUN_NOT_FOUND"), { status: 404 });
  try { return JSON.parse(value); } catch { throw Object.assign(new Error("GROWTH_RUN_CORRUPT"), { status: 502 }); }
}

export async function getGrowthRun(env, inputWorkspaceId, inputRunId) {
  const id = workspaceId(inputWorkspaceId);
  const run = await readRun(env, id, inputRunId);
  if (run.workspaceId !== id) throw Object.assign(new Error("GROWTH_WORKSPACE_MISMATCH"), { status: 403 });
  return run;
}

export async function reviewGrowthDraft(env, body) {
  const id = workspaceId(body?.workspaceId);
  const runId = text(body?.runId, 100);
  const draftId = text(body?.draftId, 100);
  const decision = text(body?.decision, 20).toLowerCase();
  if (!runId || !draftId || !["approved", "rejected"].includes(decision))
    throw Object.assign(new Error("GROWTH_REVIEW_INPUT_INVALID"), { status: 400 });
  const run = await readRun(env, id, runId);
  if (run.workspaceId !== id) throw Object.assign(new Error("GROWTH_WORKSPACE_MISMATCH"), { status: 403 });
  const topic = (run.topics || []).find(item => item?.id === draftId);
  if (!topic?.draft) throw Object.assign(new Error("GROWTH_DRAFT_NOT_FOUND"), { status: 404 });
  topic.draft.status = decision;
  topic.draft.reviewedAt = Date.now();
  topic.draft.reviewNote = text(body?.reviewNote, 1200);
  run.updatedAt = Date.now();
  const baseKey = `growth:v1:${id}`;
  await env.MONITOR.put(`${baseKey}:run:${run.id}`, JSON.stringify(run), { expirationTtl: RUN_TTL });
  const latest = await env.MONITOR.get(`${baseKey}:latest`);
  if (latest) {
    try {
      if (JSON.parse(latest)?.id === run.id)
        await env.MONITOR.put(`${baseKey}:latest`, JSON.stringify(run), { expirationTtl: RUN_TTL });
    } catch {}
  }
  return { workspaceId: id, runId: run.id, draftId, status: topic.draft.status, autoPublish: false, reviewedAt: topic.draft.reviewedAt };
}

export async function recordGrowthPerformance(env, body) {
  const id = workspaceId(body?.workspaceId);
  const result = body?.result && typeof body.result === "object" ? body.result : body;
  const item = await recordGrowthResult(env, id, {
    id: result.id,
    platform: result.platform || "threads",
    topic: result.topic,
    hookType: result.hookType,
    format: result.format || "text",
    publishedAt: result.publishedAt,
    metrics: result.metrics,
    review: result.review,
    lesson: result.lesson,
  });
  return { workspaceId: id, result: item, autoPublish: false };
}
