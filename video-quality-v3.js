/* Video Quality V3 — 95 分精品母片引擎（乾淨分支） */
export const VIDEO_QUALITY_V3 = Object.freeze({
  version: "3.1.0",
  publishScore: 90,
  premiumScore: 95,
  minScenes: 7,
  maxScenes: 10,
  maxStaticSeconds: 6,
  hookSeconds: 3,
  minEffectBeats: 4,
  minStoryBeats: 4,
  minResolution: "1080p",
  shortFormAspectRatio: "9:16",
  maxPresenterRatio: 0.55,
  minVisualKinds: 4,
  blockedLocales: ["zh-cn"],
  hardFailures: ["face_break","lip_sync","wrong_identity","blank_frame","broken_audio","unsafe_caption","no_story","no_effect_design","low_resolution","wrong_aspect_ratio","presenter_overuse","generic_motion_graphics","wrong_locale","plastic_ai_look","texture_failure","motion_morphing","physics_break","hand_object_deform","background_melting","identity_drift"]
});
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const list=v=>Array.isArray(v)?v:[];
const txt=(v,m=1200)=>String(v||"").trim().slice(0,m);
export function normalizeDirectorPlan(input={}){
 const scenes=list(input.scenes).slice(0,VIDEO_QUALITY_V3.maxScenes).map((s,i)=>({id:txt(s?.id||`scene-${i+1}`,80),start:Math.max(0,num(s?.start)),end:Math.max(0,num(s?.end)),storyBeat:txt(s?.storyBeat,80),purpose:txt(s?.purpose,300),visual:txt(s?.visual,1000),narration:txt(s?.narration,1200),subtitle:txt(s?.subtitle,300),assetType:txt(s?.assetType,80),assetUrl:txt(s?.assetUrl,1200),presenter:txt(s?.presenter,120),transition:txt(s?.transition||"cut",80),effects:list(s?.effects).slice(0,5).map(x=>txt(x,160)).filter(Boolean),soundDesign:list(s?.soundDesign).slice(0,4).map(x=>txt(x,160)).filter(Boolean),camera:txt(s?.camera,300)}));
 return {version:VIDEO_QUALITY_V3.version,route:input.route==="B"?"B":"A",channel:txt(input.channel||"tiktok",40).toLowerCase(),resolution:txt(input.resolution||"1080p",20).toLowerCase(),aspectRatio:txt(input.aspectRatio||"9:16",20),locale:txt(input.locale||"zh-TW",30),hook:txt(input.hook,500),thesis:txt(input.thesis,1000),twist:txt(input.twist,500),climax:txt(input.climax,500),cta:txt(input.cta,500),scenes};
}
export function preflightDirectorPlan(input={}){
 const plan=normalizeDirectorPlan(input),issues=[],warnings=[];
 if(!plan.hook)issues.push("缺少前三秒鉤子");if(!plan.thesis)issues.push("缺少核心觀點");if(!plan.twist)issues.push("缺少劇情轉折");if(!plan.climax)issues.push("缺少高潮");if(!plan.cta)issues.push("缺少CTA");if(plan.scenes.length<VIDEO_QUALITY_V3.minScenes)issues.push("鏡頭不足7段");
 if(plan.resolution!=="1080p"&&plan.resolution!=="4k")issues.push("正式母片低於1080p");
 if(["tiktok","shorts","reels","video"].includes(plan.channel)&&plan.aspectRatio!==VIDEO_QUALITY_V3.shortFormAspectRatio)issues.push("短影音必須使用9:16直式");
 if(VIDEO_QUALITY_V3.blockedLocales.includes(plan.locale.toLowerCase()))issues.push("台灣中文影片禁止使用zh-cn語音locale");
 let prev=0,presenterSeconds=0,effectBeats=0,genericOnly=0;const kinds=new Set(),beats=new Set();
 plan.scenes.forEach((s,i)=>{const d=s.end-s.start;if(!(d>0))issues.push(`第${i+1}鏡時間錯誤`);if(s.start<prev-.15)issues.push(`第${i+1}鏡時間重疊`);if(d>VIDEO_QUALITY_V3.maxStaticSeconds)issues.push(`第${i+1}鏡超過6秒未切換`);if(!s.storyBeat)warnings.push(`第${i+1}鏡缺劇情節點`);else beats.add(s.storyBeat);if(!s.purpose||!s.visual)issues.push(`第${i+1}鏡缺畫面目的`);if(!s.narration&&!s.subtitle)issues.push(`第${i+1}鏡缺內容`);if(s.effects.length)effectBeats++;if(s.presenter)presenterSeconds+=Math.max(0,d);const kind=s.assetType.toLowerCase();if(kind)kinds.add(kind);if(kind==="motion_graphics"||kind==="generic_motion_graphics")genericOnly++;prev=Math.max(prev,s.end)});
 const total=plan.scenes.at(-1)?.end||0, presenterRatio=total?presenterSeconds/total:0;
 if(plan.scenes[0]?.end>3.5)issues.push("前三秒鉤子太慢");if(beats.size<4)issues.push("劇情層次不足");if(effectBeats<4)issues.push("特效節點不足4鏡");if(presenterRatio>VIDEO_QUALITY_V3.maxPresenterRatio)issues.push("人物出鏡超過55%，禁止數字人念稿型母片");if(kinds.size<VIDEO_QUALITY_V3.minVisualKinds)issues.push("視覺素材少於4種");if(genericOnly>=Math.ceil(plan.scenes.length/2))issues.push("過半鏡頭為generic motion graphics，必須改用真實UI、產品素材、cinematic B-roll或情境畫面");
 return {pass:!issues.length,issues,warnings,plan,metrics:{totalSeconds:total,presenterSeconds,presenterRatio,effectBeats,genericMotionGraphicsScenes:genericOnly,visualKinds:[...kinds],storyBeats:[...beats]}};
}
export function scoreRenderedVideo(r={}){const score={hook:Math.min(12,Math.max(0,num(r.hook))),story:Math.min(15,Math.max(0,num(r.story))),effects:Math.min(15,Math.max(0,num(r.effects))),substance:Math.min(15,Math.max(0,num(r.substance))),visualRhythm:Math.min(12,Math.max(0,num(r.visualRhythm))),faceNaturalness:Math.min(10,Math.max(0,num(r.faceNaturalness))),voiceNaturalness:Math.min(8,Math.max(0,num(r.voiceNaturalness))),captions:Math.min(6,Math.max(0,num(r.captions))),brandFit:Math.min(7,Math.max(0,num(r.brandFit)))};const total=Object.values(score).reduce((a,b)=>a+b,0),hardFailures=list(r.hardFailures).filter(Boolean),pass=total>=90&&!hardFailures.length,premium=total>=95&&!hardFailures.length;return {pass,premium,total,score,hardFailures,grade:premium?"精品母片":pass?"正式發布":"重製",action:pass?"publish_queue":"regenerate"};}
export function directorSystemPrompt({route="A",channel="tiktok",duration=35}={}){return [`你是精品短影音總導演，目標95分精品母片，不是AI人物念稿。`,`產線：${route==="B"?"美女顧問團：微短劇×綜藝×觀點衝突":"產品導流：科技×故事×真實操作"}；平台${channel}；約${duration}秒。`,`只回JSON director plan，7～10鏡。`,`正式母片最低1080p；TikTok/Shorts/Reels預設9:16；台灣中文使用zh-TW語音語境，禁止zh-cn。`,`劇情必須有 hook→problem→conflict→discovery→twist/reveal→climax→resolution/CTA。`,`至少4鏡有服務劇情的特效：push/Speed Ramp/Freeze Frame/Glitch/UI飛入/Split Screen/Parallax/粒子/光掃/動態爆字。`,`聲音要有impact/whoosh/riser/bass hit/環境音/BGM卡點，不蓋人聲。`,`人物不超過55%，混用人物、真實產品UI、cinematic B-roll、情境畫面、圖解/對照/動態字至少4類；generic motion graphics不得成為主要B-roll。`,`90以下不得發布；95以上才是精品母片。臉崩、嚴重嘴型不同步、身份錯、黑畫面、音訊破損、無劇情、無特效、720p、短影音比例錯誤、人物過量、generic素材過量、zh-cn語音全部硬退件。`].join("\n");}