/* 影片品質 V2：純函式品質層。先獨立於正式 Worker，通過測試後再接入 /video-create 與 /publish-video。 */

export const VIDEO_QUALITY_V2 = Object.freeze({
  version: "2.0.0",
  minScore: 80,
  minScenes: 6,
  maxScenes: 10,
  maxStaticSeconds: 6,
  hookSeconds: 3,
  portrait: { width: 1080, height: 1920 },
  landscape: { width: 1920, height: 1080 },
});

const n = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const arr = (value) => Array.isArray(value) ? value : [];

export function normalizeDirectorPlan(input = {}) {
  const scenes = arr(input.scenes).slice(0, VIDEO_QUALITY_V2.maxScenes).map((scene, index) => ({
    id: String(scene?.id || `scene-${index + 1}`),
    start: Math.max(0, n(scene?.start)),
    end: Math.max(0, n(scene?.end)),
    purpose: String(scene?.purpose || "").trim(),
    visual: String(scene?.visual || "").trim(),
    narration: String(scene?.narration || "").trim(),
    subtitle: String(scene?.subtitle || "").trim(),
    assetType: String(scene?.assetType || "").trim(),
    assetUrl: String(scene?.assetUrl || "").trim(),
    presenter: String(scene?.presenter || "").trim(),
    transition: String(scene?.transition || "cut").trim(),
  }));
  return {
    version: VIDEO_QUALITY_V2.version,
    hook: String(input.hook || "").trim(),
    thesis: String(input.thesis || "").trim(),
    cta: String(input.cta || "").trim(),
    scenes,
  };
}

export function preflightDirectorPlan(input = {}) {
  const plan = normalizeDirectorPlan(input);
  const issues = [];
  if (!plan.hook) issues.push("缺少前三秒鉤子");
  if (!plan.thesis) issues.push("缺少核心觀點");
  if (!plan.cta) issues.push("缺少自然行動引導");
  if (plan.scenes.length < VIDEO_QUALITY_V2.minScenes) issues.push(`鏡頭不足 ${VIDEO_QUALITY_V2.minScenes} 段`);
  if (plan.scenes.length > VIDEO_QUALITY_V2.maxScenes) issues.push(`鏡頭超過 ${VIDEO_QUALITY_V2.maxScenes} 段`);
  plan.scenes.forEach((scene, index) => {
    const duration = scene.end - scene.start;
    if (!(duration > 0)) issues.push(`第 ${index + 1} 鏡時間設定錯誤`);
    if (duration > VIDEO_QUALITY_V2.maxStaticSeconds) issues.push(`第 ${index + 1} 鏡超過 ${VIDEO_QUALITY_V2.maxStaticSeconds} 秒未切換`);
    if (!scene.purpose) issues.push(`第 ${index + 1} 鏡缺少目的`);
    if (!scene.visual) issues.push(`第 ${index + 1} 鏡缺少畫面指令`);
    if (!scene.narration && !scene.subtitle) issues.push(`第 ${index + 1} 鏡沒有旁白或字幕資訊`);
  });
  const first = plan.scenes[0];
  if (first && first.end > VIDEO_QUALITY_V2.hookSeconds + 0.5) issues.push("第一鏡鉤子超過前三秒");
  return { pass: issues.length === 0, issues, plan };
}

export function scoreRenderedVideo(report = {}) {
  const score = {
    hook: Math.min(15, Math.max(0, n(report.hook, 0))),
    substance: Math.min(20, Math.max(0, n(report.substance, 0))),
    visualRhythm: Math.min(15, Math.max(0, n(report.visualRhythm, 0))),
    faceNaturalness: Math.min(15, Math.max(0, n(report.faceNaturalness, 0))),
    voiceNaturalness: Math.min(15, Math.max(0, n(report.voiceNaturalness, 0))),
    captions: Math.min(10, Math.max(0, n(report.captions, 0))),
    brandFit: Math.min(10, Math.max(0, n(report.brandFit, 0))),
  };
  const total = Object.values(score).reduce((sum, value) => sum + value, 0);
  const hardFailures = arr(report.hardFailures).map(String).filter(Boolean);
  const pass = total >= VIDEO_QUALITY_V2.minScore && hardFailures.length === 0;
  return {
    pass,
    total,
    threshold: VIDEO_QUALITY_V2.minScore,
    score,
    hardFailures,
    action: pass ? "publish_queue" : "regenerate",
  };
}

export function assertPublishable(report = {}) {
  const result = scoreRenderedVideo(report);
  if (!result.pass) {
    const error = new Error(`VIDEO_QUALITY_GATE_FAILED:${result.total}/${result.threshold}`);
    error.status = 409;
    error.quality = result;
    throw error;
  }
  return result;
}

export function directorSystemPrompt({ route = "A", channel = "tiktok", duration = 35 } = {}) {
  return [
    "你是短影音總導演，不是文案機器。輸出必須能直接交給影片生成與剪輯層。",
    `產線：${route === "B" ? "B 美女顧問團 IP" : "A 產品/作品導流"}；平台：${channel}；目標長度：約 ${duration} 秒。`,
    "只回 JSON：{hook,thesis,cta,scenes:[{id,start,end,purpose,visual,narration,subtitle,assetType,assetUrl,presenter,transition}]}。",
    "必須 6～10 鏡；第一鏡 0～3 秒完成鉤子；每鏡原則 2～5 秒，任何單一靜態人物鏡位不得超過 6 秒。",
    "人物不是整支影片。混用人物、產品實拍/網站錄影、指定素材、真實情境 B-roll、圖解、前後對照、動態大字。",
    "每個畫面必須服務當句語意；禁止無關素材、空白畫面、廉價漂浮圖形、長時間同一張臉。",
    "旁白使用台灣自然口語，有停頓、重音與情緒；字幕短句、高對比、手機安全區。",
    "內容必須有一個完整觀點或可執行資訊，不得只有宣傳口號。",
  ].join("\n");
}
