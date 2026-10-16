const DEFAULT_URL = "https://ai-eyes-video.rhtm9y855y.workers.dev";

export function normalizeYouTubeUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("YouTube URL must use HTTPS");
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const id = host === "youtu.be" ? url.pathname.split("/")[1] :
    host === "youtube.com" ? (url.pathname === "/watch" ? url.searchParams.get("v") :
      url.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)/)?.[1]) : null;
  if (!/^[\w-]{11}$/.test(id || "")) throw new Error("Invalid YouTube video URL");
  return "https://www.youtube.com/watch?v=" + id;
}

export async function aiEyesCall(
  env: Pick<Env, "AI_EYES_ACCESS_TOKEN" | "AI_EYES_BASE_URL">,
  path: "/analyze" | "/result",
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
) {
  if (!env.AI_EYES_ACCESS_TOKEN) throw new Error("AI Eyes backend credential is not configured");
  const base = env.AI_EYES_BASE_URL || DEFAULT_URL;
  const target = new URL(path, base);
  if (target.protocol !== "https:" || target.hostname !== new URL(DEFAULT_URL).hostname)
    throw new Error("AI Eyes backend URL is not allowlisted");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), path === "/analyze" ? 45000 : 18000);
  try {
    const res = await fetchImpl(target, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + env.AI_EYES_ACCESS_TOKEN },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const data: any = await res.json();
    if (!res.ok || data.ok === false) {
      const message = typeof data.error === "string" ? data.error : data.error?.message;
      throw new Error("AI Eyes HTTP " + res.status + ": " + String(message || data.stage || "unknown").slice(0,300));
    }
    return data;
  } catch (e) {
    if (controller.signal.aborted && path === "/analyze")
      throw new Error("Task creation timed out; it may already exist. Do not automatically retry.");
    throw e;
  } finally { clearTimeout(timer); }
}
