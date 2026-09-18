import { discoverThreadsTopics, draftThreadsPost, learnFromThreadsMetrics, normalizeThreadsConfig } from "./threads-growth.js";

const MODEL = "claude-sonnet-4-6",
  ORIGIN = "https://jacky95188888.github.io";
const ROUTES = new Set([
  "/",
  "/opinions",
  "/collect",
  "/deepdive",
  "/review",
  "/execute",
  "/content",
  "/summary",
  "/finalize",
  "/vision-stats",
  "/vision-reply",
  "/algo",
  "/monitor-config",
  "/monitor-subscribe",
  "/monitor-notes",
  "/threads-growth/config",
  "/threads-growth/discover",
  "/threads-growth/draft",
  "/threads-growth/approve",
  "/threads-growth/publish",
  "/threads-growth/metrics",
  "/threads-growth/learn",
  "/threads-growth/oauth-start",
  "/threads-growth/oauth/callback",
  "/hq-config",
  "/hq-tasks",
  "/video-config",
  "/video-usage",
  "/avatar-create",
  "/avatar-status",
  "/media-assets",
  "/voice-create",
  "/voice-status",
  "/video-create",
  "/video-status",
  "/publish-config",
  "/oauth-start",
  "/oauth-disconnect",
  "/oauth/youtube/callback",
  "/oauth/tiktok/callback",
  "/publish-video",
  "/publish-status",
]);
async function threadsOAuthStart(req, env) {
  if (!env.THREADS_APP_ID || !env.THREADS_APP_SECRET) throw Object.assign(new Error("THREADS_APP_CONFIG_REQUIRED"), { status: 409 });
  const state = crypto.randomUUID();
  await env.MONITOR.put("threads:growth:oauth-state:" + state, "1", { expirationTtl: 600 });
  const redirectUri = env.THREADS_REDIRECT_URI || (new URL(req.url).origin + "/threads-growth/oauth/callback");
  const u = new URL("https://threads.net/oauth/authorize");
  u.searchParams.set("client_id", env.THREADS_APP_ID); u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("scope", "threads_basic,threads_content_publish,threads_manage_insights");
  u.searchParams.set("response_type", "code"); u.searchParams.set("state", state);
  return { authorizationUrl: u.toString(), state };
}
async function threadsOAuthCallback(req, env) {
  const u = new URL(req.url), code = u.searchParams.get("code"), state = u.searchParams.get("state");
  if (!code || !state || !(await env.MONITOR.get("threads:growth:oauth-state:" + state))) return new Response("Threads OAuth 驗證失敗", { status: 400 });
  await env.MONITOR.delete("threads:growth:oauth-state:" + state);
  const redirectUri = env.THREADS_REDIRECT_URI || (u.origin + "/threads-growth/oauth/callback");
  const body = new URLSearchParams({ client_id: env.THREADS_APP_ID, client_secret: env.THREADS_APP_SECRET, grant_type: "authorization_code", redirect_uri: redirectUri, code });
  const r = await fetch("https://graph.threads.net/oauth/access_token", { method: "POST", body });
  const d = await r.json();
  if (!r.ok || !d.access_token) return new Response("Threads 授權交換失敗：" + JSON.stringify(d).slice(0, 300), { status: 502 });
  await env.MONITOR.put("threads:growth:auth", JSON.stringify({ accessToken: d.access_token, userId: String(d.user_id || ""), obtainedAt: Date.now() }));
  return new Response("Threads 授權完成，可以回到美女顧問團進行文字發布測試。", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

async function threadsGrowth(env, path, b) {
  if (!env.MONITOR) throw Object.assign(new Error("尚未綁定 MONITOR KV"), { status: 503 });
  const cfgKey = "threads:growth:config";
  if (path === "/threads-growth/config") {
    if ((b.action || "get") === "get") return { config: normalizeThreadsConfig(JSON.parse((await env.MONITOR.get(cfgKey)) || "{}")) };
    const config = normalizeThreadsConfig(b.config || b);
    await env.MONITOR.put(cfgKey, JSON.stringify(config));
    return { ok: true, config };
  }
  const config = normalizeThreadsConfig(JSON.parse((await env.MONITOR.get(cfgKey)) || "{}"));
  if (path === "/threads-growth/discover") {
    const history = JSON.parse((await env.MONITOR.get("threads:growth:history")) || "[]");
    return { stage: "discover", ...(await discoverThreadsTopics(env, { ...b, config, history })) };
  }
  if (path === "/threads-growth/draft") {
    const history = JSON.parse((await env.MONITOR.get("threads:growth:history")) || "[]");
    const learned = JSON.parse((await env.MONITOR.get("threads:growth:learned")) || "{}");
    const draft = await draftThreadsPost(env, { ...b, history, learned });
    const id = "th_" + Date.now() + "_" + crypto.randomUUID().slice(0, 8);
    const record = { id, status: "pending_review", topic: String(b.topic || "").slice(0, 300), ...draft, createdAt: Date.now(), updatedAt: Date.now() };
    await env.MONITOR.put("threads:growth:draft:" + id, JSON.stringify(record), { expirationTtl: 2592000 });
    return { stage: "draft", draft: record };
  }
  if (path === "/threads-growth/approve") {
    const id = String(b.draftId || "").slice(0, 100);
    const key = "threads:growth:draft:" + id;
    const record = JSON.parse((await env.MONITOR.get(key)) || "null");
    if (!record) throw Object.assign(new Error("DRAFT_NOT_FOUND"), { status: 404 });
    if (record.status !== "pending_review") throw Object.assign(new Error("DRAFT_NOT_PENDING"), { status: 409 });
    record.status = b.approved === false ? "rejected" : "approved";
    record.reviewedAt = Date.now(); record.updatedAt = Date.now();
    await env.MONITOR.put(key, JSON.stringify(record), { expirationTtl: 2592000 });
    return { stage: "approve", draft: record };
  }
  if (path === "/threads-growth/publish") {
    const id = String(b.draftId || "").slice(0, 100), key = "threads:growth:draft:" + id;
    const record = JSON.parse((await env.MONITOR.get(key)) || "null");
    if (!record) throw Object.assign(new Error("DRAFT_NOT_FOUND"), { status: 404 });
    if (record.status !== "approved") throw Object.assign(new Error("THREADS_APPROVAL_REQUIRED"), { status: 409 });
    const auth = JSON.parse((await env.MONITOR.get("threads:growth:auth")) || "null");
    const accessToken = auth?.accessToken || env.THREADS_ACCESS_TOKEN;
    const userId = auth?.userId || env.THREADS_USER_ID;
    if (!accessToken || !userId) throw Object.assign(new Error("THREADS_OFFICIAL_AUTH_REQUIRED"), { status: 409 });
    record.status = "publishing"; record.updatedAt = Date.now();
    await env.MONITOR.put(key, JSON.stringify(record), { expirationTtl: 2592000 });
    const createBody = new URLSearchParams({ media_type: "TEXT", text: String(record.post || "").slice(0, 5000), access_token: accessToken });
    const created = await fetch(`https://graph.threads.net/v1.0/${encodeURIComponent(userId)}/threads`, { method: "POST", body: createBody });
    const createdData = await created.json();
    if (!created.ok || !createdData.id) { record.status = "approved"; await env.MONITOR.put(key, JSON.stringify(record), { expirationTtl: 2592000 }); throw Object.assign(new Error("THREADS_CREATE_FAILED:" + JSON.stringify(createdData).slice(0, 300)), { status: 502 }); }
    const publishBody = new URLSearchParams({ creation_id: createdData.id, access_token: accessToken });
    const published = await fetch(`https://graph.threads.net/v1.0/${encodeURIComponent(userId)}/threads_publish`, { method: "POST", body: publishBody });
    const publishedData = await published.json();
    if (!published.ok || !publishedData.id) { record.status = "approved"; await env.MONITOR.put(key, JSON.stringify(record), { expirationTtl: 2592000 }); throw Object.assign(new Error("THREADS_PUBLISH_FAILED:" + JSON.stringify(publishedData).slice(0, 300)), { status: 502 }); }
    record.status = "published"; record.threadsPostId = publishedData.id; record.publishedAt = Date.now(); record.updatedAt = Date.now();
    await env.MONITOR.put(key, JSON.stringify(record), { expirationTtl: 7776000 });
    const history = JSON.parse((await env.MONITOR.get("threads:growth:history")) || "[]");
    history.push({ draftId: id, threadsPostId: publishedData.id, topicTag: record.topicTag || "", hookType: record.hookType || "", publishedAt: record.publishedAt, post: record.post });
    await env.MONITOR.put("threads:growth:history", JSON.stringify(history.slice(-200)));
    return { stage: "publish", ok: true, draft: record };
  }
  if (path === "/threads-growth/metrics") {
    const rows = Array.isArray(b.rows) ? b.rows.slice(-200) : [];
    await env.MONITOR.put("threads:growth:history", JSON.stringify(rows));
    return { stage: "metrics", saved: rows.length };
  }
  if (path === "/threads-growth/learn") {
    const rows = JSON.parse((await env.MONITOR.get("threads:growth:history")) || "[]");
    const learned = learnFromThreadsMetrics(rows);
    await env.MONITOR.put("threads:growth:learned", JSON.stringify(learned));
    return { stage: "learn", learned };
  }
  throw Object.assign(new Error("THREADS_ROUTE_NOT_FOUND"), { status: 404 });
}

const RULES = `使用繁體中文、台灣口語。食品保健不宣稱療效；不保證獲利或成功；命理標示僅供參考；價格與數據只能引用產品資料或搜尋來源。每項建議必須具體到做什麼、怎麼做、第一步。外部事實標【事實】，未查證推論標【推測】。`;
const AGENTS = {
  insight: ["洞察官", "賈伯斯＋奧格威", "看穿客人真正渴望與數據背後的人"],
  strategy: ["策略官", "亞伯拉罕＋艾利斯", "找最小施力、最大槓桿"],
  sales: ["業務官", "喬・吉拉德", "把策略變成能成交的口語話術"],
  review: ["把關官", "查理・蒙格", "反過來想，找致命漏洞並給修法"],
  innovate: [
    "創新官",
    "馬斯克＋時事檔期",
    "用第一性原理提出大膽但標示風險的方向",
  ],
};
const ORDER = Object.keys(AGENTS);
const json = (o, s = 200, h = {}) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...h,
    },
  });
function cors(req) {
  const o = req.headers.get("Origin") || ORIGIN;
  return {
    "Access-Control-Allow-Origin": o === ORIGIN ? o : ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
function profile(p) {
  if (!p || typeof p !== "object") return "【產品資料】未提供；不可編造數字。";
  return (
    "【產品資料】\n" +
    Object.entries(p)
      .filter(([, v]) => v != null && String(v).trim())
      .slice(0, 20)
      .map(([k, v]) => `- ${k}：${String(v).slice(0, 500)}`)
      .join("\n")
  );
}
async function claude(env, system, user, max = 1000, tools) {
  if (!env.ANTHROPIC_KEY) throw new Error("尚未設定 ANTHROPIC_KEY");
  const body = {
    model: MODEL,
    max_tokens: max,
    system,
    messages: [{ role: "user", content: user }],
  };
  if (tools)
    body.tools = [
      { type: "web_search_20250305", name: "web_search", max_uses: 5 },
    ];
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${t.slice(0, 300)}`);
  const d = JSON.parse(t);
  const sources = [];
  for (const block of d.content || []) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content))
      for (const item of block.content)
        if (item.url)
          sources.push({ title: item.title || item.url, url: item.url });
  }
  return {
    text: (d.content || [])
      .filter((x) => x.type === "text")
      .map((x) => x.text)
      .join("\n")
      .trim(),
    raw: d,
    sources,
  };
}
async function vision(env, system, prompt, image, mediaType) {
  if (!image || image.length > 7_000_000) throw new Error("圖片缺少或過大");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      system,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType || "image/jpeg",
                data: image,
              },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`Vision ${r.status}`);
  return (d.content || [])
    .filter((x) => x.type === "text")
    .map((x) => x.text)
    .join("\n");
}
async function usage(env, b) {
  if (!env.USAGE) return;
  const id = String(b.deviceId || "")
    .replace(/[^\w-]/g, "")
    .slice(0, 80);
  if (!id)
    throw Object.assign(new Error("DEVICE_ID_REQUIRED"), { status: 400 });
  const k = `u:${new Date().toISOString().slice(0, 10)}:${id}`,
    n = Number((await env.USAGE.get(k)) || 0),
    lim = Math.min(50, Math.max(1, Number(env.DAILY_LIMIT || 10)));
  if (n >= lim) throw Object.assign(new Error("DAILY_LIMIT"), { status: 429 });
  await env.USAGE.put(k, String(n + 1), { expirationTtl: 172800 });
}
async function legacy(env, b) {
  await usage(env, b);
  const system = String(b.system || "").slice(0, 12000),
    messages = Array.isArray(b.messages) ? b.messages.slice(0, 8) : [];
  if (!system || !messages.length)
    throw new Error("舊版請求缺少 system/messages");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 800,
      system,
      messages: messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || "").slice(0, 20000),
      })),
    }),
  });
  return new Response(await r.text(), {
    status: r.status,
    headers: { "Content-Type": "application/json" },
  });
}
async function collect(env, b) {
  const r = await claude(
    env,
    profile(b.profile) + RULES,
    "任務：" +
      b.task +
      "\n今天：" +
      (b.today || new Date().toISOString().slice(0, 10)) +
      "\n必須使用 web_search。整理：查到的事實與來源、競品價格帶、近期趨勢、查不到之處。不得憑記憶編造。",
    1800,
    true,
  );
  return { pack: r.text, sources: r.sources };
}
async function ceoPick(env, task) {
  try {
    const r = await claude(
      env,
      "你是顧問團CEO，依任務派1至5位必要顧問。",
      `任務：${task}\n只回JSON：{"picks":["insight"],"reason":"一句話"}`,
      250,
    );
    const j = JSON.parse((r.text.match(/\{[\s\S]*\}/) || [])[0]);
    const picks = (j.picks || []).filter((x) => AGENTS[x]);
    if (picks.length) return { picks, reason: j.reason || "" };
  } catch {}
  return { picks: ORDER, reason: "預設全員" };
}
async function opinions(env, b, pack) {
  const chosen =
    b.useCEO === false
      ? { picks: ORDER, reason: "全員" }
      : await ceoPick(env, b.task);
  const picks = chosen.picks,
    outs = [];
  for (const k of picks) {
    const a = AGENTS[k],
      r = await claude(
        env,
        profile(b.profile) + RULES + `\n你是${a[0]}，融合${a[1]}。${a[2]}。`,
        `任務：${b.task}\n即時資料：${pack}\n用3至5句提出最關鍵意見，標【事實】或【推測】。`,
        600,
      );
    outs.push({ role: k, agent: a[0], masters: a[1], output: r.text });
  }
  return { opinions: outs, members: picks, ceoReason: chosen.reason };
}
async function deep(env, b) {
  const material = (b.opinions || [])
    .map((x) => `【${x.agent}】${x.output}`)
    .join("\n");
  const reports = [];
  for (const k of (b.picks || ORDER).filter((x) => AGENTS[x]).slice(0, 3)) {
    const a = AGENTS[k],
      r = await claude(
        env,
        profile(b.profile) + RULES + `\n你是${a[0]}。`,
        `任務：${b.task}\n資料：${b.dataPack || ""}\n初步意見：${material}\n提出深入可執行方案、第一步、最大風險，可反駁其他顧問。`,
        1200,
      );
    reports.push({ role: k, agent: a[0], masters: a[1], output: r.text });
  }
  const d = await claude(
    env,
    RULES,
    '將以下報告收斂為2至3個真正不同方向，每個包含 title/core/why/firstStep/risk，以純 JSON {"directions":[...]} 回覆：\n' +
      reports.map((x) => x.output).join("\n"),
    900,
  );
  let directions = [];
  try {
    directions =
      JSON.parse((d.text.match(/\{[\s\S]*\}/) || [])[0]).directions || [];
  } catch {}
  return { reports, directions };
}
async function review(env, b) {
  const r = await claude(
    env,
    profile(b.profile) + RULES + "\n你是總把關官。",
    `任務：${b.task}\n待審：${JSON.stringify(b.reports || [])}\n只回JSON：{"pass":true,"issues":"","fix":""}`,
    700,
  );
  try {
    const j = JSON.parse((r.text.match(/\{[\s\S]*\}/) || [])[0]);
    return {
      pass: !!j.pass,
      issues: j.issues || "",
      fix: j.fix || "",
      raw: r.text,
    };
  } catch {
    return {
      pass: false,
      issues: "審核格式異常",
      fix: "請重新審核",
      raw: r.text,
    };
  }
}
async function execute(env, b) {
  const channel =
    {
      fb: "FB貼文",
      thread: "Threads貼文",
      video: "Instagram Reels／YouTube Shorts短影音製作包，含前三秒鉤子、旁白、字幕與分鏡",
      tiktok: "TikTok直式短影音製作包，含前三秒鉤子、旁白、字幕、鏡位與發布文案",
      youtube: "YouTube影片製作包，含標題、縮圖文字、完整旁白、分鏡、字幕、說明欄與Shorts剪輯點",
      line: "LINE推播",
    }[b.channel] || "FB貼文";
  return (
    await claude(
      env,
      profile(b.profile) + RULES,
      `任務：${b.task}\n顧問報告：${JSON.stringify(b.reports || [])}\n直接產出可複製發布的${channel}，只給成品。`,
      1600,
    )
  ).text;
}
async function contentPlan(env, b) {
  return (
    await claude(
      env,
      profile(b.profile) + RULES,
      `任務：${b.task}\n給形式、主攻平台、各平台角度、發文時段與追蹤指標。`,
      1000,
    )
  ).text;
}
async function summarize(env, b) {
  const s = (
    await claude(
      env,
      "你是會議記錄秘書。",
      `主題：${b.task}\n意見：${JSON.stringify(b.opinions || [])}\n報告：${JSON.stringify(b.reports || [])}\n產出：${b.executed || ""}\n100字內交接重點。`,
      450,
    )
  ).text;
  return {
    task: b.task,
    summary: s,
    date: b.today || new Date().toISOString().slice(0, 10),
  };
}
async function finalize(env, b) {
  return (
    await claude(
      env,
      profile(b.profile) + RULES,
      `任務：${b.task}\n即時資料：${b.dataPack || ""}\n意見：${JSON.stringify(b.opinions || [])}\n報告：${JSON.stringify(b.reports || [])}\n選定方向：${JSON.stringify(b.direction || null)}\n補充：${b.extraNeed || ""}\n整理一句話結論、逐步執行、素材話術、追蹤、風險。`,
      1700,
    )
  ).text;
}
async function algo(env, b) {
  if (b.mode === "vision")
    return {
      analysis: await vision(
        env,
        profile(b.profile) + RULES,
        "讀出讚、留言、瀏覽、分享等真實數據；讀不到填null。再回推被推或卡住原因，給下一篇具體改法。",
        b.image,
        b.mediaType,
      ),
    };
  const live = b.mode === "live";
  const r = await claude(
    env,
    profile(b.profile) + RULES,
    `題材：${b.task}\n${live ? "必須使用web_search查最近平台官方規則並附來源。" : "依互動、停留、完播率與前三秒鉤子分析。"}\n給平台、形式、時段、鉤子、限流雷區。`,
    1500,
    live,
  );
  return { analysis: r.text, sources: r.sources };
}
function safeUrl(v) {
  const u = new URL(v);
  if (u.protocol !== "https:") throw new Error("監測網址只允許 HTTPS");
  const h = u.hostname.toLowerCase();
  if (
    h === "localhost" ||
    h.endsWith(".local") ||
    /^(10|127|169\.254|192\.168)\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  )
    throw new Error("禁止內網網址");
  return u.toString();
}
async function monitorConfig(env, b) {
  if (!env.MONITOR) return { error: "尚未綁定 MONITOR KV" };
  if ((b.action || "list") === "list")
    return { items: JSON.parse((await env.MONITOR.get("items")) || "[]") };
  const items = (b.items || []).slice(0, 50).map((x, i) => ({
    id: String(x.id || Date.now() + i),
    label: String(x.label || "").slice(0, 40),
    url: safeUrl(x.url),
    purpose: String(x.purpose || "").slice(0, 120),
    enabled: x.enabled !== false,
  }));
  await env.MONITOR.put("items", JSON.stringify(items));
  return { ok: true, items };
}
async function monitorSubscribe(env, b) {
  if (!env.MONITOR) return { error: "尚未綁定 MONITOR KV" };
  const s = b.subscription;
  if (!s?.endpoint || !s?.keys?.p256dh || !s?.keys?.auth)
    return { error: "缺少完整訂閱資訊" };
  const subs = JSON.parse((await env.MONITOR.get("subs")) || "[]");
  if (!subs.some((x) => x.endpoint === s.endpoint))
    subs.push({
      endpoint: String(s.endpoint).slice(0, 1000),
      keys: {
        p256dh: String(s.keys.p256dh).slice(0, 200),
        auth: String(s.keys.auth).slice(0, 100),
      },
    });
  await env.MONITOR.put("subs", JSON.stringify(subs.slice(-100)));
  return { ok: true, count: Math.min(subs.length, 100) };
}
function hqWorkspaceId(value) {
  const id = String(value || "")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 80);
  if (id.length < 24)
    throw Object.assign(new Error("HQ_WORKSPACE_REQUIRED"), { status: 400 });
  return id;
}
function hqSafeObject(value, maxLength = 16000) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const text = JSON.stringify(value);
  if (text.length > maxLength)
    throw Object.assign(new Error("HQ_DATA_TOO_LARGE"), { status: 413 });
  return JSON.parse(text);
}
async function hqRegisterWorkspace(env, id) {
  const key = "hq:workspaces";
  const ids = JSON.parse((await env.MONITOR.get(key)) || "[]").filter(
    (x) => typeof x === "string",
  );
  if (!ids.includes(id)) {
    ids.push(id);
    await env.MONITOR.put(key, JSON.stringify(ids.slice(-20)));
  }
}
async function hqConfig(env, b) {
  if (!env.MONITOR) return { error: "尚未綁定 MONITOR KV" };
  const id = hqWorkspaceId(b.workspaceId),
    key = "hq:config:" + id;
  if ((b.action || "list") === "list")
    return { config: JSON.parse((await env.MONITOR.get(key)) || "null") };

  const channels = (Array.isArray(b.channels) ? b.channels : [])
    .filter((x) => ["thread", "fb", "video", "tiktok", "youtube", "line"].includes(x))
    .slice(0, 6);
  const config = {
    workspaceId: id,
    autoEnabled: b.autoEnabled !== false,
    autoVideoEnabled: b.autoVideoEnabled === true,
    autoPublishEnabled: b.autoPublishEnabled === true,
    approvalMode: b.approvalMode === "auto" ? "auto" : "review",
    profile: hqSafeObject(b.profile),
    product: hqSafeObject(b.product, 8000),
    presenter: hqSafeObject(b.presenter, 4000),
    production: hqSafeObject(b.production, 4000),
    publishPrivacy: hqSafeObject(b.publishPrivacy, 1000),
    channels: channels.length ? channels : ["thread", "fb", "video"],
    updatedAt: Date.now(),
  };
  await env.MONITOR.put(key, JSON.stringify(config));
  await hqRegisterWorkspace(env, id);
  return { ok: true, config };
}
async function hqTasks(env, b) {
  if (!env.MONITOR) return { error: "尚未綁定 MONITOR KV" };
  const id = hqWorkspaceId(b.workspaceId);
  if (await workspaceMigrationMatch(id)) await videoOwner(env, id, true);
  const key = "hq:tasks:" + id,
    tasks = JSON.parse((await env.MONITOR.get(key)) || "[]");
  if ((b.action || "list") === "list") return { tasks };

  if (b.action === "delete") {
    const taskId = String(b.taskId || "").slice(0, 100);
    const next = tasks.filter((x) => x && x.id !== taskId);
    await env.MONITOR.put(key, JSON.stringify(next));
    return { ok: true, tasks: next };
  }

  const task = hqSafeObject(b.task, 120000);
  if (!task.id || !task.goal)
    throw Object.assign(new Error("HQ_TASK_INVALID"), { status: 400 });
  task.id = String(task.id).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 100);
  task.goal = String(task.goal).slice(0, 2000);
  task.updatedAt = Number(task.updatedAt) || Date.now();
  const existing = tasks.find((x) => x && x.id === task.id);
  if (existing && Number(existing.updatedAt || 0) > task.updatedAt)
    return { ok: true, task: existing, ignoredOlderUpdate: true };
  const next = tasks.filter((x) => x && x.id !== task.id);
  next.unshift(task);
  await env.MONITOR.put(key, JSON.stringify(next.slice(0, 80)));
  await hqRegisterWorkspace(env, id);
  return { ok: true, task };
}

async function videoOwner(env, workspaceId, claim) {
  if (!env.MONITOR || !workspaceId) return false;
  const id = hqWorkspaceId(workspaceId), key = "hq:video-owner-workspace";
  let owner = await env.MONITOR.get(key);
  if (owner && owner !== id && await workspaceMigrationMatch(id)) {
    await migrateWorkspaceVideoData(env, owner, id);
    await env.MONITOR.put(key, id);
    owner = id;
  }
  if (!owner && claim) {
    const config = await env.MONITOR.get("hq:config:" + id);
    if (!config)
      throw Object.assign(new Error("請先完成產品與雲端同步設定"), {
        status: 409,
      });
    await env.MONITOR.put(key, id);
    owner = id;
  }
  return owner === id;
}
async function workspaceMigrationMatch(id) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id));
  const hash = Array.from(new Uint8Array(bytes)).map((x) => x.toString(16).padStart(2, "0")).join("");
  return hash === "c69e6d778e6028011ced1858578a23ddfee76799457ef0ea4a392e9c7d573fa7";
}
async function migrateWorkspaceVideoData(env, fromId, toId) {
  const directKeys = [[`hq:config:${fromId}`, `hq:config:${toId}`], [`hq:assets:${fromId}`, `hq:assets:${toId}`], [`hq:publisher:${fromId}:youtube`, `hq:publisher:${toId}:youtube`], [`hq:publisher:${fromId}:tiktok`, `hq:publisher:${toId}:tiktok`]];
  for (const [source, target] of directKeys) { const value = await env.MONITOR.get(source); if (value) await env.MONITOR.put(target, value); }
  for (const family of ["avatar", "voice"]) {
    const prefix = `hq:${family}:${fromId}:`; let cursor;
    do { const page = await env.MONITOR.list({ prefix, cursor }); for (const item of page.keys || []) { const value = await env.MONITOR.get(item.name); if (value) await env.MONITOR.put(item.name.replace(prefix, `hq:${family}:${toId}:`), value); } cursor = page.list_complete ? undefined : page.cursor; } while (cursor);
  }
  const configText = await env.MONITOR.get(`hq:config:${toId}`);
  if (configText) { const config = JSON.parse(configText); config.workspaceId = toId; config.updatedAt = Date.now(); await env.MONITOR.put(`hq:config:${toId}`, JSON.stringify(config)); }
  await hqRegisterWorkspace(env, toId);
}
async function videoConfig(env, b) {
  let ownerReady = false;
  let apiValid = false;
  let apiError = null;
  let billing = null;
  let creditReady = true;
  let avatar = null;
  let voice = null;
  try {
    ownerReady = await videoOwner(env, b.workspaceId, true);
  } catch {}
  if (env.HEYGEN_API_KEY) {
    try {
      const account = await heygen(env, "/v3/users/me");
      apiValid = true;
      if (ownerReady && account?.billing_type === "wallet") {
        const remaining = Number(account.wallet?.remaining_balance);
        billing = {
          type: "wallet",
          currency: String(account.wallet?.currency || "credits"),
          remaining: Number.isFinite(remaining) ? remaining : null,
        };
        if (Number.isFinite(remaining)) creditReady = remaining >= 0.5;
      } else if (ownerReady && account?.billing_type === "subscription") {
        const premium = Number(
            account.subscription?.credits?.premium_credits?.remaining,
          ),
          addOn = Number(
            account.subscription?.credits?.add_on_credits?.remaining,
          );
        billing = {
          type: "subscription",
          plan: String(account.subscription?.plan || "unknown"),
          premium: Number.isFinite(premium) ? premium : null,
          addOn: Number.isFinite(addOn) ? addOn : null,
        };
        if (Number.isFinite(premium) || Number.isFinite(addOn))
          creditReady = (Number.isFinite(premium) ? premium : 0) +
              (Number.isFinite(addOn) ? addOn : 0) >=
            0.5;
      } else if (ownerReady && account?.billing_type === "usage_based") {
        billing = {
          type: "usage_based",
          spendingCurrent: account.usage_based?.spending_current_usd ?? null,
          spendingCap: account.usage_based?.spending_cap_usd ?? null,
        };
      }
    } catch (error) {
      apiError = String(error?.message || error).slice(0, 200);
    }
  }
  if (ownerReady && env.MONITOR) {
    avatar = JSON.parse((await env.MONITOR.get(avatarKey(b.workspaceId, b.profileId))) || "null");
    voice = JSON.parse((await env.MONITOR.get(voiceKey(b.workspaceId, b.profileId))) || "null");
  }
  const avatarReady = avatar?.status === "ready" && !!avatar?.selectedLookId;
  return {
    provider: "heygen",
    apiReady: !!env.HEYGEN_API_KEY,
    apiValid,
    apiError,
    ownerReady,
    creditReady,
    billing,
    avatar: avatar
      ? {
          status: avatar.status,
          name: avatar.name,
          previewImageUrl: avatar.previewImageUrl || null,
          selectedLookId: avatar.selectedLookId || null,
          failure: avatar.failure || null,
        }
      : null,
    avatarReady,
    voice: voice ? { id: voice.id, status: voice.status, name: voice.name, failure: voice.failure || null } : null,
    voiceReady: voice?.status === "ready",
    ready: apiValid && ownerReady && creditReady && avatarReady,
    platforms: ["video", "tiktok", "youtube"],
  };
}
async function videoUsage(env, b) {
  await requireVideoAccess(env, b.workspaceId);
  const account = await heygen(env, "/v3/users/me");
  const sessions = await heygen(env, "/v3/video-agents?limit=50");
  let billing = null;
  if (account?.billing_type === "wallet") {
    const remaining = Number(account.wallet?.remaining_balance);
    billing = { type: "wallet", currency: String(account.wallet?.currency || "credits"), remaining: Number.isFinite(remaining) ? remaining : null };
  } else if (account?.billing_type === "subscription") {
    billing = { type: "subscription", plan: String(account.subscription?.plan || "unknown") };
  }
  return {
    billing,
    sessions: (Array.isArray(sessions) ? sessions : []).slice(0, 50).map((item) => ({
      sessionId: String(item?.session_id || "").slice(0, 160),
      title: String(item?.title || "未命名影片").slice(0, 200),
      createdAt: Number(item?.created_at || 0),
    })),
  };
}
async function requireVideoAccess(env, workspaceId) {
  if (!env.HEYGEN_API_KEY)
    throw Object.assign(
      new Error("HEYGEN_API_KEY 尚未設定，MP4 引擎目前未啟用"),
      { status: 503 },
    );
  if (!(await videoOwner(env, workspaceId, false)))
    throw Object.assign(new Error("這個同步碼沒有影片產生權限"), {
      status: 403,
    });
}
function mediaAssetKey(workspaceId) {
  return "hq:assets:" + hqWorkspaceId(workspaceId);
}
function creatorProfileId(value) {
  return String(value || "default").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80) || "default";
}
function voiceKey(workspaceId, profileId = "default") {
  const base = "hq:voice:" + hqWorkspaceId(workspaceId), id = creatorProfileId(profileId);
  return id === "default" ? base : base + ":" + id;
}
function base64Bytes(value) {
  const raw = atob(String(value || "")), bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
async function heygenUploadAsset(env, input) {
  const mediaType = String(input.mediaType || "").toLowerCase(),
    allowed = new Set(["image/jpeg", "image/png", "video/mp4", "video/webm", "audio/mpeg", "audio/wav", "audio/webm", "audio/mp4", "application/pdf", "application/x-subrip"]),
    image = String(input.data || "");
  if (!allowed.has(mediaType))
    throw Object.assign(new Error("不支援這個素材格式"), { status: 400 });
  if (!image || image.length > 6_000_000 || !/^[A-Za-z0-9+/=]+$/.test(image))
    throw Object.assign(new Error("素材缺少、格式錯誤或超過 4.5MB"), { status: 413 });
  const name = String(input.name || "material").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100),
    form = new FormData();
  form.append("file", new Blob([base64Bytes(image)], { type: mediaType }), name);
  const response = await fetch("https://api.heygen.com/v3/assets", {
    method: "POST",
    headers: { "X-Api-Key": env.HEYGEN_API_KEY },
    body: form,
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 300) }; }
  if (!response.ok)
    throw Object.assign(new Error(String(data?.error?.message || data?.message || data?.error || `HeyGen ${response.status}`).slice(0, 500)), { status: response.status >= 500 ? 502 : response.status });
  return data?.data || data;
}
async function heygenAssetWithUrl(env, uploaded) {
  const assetId = String(uploaded?.asset_id || uploaded?.id || "").slice(0, 160);
  if (!assetId) return uploaded || {};
  if (uploaded?.url) return uploaded;
  const details = await heygen(env, "/v3/assets/" + encodeURIComponent(assetId));
  return { ...uploaded, ...details, asset_id: assetId };
}
async function mediaAssets(env, b) {
  if (!env.MONITOR) throw Object.assign(new Error("尚未綁定 MONITOR KV"), { status: 503 });
  const key = mediaAssetKey(b.workspaceId),
    assets = JSON.parse((await env.MONITOR.get(key)) || "[]");
  if ((b.action || "list") === "list") return { assets };
  await requireVideoAccess(env, b.workspaceId);
  if (b.action === "delete") {
    const assetId = String(b.assetId || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 120),
      next = assets.filter((item) => item && item.id !== assetId);
    if (assetId) {
      try { await heygen(env, "/v3/assets/" + encodeURIComponent(assetId), { method: "DELETE" }); } catch {}
    }
    await env.MONITOR.put(key, JSON.stringify(next));
    return { ok: true, assets: next };
  }
  const uploaded = await heygenAssetWithUrl(env, await heygenUploadAsset(env, b)),
    asset = {
      id: String(uploaded.asset_id || uploaded.id || "").slice(0, 160),
      url: String(uploaded.url || "").slice(0, 1200),
      name: String(b.name || "素材").slice(0, 100),
      mediaType: String(uploaded.mime_type || b.mediaType || "").slice(0, 100),
      scope: b.scope === "persistent" ? "persistent" : "once",
      productKey: String(b.productKey || "").replace(/[^A-Za-z0-9_\u4e00-\u9fff-]/g, "").slice(0, 80),
      createdAt: Date.now(),
    };
  if (!asset.id || !asset.url) throw Object.assign(new Error("HeyGen 沒有回傳素材資料"), { status: 502 });
  if (asset.scope === "persistent")
    await env.MONITOR.put(key, JSON.stringify([asset, ...assets.filter((x) => x && x.id !== asset.id)].slice(0, 30)));
  return { ok: true, asset };
}
async function voiceCreate(env, b) {
  await requireVideoAccess(env, b.workspaceId);
  if (!env.MONITOR) throw Object.assign(new Error("尚未綁定 MONITOR KV"), { status: 503 });
  const profileId = creatorProfileId(b.profileId), profileName = String(b.profileName || "目前人物").trim().slice(0, 60) || "目前人物",
    asset = await heygenAssetWithUrl(env, await heygenUploadAsset(env, { data: b.audio, mediaType: b.mediaType, name: profileId + "-voice." + (String(b.mediaType).includes("webm") ? "webm" : "mp4") })),
    result = await heygen(env, "/v3/voices/clone", {
      method: "POST",
      body: JSON.stringify({ audio: { type: "url", url: asset.url }, voice_name: profileName + "專屬聲音", language: "zh", remove_background_noise: true }),
    }),
    voice = { id: String(result?.voice_clone_id || result?.voice_id || "").slice(0, 160), profileId, status: "processing", name: profileName + "專屬聲音", createdAt: Date.now(), updatedAt: Date.now() };
  if (!voice.id) throw Object.assign(new Error("HeyGen 沒有回傳聲音工作編號"), { status: 502 });
  await env.MONITOR.put(voiceKey(b.workspaceId, profileId), JSON.stringify(voice));
  return { ok: true, voice };
}
async function voiceStatus(env, b) {
  await requireVideoAccess(env, b.workspaceId);
  if (!env.MONITOR) throw Object.assign(new Error("尚未綁定 MONITOR KV"), { status: 503 });
  const key = voiceKey(b.workspaceId, b.profileId), voice = JSON.parse((await env.MONITOR.get(key)) || "null");
  if (!voice?.id) return { voice: null };
  try {
    const result = await heygen(env, "/v3/voices/" + encodeURIComponent(voice.id)), status = String(result?.status || "").toLowerCase();
    voice.status = ["complete", "completed", "ready"].includes(status) ? "ready" : (["failed", "error"].includes(status) ? "failed" : "processing");
    voice.failure = result?.failure_message || result?.error || null;
  } catch (error) {
    voice.failure = String(error?.message || error).slice(0, 300);
  }
  voice.updatedAt = Date.now();
  await env.MONITOR.put(key, JSON.stringify(voice));
  return { ok: true, voice };
}
function avatarKey(workspaceId, profileId = "default") {
  const base = "hq:avatar:" + hqWorkspaceId(workspaceId), id = creatorProfileId(profileId);
  return id === "default" ? base : base + ":" + id;
}
function avatarItem(result) {
  return result?.avatar_item || result?.avatar || result;
}
async function avatarCreate(env, b) {
  await requireVideoAccess(env, b.workspaceId);
  if (!env.MONITOR)
    throw Object.assign(new Error("尚未綁定 MONITOR KV"), { status: 503 });
  const mediaType = String(b.mediaType || "").toLowerCase(),
    image = String(b.image || "");
  if (!["image/jpeg", "image/png"].includes(mediaType))
    throw Object.assign(new Error("請使用 JPEG 或 PNG 正面照片"), { status: 400 });
  if (!image || image.length > 6_000_000 || !/^[A-Za-z0-9+/=]+$/.test(image))
    throw Object.assign(new Error("照片缺少、格式錯誤或檔案過大"), { status: 413 });
  const profileId = creatorProfileId(b.profileId), profileName = String(b.profileName || "目前人物").trim().slice(0, 60) || "目前人物",
    appearancePrompt = String(b.appearancePrompt || "Keep the same identity as the reference. Natural, professional and realistic proportions.").trim().slice(0, 1000),
    result = await heygen(env, "/v3/avatars", {
      method: "POST",
      body: JSON.stringify({
        type: "photo",
        name: profileName + "專屬人物",
        file: { type: "base64", media_type: mediaType, data: image },
      }),
    }),
    item = avatarItem(result),
    lookId = item?.id || item?.avatar_id;
  if (!lookId)
    throw Object.assign(new Error("HeyGen 沒有回傳人物編號"), { status: 502 });
  const avatar = {
    name: profileName + "專屬人物",
    profileId,
    appearancePrompt,
    status: "building_face",
    baseLookId: lookId,
    groupId: item?.group_id || null,
    previewImageUrl: item?.preview_image_url || item?.image_url || null,
    selectedLookId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await env.MONITOR.put(avatarKey(b.workspaceId, profileId), JSON.stringify(avatar));
  return { ok: true, avatar };
}
async function avatarStatus(env, b) {
  await requireVideoAccess(env, b.workspaceId);
  if (!env.MONITOR)
    throw Object.assign(new Error("尚未綁定 MONITOR KV"), { status: 503 });
  const key = avatarKey(b.workspaceId, b.profileId),
    avatar = JSON.parse((await env.MONITOR.get(key)) || "null");
  if (!avatar?.baseLookId)
    throw Object.assign(new Error("尚未建立專屬人物"), { status: 404 });
  try {
    const currentId = avatar.styledLookId || avatar.baseLookId,
      result = await heygen(
        env,
        "/v3/avatars/looks/" + encodeURIComponent(currentId),
      ),
      item = avatarItem(result),
      status = String(item?.status || "processing").toLowerCase();
    avatar.previewImageUrl =
      item?.preview_image_url || item?.image_url || avatar.previewImageUrl || null;
    if (!avatar.styledLookId && status === "completed") {
      const styledResult = await heygen(env, "/v3/avatars", {
          method: "POST",
          body: JSON.stringify({
            type: "prompt",
            name: avatar.name + "造型",
            avatar_id: avatar.baseLookId,
            prompt: avatar.appearancePrompt || "Keep the same face and identity as the reference. Natural realistic proportions, professional presentation, flattering light, realistic skin and anatomically correct hands.",
          }),
        }),
        styled = avatarItem(styledResult),
        styledLookId = styled?.id || styled?.avatar_id;
      if (!styledLookId) throw new Error("HeyGen 沒有回傳造型編號");
      avatar.styledLookId = styledLookId;
      avatar.status = "building_style";
    } else if (avatar.styledLookId && status === "completed") {
      avatar.status = "ready";
      avatar.selectedLookId = avatar.styledLookId;
    } else if (status === "failed") {
      avatar.status = "failed";
      avatar.failure = item?.failure_message || "人物建立失敗";
    } else {
      avatar.status = avatar.styledLookId ? "building_style" : "building_face";
    }
  } catch (error) {
    avatar.failure = String(error?.message || error).slice(0, 300);
    if ((error?.status || 0) >= 400 && (error?.status || 0) < 500)
      avatar.status = "failed";
  }
  avatar.updatedAt = Date.now();
  await env.MONITOR.put(key, JSON.stringify(avatar));
  return { ok: true, avatar };
}
async function hqTaskForVideo(env, workspaceId, taskId) {
  if (!env.MONITOR)
    throw Object.assign(new Error("尚未綁定 MONITOR KV"), { status: 503 });
  const id = hqWorkspaceId(workspaceId),
    safeTaskId = String(taskId || "")
      .replace(/[^A-Za-z0-9_-]/g, "")
      .slice(0, 100),
    key = "hq:tasks:" + id,
    tasks = JSON.parse((await env.MONITOR.get(key)) || "[]"),
    index = tasks.findIndex((item) => item && item.id === safeTaskId);
  if (index < 0)
    throw Object.assign(new Error("找不到這個影片任務"), { status: 404 });
  const task = tasks[index];
  if (!task.outputs || !Object.keys(task.outputs).length)
    throw Object.assign(new Error("請先完成內容產線，再產生影片"), {
      status: 409,
    });
  return { id, key, tasks, index, task };
}
async function saveVideoJob(env, record, channel, job) {
  const task = record.tasks[record.index];
  task.videoJobs = { ...(task.videoJobs || {}), [channel]: job };
  task.updatedAt = Date.now();
  record.tasks[record.index] = task;
  await env.MONITOR.put(
    record.key,
    JSON.stringify(record.tasks.slice(0, 80)),
  );
  return task;
}
function videoPrompt(task, channel) {
  const label =
      channel === "youtube"
        ? "YouTube 橫式影片"
        : channel === "tiktok"
          ? "TikTok 直式短影片"
          : "Reels／Shorts 直式短影片",
    production = task.production || {},
    durationSeconds = Math.max(15, Math.min(35, Number(production.totalSeconds) || 30)),
    presenterSeconds = Math.max(0, Math.min(durationSeconds, 12, Number(production.presenterSeconds) || 9)),
    presenterName = String(task.presenter?.name || "創作者").slice(0, 60),
    coHosts = (Array.isArray(task.coHosts) ? task.coHosts : []).filter((host) => host && host.name).slice(0, 2),
    brandStyle = String(production.brandStyle || "依產品定位建立一致、清楚且可信任的品牌視覺").slice(0, 500),
    callToAction = String(production.callToAction || "提供一個自然且可執行的下一步").slice(0, 500);
  return [
    `製作一支繁體中文、台灣口語的 ${label}，長度約 ${durationSeconds} 秒。`,
    `主題：${String(task.goal || "").slice(0, 1000)}`,
    `產品：${String(task.product?.name || "目前主打產品").slice(0, 120)}`,
    `出鏡人物：${presenterName}。人物出鏡總長約 ${presenterSeconds} 秒，只用於關鍵開場、觀點或收尾。`,
    coHosts.length
      ? `共同主持人：${coHosts.map((host) => String(host.name).slice(0, 60)).join("、")}。已附共同主持人的參考照片；雙方必須輪流對話，至少各有一句台詞，並在結尾同框。不得把共同主持人替換成陌生臉孔。`
      : "採單人主持。",
    task.contentMode === "statement" && task.statement
      ? `創作者親自陳述：${String(task.statement).slice(0, 4000)}\n必須保留這段陳述的核心立場與語氣，不可改成相反意思。`
      : "內容由 AI 自動構建，但要有明確觀點、真實情境與可執行下一步。",
    Array.isArray(task.assets) && task.assets.length
      ? `已附上 ${Math.min(task.assets.length, 20)} 個指定素材。優先把它們安排進與旁白直接相關的鏡頭；禁止只當無意義背景或忽略。`
      : "沒有指定素材時，才由系統依旁白選擇相關情境畫面。",
    `品牌視覺：${brandStyle}。繁體中文字幕必須高對比、固定在手機安全區內，不得逐字漂移或超出畫面。`,
    "這不是單一人物念稿。每 3～5 秒必須有一次有意義的鏡頭或構圖變化；人物之外的時間，使用與當句旁白直接相關的產品素材、操作錄影、真實情境 B-roll、圖表與動態字卡。",
    "固定七段式：①0～3秒問題鉤子動態字卡；②3～8秒人物提出具體問題；③8～14秒相關情境或產品素材；④14～20秒時間軸、步驟或前後對照；⑤20～26秒第二個具體情境或證據；⑥26～31秒人物回到畫面給結論；⑦31～35秒留言或私訊行動收尾。若總長低於35秒，等比例縮短，但不可刪除鉤子、情境、圖解、結論與收尾。",
    "每個畫面必須直接服務當下旁白語意；優先示範產品、問題情境、使用步驟、前後對照或具體證據。禁止無關素材、隨機漂浮方塊、空白畫面與長時間同一鏡位。",
    "人物說話時使用中景或半身，單一人物鏡位不可連續超過6秒；情境段落只保留旁白；加入柔和低音量背景音樂、少量轉場音效，不能蓋過人聲。",
    `行動引導：${callToAction}。必須使用自然口吻、清楚字幕、前三秒有鉤子、畫面節奏明快；不得宣稱療效、保證獲利或成功。`,
    "以下是已通過內容產線的腳本與分鏡，請忠實製作，不要杜撰價格、數據或見證：",
    String(task.outputs?.[channel] || task.outputs?.video || "").slice(0, 7500),
  ]
    .join("\n\n")
    .slice(0, 10000);
}
async function videoRateLimit(env, workspaceId) {
  const day = new Date().toISOString().slice(0, 10);
  for (const [key, limit] of [
    [`hq:video-usage:${day}:global`, 6],
    [`hq:video-usage:${day}:${workspaceId}`, 3],
  ]) {
    const count = Number((await env.MONITOR.get(key)) || 0);
    if (count >= limit)
      throw Object.assign(
        new Error("今日影片產生額度已用完，避免意外消耗 HeyGen 點數"),
        { status: 429 },
      );
    await env.MONITOR.put(key, String(count + 1), {
      expirationTtl: 172800,
    });
  }
}
async function heygen(env, path, init = {}) {
  const response = await fetch("https://api.heygen.com" + path, {
      ...init,
      headers: {
        "X-Api-Key": env.HEYGEN_API_KEY,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    }),
    text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text.slice(0, 300) };
  }
  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      data?.error ||
      `HeyGen ${response.status}`;
    throw Object.assign(new Error(String(message).slice(0, 500)), {
      status: response.status >= 500 ? 502 : response.status,
    });
  }
  return data?.data || data;
}
async function videoCreate(req, env, b) {
  await requireVideoAccess(env, b.workspaceId);
  const channel = String(b.channel || "");
  if (!["video", "tiktok", "youtube"].includes(channel))
    throw Object.assign(new Error("不支援的影片平台"), { status: 400 });
  const record = await hqTaskForVideo(env, b.workspaceId, b.taskId);
  if (
    !record.task.channels?.includes(channel) ||
    !record.task.outputs?.[channel]
  )
    throw Object.assign(new Error("這個任務沒有該平台的影片製作包"), {
      status: 409,
    });
  return createVideoForRecord(env, record, channel);
}
async function createVideoForRecord(env, record, channel) {
  const old = record.task.videoJobs?.[channel];
  if (
    old &&
    [
      "thinking",
      "generating",
      "pending",
      "processing",
      "completed",
    ].includes(old.status)
  )
    return { ok: true, reused: true, job: old };
  const profileId = creatorProfileId(record.task.presenter?.id),
    presenterName = String(record.task.presenter?.name || "目前人物").slice(0, 60),
    avatar = JSON.parse(
    (await env.MONITOR.get(avatarKey(record.id, profileId))) || "null",
  );
  const voice = JSON.parse(
    (await env.MONITOR.get(voiceKey(record.id, profileId))) || "null",
  );
  if (avatar?.status !== "ready" || !avatar?.selectedLookId)
    throw Object.assign(
      new Error(`請先在營運總部完成「${presenterName}」的人物設定，避免產生陌生人物`),
      { status: 409 },
    );
  await videoRateLimit(env, record.id);
  const request = {
    prompt: videoPrompt(record.task, channel),
    avatar_id: avatar.selectedLookId,
    mode: "generate",
    orientation: channel === "youtube" ? "landscape" : "portrait",
    incognito_mode: true,
  };
  if (voice?.status === "ready" && voice.id) request.voice_id = voice.id;
  const files = (Array.isArray(record.task.assets) ? record.task.assets : [])
    .filter((item) => item && /^https:\/\//.test(String(item.url || "")))
    .slice(0, 20)
    .map((item) => ({ type: "url", url: String(item.url).slice(0, 1200) }));
  if (files.length) request.files = files;
  const result = await heygen(env, "/v3/video-agents", {
    method: "POST",
    body: JSON.stringify(request),
  });
  if (!result?.session_id)
    throw Object.assign(new Error("HeyGen 沒有回傳影片工作編號"), {
      status: 502,
    });
  const job = {
    provider: "heygen",
    channel,
    sessionId: result.session_id,
    videoId: result.video_id || null,
    status: result.status || "generating",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await saveVideoJob(env, record, channel, job);
  return { ok: true, job };
}
async function videoStatus(req, env, b) {
  await requireVideoAccess(env, b.workspaceId);
  const channel = String(b.channel || "");
  if (!["video", "tiktok", "youtube"].includes(channel))
    throw Object.assign(new Error("不支援的影片平台"), { status: 400 });
  const record = await hqTaskForVideo(env, b.workspaceId, b.taskId),
    old = record.task.videoJobs?.[channel];
  if (!old?.sessionId)
    throw Object.assign(new Error("這個平台尚未建立影片"), { status: 404 });
  if (old.status === "completed" && old.videoUrl)
    return { ok: true, job: old };

  const session = await heygen(
      env,
      "/v3/video-agents/" + encodeURIComponent(old.sessionId),
    ),
    videoId = session?.video_id || old.videoId || null;
  let video = null;
  if (videoId)
    video = await heygen(env, "/v3/videos/" + encodeURIComponent(videoId));
  const status = video?.status || session?.status || old.status || "processing",
    job = {
      ...old,
      videoId,
      status,
      progress: session?.progress ?? null,
      videoUrl: video?.video_url || old.videoUrl || null,
      captionedVideoUrl:
        video?.captioned_video_url || old.captionedVideoUrl || null,
      thumbnailUrl: video?.thumbnail_url || old.thumbnailUrl || null,
      subtitleUrl: video?.subtitle_url || old.subtitleUrl || null,
      duration: video?.duration ?? old.duration ?? null,
      failure:
        video?.failure_message || session?.failure_message || null,
      updatedAt: Date.now(),
    };
  await saveVideoJob(env, record, channel, job);
  return { ok: true, job };
}
const PUBLISH_PROVIDERS = new Set(["youtube", "tiktok"]);
function publishProvider(value) {
  const provider = String(value || "").toLowerCase();
  if (!PUBLISH_PROVIDERS.has(provider))
    throw Object.assign(new Error("不支援的發布平台"), { status: 400 });
  return provider;
}
function publisherKey(workspaceId, provider) {
  return `hq:publisher:${hqWorkspaceId(workspaceId)}:${publishProvider(provider)}`;
}
function decodeB64url(value) {
  const raw = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = raw + "=".repeat((4 - (raw.length % 4)) % 4);
  const binary = atob(padded), out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
async function publisherCryptoKey(env) {
  const secret = String(env.PUBLISH_TOKEN_KEY || env.ANTHROPIC_KEY || "");
  if (!secret)
    throw Object.assign(new Error("尚未設定發布憑證加密金鑰"), { status: 503 });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("sales-team-publisher-v1:" + secret),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function sealPublisher(env, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await publisherCryptoKey(env),
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return { version: 1, iv: b64url(iv), data: b64url(new Uint8Array(encrypted)) };
}
async function openPublisher(env, sealed) {
  if (!sealed?.iv || !sealed?.data) return null;
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeB64url(sealed.iv) },
    await publisherCryptoKey(env),
    decodeB64url(sealed.data),
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}
async function getPublisher(env, workspaceId, provider) {
  if (!env.MONITOR) return null;
  const saved = JSON.parse((await env.MONITOR.get(publisherKey(workspaceId, provider))) || "null");
  if (!saved?.sealed) return null;
  try {
    return await openPublisher(env, saved.sealed);
  } catch {
    throw Object.assign(new Error("平台授權資料無法解密，請重新連線"), { status: 409 });
  }
}
async function savePublisher(env, workspaceId, provider, token) {
  await env.MONITOR.put(
    publisherKey(workspaceId, provider),
    JSON.stringify({ sealed: await sealPublisher(env, token), updatedAt: Date.now() }),
  );
}
function publisherCredentialsReady(env, provider) {
  return provider === "youtube"
    ? !!(env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET)
    : !!(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET);
}
function oauthRedirect(req, provider) {
  return new URL(`/oauth/${provider}/callback`, new URL(req.url).origin).toString();
}
function formBody(values) {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value != null && value !== "") out.set(key, String(value));
  return out.toString();
}
async function responseJson(response, label) {
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 500) }; }
  if (!response.ok || data?.error?.code && data.error.code !== "ok") {
    const message = data?.error_description || data?.error?.message || data?.error?.code || data?.error || data?.message || `${label} ${response.status}`;
    throw Object.assign(new Error(String(message).slice(0, 500)), { status: response.status >= 500 ? 502 : 400 });
  }
  return data;
}
async function oauthStart(req, env, b) {
  await requireVideoAccess(env, b.workspaceId);
  const provider = publishProvider(b.provider);
  if (!publisherCredentialsReady(env, provider))
    throw Object.assign(new Error(provider === "youtube" ? "尚未設定 YouTube OAuth 憑證" : "尚未設定 TikTok 開發者憑證"), { status: 409 });
  const state = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await env.MONITOR.put(
    `hq:oauth-state:${state}`,
    JSON.stringify({ workspaceId: hqWorkspaceId(b.workspaceId), provider, createdAt: Date.now() }),
    { expirationTtl: 600 },
  );
  const redirectUri = oauthRedirect(req, provider);
  let authUrl;
  if (provider === "youtube") {
    const params = new URLSearchParams({
      client_id: env.YOUTUBE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/youtube.upload",
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent select_account",
      state,
    });
    authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + params;
  } else {
    const params = new URLSearchParams({
      client_key: env.TIKTOK_CLIENT_KEY,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "user.info.basic,video.publish",
      state,
    });
    authUrl = "https://www.tiktok.com/v2/auth/authorize/?" + params;
  }
  return { ok: true, provider, authUrl, redirectUri };
}
function oauthResultPage(provider, ok, message) {
  const label = provider === "youtube" ? "YouTube" : "TikTok";
  const target = `${ORIGIN}/sales-team/?oauth=${encodeURIComponent(provider)}&result=${ok ? "connected" : "failed"}`;
  const safeMessage = String(message || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  return new Response(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="refresh" content="2;url=${target}"><title>${label} 授權</title><style>body{margin:0;background:#140b2d;color:#fff;font-family:system-ui;display:grid;place-items:center;min-height:100vh}.box{max-width:560px;margin:24px;padding:32px;border:1px solid #cda84a;border-radius:24px;background:#241742;text-align:center}a{color:#ffe291}</style></head><body><div class="box"><h1>${ok ? "✅" : "⚠️"} ${label} ${ok ? "連線完成" : "連線失敗"}</h1><p>${safeMessage}</p><p>即將返回顧問團。</p><a href="${target}">立即返回</a></div></body></html>`, {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" },
  });
}
async function oauthCallback(req, env, provider) {
  const url = new URL(req.url), state = String(url.searchParams.get("state") || "");
  const stateKey = `hq:oauth-state:${state}`;
  const saved = state ? JSON.parse((await env.MONITOR.get(stateKey)) || "null") : null;
  if (!saved || saved.provider !== provider)
    return oauthResultPage(provider, false, "授權驗證已過期，請回到顧問團重新連線。");
  await env.MONITOR.delete(stateKey);
  if (url.searchParams.get("error"))
    return oauthResultPage(provider, false, url.searchParams.get("error_description") || url.searchParams.get("error"));
  const code = String(url.searchParams.get("code") || "");
  if (!code) return oauthResultPage(provider, false, "平台沒有回傳授權碼。");
  try {
    const redirectUri = oauthRedirect(req, provider);
    let token;
    if (provider === "youtube") {
      token = await responseJson(await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({ code, client_id: env.YOUTUBE_CLIENT_ID, client_secret: env.YOUTUBE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: "authorization_code" }),
      }), "YouTube OAuth");
    } else {
      token = await responseJson(await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({ code, client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: "authorization_code" }),
      }), "TikTok OAuth");
    }
    token.provider = provider;
    token.created_at = Date.now();
    token.expires_at = Date.now() + Math.max(60, Number(token.expires_in || 3600)) * 1000;
    await savePublisher(env, saved.workspaceId, provider, token);
    return oauthResultPage(provider, true, "帳號已安全連接；目前沒有發布任何影片。");
  } catch (error) {
    return oauthResultPage(provider, false, error?.message || error);
  }
}
async function refreshPublisher(env, workspaceId, provider, token) {
  if (!token?.refresh_token || Number(token.expires_at || 0) > Date.now() + 120000) return token;
  let fresh;
  if (provider === "youtube") {
    fresh = await responseJson(await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody({ client_id: env.YOUTUBE_CLIENT_ID, client_secret: env.YOUTUBE_CLIENT_SECRET, refresh_token: token.refresh_token, grant_type: "refresh_token" }),
    }), "YouTube refresh");
  } else {
    fresh = await responseJson(await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, refresh_token: token.refresh_token, grant_type: "refresh_token" }),
    }), "TikTok refresh");
  }
  const next = { ...token, ...fresh, refresh_token: fresh.refresh_token || token.refresh_token, provider, expires_at: Date.now() + Math.max(60, Number(fresh.expires_in || 3600)) * 1000 };
  await savePublisher(env, workspaceId, provider, next);
  return next;
}
async function creatorInfo(env, workspaceId, provider, token) {
  token = await refreshPublisher(env, workspaceId, provider, token);
  if (provider === "youtube") {
    const data = await responseJson(await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${token.access_token}` } }), "YouTube channel");
    const channel = data.items?.[0];
    return { token, account: channel ? { id: channel.id, name: channel.snippet?.title || "YouTube 頻道", avatarUrl: channel.snippet?.thumbnails?.default?.url || null } : null, privacyOptions: ["private", "unlisted", "public"] };
  }
  const data = await responseJson(await fetch("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", { method: "POST", headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json; charset=UTF-8" }, body: "{}" }), "TikTok creator");
  return { token, account: data.data ? { id: token.open_id || null, name: data.data.creator_nickname || data.data.creator_username || "TikTok 帳號", username: data.data.creator_username || null, avatarUrl: data.data.creator_avatar_url || null, maxDuration: data.data.max_video_post_duration_sec || null } : null, privacyOptions: data.data?.privacy_level_options || [] };
}
async function publishConfig(env, b) {
  await requireVideoAccess(env, b.workspaceId);
  const result = {};
  for (const provider of ["youtube", "tiktok"]) {
    const token = await getPublisher(env, b.workspaceId, provider);
    const item = { credentialsReady: publisherCredentialsReady(env, provider), connected: !!token, account: null, privacyOptions: provider === "youtube" ? ["private", "unlisted", "public"] : [], error: null };
    if (token && b.refresh === true) {
      try {
        const info = await creatorInfo(env, b.workspaceId, provider, token);
        item.account = info.account;
        item.privacyOptions = info.privacyOptions;
      } catch (error) { item.error = String(error?.message || error).slice(0, 300); }
    }
    result[provider] = item;
  }
  return { ok: true, platforms: result };
}
async function oauthDisconnect(env, b) {
  await requireVideoAccess(env, b.workspaceId);
  const provider = publishProvider(b.provider), token = await getPublisher(env, b.workspaceId, provider);
  if (token?.access_token) {
    try {
      if (provider === "youtube")
        await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(token.access_token), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
      else
        await fetch("https://open.tiktokapis.com/v2/oauth/revoke/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formBody({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, token: token.access_token }) });
    } catch {}
  }
  await env.MONITOR.delete(publisherKey(b.workspaceId, provider));
  return { ok: true, provider, connected: false };
}
async function remoteVideo(videoUrl) {
  const url = safeUrl(videoUrl), response = await fetch(url);
  if (!response.ok || !response.body)
    throw Object.assign(new Error("無法讀取待發布影片"), { status: 502 });
  const length = Number(response.headers.get("content-length") || 0);
  if (!length) throw Object.assign(new Error("影片來源沒有提供檔案大小"), { status: 409 });
  return { response, length, contentType: response.headers.get("content-type") || "video/mp4" };
}
async function youtubePublish(env, workspaceId, token, videoUrl, metadata) {
  token = await refreshPublisher(env, workspaceId, "youtube", token);
  const video = await remoteVideo(videoUrl);
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Length": String(video.length), "X-Upload-Content-Type": video.contentType },
    body: JSON.stringify({ snippet: { title: metadata.title, description: metadata.description, categoryId: "22" }, status: { privacyStatus: metadata.privacy } }),
  });
  if (!init.ok) await responseJson(init, "YouTube upload init");
  const location = init.headers.get("location");
  if (!location) throw Object.assign(new Error("YouTube 沒有回傳上傳位置"), { status: 502 });
  const uploaded = await responseJson(await fetch(location, { method: "PUT", headers: { "Content-Type": video.contentType, "Content-Length": String(video.length) }, body: video.response.body }), "YouTube upload");
  return { provider: "youtube", status: "published", videoId: uploaded.id, url: uploaded.id ? `https://youtu.be/${uploaded.id}` : null, privacy: metadata.privacy, publishedAt: Date.now() };
}
async function tiktokPublish(env, workspaceId, token, videoUrl, metadata) {
  token = await refreshPublisher(env, workspaceId, "tiktok", token);
  const info = await creatorInfo(env, workspaceId, "tiktok", token);
  if (!info.privacyOptions.includes(metadata.privacy))
    throw Object.assign(new Error("請重新選擇 TikTok 目前允許的可見度"), { status: 409 });
  const video = await remoteVideo(videoUrl);
  if (video.length > 64 * 1024 * 1024)
    throw Object.assign(new Error("TikTok 自動上傳目前限制影片小於 64MB"), { status: 413 });
  const init = await responseJson(await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    method: "POST",
    headers: { Authorization: `Bearer ${info.token.access_token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ post_info: { title: metadata.description.slice(0, 2200), privacy_level: metadata.privacy, disable_comment: false, disable_duet: false, disable_stitch: false, video_cover_timestamp_ms: 1000 }, source_info: { source: "FILE_UPLOAD", video_size: video.length, chunk_size: video.length, total_chunk_count: 1 } }),
  }), "TikTok upload init");
  const uploadUrl = init.data?.upload_url, publishId = init.data?.publish_id;
  if (!uploadUrl || !publishId) throw Object.assign(new Error("TikTok 沒有回傳上傳位置"), { status: 502 });
  const upload = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": video.contentType, "Content-Length": String(video.length), "Content-Range": `bytes 0-${video.length - 1}/${video.length}` }, body: video.response.body });
  if (!upload.ok) await responseJson(upload, "TikTok upload");
  return { provider: "tiktok", status: "processing", publishId, privacy: metadata.privacy, publishedAt: Date.now() };
}
async function savePublishJob(env, record, provider, job) {
  const task = record.tasks[record.index];
  task.publishJobs = { ...(task.publishJobs || {}), [provider]: job };
  task.updatedAt = Date.now();
  record.tasks[record.index] = task;
  await env.MONITOR.put(record.key, JSON.stringify(record.tasks.slice(0, 80)));
  return task;
}
async function publishVideo(env, b) {
  await requireVideoAccess(env, b.workspaceId);
  const provider = publishProvider(b.provider), channel = provider === "youtube" ? "youtube" : "tiktok";
  const record = await hqTaskForVideo(env, b.workspaceId, b.taskId), task = record.task;
  if (!task.finalApprovedAt && task.approvalMode !== "auto")
    throw Object.assign(new Error("請先播放並批准影片成品"), { status: 409 });
  // Existing Reels／Shorts tasks store their completed landscape file as "video".
  // Permit the owner-approved file to be published to YouTube without producing it again.
  const videoJob = task.videoJobs?.[channel] || (provider === "youtube" ? task.videoJobs?.video : null);
  if (videoJob?.status !== "completed" || !videoJob.videoUrl)
    throw Object.assign(new Error("這個平台的 MP4 尚未完成"), { status: 409 });
  let token = await getPublisher(env, record.id, provider);
  if (!token) throw Object.assign(new Error(`請先連接 ${provider === "youtube" ? "YouTube" : "TikTok"} 帳號`), { status: 409 });
  const privacy = String(b.privacy || (provider === "youtube" ? "private" : ""));
  if (provider === "youtube" && !["private", "unlisted", "public"].includes(privacy))
    throw Object.assign(new Error("YouTube 可見度不正確"), { status: 400 });
  if (provider === "tiktok" && !privacy)
    throw Object.assign(new Error("請先選擇 TikTok 可見度"), { status: 400 });
  const metadata = { title: String(task.goal || "顧問團影片").slice(0, 100), description: String(task.outputs?.[channel] || task.outputs?.video || task.goal || "").slice(0, provider === "youtube" ? 5000 : 2200), privacy };
  const pending = { provider, status: "uploading", privacy, startedAt: Date.now() };
  await savePublishJob(env, record, provider, pending);
  try {
    const job = provider === "youtube"
      ? await youtubePublish(env, record.id, token, videoJob.captionedVideoUrl || videoJob.videoUrl, metadata)
      : await tiktokPublish(env, record.id, token, videoJob.captionedVideoUrl || videoJob.videoUrl, metadata);
    await savePublishJob(env, record, provider, job);
    return { ok: true, job };
  } catch (error) {
    const job = { ...pending, status: "failed", failure: String(error?.message || error).slice(0, 500), updatedAt: Date.now() };
    await savePublishJob(env, record, provider, job);
    throw error;
  }
}
async function publishStatus(env, b) {
  await requireVideoAccess(env, b.workspaceId);
  const provider = publishProvider(b.provider), record = await hqTaskForVideo(env, b.workspaceId, b.taskId), old = record.task.publishJobs?.[provider];
  if (!old) throw Object.assign(new Error("尚未開始發布"), { status: 404 });
  if (provider === "youtube" || !old.publishId || ["published", "failed"].includes(old.status)) return { ok: true, job: old };
  let token = await getPublisher(env, record.id, provider);
  if (!token) throw Object.assign(new Error("TikTok 授權已中斷"), { status: 409 });
  token = await refreshPublisher(env, record.id, provider, token);
  const data = await responseJson(await fetch("https://open.tiktokapis.com/v2/post/publish/status/fetch/", { method: "POST", headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json; charset=UTF-8" }, body: JSON.stringify({ publish_id: old.publishId }) }), "TikTok status");
  const platformStatus = String(data.data?.status || "PROCESSING_UPLOAD"), job = { ...old, platformStatus, status: platformStatus === "PUBLISH_COMPLETE" ? "published" : platformStatus === "FAILED" ? "failed" : "processing", failure: data.data?.fail_reason || old.failure || null, updatedAt: Date.now() };
  await savePublishJob(env, record, provider, job);
  return { ok: true, job };
}
function b64url(bytes) {
  let s = "";
  for (const n of bytes) s += String.fromCharCode(n);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function vapidJwt(env, audience) {
  let jwk;
  try {
    jwk = JSON.parse(env.VAPID_PRIVATE);
  } catch {
    throw new Error("VAPID_PRIVATE 必須是 P-256 JWK JSON");
  }
  const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    ),
    enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const input =
    enc({ typ: "JWT", alg: "ES256" }) +
    "." +
    enc({
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 43200,
      sub: env.VAPID_SUBJECT || "mailto:admin@example.com",
    });
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(input),
  );
  return input + "." + b64url(new Uint8Array(sig));
}
async function sendPush(env, sub) {
  const jwt = await vapidJwt(env, new URL(sub.endpoint).origin);
  return fetch(sub.endpoint, {
    method: "POST",
    headers: {
      TTL: "86400",
      Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC}`,
    },
  });
}
async function monitorScheduled(env) {
  if (!env.MONITOR) return;
  const items = JSON.parse((await env.MONITOR.get("items")) || "[]"),
    notes = JSON.parse((await env.MONITOR.get("notes")) || "[]");
  for (const it of items) {
    if (!it.enabled) continue;
    try {
      const r = await fetch(safeUrl(it.url), {
        redirect: "error",
        headers: { "User-Agent": "SanbaobaMonitor/1.0" },
      });
      if (!r.ok) continue;
      const txt = (await r.text())
          .replace(
            /<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi,
            " ",
          )
          .replace(/\s+/g, " ")
          .slice(0, 8000),
        key = "snap:" + it.id,
        old = await env.MONITOR.get(key);
      await env.MONITOR.put(key, txt);
      if (old && old !== txt)
        notes.unshift({
          id: it.id,
          label: it.label,
          url: it.url,
          headline: "監測內容有變動",
          at: Date.now(),
        });
    } catch {}
  }
  const trimmed = notes.slice(0, 50);
  await env.MONITOR.put("notes", JSON.stringify(trimmed));
  if (
    env.VAPID_PUBLIC &&
    env.VAPID_PRIVATE &&
    trimmed[0]?.at > Date.now() - 120000
  ) {
    const subs = JSON.parse((await env.MONITOR.get("subs")) || "[]");
    for (const s of subs)
      try {
        await sendPush(env, s);
      } catch {}
  }
}
function taiwanDay(now = Date.now()) {
  return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function hqProductName(config) {
  return String(
    config.product?.name ||
      config.profile?.p_name ||
      config.profile?.name ||
      "目前主打產品",
  ).slice(0, 100);
}
async function hqAutoTask(env, config, slot, today) {
  const productName = hqProductName(config),
    base = profile(config.profile) +
      "\n【產品快照】\n" +
      JSON.stringify(config.product || {}) +
      "\n" +
      RULES;
  let goal = "",
    strategy = "",
    outputs = {},
    employees = [],
    quality = { pass: true, flags: [], summary: "自動任務已完成，等待老闆批准。" };

  if (slot === "morning") {
    goal = `${today} ${productName} 上午市場與社群情報`;
    employees = ["市場情報員", "社群趨勢雷達", "策略主管"];
    const result = await claude(
      env,
      base,
      `今天是 ${today}。必須使用 web_search，為「${productName}」整理今天可用的市場情報：3個真實趨勢或熱門切角、來源、與產品的關聯、今天最值得做的第一步。不得編造數據。`,
      1600,
      true,
    );
    strategy = result.text;
    outputs.brief = result.text +
      (result.sources?.length
        ? "\n\n【資料來源】\n" + result.sources.map((x) => `- ${x.title}：${x.url}`).join("\n")
        : "");
  } else if (slot === "afternoon") {
    goal = `${today} ${productName} 下午多平台內容包`;
    employees = ["內容企劃", "Threads 寫手", "FB 編輯", "短影音編導", "TikTok 編導", "YouTube 製作人", "品質主管"];
    const channels = (config.channels || ["thread", "fb", "video", "tiktok", "youtube"]).join("、"),
      result = await claude(
        env,
        base,
        `今天是 ${today}。替「${productName}」完成 ${channels} 的今日內容包。內容必須像真人、具體、有第一步，不可罐頭。每一支影片嚴禁超過35秒，並必須提供：逐字旁白、逐句字幕、時間碼、逐鏡分鏡，以及每一句旁白直接對應的情境畫面或圖解；不能整支只讓人物站著念稿。固定七段：0～3秒動態問題鉤子、3～8秒人物提出問題、8～14秒相關情境素材、14～20秒時間軸或對照圖解、20～26秒第二個具體情境、26～31秒人物給結論、31～35秒行動引導。人物總出鏡約8～12秒，單一鏡位不超過6秒。只回 JSON：{"strategy":"一句策略","outputs":{"thread":"成品","fb":"成品","video":"Reels或Shorts製作包","tiktok":"TikTok製作包","youtube":"YouTube完整製作包","line":"成品"}}；只保留要求的平台。`,
        2600,
      );
    try {
      const parsed = JSON.parse((result.text.match(/\{[\s\S]*\}/) || [])[0]);
      strategy = String(parsed.strategy || "今日自動內容策略");
      outputs = hqSafeObject(parsed.outputs, 60000);
    } catch {
      strategy = "AI 回傳格式需人工確認";
      outputs.brief = result.text;
      quality = { pass: false, flags: ["內容格式未完全結構化"], summary: "已保留原始內容，等待老闆確認。" };
    }
  } else {
    goal = `${today} 晚上營運覆盤與明日第一步`;
    employees = ["營運秘書", "成效分析員", "策略主管"];
    const tasks = JSON.parse(
      (await env.MONITOR.get("hq:tasks:" + config.workspaceId)) || "[]",
    ).filter((x) => new Date(Number(x.createdAt || 0) + 8 * 60 * 60 * 1000).toISOString().slice(0, 10) === today);
    const digest = tasks
      .slice(0, 12)
      .map((x) => ({ goal: x.goal, state: x.state, quality: x.quality?.summary }))
      .slice(0, 12);
    const result = await claude(
      env,
      base,
      `今天是 ${today}。依今日任務紀錄 ${JSON.stringify(digest)}，寫一份100至250字營運覆盤：今天完成什麼、卡在哪裡、明天最重要的一件事。資料不足要明說，不可虛構成效數字。`,
      700,
    );
    strategy = "每日營運覆盤";
    outputs.review = result.text;
  }

  return {
    id: `auto_${today.replace(/-/g, "")}_${slot}`,
    goal,
    product: config.product || { name: productName },
    presenter: config.presenter || { id: "default", name: "目前人物" },
    production: config.production || {},
    channels: Object.keys(outputs),
    employees,
    autoSlot: slot,
    approvalMode: config.approvalMode === "auto" ? "auto" : "review",
    state: config.approvalMode === "auto" ? "scheduled" : "approval",
    strategy,
    outputs,
    quality,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
async function hqScheduled(env, event) {
  if (!env.MONITOR) return;
  const slot = {
    "0 1 * * *": "morning",
    "0 6 * * *": "afternoon",
    "0 13 * * *": "evening",
  }[event?.cron];
  if (!slot) return;
  const today = taiwanDay(),
    workspaceIds = JSON.parse((await env.MONITOR.get("hq:workspaces")) || "[]").slice(-20);
  for (const workspaceId of workspaceIds) {
    const marker = `hq:auto:${workspaceId}:${today}:${slot}`;
    if (await env.MONITOR.get(marker)) continue;
    try {
      const config = JSON.parse(
        (await env.MONITOR.get("hq:config:" + workspaceId)) || "null",
      );
      if (!config?.autoEnabled) continue;
      const task = await hqAutoTask(env, config, slot, today),
        key = "hq:tasks:" + workspaceId,
        tasks = JSON.parse((await env.MONITOR.get(key)) || "[]").filter(
          (x) => x && x.id !== task.id,
        );
      tasks.unshift(task);
      await env.MONITOR.put(key, JSON.stringify(tasks.slice(0, 80)));
      if (
        slot === "afternoon" &&
        config.approvalMode === "auto" &&
        config.autoVideoEnabled === true &&
        env.HEYGEN_API_KEY &&
        (await videoOwner(env, workspaceId, false))
      ) {
        const record = { id: workspaceId, key, tasks, index: 0, task };
        for (const channel of (task.channels || []).filter((name) =>
          ["video", "tiktok", "youtube"].includes(name),
        ))
          try {
            await createVideoForRecord(env, record, channel);
          } catch (error) {
            task.videoAutomationError = String(
              error?.message || error,
            ).slice(0, 300);
            task.updatedAt = Date.now();
            await env.MONITOR.put(key, JSON.stringify(tasks.slice(0, 80)));
          }
      }
      await env.MONITOR.put(marker, "done", { expirationTtl: 172800 });
    } catch (error) {
      await env.MONITOR.put(
        `hq:auto-error:${workspaceId}`,
        JSON.stringify({ slot, at: Date.now(), error: String(error?.message || error).slice(0, 300) }),
        { expirationTtl: 604800 },
      );
    }
  }
}
async function hqProcessAutoPublish(env) {
  if (!env.MONITOR) return;
  const workspaceIds = JSON.parse((await env.MONITOR.get("hq:workspaces")) || "[]").slice(-20);
  for (const workspaceId of workspaceIds) {
    const config = JSON.parse((await env.MONITOR.get("hq:config:" + workspaceId)) || "null");
    if (config?.approvalMode !== "auto" || config?.autoPublishEnabled !== true) continue;
    const tasks = JSON.parse((await env.MONITOR.get("hq:tasks:" + workspaceId)) || "[]").slice(0, 12);
    for (const task of tasks) {
      if (!task || task.approvalMode !== "auto") continue;
      for (const provider of ["youtube", "tiktok"]) {
        if (!task.channels?.includes(provider)) continue;
        const existingPublish = task.publishJobs?.[provider];
        try {
          if (existingPublish?.status === "processing") {
            await publishStatus(env, { workspaceId, taskId: task.id, provider });
            continue;
          }
          if (existingPublish && existingPublish.status !== "failed") continue;
          let currentVideo = task.videoJobs?.[provider];
          if (currentVideo?.sessionId && ["thinking", "generating", "pending", "processing"].includes(currentVideo.status)) {
            const checked = await videoStatus(null, env, { workspaceId, taskId: task.id, channel: provider });
            currentVideo = checked.job;
          }
          if (currentVideo?.status !== "completed" || !currentVideo.videoUrl) continue;
          const privacy = String(config.publishPrivacy?.[provider] || (provider === "youtube" ? "private" : ""));
          if (provider === "tiktok" && !privacy) continue;
          await publishVideo(env, { workspaceId, taskId: task.id, provider, privacy });
        } catch (error) {
          await env.MONITOR.put(
            `hq:auto-publish-error:${workspaceId}:${task.id}:${provider}`,
            JSON.stringify({ at: Date.now(), error: String(error?.message || error).slice(0, 500) }),
            { expirationTtl: 604800 },
          );
        }
      }
    }
  }
}
export default {
  async scheduled(e, env, ctx) {
    ctx.waitUntil((async () => {
      await Promise.all([
        e?.cron === "0 1 * * *" ? monitorScheduled(env) : Promise.resolve(),
        hqScheduled(env, e),
      ]);
      await hqProcessAutoPublish(env);
    })());
  },
  async fetch(req, env) {
    const H = cors(req),
      url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: H });
    try {
      if (req.headers.get("Origin") && req.headers.get("Origin") !== ORIGIN)
        return json({ error: "ORIGIN_DENIED" }, 403, H);
      if (!ROUTES.has(url.pathname))
        return json({ error: "NOT_FOUND" }, 404, H);
      if (url.pathname === "/monitor-notes" && req.method === "GET")
        return json(
          {
            notes: env.MONITOR
              ? JSON.parse((await env.MONITOR.get("notes")) || "[]")
              : [],
          },
          200,
          H,
        );
      if (url.pathname === "/threads-growth/oauth/callback" && req.method === "GET")
        return threadsOAuthCallback(req, env);
      if (url.pathname === "/oauth/youtube/callback" && req.method === "GET")
        return oauthCallback(req, env, "youtube");
      if (url.pathname === "/oauth/tiktok/callback" && req.method === "GET")
        return oauthCallback(req, env, "tiktok");
      if (req.method !== "POST") return json({ error: "POST_ONLY" }, 405, H);
      if (Number(req.headers.get("content-length") || 0) > 7_000_000)
        return json({ error: "REQUEST_TOO_LARGE" }, 413, H);
      const b = await req.json(),
        task = String(b.task || "").trim();
      if (url.pathname === "/" && b.system && b.messages) {
        const r = await legacy(env, b);
        const out = new Response(r.body, {
          status: r.status,
          headers: { ...Object.fromEntries(r.headers), ...H },
        });
        return out;
      }
      if (url.pathname === "/threads-growth/oauth-start")
        return json(await threadsOAuthStart(req, env), 200, H);
      if (url.pathname.startsWith("/threads-growth/"))
        return json(await threadsGrowth(env, url.pathname, b), 200, H);
      if (url.pathname === "/monitor-config")
        return json(await monitorConfig(env, b), 200, H);
      if (url.pathname === "/monitor-subscribe")
        return json(await monitorSubscribe(env, b), 200, H);
      if (url.pathname === "/hq-config")
        return json(await hqConfig(env, b), 200, H);
      if (url.pathname === "/hq-tasks")
        return json(await hqTasks(env, b), 200, H);
      if (url.pathname === "/video-config")
        return json(await videoConfig(env, b), 200, H);
      if (url.pathname === "/video-usage")
        return json(await videoUsage(env, b), 200, H);
      if (url.pathname === "/avatar-create")
        return json(await avatarCreate(env, b), 200, H);
      if (url.pathname === "/avatar-status")
        return json(await avatarStatus(env, b), 200, H);
      if (url.pathname === "/media-assets")
        return json(await mediaAssets(env, b), 200, H);
      if (url.pathname === "/voice-create")
        return json(await voiceCreate(env, b), 200, H);
      if (url.pathname === "/voice-status")
        return json(await voiceStatus(env, b), 200, H);
      if (url.pathname === "/video-create")
        return json(await videoCreate(req, env, b), 200, H);
      if (url.pathname === "/video-status")
        return json(await videoStatus(req, env, b), 200, H);
      if (url.pathname === "/publish-config")
        return json(await publishConfig(env, b), 200, H);
      if (url.pathname === "/oauth-start")
        return json(await oauthStart(req, env, b), 200, H);
      if (url.pathname === "/oauth-disconnect")
        return json(await oauthDisconnect(env, b), 200, H);
      if (url.pathname === "/publish-video")
        return json(await publishVideo(env, b), 200, H);
      if (url.pathname === "/publish-status")
        return json(await publishStatus(env, b), 200, H);
      if (url.pathname === "/vision-stats") {
        const t = await vision(
          env,
          "只讀圖片真實數字，讀不到填 null，不猜。",
          "只回 JSON：likes/comments/views/note",
          b.image,
          b.mediaType,
        );
        let x;
        try {
          x = JSON.parse((t.match(/\{[\s\S]*\}/) || [])[0]);
        } catch {
          x = {
            likes: null,
            comments: null,
            views: null,
            note: t.slice(0, 200),
          };
        }
        return json({ stage: "vision-stats", result: x }, 200, H);
      }
      if (url.pathname === "/vision-reply")
        return json(
          {
            stage: "vision-reply",
            reply: await vision(
              env,
              profile(b.profile) + RULES,
              "先說客人想要什麼，再給可直接複製的成交回覆。",
              b.image,
              b.mediaType,
            ),
          },
          200,
          H,
        );
      if (url.pathname === "/algo")
        return json(
          {
            stage: "algo",
            mode: b.mode || "fixed",
            result: await algo(env, b),
          },
          200,
          H,
        );
      if (!task) return json({ error: "缺少任務內容" }, 400, H);
      if (url.pathname === "/collect")
        return json(
          { stage: "collect", task, ...(await collect(env, b)) },
          200,
          H,
        );
      if (url.pathname === "/opinions" || url.pathname === "/") {
        let pack = String(b.dataPack || "");
        let autoCollected = null;
        if (!pack) {
          const c = await collect(env, b);
          pack = c.pack;
          autoCollected = { sources: c.sources };
        }
        const o = await opinions(env, b, pack);
        return json(
          { stage: "opinions", dataPack: pack, autoCollected, ...o },
          200,
          H,
        );
      }
      if (url.pathname === "/deepdive")
        return json({ stage: "deepdive", ...(await deep(env, b)) }, 200, H);
      if (url.pathname === "/review")
        return json({ stage: "review", ...(await review(env, b)) }, 200, H);
      if (url.pathname === "/execute")
        return json(
          { stage: "execute", output: await execute(env, b) },
          200,
          H,
        );
      if (url.pathname === "/content")
        return json(
          { stage: "content", content: await contentPlan(env, b) },
          200,
          H,
        );
      if (url.pathname === "/summary")
        return json(
          { stage: "summary", record: await summarize(env, b) },
          200,
          H,
        );
      if (url.pathname === "/finalize")
        return json(
          { stage: "finalize", plan: await finalize(env, b) },
          200,
          H,
        );
      return json({ error: "NOT_FOUND" }, 404, H);
    } catch (e) {
      return json({ error: String(e.message || e) }, e.status || 500, H);
    }
  },
};
