// V3 phase 2: render-review recording + auto-publish quality gate.
// Apply only to the COMPLETE sales-team-worker.js.
import fs from "node:fs";
const path="sales-team-worker.js";let src=fs.readFileSync(path,"utf8");
if(!src.includes('"/video-status",'))throw new Error("route anchor missing");
src=src.replace('"/video-status",','"/video-status",\n  "/video-quality",');
const anchor='const PUBLISH_PROVIDERS = new Set(["youtube", "tiktok"]);';
if(!src.includes(anchor))throw new Error("publish anchor missing");
const qc=`function videoV3QualityScore(report = {}) {
  const weights = { hook:12, story:15, effects:15, substance:15, visualRhythm:12, faceNaturalness:10, voiceNaturalness:8, captions:6, brandFit:7 };
  let score=0; for(const [k,w] of Object.entries(weights)){ const v=Math.max(0,Math.min(100,Number(report[k]||0))); score += v*w/100; }
  return Math.round(score);
}
function videoV3HardFailures(report={}) { const allowed=new Set(["face_break","lip_sync","wrong_identity","blank_frame","broken_audio","unsafe_caption","no_story","no_effect_design"]); return [...new Set((Array.isArray(report.hardFailures)?report.hardFailures:[]).filter(x=>allowed.has(String(x))))]; }
async function videoQuality(req, env, b) {
  await requireVideoAccess(env,b.workspaceId); const channel=String(b.channel||"");
  if(!["video","tiktok","youtube"].includes(channel)) throw Object.assign(new Error("不支援的影片平台"),{status:400});
  const record=await hqTaskForVideo(env,b.workspaceId,b.taskId), old=record.task.videoJobs?.[channel];
  if(!old) throw Object.assign(new Error("這個平台尚未建立影片"),{status:404});
  if(old.status!=="completed"||!old.videoUrl) throw Object.assign(new Error("影片尚未完成，不能評分"),{status:409});
  const report=b.report&&typeof b.report==="object"?b.report:{}; const hardFailures=videoV3HardFailures(report); const score=videoV3QualityScore(report);
  const quality={...(old.quality||{}),version:"3.0.0",status:"reviewed",score,pass:score>=90&&!hardFailures.length,premium:score>=95&&!hardFailures.length,hardFailures,reviewedAt:Date.now(),dimensions:{hook:Number(report.hook||0),story:Number(report.story||0),effects:Number(report.effects||0),substance:Number(report.substance||0),visualRhythm:Number(report.visualRhythm||0),faceNaturalness:Number(report.faceNaturalness||0),voiceNaturalness:Number(report.voiceNaturalness||0),captions:Number(report.captions||0),brandFit:Number(report.brandFit||0)},notes:String(report.notes||"").slice(0,3000)};
  const job={...old,quality,updatedAt:Date.now()}; await saveVideoJob(env,record,channel,job); return {ok:true,quality,gate:videoV3AutoPublishGate(job)};
}
`;
src=src.replace(anchor,qc+"\n"+anchor);
const dispatchNeedle='      if (url.pathname === "/video-status")\n        return json(await videoStatus(req, env, b), 200, H);';
if(!src.includes(dispatchNeedle))throw new Error("video-status url.pathname dispatch anchor missing; refusing unsafe patch");
src=src.replace(dispatchNeedle,dispatchNeedle+'\n      if (url.pathname === "/video-quality")\n        return json(await videoQuality(req, env, b), 200, H);');
// Gate direct publish: manual legacy approval remains compatible; auto mode requires V3 >=90.
const publishNeedle='const videoJob =';
const publishPos=src.indexOf(publishNeedle,src.indexOf('async function publishVideo'));
if(publishPos<0)throw new Error("publishVideo videoJob anchor missing");
const tokenPos=src.indexOf('const token',publishPos);if(tokenPos<0)throw new Error("publisher token anchor missing");
const gate='  if (config.approvalMode === "auto") { const gate = videoV3AutoPublishGate(videoJob); if (!gate.pass) throw Object.assign(new Error("自動發布已被 V3 品質閘門擋下：" + gate.reason), { status: 409 }); }\n  if (videoJob?.quality?.version === "3.0.0" && Array.isArray(videoJob.quality.hardFailures) && videoJob.quality.hardFailures.length && b.manualOverride !== true) throw Object.assign(new Error("影片有 V3 硬性退件，需人工覆核後才能發布"), { status: 409 });\n';
src=src.slice(0,tokenPos)+gate+src.slice(tokenPos);
fs.writeFileSync(path,src);console.log("V3 QC/publish patch applied");
