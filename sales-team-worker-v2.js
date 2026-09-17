import baseWorker from "./sales-team-worker.js";
import {
  threadsConnection,
  threadsOauthStart,
  threadsOauthCallback,
  threadsDisconnect,
  threadsRoute,
} from "./threads-worker-bridge-v1.js";

const ORIGIN = "https://jacky95188888.github.io";
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
});
function cors(req) {
  const origin = req.headers.get("Origin") || ORIGIN;
  return {
    "Access-Control-Allow-Origin": origin === ORIGIN ? origin : ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}
async function ai(env, prompt) {
  if (!env.ANTHROPIC_KEY) throw Object.assign(new Error("ANTHROPIC_KEY_REQUIRED"), { status: 503 });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1200, system: "使用繁體中文、台灣口語。只依提供資料判斷；不得捏造個人經驗、數據或來源。", messages: [{ role: "user", content: String(prompt || "").slice(0, 16000) }] }),
  });
  const raw = await r.text();
  if (!r.ok) throw Object.assign(new Error(`Anthropic ${r.status}: ${raw.slice(0, 300)}`), { status: 502 });
  const data = JSON.parse(raw);
  return { text: (data.content || []).filter(x => x.type === "text").map(x => x.text).join("\n").trim() };
}
function dayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = type => parts.find(x => x.type === type)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
async function listThreadWorkspaces(env) {
  if (!env.MONITOR) return [];
  const raw = await env.MONITOR.get("threads:workspaces");
  try { return [...new Set(JSON.parse(raw || "[]").map(x => String(x || "").trim()).filter(Boolean))].slice(0, 100); }
  catch { return []; }
}
async function threadsCultivationScheduled(event, env) {
  if (!env.MONITOR) return;
  const ids = await listThreadWorkspaces(env);
  const slot = event?.cron === "0 1 * * *" ? "research" : event?.cron === "0 6 * * *" ? "draft" : event?.cron === "0 13 * * *" ? "review" : "other";
  if (slot === "other") return;
  for (const workspaceId of ids) {
    const cfg = JSON.parse((await env.MONITOR.get(`threads:cultivation:${workspaceId}`)) || "null");
    if (!cfg?.enabled) continue;
    const status = await threadsConnection(env, workspaceId);
    const record = { workspaceId, slot, day: dayKey(), at: Date.now(), connected: status.connected, mode: "safe-review", autoPublish: false, autoReply: false };
    // V1 schedule intentionally prepares work only. Public posting/replies remain disabled until OAuth live test + explicit opt-in.
    if (status.connected && slot === "research") {
      try {
        const result = await threadsRoute(env, { workspaceId, action: "discover", queries: cfg.queries || [], limit: 10 }, prompt => ai(env, prompt));
        record.candidates = (result?.candidates || []).slice(0, 20);
      } catch (e) { record.error = String(e?.message || e).slice(0, 500); }
    }
    await env.MONITOR.put(`threads:cycle:${workspaceId}:${dayKey()}:${slot}`, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 14 });
  }
}
async function saveCultivationConfig(env, body) {
  if (!env.MONITOR) throw Object.assign(new Error("MONITOR_NOT_CONFIGURED"), { status: 503 });
  const workspaceId = String(body.workspaceId || "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
  if (!workspaceId) throw Object.assign(new Error("WORKSPACE_ID_REQUIRED"), { status: 400 });
  const current = JSON.parse((await env.MONITOR.get(`threads:cultivation:${workspaceId}`)) || "{}");
  const next = {
    ...current,
    enabled: body.enabled === true,
    queries: Array.isArray(body.queries) ? body.queries.map(x => String(x || "").trim().slice(0, 120)).filter(Boolean).slice(0, 5) : (current.queries || []),
    approvalMode: "review",
    autoPublish: false,
    autoReply: false,
    maxPostsPerDay: Math.min(3, Math.max(1, Number(body.maxPostsPerDay || current.maxPostsPerDay || 3))),
    maxRepliesPerDay: Math.min(5, Math.max(1, Number(body.maxRepliesPerDay || current.maxRepliesPerDay || 5))),
    updatedAt: Date.now(),
  };
  await env.MONITOR.put(`threads:cultivation:${workspaceId}`, JSON.stringify(next));
  const ids = await listThreadWorkspaces(env);
  if (!ids.includes(workspaceId)) await env.MONITOR.put("threads:workspaces", JSON.stringify([...ids, workspaceId].slice(-100)));
  return { workspaceId, ...next };
}

export default {
  scheduled(event, env, ctx) {
    const legacy = Promise.resolve(baseWorker.scheduled(event, env, ctx));
    const threads = threadsCultivationScheduled(event, env);
    ctx?.waitUntil?.(threads);
    return legacy;
  },
  async fetch(req, env, ctx) {
    const url = new URL(req.url), H = cors(req);
    const isThreads = url.pathname.startsWith("/threads-") || url.pathname === "/oauth/threads/callback";
    if (!isThreads) return baseWorker.fetch(req, env, ctx);
    if (req.method === "OPTIONS") return new Response(null, { headers: H });
    try {
      if (req.headers.get("Origin") && req.headers.get("Origin") !== ORIGIN)
        return json({ error: "ORIGIN_DENIED" }, 403, H);
      if (url.pathname === "/oauth/threads/callback" && req.method === "GET") {
        await threadsOauthCallback(req, env);
        const target = `${ORIGIN}/sales-team/?oauth=threads&result=connected`;
        return new Response(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="refresh" content="2;url=${target}"><body style="margin:0;background:#140b2d;color:#fff;font-family:system-ui;display:grid;place-items:center;min-height:100vh"><main style="padding:32px;border:1px solid #cda84a;border-radius:24px;background:#241742;text-align:center"><h1>✅ Threads 連線完成</h1><p>帳號已安全連接，尚未自動發布內容。</p><a style="color:#ffe291" href="${target}">返回顧問團</a></main></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
      }
      if (req.method !== "POST") return json({ error: "POST_ONLY" }, 405, H);
      const body = await req.json();
      if (url.pathname === "/threads-config") return json(await threadsConnection(env, body.workspaceId), 200, H);
      if (url.pathname === "/threads-cultivation-config") return json(await saveCultivationConfig(env, body), 200, H);
      if (url.pathname === "/threads-oauth-start") return json(await threadsOauthStart(req, env, body.workspaceId), 200, H);
      if (url.pathname === "/threads-disconnect") return json(await threadsDisconnect(env, body.workspaceId), 200, H);
      if (url.pathname === "/threads-action") return json(await threadsRoute(env, body, prompt => ai(env, prompt)), 200, H);
      return json({ error: "NOT_FOUND" }, 404, H);
    } catch (error) {
      return json({ error: String(error?.message || error).slice(0, 700) }, Number(error?.status || 500), H);
    }
  },
};
