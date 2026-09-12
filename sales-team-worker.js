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
  "/hq-config",
  "/hq-tasks",
]);
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
    profile: hqSafeObject(b.profile),
    product: hqSafeObject(b.product, 8000),
    channels: channels.length ? channels : ["thread", "fb", "video", "tiktok", "youtube"],
    updatedAt: Date.now(),
  };
  await env.MONITOR.put(key, JSON.stringify(config));
  await hqRegisterWorkspace(env, id);
  return { ok: true, config };
}
async function hqTasks(env, b) {
  if (!env.MONITOR) return { error: "尚未綁定 MONITOR KV" };
  const id = hqWorkspaceId(b.workspaceId),
    key = "hq:tasks:" + id,
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
        `今天是 ${today}。替「${productName}」完成 ${channels} 的今日內容包。內容必須像真人、具體、有第一步，不可罐頭。影片平台必須包含可直接製作的旁白、字幕與逐鏡分鏡。只回 JSON：{"strategy":"一句策略","outputs":{"thread":"成品","fb":"成品","video":"Reels或Shorts製作包","tiktok":"TikTok製作包","youtube":"YouTube完整製作包","line":"成品"}}；只保留要求的平台。`,
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
    channels: Object.keys(outputs),
    employees,
    autoSlot: slot,
    state: "approval",
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
export default {
  async scheduled(e, env, ctx) {
    ctx.waitUntil(
      Promise.all([
        e?.cron === "0 1 * * *" ? monitorScheduled(env) : Promise.resolve(),
        hqScheduled(env, e),
      ]),
    );
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
      if (url.pathname === "/monitor-config")
        return json(await monitorConfig(env, b), 200, H);
      if (url.pathname === "/monitor-subscribe")
        return json(await monitorSubscribe(env, b), 200, H);
      if (url.pathname === "/hq-config")
        return json(await hqConfig(env, b), 200, H);
      if (url.pathname === "/hq-tasks")
        return json(await hqTasks(env, b), 200, H);
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
