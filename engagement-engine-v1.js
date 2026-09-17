/* Engagement Engine V1
 * Cross-industry / cross-platform discovery and conversation decision core.
 * Platform adapters must use official/authorized APIs. No scraping or spam loops here.
 */

const ENGAGEMENT_VERSION = 1;
const MAX_SEEN = 500;

function safeId(value) {
  const id = String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  if (!id) throw Object.assign(new Error("WORKSPACE_ID_REQUIRED"), { status: 400 });
  return id;
}
function txt(v, n = 1000) { return String(v || "").trim().slice(0, n); }
function key(workspaceId, name) { return `engage:v${ENGAGEMENT_VERSION}:${safeId(workspaceId)}:${name}`; }

export function buildDiscoveryBrief(profile, growthContext = {}) {
  if (!profile?.industry) throw Object.assign(new Error("BUSINESS_PROFILE_REQUIRED"), { status: 409 });
  return `你是跨產業「對話機會研究員」，不是廣告機器人。\n產業：${profile.industry}\n產品/服務：${profile.offer || "未填"}\n客群：${profile.audience || "未填"}\n地區：${profile.region || "未填"}\n目標：${(profile.goals || []).join("、") || "未填"}\n平台：${(profile.platforms || []).join("、") || "未填"}\n既有學習：${JSON.stringify(growthContext.playbook || {})}\n\n搜尋近期、公開、與此客戶真正相關的討論。找的是「值得參與的對話」，不是可以塞廣告的地方。每個候選必須整理：主題、原文摘要、時間、來源、為何相關、可提供的實質價值、是否適合回覆。不得抄寫他人內容，不得虛構來源。`;
}

export function buildReplyDecisionBrief(profile, candidate, history = []) {
  return `你是社群互動把關官。先決定「要不要回」，不是先寫留言。\n品牌/產業：${profile?.industry || "未知"}\n品牌語氣：${profile?.voice || "自然、像真人"}\n候選討論：${JSON.stringify(candidate || {})}\n最近互動紀錄：${JSON.stringify(history.slice(0, 15))}\n\n只在能增加資訊、經驗、解法或真誠對話時建議回覆。拒絕：無關蹭流量、重複留言、硬推銷、假裝親身經驗、挑釁、洗版、敏感個資、沒有把握的事實。輸出結構化結論：decision=reply|skip、reason、valueToAdd、risk、replyGoal。`;
}

export function buildReplyDraftBrief(profile, candidate, decision) {
  if (decision?.decision !== "reply") throw Object.assign(new Error("REPLY_NOT_APPROVED"), { status: 409 });
  return `替這個品牌寫一則自然、有內容的社群回覆。\n產業：${profile?.industry || "未知"}\n語氣：${profile?.voice || "台灣自然口語"}\n原討論：${JSON.stringify(candidate || {})}\n要增加的價值：${decision.valueToAdd || ""}\n互動目的：${decision.replyGoal || "參與對話"}\n\n規則：直接回應對方；不使用空泛的「好棒」「謝謝分享」；除非對方明確詢問，否則不要塞產品連結或強迫導流；不冒充真人經驗；不複製原文；保持簡短。只輸出可發布回覆。`;
}

export async function wasSeen(env, workspaceId, platform, externalId) {
  if (!env.MONITOR || !externalId) return false;
  return !!(await env.MONITOR.get(key(workspaceId, `seen:${txt(platform,40)}:${txt(externalId,160)}`)));
}

export async function markSeen(env, workspaceId, platform, externalId) {
  if (!env.MONITOR || !externalId) return;
  await env.MONITOR.put(key(workspaceId, `seen:${txt(platform,40)}:${txt(externalId,160)}`), "1", { expirationTtl: 60 * 60 * 24 * 30 });
}

export async function recordEngagement(env, workspaceId, record = {}) {
  if (!env.MONITOR) throw Object.assign(new Error("MONITOR_NOT_CONFIGURED"), { status: 503 });
  const historyKey = key(workspaceId, "history");
  const history = JSON.parse((await env.MONITOR.get(historyKey)) || "[]");
  const item = {
    id: txt(record.id || crypto.randomUUID(), 100),
    platform: txt(record.platform, 40),
    externalId: txt(record.externalId, 180),
    topic: txt(record.topic, 300),
    decision: record.decision === "reply" ? "reply" : "skip",
    reason: txt(record.reason, 800),
    reply: txt(record.reply, 1500),
    published: !!record.published,
    metrics: record.metrics && typeof record.metrics === "object" ? record.metrics : {},
    createdAt: Date.now(),
  };
  await env.MONITOR.put(historyKey, JSON.stringify([item, ...history].slice(0, MAX_SEEN)));
  return item;
}

export function buildEngagementReviewBrief(profile, history = []) {
  return `你是互動成長分析員。分析哪些「主動參與討論」真的產生後續對話，而不是只看留言數量。\n產業：${profile?.industry || "未知"}\n紀錄：${JSON.stringify(history.slice(0, 40))}\n\n比較主題、回覆方式、平台與後續互動。指出：值得繼續的對話類型、應停止的模式、疑似垃圾互動訊號、下一輪搜尋方向。資料不足就明確說不足，不得自行腦補。`;
}
