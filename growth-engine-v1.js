/* Universal Growth Engine V1
 * Multi-tenant, multi-industry learning core for Sales Team.
 * Industry/brand rules are data, never hard-coded into the engine.
 */

const GROWTH_VERSION = 1;
const GROWTH_MAX_HISTORY = 30;

function growthWorkspaceId(value) {
  const id = String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  if (!id) throw Object.assign(new Error("WORKSPACE_ID_REQUIRED"), { status: 400 });
  return id;
}

function growthKey(workspaceId, kind) {
  return `growth:v${GROWTH_VERSION}:${growthWorkspaceId(workspaceId)}:${kind}`;
}

function cleanText(value, max = 1000) {
  return String(value || "").trim().slice(0, max);
}

export function normalizeBusinessProfile(input = {}) {
  return {
    industry: cleanText(input.industry, 160),
    offer: cleanText(input.offer, 1200),
    audience: cleanText(input.audience, 1200),
    region: cleanText(input.region, 240),
    goals: Array.isArray(input.goals) ? input.goals.map(x => cleanText(x, 160)).filter(Boolean).slice(0, 8) : [],
    platforms: Array.isArray(input.platforms) ? input.platforms.map(x => cleanText(x, 60).toLowerCase()).filter(Boolean).slice(0, 10) : [],
    voice: cleanText(input.voice, 600),
    constraints: cleanText(input.constraints, 1200),
    updatedAt: Date.now(),
  };
}

export async function saveBusinessProfile(env, workspaceId, input) {
  if (!env.MONITOR) throw Object.assign(new Error("MONITOR_NOT_CONFIGURED"), { status: 503 });
  const profile = normalizeBusinessProfile(input);
  await env.MONITOR.put(growthKey(workspaceId, "profile"), JSON.stringify(profile));
  return profile;
}

export async function loadGrowthContext(env, workspaceId) {
  if (!env.MONITOR) return { profile: null, history: [], playbook: null };
  const [profileRaw, historyRaw, playbookRaw] = await Promise.all([
    env.MONITOR.get(growthKey(workspaceId, "profile")),
    env.MONITOR.get(growthKey(workspaceId, "history")),
    env.MONITOR.get(growthKey(workspaceId, "playbook")),
  ]);
  return {
    profile: profileRaw ? JSON.parse(profileRaw) : null,
    history: historyRaw ? JSON.parse(historyRaw) : [],
    playbook: playbookRaw ? JSON.parse(playbookRaw) : null,
  };
}

export async function recordGrowthResult(env, workspaceId, result = {}) {
  if (!env.MONITOR) throw Object.assign(new Error("MONITOR_NOT_CONFIGURED"), { status: 503 });
  const key = growthKey(workspaceId, "history");
  const old = JSON.parse((await env.MONITOR.get(key)) || "[]");
  const item = {
    id: cleanText(result.id || crypto.randomUUID(), 100),
    platform: cleanText(result.platform, 60),
    topic: cleanText(result.topic, 300),
    hookType: cleanText(result.hookType, 100),
    format: cleanText(result.format, 100),
    publishedAt: Number(result.publishedAt || Date.now()),
    measuredAt: Date.now(),
    metrics: result.metrics && typeof result.metrics === "object" ? result.metrics : {},
    review: cleanText(result.review, 2500),
    lesson: cleanText(result.lesson, 1200),
  };
  const history = [item, ...old].slice(0, GROWTH_MAX_HISTORY);
  await env.MONITOR.put(key, JSON.stringify(history));
  return item;
}

export function buildResearchBrief(profile, history = [], playbook = null) {
  if (!profile?.industry) throw Object.assign(new Error("BUSINESS_PROFILE_REQUIRED"), { status: 409 });
  const recent = history.slice(0, 12).map((x, i) => ({
    n: i + 1,
    platform: x.platform,
    topic: x.topic,
    hookType: x.hookType,
    metrics: x.metrics,
    lesson: x.lesson,
  }));
  return `你是跨產業市場研究員。禁止假設產業；只能依此 Workspace 資料研究。\n\n【產業】${profile.industry}\n【產品/服務】${profile.offer || "未填"}\n【目標客群】${profile.audience || "未填"}\n【地區】${profile.region || "未填"}\n【目標】${(profile.goals || []).join("、") || "未填"}\n【平台】${(profile.platforms || []).join("、") || "未填"}\n\n【最近表現】\n${JSON.stringify(recent)}\n\n【既有策略】\n${JSON.stringify(playbook || {})}\n\n本輪必須：1. 搜尋近期市場與同業案例；2. 分析有效原因，不複製原文；3. 找出已疲乏題材；4. 提出至少三個不同假設；5. 用過往數據反駁至少一個假設；6. 明確說明本輪要測什麼。外部事實必須保留來源。`;
}

export function buildReviewBrief(profile, history, current) {
  return `你是成長檢討官。你的任務不是稱讚內容，而是找出下一輪可以驗證的改進。\n產業：${profile?.industry || "未知"}\n目標：${(profile?.goals || []).join("、") || "未知"}\n本次結果：${JSON.stringify(current || {})}\n最近紀錄：${JSON.stringify((history || []).slice(0, 12))}\n請區分「有數據支持」「合理推測」「尚無法判斷」。不得把單篇偶然結果當成規律。輸出：有效訊號、失敗訊號、可能原因、下一輪保留、下一輪停止、下一輪實驗。`;
}

export async function savePlaybook(env, workspaceId, playbook = {}) {
  if (!env.MONITOR) throw Object.assign(new Error("MONITOR_NOT_CONFIGURED"), { status: 503 });
  const value = { ...playbook, updatedAt: Date.now(), version: GROWTH_VERSION };
  await env.MONITOR.put(growthKey(workspaceId, "playbook"), JSON.stringify(value));
  return value;
}
