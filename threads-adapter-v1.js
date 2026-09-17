/* Threads Adapter V1
 * Official Meta Threads API only. No scraping/browser automation.
 * Token persistence/encryption stays in the Worker publisher layer.
 */

const THREADS_API = "https://graph.threads.net";
const MAX_SEARCH_LIMIT = 50;

function text(v, n = 1000) { return String(v || "").trim().slice(0, n); }
function limit(v, fallback = 25) { return Math.max(1, Math.min(MAX_SEARCH_LIMIT, Number(v || fallback))); }
function tokenValue(token) {
  const value = typeof token === "string" ? token : token?.access_token;
  if (!value) throw Object.assign(new Error("THREADS_NOT_CONNECTED"), { status: 409 });
  return value;
}
async function api(path, token, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${tokenValue(token)}`);
  const r = await fetch(`${THREADS_API}${path}`, { ...init, headers });
  const raw = await r.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw: raw.slice(0, 500) }; }
  if (!r.ok) throw Object.assign(new Error(`THREADS_API_${r.status}: ${JSON.stringify(data).slice(0, 500)}`), { status: 502 });
  return data;
}
function qs(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  return q.toString();
}

export const THREADS_SCOPES = [
  "threads_basic",
  "threads_content_publish",
  "threads_read_replies",
  "threads_manage_replies",
  "threads_manage_insights",
  "threads_keyword_search",
];

export async function threadsSearch(token, options = {}) {
  const query = text(options.query, 120);
  if (!query) throw Object.assign(new Error("THREADS_SEARCH_QUERY_REQUIRED"), { status: 400 });
  const params = {
    q: query,
    search_type: String(options.searchType || "RECENT").toUpperCase() === "TOP" ? "TOP" : "RECENT",
    search_mode: String(options.searchMode || "KEYWORD").toUpperCase() === "TAG" ? "TAG" : "KEYWORD",
    fields: options.fields || "id,text,username,timestamp,permalink,has_replies,is_quote_post",
    limit: limit(options.limit),
    since: options.since,
    until: options.until,
  };
  return api(`/keyword_search?${qs(params)}`, token);
}

export async function threadsCreateText(token, body = {}) {
  const value = text(body.text, 5000);
  if (!value) throw Object.assign(new Error("THREADS_TEXT_REQUIRED"), { status: 400 });
  const params = { media_type: "TEXT", text: value };
  if (body.replyToId) params.reply_to_id = text(body.replyToId, 180);
  if (body.replyControl) params.reply_control = text(body.replyControl, 80);
  return api(`/me/threads?${qs(params)}`, token, { method: "POST" });
}

export async function threadsPublish(token, creationId) {
  const id = text(creationId, 180);
  if (!id) throw Object.assign(new Error("THREADS_CREATION_ID_REQUIRED"), { status: 400 });
  return api(`/me/threads_publish?${qs({ creation_id: id })}`, token, { method: "POST" });
}

export async function threadsPostText(token, body = {}) {
  const created = await threadsCreateText(token, body);
  const published = await threadsPublish(token, created.id);
  return { creationId: created.id, id: published.id, replyToId: body.replyToId || null };
}

export async function threadsReplies(token, threadId, options = {}) {
  const id = text(threadId, 180);
  if (!id) throw Object.assign(new Error("THREAD_ID_REQUIRED"), { status: 400 });
  const params = {
    fields: options.fields || "id,text,username,timestamp,permalink,has_replies,is_reply,is_reply_owned_by_me,root_post,replied_to",
    reverse: options.reverse === true ? "true" : "false",
  };
  return api(`/${encodeURIComponent(id)}/replies?${qs(params)}`, token);
}

export async function threadsInsights(token, threadId, metrics = ["views", "likes", "replies", "reposts", "quotes", "shares"]) {
  const id = text(threadId, 180);
  if (!id) throw Object.assign(new Error("THREAD_ID_REQUIRED"), { status: 400 });
  const safeMetrics = metrics.map(x => text(x, 40)).filter(Boolean).slice(0, 12).join(",");
  return api(`/${encodeURIComponent(id)}/insights?${qs({ metric: safeMetrics })}`, token);
}

export function normalizeThreadsInsights(payload = {}) {
  const out = {};
  for (const row of payload.data || []) {
    const name = text(row.name, 60);
    const value = row.values?.[0]?.value;
    if (name) out[name] = typeof value === "number" ? value : value ?? null;
  }
  return out;
}
