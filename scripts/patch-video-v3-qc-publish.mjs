// V3 phase 2 secure QC: manual reviews can never unlock auto-publish.
// Apply only to the COMPLETE sales-team-worker.js.
import fs from "node:fs";
const path="sales-team-worker.js";
let src=fs.readFileSync(path,"utf8");

if(src.includes("TRUSTED_VISUAL_QC_V1")){
  console.log("Trusted V3 QC already integrated");
  process.exit(0);
}

// 1) Public manual-review route. It records feedback only; it is NOT trusted QC.
if(!src.includes('"/video-status",')) throw new Error("video-status route anchor missing");
src=src.replace('"/video-status",','"/video-status",\n  "/video-quality",');

// 2) Trusted server-side quality helpers. No public route can call applyVideoV3TrustedQualityReview directly.
const helperAnchor='const PUBLISH_PROVIDERS = new Set(["youtube", "tiktok"]);';
if(!src.includes(helperAnchor)) throw new Error("publish providers anchor missing");
const helpers=`// TRUSTED_VISUAL_QC_V1
function videoV3QualityScore(report = {}) {
  const weights = { hook:12, story:15, effects:15, substance:15, visualRhythm:12, faceNaturalness:10, voiceNaturalness:8, captions:6, brandFit:7 };
  let score=0;
  for(const [k,w] of Object.entries(weights)){
    const v=Math.max(0,Math.min(100,Number(report[k]||0)));
    score += v*w/100;
  }
  return Math.round(score);
}
function videoV3VisualScore(report = {}) {
  const weights={photorealism:18,textureDetail:12,lighting:12,motionCoherence:15,physicalPlausibility:10,identityConsistency:12,cinematicComposition:10,artifactControl:11};
  let score=0;
  for(const [k,w] of Object.entries(weights)){
    const v=Math.max(0,Math.min(100,Number(report[k]||0)));
    score += v*w/100;
  }
  return Math.round(score);
}
function videoV3HardFailures(report={}) {
  const allowed=new Set(["face_break","lip_sync","wrong_identity","blank_frame","broken_audio","unsafe_caption","no_story","no_effect_design","plastic_ai_look","texture_failure","motion_morphing","physics_break","hand_object_deform","background_melting","identity_drift","text_logo_corruption","product_ui_corruption","severe_flicker","subject_edge_warp","unnatural_depth_of_field"]);
  return [...new Set((Array.isArray(report.hardFailures)?report.hardFailures:[]).map(String).filter(x=>allowed.has(x)))];
}
function videoV3TrustedGate(job={}) {
  const q=job.quality||{};
  if(q.version!=="3.0.0") return {pass:false,reason:"V3品質報告缺失"};
  if(q.referenceGate?.required===true&&q.referenceGate?.pass!==true) return {pass:false,reason:"Reference Gate 未通過"};
  if(q.reviewSource!=="trusted_server") return {pass:false,reason:"尚未完成伺服器可信 QC"};
  if(q.visual?.trusted!==true) return {pass:false,reason:"尚未完成可信 Visual QC"};
  if(q.visual?.pass!==true||Number(q.visual?.score||0)<90) return {pass:false,reason:\`Visual QC 未達90分（\${q.visual?.score??"尚未評分"}）\`};
  if(Array.isArray(q.hardFailures)&&q.hardFailures.length) return {pass:false,reason:"硬性退件："+q.hardFailures.join("、")};
  if(q.pass!==true||Number(q.score||0)<90) return {pass:false,reason:\`製作品質未達90分（\${q.score??"尚未評分"}）\`};
  return {pass:true,premium:Number(q.score)>=95&&Number(q.visual.score)>=90,reason:Number(q.score)>=95?"95分精品母片":"90分以上可發布"};
}
async function videoQuality(req, env, b) {
  await requireVideoAccess(env,b.workspaceId);
  const channel=String(b.channel||"");
  if(!["video","tiktok","youtube"].includes(channel)) throw Object.assign(new Error("不支援的影片平台"),{status:400});
  const record=await hqTaskForVideo(env,b.workspaceId,b.taskId), old=record.task.videoJobs?.[channel];
  if(!old) throw Object.assign(new Error("這個平台尚未建立影片"),{status:404});
  if(old.status!=="completed"||!old.videoUrl) throw Object.assign(new Error("影片尚未完成，不能評分"),{status:409});
  const report=b.report&&typeof b.report==="object"?b.report:{};
  const manualReview={source:"manual_client",score:videoV3QualityScore(report),hardFailures:videoV3HardFailures(report),notes:String(report.notes||"").slice(0,3000),reviewedAt:Date.now()};
  const job={...old,manualReview,updatedAt:Date.now()};
  await saveVideoJob(env,record,channel,job);
  return {ok:true,manualReview,autoPublishUnlocked:false,gate:videoV3TrustedGate(job)};
}
async function applyVideoV3TrustedQualityReview(env, record, channel, trustedReport={}) {
  const old=record.task.videoJobs?.[channel];
  if(!old||old.status!=="completed"||!old.videoUrl) throw Object.assign(new Error("影片尚未完成，不能做可信 QC"),{status:409});
  if(trustedReport.source!=="server_visual_qc") throw Object.assign(new Error("TRUSTED_QC_SOURCE_REQUIRED"),{status:403});
  const production=trustedReport.production&&typeof trustedReport.production==="object"?trustedReport.production:{};
  const visual=trustedReport.visual&&typeof trustedReport.visual==="object"?trustedReport.visual:{};
  const hardFailures=videoV3HardFailures({hardFailures:[...(Array.isArray(production.hardFailures)?production.hardFailures:[]),...(Array.isArray(visual.hardFailures)?visual.hardFailures:[])]});
  const score=videoV3QualityScore(production);
  const visualScore=videoV3VisualScore(visual);
  const quality={...(old.quality||{}),version:"3.0.0",status:"trusted_reviewed",reviewSource:"trusted_server",score,pass:score>=90&&!hardFailures.length,premium:score>=95&&visualScore>=90&&!hardFailures.length,hardFailures,reviewedAt:Date.now(),visual:{trusted:true,score:visualScore,pass:visualScore>=90&&!hardFailures.length,sampleCount:Number(visual.sampleCount||0),model:String(visual.model||"").slice(0,120),notes:String(visual.notes||"").slice(0,2000)},productionDimensions:production};
  const job={...old,quality,updatedAt:Date.now()};
  await saveVideoJob(env,record,channel,job);
  return {job,quality,gate:videoV3TrustedGate(job)};
}
`;
src=src.replace(helperAnchor,helpers+"\n"+helperAnchor);

// 3) Public dispatch can record manual feedback only.
const dispatchNeedle='      if (url.pathname === "/video-status")\n        return json(await videoStatus(req, env, b), 200, H);';
if(!src.includes(dispatchNeedle)) throw new Error("video-status dispatch anchor missing");
src=src.replace(dispatchNeedle,dispatchNeedle+'\n      if (url.pathname === "/video-quality")\n        return json(await videoQuality(req, env, b), 200, H);');

// 4) Direct auto publish must have trusted server + visual QC before any publisher token/API work.
const publishNeedle='  if (videoJob?.status !== "completed" || !videoJob.videoUrl)\n    throw Object.assign(new Error("這個平台的 MP4 尚未完成"), { status: 409 });\n  let token = await getPublisher(env, record.id, provider);';
if(!src.includes(publishNeedle)) throw new Error("publishVideo completed-job/token anchor missing");
const publishReplacement='  if (videoJob?.status !== "completed" || !videoJob.videoUrl)\n    throw Object.assign(new Error("這個平台的 MP4 尚未完成"), { status: 409 });\n  if (task.approvalMode === "auto") {\n    const gate=videoV3TrustedGate(videoJob);\n    if(!gate.pass) throw Object.assign(new Error("自動發布已被可信 V3 QC 擋下："+gate.reason),{status:409});\n  }\n  let token = await getPublisher(env, record.id, provider);';
src=src.replace(publishNeedle,publishReplacement);

// 5) Scheduled auto-publisher should HOLD rather than repeatedly calling publisher when QC is not trusted.
const autoNeedle='          if (currentVideo?.status !== "completed" || !currentVideo.videoUrl) continue;\n          const privacy = String(config.publishPrivacy?.[provider] || (provider === "youtube" ? "private" : ""));';
if(!src.includes(autoNeedle)) throw new Error("hqProcessAutoPublish completed-video anchor missing");
const autoReplacement='          if (currentVideo?.status !== "completed" || !currentVideo.videoUrl) continue;\n          const qualityGate=videoV3TrustedGate(currentVideo);\n          if(!qualityGate.pass){\n            await env.MONITOR.put(`hq:auto-publish-hold:${workspaceId}:${task.id}:${provider}`,JSON.stringify({at:Date.now(),reason:qualityGate.reason}),{expirationTtl:604800});\n            continue;\n          }\n          const privacy = String(config.publishPrivacy?.[provider] || (provider === "youtube" ? "private" : ""));';
src=src.replace(autoNeedle,autoReplacement);

fs.writeFileSync(path,src);
console.log("Trusted V3 QC/publish security patch applied");
