/* 影片品質 V2.2：導演前檢 + 劇情/特效設計 + 成片品質閘門。 */

export const VIDEO_QUALITY_V2 = Object.freeze({
  version: "2.2.0",
  minScore: 82,
  minScenes: 7,
  maxScenes: 10,
  maxStaticSeconds: 6,
  hookSeconds: 3,
  minEffectBeats: 4,
  minStoryBeats: 4,
  portrait: { width: 1080, height: 1920 },
  landscape: { width: 1920, height: 1080 },
  hardFailureCodes: ["face_break", "lip_sync", "wrong_identity", "blank_frame", "broken_audio", "unsafe_caption", "no_story", "no_effect_design"],
});

const n = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const arr = (value) => Array.isArray(value) ? value : [];
const text = (value, max = 1200) => String(value || "").trim().slice(0, max);

export function normalizeDirectorPlan(input = {}) {
  const scenes = arr(input.scenes).slice(0, VIDEO_QUALITY_V2.maxScenes).map((scene, index) => ({
    id: text(scene?.id || `scene-${index + 1}`, 80), start: Math.max(0, n(scene?.start)), end: Math.max(0, n(scene?.end)),
    storyBeat: text(scene?.storyBeat, 80), purpose: text(scene?.purpose, 300), visual: text(scene?.visual, 1000), narration: text(scene?.narration, 1200), subtitle: text(scene?.subtitle, 300),
    assetType: text(scene?.assetType, 80), assetUrl: text(scene?.assetUrl, 1200), presenter: text(scene?.presenter, 120), transition: text(scene?.transition || "cut", 80),
    effects: arr(scene?.effects).slice(0, 5).map((x) => text(x, 160)).filter(Boolean),
    soundDesign: arr(scene?.soundDesign).slice(0, 4).map((x) => text(x, 160)).filter(Boolean),
    camera: text(scene?.camera, 300),
  }));
  return { version: VIDEO_QUALITY_V2.version, route: input.route === "B" ? "B" : "A", hook: text(input.hook, 500), thesis: text(input.thesis, 1000), twist: text(input.twist, 500), climax: text(input.climax, 500), cta: text(input.cta, 500), scenes };
}

export function preflightDirectorPlan(input = {}) {
  const plan = normalizeDirectorPlan(input), issues = [], warnings = [];
  if (!plan.hook) issues.push("缺少前三秒鉤子");
  if (!plan.thesis) issues.push("缺少核心觀點");
  if (!plan.twist) issues.push("缺少劇情轉折");
  if (!plan.climax) issues.push("缺少視覺或內容高潮");
  if (!plan.cta) issues.push("缺少自然行動引導");
  if (plan.scenes.length < VIDEO_QUALITY_V2.minScenes) issues.push(`鏡頭不足 ${VIDEO_QUALITY_V2.minScenes} 段`);
  let previousEnd = 0, presenterSeconds = 0, effectBeats = 0; const visualKinds = new Set(), storyBeats = new Set();
  plan.scenes.forEach((scene, index) => {
    const duration = scene.end - scene.start;
    if (!(duration > 0)) issues.push(`第 ${index + 1} 鏡時間設定錯誤`);
    if (scene.start < previousEnd - 0.15) issues.push(`第 ${index + 1} 鏡與前鏡時間重疊`);
    if (duration > VIDEO_QUALITY_V2.maxStaticSeconds) issues.push(`第 ${index + 1} 鏡超過 ${VIDEO_QUALITY_V2.maxStaticSeconds} 秒未切換`);
    if (!scene.storyBeat) warnings.push(`第 ${index + 1} 鏡缺少劇情節點`); else storyBeats.add(scene.storyBeat);
    if (!scene.purpose || !scene.visual) issues.push(`第 ${index + 1} 鏡缺少目的或畫面指令`);
    if (!scene.narration && !scene.subtitle) issues.push(`第 ${index + 1} 鏡沒有旁白或字幕資訊`);
    if (scene.effects.length) effectBeats += 1;
    if (scene.presenter) presenterSeconds += Math.max(0, duration);
    if (scene.assetType) visualKinds.add(scene.assetType.toLowerCase());
    previousEnd = Math.max(previousEnd, scene.end);
  });
  const first = plan.scenes[0], total = plan.scenes.at(-1)?.end || 0;
  if (first && first.end > VIDEO_QUALITY_V2.hookSeconds + 0.5) issues.push("第一鏡鉤子超過前三秒");
  if (storyBeats.size < VIDEO_QUALITY_V2.minStoryBeats) issues.push("劇情層次不足，至少需要問題、衝突/探索、轉折/揭曉、高潮/結論");
  if (effectBeats < VIDEO_QUALITY_V2.minEffectBeats) issues.push(`特效節點不足，至少 ${VIDEO_QUALITY_V2.minEffectBeats} 個鏡頭需有有意義的視覺特效`);
  if (total && presenterSeconds / total > 0.55) warnings.push("人物出鏡超過成片 55%，應增加產品/UI/B-roll/圖卡/情節畫面");
  if (visualKinds.size < 4) warnings.push("視覺素材類型少於 4 種，成片豐富度不足");
  return { pass: issues.length === 0, issues, warnings, plan, metrics: { totalSeconds: total, presenterSeconds, visualKinds: [...visualKinds], storyBeats: [...storyBeats], effectBeats } };
}

export function buildFallbackDirectorPlan({ route = "A", duration = 35, presenter = "創作者", assetUrl = "" } = {}) {
  const end = Math.max(32, Math.min(42, n(duration, 35))), cuts = [0, 3, 7, 12, 17, 22, 27, 32, end];
  const types = ["motion_text", "avatar", "cinematic_broll", assetUrl ? "product_ui" : "diagram", "cinematic_broll", "comparison", "avatar", "cta_card"];
  const beats = ["hook", "problem", "conflict", "discovery", "twist", "reveal", "climax", "resolution"];
  const effects = [["impact_zoom","kinetic_type"],["push_in","whip_cut"],["speed_ramp","parallax"],["ui_fly_in","screen_focus"],["glitch_transition","freeze_frame"],["split_screen","data_pop"],["dramatic_push_in","light_sweep"],["logo_reveal","particle_finish"]];
  return normalizeDirectorPlan({ route, hook: "前三秒直接丟出衝突或不可思議的問題", thesis: "用具體情境完成一個完整觀點", twist: "中段出現反差、錯誤認知被推翻或關鍵資訊揭曉", climax: "在最後三分之一安排最強畫面與核心結論", cta: "把 CTA 包在劇情結果裡，不硬賣", scenes: cuts.slice(0,-1).map((start,i)=>({ id:`scene-${i+1}`, start, end:cuts[i+1], storyBeat:beats[i], purpose:beats[i], visual:i===3&&assetUrl?"實際產品/UI 畫面被拉進場景，局部放大關鍵功能":`${types[i]}，畫面與情節同步`, narration:`第 ${i+1} 鏡台灣自然口語，推進情節`, subtitle:`重點 ${i+1}`, assetType:types[i], assetUrl:i===3?assetUrl:"", presenter:[1,6].includes(i)?presenter:"", transition:i===0?"impact_cut":"cinematic_cut", effects:effects[i], soundDesign:i===0?["impact_hit"]:i===4?["glitch_sfx","riser"]:i===6?["bass_hit"]:["whoosh"], camera:["fast_push","medium_push","handheld_follow","screen_macro","orbit","split_focus","close_push","pull_back"][i] })) });
}

export function scoreRenderedVideo(report = {}) {
  const score = { hook: Math.min(12,Math.max(0,n(report.hook))), story: Math.min(15,Math.max(0,n(report.story))), effects: Math.min(15,Math.max(0,n(report.effects))), substance: Math.min(15,Math.max(0,n(report.substance))), visualRhythm: Math.min(12,Math.max(0,n(report.visualRhythm))), faceNaturalness: Math.min(10,Math.max(0,n(report.faceNaturalness))), voiceNaturalness: Math.min(8,Math.max(0,n(report.voiceNaturalness))), captions: Math.min(6,Math.max(0,n(report.captions))), brandFit: Math.min(7,Math.max(0,n(report.brandFit))) };
  const total = Object.values(score).reduce((sum,value)=>sum+value,0), hardFailures = arr(report.hardFailures).map(String).filter(Boolean);
  const pass = total >= VIDEO_QUALITY_V2.minScore && hardFailures.length === 0;
  return { pass,total,threshold:VIDEO_QUALITY_V2.minScore,score,hardFailures,action:pass?"publish_queue":"regenerate" };
}

export function publishGate({ report, finalApprovedAt, approvalMode = "manual", manualOverride = false } = {}) {
  const quality = scoreRenderedVideo(report || {}), reasons = [];
  if (!quality.pass) reasons.push(`品質 ${quality.total}/${quality.threshold} 未過關`);
  if (quality.hardFailures.length) reasons.push(`硬性退件：${quality.hardFailures.join("、")}`);
  if (!finalApprovedAt && approvalMode !== "auto") reasons.push("尚未完成成片批准");
  const pass = manualOverride === true || reasons.length === 0;
  return { pass,reasons,quality,action:pass?"publish":"regenerate" };
}

export function assertPublishable(input = {}) { const result = input && Object.prototype.hasOwnProperty.call(input,"report") ? publishGate(input) : { ...scoreRenderedVideo(input), reasons:[] }; if(!result.pass){ const error=new Error(`VIDEO_QUALITY_GATE_FAILED:${result.quality?.total??result.total}/${VIDEO_QUALITY_V2.minScore}`); error.status=409; error.quality=result.quality||result; error.reasons=result.reasons||[]; throw error; } return result; }

export function directorSystemPrompt({ route = "A", channel = "tiktok", duration = 35 } = {}) {
  return [
    "你是電影感短影音總導演，不是文案機器。目標是讓人看不出只是 AI 人物念稿。",
    `產線：${route === "B" ? "B 美女顧問團 IP：微短劇×綜藝×觀點衝突" : "A 產品/作品導流：科技×故事×真實操作示範"}；平台：${channel}；約 ${duration} 秒。`,
    "只回 JSON：{route,hook,thesis,twist,climax,cta,scenes:[{id,start,end,storyBeat,purpose,visual,narration,subtitle,assetType,assetUrl,presenter,transition,effects:[],soundDesign:[],camera}]}。",
    "必須 7～10 鏡，形成 hook→problem→conflict/exploration→discovery→twist/reveal→climax→resolution/CTA。沒有情節推進就退件。",
    "至少四個鏡頭要有有意義的特效節點，可用快速推鏡、速度變化、Freeze Frame、Glitch、UI飛入、Split Screen、Parallax、粒子、光掃、動態爆字；特效必須服務情節，禁止亂炫技。",
    "聲音也是特效：impact hit、whoosh、riser、bass hit、環境音與背景音樂要跟剪接卡點，但不可蓋過人聲。",
    "第一鏡 0～3 秒必須視覺衝擊＋問題/衝突；中段必須有一次反差或揭曉；最後三分之一安排全片最強畫面與核心結論。",
    "人物總出鏡原則不超過55%，至少混用四種視覺：人物、產品/UI、電影感B-roll、圖解/對照/動態字。單一人物鏡位不超過6秒。",
    route === "B" ? "美女顧問團採節目/短劇語言：對話衝突、反應特寫、定格、分割畫面、資料卡、反轉收尾。" : "產品導流採電影化展示：問題情境→神秘/科技轉場→產品UI立體展開→功能操作→結果揭曉。若產品為命理，可用東方符號、光粒、命盤線條與未來HUD，但不可遮住真實UI。",
    "每個畫面都必須服務當句語意；禁止無關素材、廉價漂浮圖形、長時間同一張臉、空白畫面。",
    "旁白使用台灣自然口語，有停頓、重音、情緒；字幕短句、高對比、手機安全區。內容至少提供一個完整觀點或可執行資訊。",
    "臉崩、嚴重嘴型不同步、人物身份錯誤、黑/空白畫面、音訊破損、沒有劇情、沒有特效設計，全部硬性退件，不得發布。",
  ].join("\n");
}
