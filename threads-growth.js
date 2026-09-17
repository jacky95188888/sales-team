// Threads Growth V1 — text only. No video/HeyGen/YouTube/TikTok.
// Pure helpers + Anthropic-powered discovery/drafting. Publishing is intentionally
// kept behind a separate official Threads authorization step.

const DEFAULT_TOPICS = [
  "美女顧問團開發日記",
  "AI自動化實驗",
  "一人公司實作",
  "開發踩坑與修正",
  "作品開發過程",
];

const clean = (v, n = 4000) => String(v || "").trim().slice(0, n);

export function normalizeThreadsConfig(input = {}) {
  const mode = input.mode === "auto" ? "auto" : "review";
  const topics = Array.isArray(input.topics)
    ? input.topics.map((x) => clean(x, 80)).filter(Boolean).slice(0, 12)
    : DEFAULT_TOPICS;
  return {
    enabled: input.enabled !== false,
    mode,
    topics: topics.length ? topics : DEFAULT_TOPICS,
    postsPerDay: Math.min(4, Math.max(1, Number(input.postsPerDay || 1))),
    cooldownHours: Math.min(168, Math.max(12, Number(input.cooldownHours || 48))),
    explorationRate: Math.min(0.5, Math.max(0.1, Number(input.explorationRate || 0.25))),
  };
}

async function anthropic(env, system, user, max_tokens = 1200, web = false) {
  if (!env.ANTHROPIC_KEY) throw new Error("尚未設定 ANTHROPIC_KEY");
  const body = {
    model: "claude-sonnet-4-6",
    max_tokens,
    system,
    messages: [{ role: "user", content: user }],
  };
  if (web) body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`Anthropic ${r.status}`);
  return (d.content || []).filter((x) => x.type === "text").map((x) => x.text).join("\n").trim();
}

function parseJson(text, fallback) {
  try {
    return JSON.parse((text.match(/\{[\s\S]*\}/) || [])[0]);
  } catch {
    return fallback;
  }
}

export async function discoverThreadsTopics(env, body = {}) {
  const cfg = normalizeThreadsConfig(body.config);
  const history = Array.isArray(body.history) ? body.history.slice(-30) : [];
  const out = await anthropic(
    env,
    "你是 Threads 內容偵察員。只找適合帳號自然分享、能提供價值的近期題材；不要洗互動、互追、聳動造假或編造數據。使用繁體中文、台灣口語。",
    `內容主軸：${cfg.topics.join("、")}\n近期已發：${JSON.stringify(history)}\n請使用網路搜尋近期可延伸的討論。只回 JSON：{"candidates":[{"topic":"","angle":"","whyNow":"","sourceHint":"","risk":""}]}，最多 6 題。`,
    1400,
    true,
  );
  return parseJson(out, { candidates: [], raw: out });
}

export async function draftThreadsPost(env, body = {}) {
  const topic = clean(body.topic, 300);
  if (!topic) throw new Error("TOPIC_REQUIRED");
  const history = Array.isArray(body.history) ? body.history.slice(-20) : [];
  const learned = body.learned && typeof body.learned === "object" ? body.learned : {};
  const out = await anthropic(
    env,
    "你是美女顧問團的 Threads 主筆。繁體中文、台灣自然口語，像真人記錄自己的實作與想法。禁止罐頭文、假數據、假案例、硬湊成功故事。前三行要讓人想繼續看，但不得標題黨。不要每篇都推產品。",
    `題目：${topic}\n補充資料：${clean(body.context, 5000)}\n近期文章摘要：${JSON.stringify(history)}\n歷史學習：${JSON.stringify(learned)}\n先想 3 個真正不同的開頭，再選最適合的一個完成文章。只回 JSON：{"hooks":["","",""] ,"selected":0,"reason":"","post":"","topicTag":"","hookType":""}。文章適合 Threads 閱讀，不要解釋生成過程。`,
    1600,
  );
  return parseJson(out, { hooks: [], selected: 0, reason: "解析失敗", post: out });
}

export function learnFromThreadsMetrics(rows = []) {
  const valid = (Array.isArray(rows) ? rows : []).filter((x) => x && x.topicTag);
  const buckets = new Map();
  for (const row of valid) {
    const key = `${clean(row.topicTag, 80)}|${clean(row.hookType, 80) || "unknown"}`;
    const views = Math.max(0, Number(row.views || 0));
    const likes = Math.max(0, Number(row.likes || 0));
    const replies = Math.max(0, Number(row.replies || 0));
    const reposts = Math.max(0, Number(row.reposts || 0));
    // Engagement is normalized by views when available; otherwise keep a raw signal.
    const score = views > 0 ? (likes + replies * 2 + reposts * 2.5) / views : likes + replies * 2 + reposts * 2.5;
    const b = buckets.get(key) || { key, count: 0, scoreSum: 0 };
    b.count += 1;
    b.scoreSum += score;
    buckets.set(key, b);
  }
  const patterns = [...buckets.values()]
    .map((x) => ({ ...x, avgScore: x.scoreSum / x.count }))
    .sort((a, b) => b.avgScore - a.avgScore);
  return {
    sampleSize: valid.length,
    patterns,
    note: valid.length < 10 ? "樣本仍少，維持探索，不要過早固定模板。" : "可提高高表現題材比例，但至少保留 25% 新題材探索。",
  };
}
