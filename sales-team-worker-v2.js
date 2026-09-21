import baseWorker from "./sales-team-worker.js";
import {
  threadsConnection,
  threadsOauthStart,
  threadsOauthCallback,
  threadsDisconnect,
  threadsRoute,
} from "./threads-worker-bridge-v1.js";
import { buildThreadsDraftCycle, buildThreadsReviewCycle } from "./threads-cycle-v1.js";
import { getGrowthProfile, getGrowthRun, putGrowthProfile, recordGrowthPerformance, reviewGrowthDraft, runGrowthResearch } from "./growth-run-v1.js";

const ORIGIN = "https://jacky95188888.github.io";
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });
function cors(req) { const origin = req.headers.get("Origin") || ORIGIN; return { "Access-Control-Allow-Origin": origin === ORIGIN ? origin : ORIGIN, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" }; }
function collectSources(value, output = [], seen = new Set()) {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) { for (const item of value) collectSources(item, output, seen); return output; }
  const url = typeof value.url === "string" ? value.url.trim() : "";
  if (/^https?:\/\//i.test(url) && !seen.has(url)) {
    seen.add(url);
    output.push({ title: String(value.title || value.name || url).slice(0, 300), url: url.slice(0, 1800) });
  }
  for (const child of Object.values(value)) collectSources(child, output, seen);
  return output;
}
async function ai(env, prompt, options = {}) {
  if (!env.ANTHROPIC_KEY) throw Object.assign(new Error("ANTHROPIC_KEY_REQUIRED"), { status: 503 });
  const payload = { model: "claude-sonnet-4-6", max_tokens: Math.min(6000, Math.max(800, Number(options.maxTokens) || 1800)), system: "使用繁體中文、台灣口語。只依提供資料判斷；不得捏造個人經驗、數據或來源。輸出 JSON 時必須是有效 JSON。", messages: [{ role: "user", content: String(prompt || "").slice(0, 30000) }] };
  if (options.webSearch === true) payload.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: Math.min(10, Math.max(1, Number(options.maxUses) || 5)) }];
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_KEY, "anthropic-version": "2023-06-01" }, body: JSON.stringify(payload) });
  const raw = await r.text(); if (!r.ok) throw Object.assign(new Error(`Anthropic ${r.status}: ${raw.slice(0, 300)}`), { status: 502 });
  const data = JSON.parse(raw); return { text: (data.content || []).filter(x => x.type === "text").map(x => x.text).join("\n").trim(), sources: collectSources(data.content), raw: data };
}
function dayKey() { const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const g = t => p.find(x => x.type === t)?.value || "00"; return `${g("year")}-${g("month")}-${g("day")}`; }
async function listThreadWorkspaces(env) { if (!env.MONITOR) return []; try { return [...new Set(JSON.parse((await env.MONITOR.get("threads:workspaces")) || "[]").map(x => String(x || "").trim()).filter(Boolean))].slice(0, 100); } catch { return []; } }
async function threadsCultivationScheduled(event, env) {
  if (!env.MONITOR) return;
  const ids = await listThreadWorkspaces(env), day = dayKey();
  const slot = event?.cron === "0 1 * * *" ? "research" : event?.cron === "0 6 * * *" ? "draft" : event?.cron === "0 13 * * *" ? "review" : "other";
  if (slot === "other") return;
  for (const workspaceId of ids) {
    let cfg; try { cfg = JSON.parse((await env.MONITOR.get(`threads:cultivation:${workspaceId}`)) || "null"); } catch { cfg = null; }
    if (!cfg?.enabled) continue;
    const status = await threadsConnection(env, workspaceId);
    if (!status.connected) { await env.MONITOR.put(`threads:cycle:${workspaceId}:${day}:${slot}`, JSON.stringify({ workspaceId, day, slot, at: Date.now(), connected: false, skipped: "THREADS_NOT_CONNECTED", autoPublish: false, autoReply: false }), { expirationTtl: 1209600 }); continue; }
    try {
      if (slot === "research") {
        const result = await threadsRoute(env, { workspaceId, action: "discover", queries: cfg.queries || [], limit: 10 }, prompt => ai(env, prompt));
        await env.MONITOR.put(`threads:cycle:${workspaceId}:${day}:research`, JSON.stringify({ workspaceId, day, slot, at: Date.now(), connected: true, mode: "safe-review", autoPublish: false, autoReply: false, candidates: (result?.candidates || []).slice(0, 20) }), { expirationTtl: 1209600 });
      } else if (slot === "draft") {
        await buildThreadsDraftCycle(env, workspaceId, day, prompt => ai(env, prompt));
      } else if (slot === "review") {
        await buildThreadsReviewCycle(env, workspaceId, day, prompt => ai(env, prompt));
      }
    } catch (e) {
      await env.MONITOR.put(`threads:cycle:${workspaceId}:${day}:${slot}`, JSON.stringify({ workspaceId, day, slot, at: Date.now(), connected: true, error: String(e?.message || e).slice(0, 700), autoPublish: false, autoReply: false }), { expirationTtl: 1209600 });
    }
  }
}
async function saveCultivationConfig(env, body) {
  if (!env.MONITOR) throw Object.assign(new Error("MONITOR_NOT_CONFIGURED"), { status: 503 });
  const workspaceId = String(body.workspaceId || "").trim().replace(/[^a-zA-Z0-9_-]/g, ""); if (!workspaceId) throw Object.assign(new Error("WORKSPACE_ID_REQUIRED"), { status: 400 });
  let current; try { current = JSON.parse((await env.MONITOR.get(`threads:cultivation:${workspaceId}`)) || "{}"); } catch { current = {}; }
  const next = { ...current, enabled: body.enabled === true, queries: Array.isArray(body.queries) ? body.queries.map(x => String(x || "").trim().slice(0, 120)).filter(Boolean).slice(0, 5) : (current.queries || []), approvalMode: "review", autoPublish: false, autoReply: false, maxPostsPerDay: Math.min(3, Math.max(1, Number(body.maxPostsPerDay || current.maxPostsPerDay || 3))), maxRepliesPerDay: Math.min(5, Math.max(1, Number(body.maxRepliesPerDay || current.maxRepliesPerDay || 5))), updatedAt: Date.now() };
  await env.MONITOR.put(`threads:cultivation:${workspaceId}`, JSON.stringify(next)); const ids = await listThreadWorkspaces(env); if (!ids.includes(workspaceId)) await env.MONITOR.put("threads:workspaces", JSON.stringify([...ids, workspaceId].slice(-100))); return { workspaceId, ...next };
}
async function getCycle(env, body) { const workspaceId = String(body.workspaceId || "").trim().replace(/[^a-zA-Z0-9_-]/g, ""); if (!workspaceId) throw Object.assign(new Error("WORKSPACE_ID_REQUIRED"), { status: 400 }); const day = String(body.day || dayKey()).slice(0, 10); const slots = ["research", "draft", "review"]; const out = {}; for (const slot of slots) { try { out[slot] = JSON.parse((await env.MONITOR.get(`threads:cycle:${workspaceId}:${day}:${slot}`)) || "null"); } catch { out[slot] = null; } } return { workspaceId, day, ...out }; }

export default {
  scheduled(event, env, ctx) { const legacy = Promise.resolve(baseWorker.scheduled(event, env, ctx)); const threads = threadsCultivationScheduled(event, env); ctx?.waitUntil?.(threads); return legacy; },
  async fetch(req, env, ctx) {
    const url = new URL(req.url), H = cors(req), isExtended = url.pathname.startsWith("/threads-") || url.pathname.startsWith("/growth-") || url.pathname === "/oauth/threads/callback"; if (!isExtended) return baseWorker.fetch(req, env, ctx); if (req.method === "OPTIONS") return new Response(null, { headers: H });
    try {
      if (req.headers.get("Origin") && req.headers.get("Origin") !== ORIGIN) return json({ error: "ORIGIN_DENIED" }, 403, H);
      if (url.pathname === "/oauth/threads/callback" && req.method === "GET") { await threadsOauthCallback(req, env); const target = `${ORIGIN}/sales-team/?oauth=threads&result=connected`; return new Response(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="refresh" content="2;url=${target}"><body style="margin:0;background:#140b2d;color:#fff;font-family:system-ui;display:grid;place-items:center;min-height:100vh"><main style="padding:32px;border:1px solid #cda84a;border-radius:24px;background:#241742;text-align:center"><h1>✅ Threads 連線完成</h1><p>帳號已安全連接，尚未自動發布內容。</p><a style="color:#ffe291" href="${target}">返回顧問團</a></main></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }); }
      if (req.method !== "POST") return json({ error: "POST_ONLY" }, 405, H); const body = await req.json();
      if (url.pathname === "/growth-profile") return json(body.profile ? await putGrowthProfile(env, body.workspaceId, body.profile) : await getGrowthProfile(env, body.workspaceId), 200, H);
      if (url.pathname === "/growth-run") return json(await runGrowthResearch(env, body, (prompt, options) => ai(env, prompt, options)), 200, H);
      if (url.pathname === "/growth-run-get") return json(await getGrowthRun(env, body.workspaceId, body.runId), 200, H);
      if (url.pathname === "/growth-review") return json(await reviewGrowthDraft(env, body), 200, H);
      if (url.pathname === "/growth-result") return json(await recordGrowthPerformance(env, body), 200, H);
      if (url.pathname === "/threads-config") return json(await threadsConnection(env, body.workspaceId), 200, H);
      if (url.pathname === "/threads-cultivation-config") return json(await saveCultivationConfig(env, body), 200, H);
      if (url.pathname === "/threads-cycle") return json(await getCycle(env, body), 200, H);
      if (url.pathname === "/threads-oauth-start") return json(await threadsOauthStart(req, env, body.workspaceId), 200, H);
      if (url.pathname === "/threads-disconnect") return json(await threadsDisconnect(env, body.workspaceId), 200, H);
      if (url.pathname === "/threads-publish-preview") return json(await threadsRoute(env, { ...body, action: "publish-preview" }, prompt => ai(env, prompt)), 200, H);
      if (url.pathname === "/threads-action") return json(await threadsRoute(env, body, prompt => ai(env, prompt)), 200, H);
      return json({ error: "NOT_FOUND" }, 404, H);
    } catch (error) { return json({ error: String(error?.message || error).slice(0, 700) }, Number(error?.status || 500), H); }
  },
};
