import fs from "node:fs";

const path = "sales-team-worker.js";
let src = fs.readFileSync(path, "utf8");

if (src.includes("REFERENCE_RUNTIME_V1")) {
  console.log("Reference orchestrator already integrated");
  process.exit(0);
}

const routeAnchor = '  "/video-status",\n';
if (!src.includes(routeAnchor)) throw new Error("video-status route anchor missing");
src = src.replace(routeAnchor, routeAnchor + '  "/reference-orchestrate",\n');

const helperAnchor = "async function videoRateLimit(env, workspaceId) {";
if (!src.includes(helperAnchor)) throw new Error("videoRateLimit anchor missing");

const helpers = `// REFERENCE_RUNTIME_V1
function referenceRuntimeJson(raw = "") {
  let text = String(raw || "").trim().replace(/^\\x60\\x60\\x60(?:json)?\\s*/i, "").replace(/\\s*\\x60\\x60\\x60$/i, "");
  const match = text.match(/\\{[\\s\\S]*\\}/);
  return JSON.parse(match ? match[0] : text);
}
function referenceMetricRegime(publishedAt) {
  const t = Date.parse(publishedAt || "");
  if (!Number.isFinite(t)) return "unknown";
  return t >= Date.parse("2026-08-24T00:00:00Z") ? "public-view-starts-2026-08-24+" : "legacy-public-view-count";
}
async function referenceDiscover(env, query, maxResults = 5) {
  const key = String(env.YOUTUBE_API_KEY || "").trim();
  if (!key) throw Object.assign(new Error("REFERENCE_DISCOVERY_UNAVAILABLE:YOUTUBE_API_KEY missing"), { status: 503 });
  const q = String(query || "").trim().slice(0, 300);
  if (!q) throw Object.assign(new Error("REFERENCE_QUERY_REQUIRED"), { status: 400 });
  const limit = Math.max(3, Math.min(10, Number(maxResults) || 5));
  const p = new URLSearchParams({ part: "snippet", type: "video", q, maxResults: String(limit), order: "viewCount", regionCode: "TW", relevanceLanguage: "zh-Hant", key });
  const sr = await fetch("https://www.googleapis.com/youtube/v3/search?" + p);
  const sj = await sr.json().catch(() => ({}));
  if (!sr.ok) throw Object.assign(new Error("YOUTUBE_API_" + sr.status + ":" + String(sj?.error?.message || sr.statusText).slice(0, 240)), { status: sr.status });
  const ids = (sj.items || []).map(x => x?.id?.videoId).filter(Boolean).slice(0, limit);
  if (!ids.length) return { status: "REFERENCE_INSUFFICIENT", candidates: [] };
  const d = new URLSearchParams({ part: "snippet,statistics,contentDetails", id: ids.join(","), key });
  const vr = await fetch("https://www.googleapis.com/youtube/v3/videos?" + d);
  const vj = await vr.json().catch(() => ({}));
  if (!vr.ok) throw Object.assign(new Error("YOUTUBE_API_" + vr.status), { status: vr.status });
  const candidates = (vj.items || []).map(v => ({
    videoId: String(v.id || ""),
    title: String(v.snippet?.title || "").slice(0, 300),
    channelTitle: String(v.snippet?.channelTitle || "").slice(0, 220),
    publishedAt: String(v.snippet?.publishedAt || ""),
    duration: String(v.contentDetails?.duration || ""),
    views: Number(v.statistics?.viewCount || 0),
    likes: v.statistics?.likeCount == null ? null : Number(v.statistics.likeCount),
    comments: v.statistics?.commentCount == null ? null : Number(v.statistics.commentCount),
    metricRegime: referenceMetricRegime(v.snippet?.publishedAt),
    publicUrl: "https://www.youtube.com/watch?v=" + encodeURIComponent(v.id || "")
  })).filter(x => x.videoId && x.views > 0).sort((a, b) => b.views - a.views);
  return { status: candidates.length >= 3 ? "PUBLIC_EVIDENCE_READY" : "REFERENCE_INSUFFICIENT", source: "YouTube Data API v3", checkedAt: new Date().toISOString(), candidates };
}
async function referenceAnalyzePacket(env, packet = {}) {
  if (packet.authorized !== true) throw Object.assign(new Error("REFERENCE_MEDIA_NOT_AUTHORIZED"), { status: 403 });
  const frames = Array.isArray(packet.frames) ? packet.frames.slice(0, 8) : [];
  if (frames.length < 3) return { status: "REFERENCE_EVIDENCE_INCOMPLETE", videoId: String(packet.videoId || ""), issues: ["可信影格不足3張"] };
  const content = [];
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i] || {}, data = String(f.base64 || ""), media = String(f.mediaType || "image/jpeg");
    if (!data || data.length >= 7000000 || !/^image\\/(jpeg|png|webp)$/i.test(media)) continue;
    content.push({ type: "text", text: "frame-" + (i + 1) + " timestamp=" + Number(f.timestampSec || 0).toFixed(2) + "s" });
    content.push({ type: "image", source: { type: "base64", media_type: media, data } });
  }
  if (content.filter(x => x.type === "image").length < 3) return { status: "REFERENCE_EVIDENCE_INCOMPLETE", videoId: String(packet.videoId || ""), issues: ["有效可信影格不足3張"] };
  const transcript = String(packet.transcript || "").slice(0, 12000), transcriptSource = String(packet.transcriptSource || "").slice(0, 200);
  content.push({ type: "text", text: [
    "只能根據影格、時間戳與提供的逐字稿觀察，不得猜留存、engaged views、未提供的聲音。",
    transcript ? "可信逐字稿：\\n" + transcript : "沒有可信逐字稿；聲音節奏與完整CTA填unknown。",
    "只回JSON：{hook,firstCut,firstPayoff,storyBeats:[],conflictOrTwist,climax,presenterRatio,brollTypes:[],productProof:[],effectBeats:[],soundBeats:[],captionRhythm,cta,unknowns:[],evidenceNotes:[],confidence}"
  ].join("\\n") });
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_KEY, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: env.REFERENCE_VISION_MODEL || MODEL, max_tokens: 1800, system: "你是短影音結構分析師，只輸出合法JSON。", messages: [{ role: "user", content }] }) });
  const t = await r.text();
  if (!r.ok) throw Object.assign(new Error("REFERENCE_VISUAL_MODEL_" + r.status + ":" + t.slice(0, 240)), { status: r.status });
  const d = JSON.parse(t), raw = (d.content || []).filter(x => x.type === "text").map(x => x.text).join("\\n"), j = referenceRuntimeJson(raw);
  const transcriptTrusted = !!transcript && !!transcriptSource;
  return { status: "PASS", videoId: String(packet.videoId || ""), evidenceType: transcriptTrusted ? "trusted-frames-plus-transcript" : "trusted-frames", visualEvidenceCount: content.filter(x => x.type === "image").length, transcriptEvidence: { available: transcriptTrusted, source: transcriptTrusted ? transcriptSource : "" }, hook: String(j.hook || "").slice(0, 500), firstCut: String(j.firstCut || "").slice(0, 300), firstPayoff: String(j.firstPayoff || "").slice(0, 500), storyBeats: Array.isArray(j.storyBeats) ? j.storyBeats.slice(0, 10) : [], conflictOrTwist: String(j.conflictOrTwist || "").slice(0, 500), climax: String(j.climax || "").slice(0, 500), presenterRatio: j.presenterRatio == null ? null : Math.max(0, Math.min(1, Number(j.presenterRatio) || 0)), brollTypes: Array.isArray(j.brollTypes) ? j.brollTypes.slice(0, 10) : [], productProof: Array.isArray(j.productProof) ? j.productProof.slice(0, 8) : [], effectBeats: Array.isArray(j.effectBeats) ? j.effectBeats.slice(0, 12) : [], soundBeats: transcriptTrusted && Array.isArray(j.soundBeats) ? j.soundBeats.slice(0, 12) : [], captionRhythm: String(j.captionRhythm || "").slice(0, 500), cta: transcriptTrusted ? String(j.cta || "unknown").slice(0, 500) : "unknown", unknowns: Array.isArray(j.unknowns) ? j.unknowns.slice(0, 20) : [], confidence: Math.max(0, Math.min(1, Number(j.confidence) || 0)) };
}
async function referenceOrchestrate(env, b = {}) {
  const discovery = b.discovery && Array.isArray(b.discovery.candidates) ? b.discovery : await referenceDiscover(env, b.query || b.task, b.maxResults || 5);
  const packets = Array.isArray(b.references) ? b.references : [];
  const packetById = new Map(packets.map(x => [String(x?.videoId || ""), x]));
  const analyses = [];
  for (const candidate of (discovery.candidates || []).slice(0, 5)) {
    const packet = packetById.get(String(candidate.videoId || ""));
    if (!packet) continue;
    const analysis = await referenceAnalyzePacket(env, packet);
    if (analysis.status === "PASS" && analysis.confidence >= .6) analyses.push(analysis);
  }
  if (analyses.length < 3) return { status: "REFERENCE_EVIDENCE_INCOMPLETE", discovery, analyses, issues: ["至少需要3支候選影片提供可信影格分析"] };
  const synthesis = await claude(env, "你是Reference Analyst，只能綜合已提供分析，不得新增不存在的影片證據。只輸出合法JSON。", "請找出至少由2支不同影片共同支持的結構規律。只回JSON：{commonPatterns:[],hookPatterns:[],storyPatterns:[],brollPatterns:[],effectPatterns:[],soundPatterns:[],ctaPatterns:[],evidenceMap:[{pattern,videoIds:[]}],confidence}.\\n分析資料：" + JSON.stringify(analyses).slice(0, 22000), 1800);
  const s = referenceRuntimeJson(synthesis.text), evidenceMap = Array.isArray(s.evidenceMap) ? s.evidenceMap.filter(x => new Set(Array.isArray(x.videoIds) ? x.videoIds : []).size >= 2) : [];
  const commonPatterns = evidenceMap.map(x => String(x.pattern || "")).filter(Boolean).slice(0, 12);
  const pass = commonPatterns.length >= 3;
  const sources = (discovery.candidates || []).filter(x => analyses.some(a => a.videoId === x.videoId)).slice(0, 10);
  const regimes = [...new Set(sources.map(x => x.metricRegime).filter(Boolean))];
  return { version: "2.2.0", status: pass ? "PASS" : "REFERENCE_EVIDENCE_INCOMPLETE", sampleCount: sources.length, sources, commonPatterns, hookPatterns: Array.isArray(s.hookPatterns) ? s.hookPatterns.slice(0, 8) : [], storyPatterns: Array.isArray(s.storyPatterns) ? s.storyPatterns.slice(0, 8) : [], ctaPatterns: Array.isArray(s.ctaPatterns) ? s.ctaPatterns.slice(0, 8) : [], evidenceMap, analyses, metricRegime: regimes.length === 1 ? regimes[0] : "mixed", confidence: Math.max(0, Math.min(1, Number(s.confidence) || 0)), checkedAt: new Date().toISOString(), originalityGuard: "只學跨影片共同結構，不複製單一影片腳本、角色、口頭禪或獨特橋段。", inaccessibleMetrics: ["creatorRetention", "stayedToWatch", "engagedViews"], issues: pass ? [] : ["跨影片共同結構證據不足3項"] };
}
`;

src = src.replace(helperAnchor, helpers + "\n" + helperAnchor);

const handlerAnchor = '      if (url.pathname === "/video-status")\n        return json(await videoStatus(req, env, b), 200, H);';
if (!src.includes(handlerAnchor)) throw new Error("video-status handler anchor missing");
src = src.replace(handlerAnchor, handlerAnchor + '\n      if (url.pathname === "/reference-orchestrate")\n        return json(await referenceOrchestrate(env, b), 200, H);');

const directorAnchor = '  const director = await buildVideoV3DirectorPlan(env, record.task, channel);';
if (!src.includes(directorAnchor)) throw new Error("V3 director anchor missing");
src = src.replace(directorAnchor, '  if (videoV3Route(record.task) === "B" && !record.task.referenceBrief && record.task.referenceEvidence) {\n    const generatedReference = await referenceOrchestrate(env, { task: record.task.goal, ...record.task.referenceEvidence });\n    if (generatedReference.status === "PASS") record.task.referenceBrief = generatedReference;\n  }\n' + directorAnchor);

fs.writeFileSync(path, src);
console.log("Reference orchestrator integration patch applied");
