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

export default {
  scheduled(event, env, ctx) { return baseWorker.scheduled(event, env, ctx); },
  async fetch(req, env, ctx) {
    const url = new URL(req.url), H = cors(req);
    const isThreads = url.pathname.startsWith("/threads-") || url.pathname === "/oauth/threads/callback";
    if (!isThreads) return baseWorker.fetch(req, env, ctx);
    if (req.method === "OPTIONS") return new Response(null, { headers: H });
    try {
      if (req.headers.get("Origin") && req.headers.get("Origin") !== ORIGIN)
        return json({ error: "ORIGIN_DENIED" }, 403, H);
      if (url.pathname === "/oauth/threads/callback" && req.method === "GET") {
        const result = await threadsOauthCallback(req, env);
        const target = `${ORIGIN}/sales-team/?oauth=threads&result=connected`;
        return new Response(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="refresh" content="2;url=${target}"><body style="margin:0;background:#140b2d;color:#fff;font-family:system-ui;display:grid;place-items:center;min-height:100vh"><main style="padding:32px;border:1px solid #cda84a;border-radius:24px;background:#241742;text-align:center"><h1>✅ Threads 連線完成</h1><p>帳號已安全連接，尚未自動發布內容。</p><a style="color:#ffe291" href="${target}">返回顧問團</a></main></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
      }
      if (req.method !== "POST") return json({ error: "POST_ONLY" }, 405, H);
      const body = await req.json();
      if (url.pathname === "/threads-config") return json(await threadsConnection(env, body.workspaceId), 200, H);
      if (url.pathname === "/threads-oauth-start") return json(await threadsOauthStart(req, env, body.workspaceId), 200, H);
      if (url.pathname === "/threads-disconnect") return json(await threadsDisconnect(env, body.workspaceId), 200, H);
      if (url.pathname === "/threads-action") return json(await threadsRoute(env, body, prompt => ai(env, prompt)), 200, H);
      return json({ error: "NOT_FOUND" }, 404, H);
    } catch (error) {
      return json({ error: String(error?.message || error).slice(0, 700) }, Number(error?.status || 500), H);
    }
  },
};
