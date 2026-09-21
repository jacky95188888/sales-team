/* Threads Worker Bridge V1
 * Drop-in bridge for sales-team-worker.js.
 * Keeps Threads OAuth/token lifecycle isolated from the existing video publishers.
 */
import { THREADS_SCOPES } from "./threads-adapter-v1.js";
import {
  threadsDiscover,
  threadsEvaluateCandidate,
  threadsDraftReply,
  threadsPublishReply,
  threadsPublishPost,
  threadsPreviewPost,
  threadsCollectPostMetrics,
} from "./threads-service-v1.js";

const PROVIDER = "threads";
function clean(v, n = 500) { return String(v || "").trim().slice(0, n); }
function workspace(v) {
  const id = clean(v, 80).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!id) throw Object.assign(new Error("WORKSPACE_ID_REQUIRED"), { status: 400 });
  return id;
}
function stateKey(state) { return `threads:oauth-state:${state}`; }
function tokenKey(id) { return `threads:publisher:${workspace(id)}`; }
function b64(bytes) {
  let s = ""; for (const n of bytes) s += String.fromCharCode(n);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decode(value) {
  const raw = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(raw + "=".repeat((4 - raw.length % 4) % 4));
  return Uint8Array.from(bin, x => x.charCodeAt(0));
}
async function key(env) {
  const secret = clean(env.PUBLISH_TOKEN_KEY || env.ANTHROPIC_KEY, 10000);
  if (!secret) throw Object.assign(new Error("PUBLISH_TOKEN_KEY_REQUIRED"), { status: 503 });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("sales-team-threads-v1:" + secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function seal(env, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(env), new TextEncoder().encode(JSON.stringify(value)));
  return { iv: b64(iv), data: b64(new Uint8Array(data)), version: 1 };
}
async function open(env, value) {
  if (!value?.iv || !value?.data) return null;
  const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(value.iv) }, await key(env), decode(value.data));
  return JSON.parse(new TextDecoder().decode(data));
}
async function saveToken(env, id, token) {
  await env.MONITOR.put(tokenKey(id), JSON.stringify({ sealed: await seal(env, token), updatedAt: Date.now() }));
}
async function getToken(env, id) {
  const saved = JSON.parse((await env.MONITOR.get(tokenKey(id))) || "null");
  return saved?.sealed ? open(env, saved.sealed) : null;
}
async function apiJson(response, label) {
  const raw = await response.text(); let data;
  try { data = JSON.parse(raw); } catch { data = { error: raw.slice(0, 500) }; }
  if (!response.ok || data?.error) throw Object.assign(new Error(`${label}: ${JSON.stringify(data).slice(0, 500)}`), { status: 400 });
  return data;
}
function redirect(req) { return new URL("/oauth/threads/callback", new URL(req.url).origin).toString(); }

export function threadsCredentialsReady(env) { return !!(env.THREADS_APP_ID && env.THREADS_APP_SECRET); }
export async function threadsConnection(env, workspaceId) {
  const token = await getToken(env, workspaceId);
  return { provider: PROVIDER, credentialsReady: threadsCredentialsReady(env), connected: !!token };
}
export async function threadsOauthStart(req, env, workspaceId) {
  if (!env.MONITOR) throw Object.assign(new Error("MONITOR_NOT_CONFIGURED"), { status: 503 });
  if (!threadsCredentialsReady(env)) throw Object.assign(new Error("THREADS_OAUTH_NOT_CONFIGURED"), { status: 409 });
  const id = workspace(workspaceId), state = b64(crypto.getRandomValues(new Uint8Array(32)));
  await env.MONITOR.put(stateKey(state), JSON.stringify({ workspaceId: id, createdAt: Date.now() }), { expirationTtl: 600 });
  const q = new URLSearchParams({ client_id: env.THREADS_APP_ID, redirect_uri: redirect(req), scope: THREADS_SCOPES.join(","), response_type: "code", state });
  return { provider: PROVIDER, authUrl: `https://threads.net/oauth/authorize?${q}`, redirectUri: redirect(req) };
}
export async function threadsOauthCallback(req, env) {
  const url = new URL(req.url), state = clean(url.searchParams.get("state"), 200), code = clean(url.searchParams.get("code"), 2000);
  const saved = state ? JSON.parse((await env.MONITOR.get(stateKey(state))) || "null") : null;
  if (!saved) throw Object.assign(new Error("THREADS_OAUTH_STATE_EXPIRED"), { status: 400 });
  await env.MONITOR.delete(stateKey(state));
  if (!code) throw Object.assign(new Error(clean(url.searchParams.get("error_description") || url.searchParams.get("error") || "THREADS_OAUTH_CODE_MISSING", 500)), { status: 400 });
  const short = await apiJson(await fetch("https://graph.threads.net/oauth/access_token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.THREADS_APP_ID, client_secret: env.THREADS_APP_SECRET, grant_type: "authorization_code", redirect_uri: redirect(req), code }) }), "Threads OAuth");
  let token = short;
  if (short.access_token) {
    try {
      const q = new URLSearchParams({ grant_type: "th_exchange_token", client_secret: env.THREADS_APP_SECRET, access_token: short.access_token });
      token = await apiJson(await fetch(`https://graph.threads.net/access_token?${q}`), "Threads long token");
    } catch {}
  }
  token.provider = PROVIDER; token.created_at = Date.now(); token.expires_at = Date.now() + Math.max(60, Number(token.expires_in || 3600)) * 1000;
  await saveToken(env, saved.workspaceId, token);
  return { ok: true, provider: PROVIDER, workspaceId: saved.workspaceId };
}
export async function threadsDisconnect(env, workspaceId) {
  await env.MONITOR.delete(tokenKey(workspaceId));
  return { ok: true, provider: PROVIDER, connected: false };
}
async function requireToken(env, id) {
  const token = await getToken(env, id);
  if (!token?.access_token) throw Object.assign(new Error("THREADS_NOT_CONNECTED"), { status: 409 });
  return token;
}
export async function threadsRoute(env, body, askAi) {
  const id = workspace(body.workspaceId), action = clean(body.action, 80), token = await requireToken(env, id);
  if (action === "discover") return threadsDiscover(env, id, token, body);
  if (action === "evaluate") return threadsEvaluateCandidate(env, id, body.candidate, askAi);
  if (action === "draft-reply") return threadsDraftReply(env, id, body.candidate, body.decision, askAi);
  if (action === "publish-preview") return { authorization: { connected: true, provider: PROVIDER }, ...threadsPreviewPost(body) };
  if (action === "publish-reply") return threadsPublishReply(env, id, token, body.candidate, body.decision, body.reply);
  if (action === "publish-post") return threadsPublishPost(env, id, token, body);
  if (action === "collect-metrics") return threadsCollectPostMetrics(env, id, token, body.threadId, body);
  throw Object.assign(new Error("THREADS_ACTION_NOT_SUPPORTED"), { status: 400 });
}
