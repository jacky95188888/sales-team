/* 影片品質 V2：導演前檢 + 成片品質閘門。正式 Worker 接線前先維持獨立純函式。 */

export const VIDEO_QUALITY_V2 = Object.freeze({
  version: "2.1.0",
  minScore: 80,
  minScenes: 6,
  maxScenes: 10,
  maxStaticSeconds: 6,
  hookSeconds: 3,
  portrait: { width: 1080, height: 1920 },
  landscape: { width: 1920, height: 1080 },
  hardFailureCodes: ["face_break", "lip_sync", "wrong_identity", "blank_frame", "broken_audio", "unsafe_caption"],
});

const n = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const arr = (value) => Array.isArray(value) ? value : [];
const text = (value, max = 1200) => String(value || "").trim().slice(0, max);

export function normalizeDirectorPlan(input = {}) {
  const scenes = arr(input.scenes).slice(0, VIDEO_QUALITY_V2.maxScenes).map((scene, index) => ({
    id: text(scene?.id || `scene-${index + 1}`, 80),
    start: Math.max(0, n(scene?.start)),
    end: Math.max(0, n(scene?.end)),
    purpose: text(scene?.purpose, 300),
    visual: text(scene?.visual, 1000),
    narration: text(scene?.narration, 1200),
    subtitle: text(scene?.subtitle, 300),
    assetType: text(scene?.assetType, 80),
    assetUrl: text(scene?.assetUrl, 1200),
    presenter: text(scene?.presenter, 120),
    transition: text(scene?.transition || "cut", 80),
  }));
  return {
    version: VIDEO_QUALITY_V2.version,
    route: input.route === "B" ? "B" : "A",
    hook: text(input.hook, 500),
    thesis: text(input.thesis, 1000),
    cta: text(input.cta, 500),
    scenes,
  };
}

export function preflightDirectorPlan(input = {}) {
  const plan = normalizeDirectorPlan(input), issues = [], warnings = [];
  if (!plan.hook) issues.push("缺少前三秒鉤子");
  if (!plan.thesis) issues.push("缺少核心觀點");
  if (!plan.cta) issues.push("缺少自然行動引導");
  if (plan.scenes.length < VIDEO_QUALITY_V2.minScenes) issues.push(`鏡頭不足 ${VIDEO_QUALITY_V2.minScenes} 段`);
  if (plan.scenes.length > VIDEO_QUALITY_V2.maxScenes) issues.push(`鏡頭超過 ${VIDEO_QUALITY_V2.maxScenes} 段`);
  let previousEnd = 0, presenterSeconds = 0, visualKinds = new Set();
  plan.scenes.forEach((scene, index) => {
    const duration = scene.end - scene.start;
    if (!(duration > 0)) issues.push(`第 ${index + 1} 鏡時間設定錯誤`);
    if (scene.start < previousEnd - 0.15) issues.push(`第 ${index + 1} 鏡與前鏡時間重疊`);
    if (duration > VIDEO_QUALITY_V2.maxStaticSeconds) issues.push(`第 ${index + 1} 鏡超過 ${VIDEO_QUALITY_V2.maxStaticSeconds} 秒未切換`);
    if (!scene.purpose) issues.push(`第 ${index + 1} 鏡缺少目的`);
    if (!scene.visual) issues.push(`第 ${index + 1} 鏡缺少畫面指令`);
    if (!scene.narration && !scene.subtitle) issues.push(`第 ${index + 1} 鏡沒有旁白或字幕資訊`);
    if (scene.presenter) presenterSeconds += Math.max(0, duration);
    if (scene.assetType) visualKinds.add(scene.assetType.toLowerCase());
    previousEnd = Math.max(previousEnd, scene.end);
  });
  const first = plan.scenes[0], total = plan.scenes.at(-1)?.end || 0;
  if (first && first.end > VIDEO_QUALITY_V2.hookSeconds + 0.5) issues.push("第一鏡鉤子超過前三秒");
  if (total && presenterSeconds / total > 0.55) warnings.push("人物出鏡超過成片 55%，建議增加產品/UI/B-roll/圖卡");
  if (visualKinds.size < 3) warnings.push("視覺素材類型少於 3 種，成片可能像單一 AI 念稿");
  return { pass: issues.length === 0, issues, warnings, plan, metrics: { totalSeconds: total, presenterSeconds, visualKinds: [...visualKinds] } };
}

export function buildFallbackDirectorPlan({ route = "A", duration = 32, presenter = "創作者", assetUrl = "" } = {}) {
  const end = Math.max(28, Math.min(40, n(duration, 32)));
  const cuts = [0, 3, 7, 12, 17, 22, 27, end];
  const types = ["motion_text", "avatar", assetUrl ? "product_ui" : "broll", "diagram", "broll", "avatar", "cta_card"];
  const purposes = ["鉤子", "提出問題", "展示證據或產品", "拆解方法", "第二情境", "給結論", "自然 CTA"];
  return normalizeDirectorPlan({ route, hook: "前三秒直接指出觀眾正在遇到的問題", thesis: "提供一個完整、具體、可執行的核心觀點", cta: "讓觀眾自然進入下一步，不硬賣", scenes: cuts.slice(0, -1).map((start, i) => ({ id: `scene-${i + 1}`, start, end: cuts[i + 1], purpose: purposes[i], visual: i === 2 && assetUrl ? "實際產品或網站畫面，放大與當句相關的功能" : `${types[i]}，畫面必須服務當句語意`, narration: `第 ${i + 1} 鏡台灣自然口語內容`, subtitle: `重點 ${i + 1}`, assetType: types[i], assetUrl: i === 2 ? assetUrl : "", presenter: [1, 5].includes(i) ? presenter : "", transition: i === 0 ? "hard_cut" : "cut" })) });
}

export function scoreRenderedVideo(report = {}) {
  const score = {
    hook: Math.min(15, Math.max(0, n(report.hook))),
    substance: Math.min(20, Math.max(0, n(report.substance))),
    visualRhythm: Math.min(15, Math.max(0, n(report.visualRhythm))),
    faceNaturalness: Math.min(15, Math.max(0, n(report.faceNaturalness))),
    voiceNaturalness: Math.min(15, Math.max(0, n(report.voiceNaturalness))),
    captions: Math.min(10, Math.max(0, n(report.captions))),
    brandFit: Math.min(10, Math.max(0, n(report.brandFit))),
  };
  const total = Object.values(score).reduce((sum, value) => sum + value, 0);
  const hardFailures = arr(report.hardFailures).map(String).filter(Boolean);
  const pass = total >= VIDEO_QUALITY_V2.minScore && hardFailures.length === 0;
  return { pass, total, threshold: VIDEO_QUALITY_V2.minScore, score, hardFailures, action: pass ? "publish_queue" : "regenerate" };
}

export function publishGate({ report, finalApprovedAt, approvalMode = "manual", manualOverride = false } = {}) {
  const quality = scoreRenderedVideo(report || {});
  const reasons = [];
  if (!quality.pass) reasons.push(`品質 ${quality.total}/${quality.threshold} 未過關`);
  if (quality.hardFailures.length) reasons.push(`硬性退件：${quality.hardFailures.join("、")}`);
  if (!finalApprovedAt && approvalMode !== "auto") reasons.push("尚未完成成片批准");
  const pass = manualOverride === true || reasons.length === 0;
  return { pass, reasons, quality, action: pass ? "publish" : "regenerate" };
}

export function assertPublishable(input = {}) {
  const result = input && Object.prototype.hasOwnProperty.call(input, "report") ? publishGate(input) : { ...scoreRenderedVideo(input), reasons: [] };
  if (!result.pass) {
    const error = new Error(`VIDEO_QUALITY_GATE_FAILED:${result.quality?.total ?? result.total}/${VIDEO_QUALITY_V2.minScore}`);
    error.status = 409;
    error.quality = result.quality || result;
    error.reasons = result.reasons || [];
    throw error;
  }
  return result;
}

export function directorSystemPrompt({ route = "A", channel = "tiktok", duration = 35 } = {}) {
  return [
    "你是短影音總導演，不是文案機器。輸出必須能直接交給影片生成與剪輯層。",
    `產線：${route === "B" ? "B 美女顧問團 IP" : "A 產品/作品導流"}；平台：${channel}；目標長度：約 ${duration} 秒。`,
    "只回 JSON：{route,hook,thesis,cta,scenes:[{id,start,end,purpose,visual,narration,subtitle,assetType,assetUrl,presenter,transition}]}。",
    "必須 6～10 鏡；第一鏡 0～3 秒完成鉤子；每鏡原則 2～5 秒，任何單一靜態人物鏡位不得超過 6 秒。",
    "人物不是整支影片。至少混用三種視覺：人物、產品/UI/指定素材、真實情境 B-roll、圖解、前後對照、動態大字。",
    "人物總出鏡原則不超過全片 55%；產品導流產線讓產品/UI 成為主角，IP 產線才提高主持人互動比重。",
    "每個畫面必須服務當句語意；禁止無關素材、空白畫面、廉價漂浮圖形、長時間同一張臉。",
    "旁白使用台灣自然口語，有停頓、重音與情緒；字幕短句、高對比、手機安全區。",
    "內容必須有一個完整觀點或可執行資訊，不得只有宣傳口號。",
    "成片若臉部崩壞、嚴重嘴型不同步、人物身份錯誤、黑/空白畫面或音訊破損，視為硬性退件，不得發布。",
  ].join("\n");
}
