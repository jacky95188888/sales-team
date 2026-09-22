/* Trusted reference structure analyzer for Cloudflare Worker.
 * It analyzes authorized frame samples + optional transcript. It does NOT rip/download YouTube videos.
 * Goal: produce evidence-backed structure observations for reference-brief-worker.js.
 */
const arr=v=>Array.isArray(v)?v:[];
const str=(v,m=1200)=>String(v??"").trim().slice(0,m);
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp01=v=>Math.max(0,Math.min(1,num(v,0)));
const now=()=>new Date().toISOString();

export const REFERENCE_FRAME_MIN=3;
export const REFERENCE_FRAME_TARGET=8;
export const REFERENCE_FRAME_MAX=12;

function parseJson(raw=""){
  let t=String(raw||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"");
  const m=t.match(/\{[\s\S]*\}/);if(m)t=m[0];
  return JSON.parse(t);
}

function normalizeFrame(x={},i=0){
  return {
    frameId:str(x.frameId||`frame-${i+1}`,80),
    timestampSec:Math.max(0,num(x.timestampSec)),
    mediaType:str(x.mediaType||"image/jpeg",80),
    base64:str(x.base64,8_000_000),
    source:str(x.source||"authorized-frame-sample",120)
  };
}

function validateFrames(frames=[]){
  const clean=arr(frames).slice(0,REFERENCE_FRAME_MAX).map(normalizeFrame)
    .filter(x=>x.base64&&x.base64.length<7_000_000&&/^image\/(jpeg|png|webp)$/i.test(x.mediaType));
  const issues=[];
  if(clean.length<REFERENCE_FRAME_MIN)issues.push(`可信影格不足${REFERENCE_FRAME_MIN}張`);
  for(let i=1;i<clean.length;i++)if(clean[i].timestampSec<clean[i-1].timestampSec)issues.push("影格時間戳未依序排列");
  return {pass:!issues.length,issues,frames:clean};
}

async function anthropicVision(env,content,maxTokens=1800){
  if(!env?.ANTHROPIC_KEY){const e=new Error("REFERENCE_VISUAL_UNAVAILABLE:ANTHROPIC_KEY missing");e.status=503;throw e;}
  const r=await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{"content-type":"application/json","x-api-key":env.ANTHROPIC_KEY,"anthropic-version":"2023-06-01"},
    body:JSON.stringify({
      model:env.REFERENCE_VISION_MODEL||env.ANTHROPIC_MODEL||"claude-sonnet-4-6",
      max_tokens:maxTokens,
      system:"你是短影音結構分析師。只能根據提供的影格、時間戳、字幕/逐字稿做觀察；看不到或無法證明的內容必須標 unknown。不要猜觀眾留存、engaged views、演算法偏好或未提供的聲音內容。只輸出合法 JSON。",
      messages:[{role:"user",content}]
    })
  });
  const text=await r.text();
  if(!r.ok){const e=new Error(`REFERENCE_VISUAL_MODEL_${r.status}:${text.slice(0,300)}`);e.status=r.status;throw e;}
  const d=JSON.parse(text);
  return (d.content||[]).filter(x=>x.type==="text").map(x=>x.text).join("\n");
}

function textBlock(videoId,transcript,frames){
  const timeline=frames.map(x=>`${x.frameId}@${x.timestampSec.toFixed(2)}s`).join(", ");
  return {
    type:"text",
    text:[
      `videoId=${str(videoId,80)}`,
      `影格時間：${timeline}`,
      transcript?`可用逐字稿/字幕：\n${str(transcript,12000)}`:"沒有可信逐字稿；與語音/聲音/完整 CTA 有關的結論請標 unknown。",
      "請分析：0–3秒視覺Hook、可觀察首次明顯畫面轉換、首次可觀察payoff、story beats、衝突/反轉、高潮、主持人佔比估計、B-roll類型、產品/證據畫面、特效節點、字幕節奏、CTA（若證據不足填unknown）。",
      "不要把相鄰取樣影格直接當成真實cut；只能寫 observed visual change，除非提供連續取樣足以支持切鏡。",
      "只回 JSON：{hook,firstCut,firstPayoff,storyBeats:[],conflictOrTwist,climax,presenterRatio,brollTypes:[],productProof:[],effectBeats:[],soundBeats:[],captionRhythm,cta,unknowns:[],evidenceNotes:[],confidence}"
    ].join("\n")
  };
}

export async function analyzeReferenceFrames({env,videoId,frames=[],transcript="",transcriptSource="",authorized=true}){
  if(authorized!==true){const e=new Error("REFERENCE_MEDIA_NOT_AUTHORIZED");e.status=403;throw e;}
  const checked=validateFrames(frames);
  if(!checked.pass)return {status:"REFERENCE_EVIDENCE_INCOMPLETE",videoId:str(videoId,80),checkedAt:now(),issues:checked.issues};
  const content=[];
  for(const f of checked.frames){
    content.push({type:"text",text:`${f.frameId} timestamp=${f.timestampSec.toFixed(2)}s`});
    content.push({type:"image",source:{type:"base64",media_type:f.mediaType,data:f.base64}});
  }
  content.push(textBlock(videoId,transcript,checked.frames));
  const raw=await anthropicVision(env,content);
  let j;try{j=parseJson(raw);}catch{const e=new Error("REFERENCE_VISUAL_JSON_INVALID");e.status=502;throw e;}
  const transcriptTrusted=!!str(transcript,12000)&&!!str(transcriptSource,200);
  return {
    status:"PASS",
    videoId:str(videoId,80),
    checkedAt:now(),
    evidenceType:transcriptTrusted?"trusted-frames-plus-transcript":"trusted-frames",
    visualEvidenceCount:checked.frames.length,
    transcriptEvidence:transcriptTrusted?{available:true,source:str(transcriptSource,200)}:{available:false,source:""},
    hook:str(j.hook,500),
    firstCut:str(j.firstCut,300),
    firstPayoff:str(j.firstPayoff,500),
    storyBeats:arr(j.storyBeats).slice(0,10).map(x=>str(x,260)).filter(Boolean),
    conflictOrTwist:str(j.conflictOrTwist,500),
    climax:str(j.climax,500),
    presenterRatio:j.presenterRatio==null?null:clamp01(j.presenterRatio),
    brollTypes:arr(j.brollTypes).slice(0,10).map(x=>str(x,160)).filter(Boolean),
    productProof:arr(j.productProof).slice(0,8).map(x=>str(x,260)).filter(Boolean),
    effectBeats:arr(j.effectBeats).slice(0,12).map(x=>str(x,220)).filter(Boolean),
    soundBeats:transcriptTrusted?arr(j.soundBeats).slice(0,12).map(x=>str(x,220)).filter(Boolean):[],
    captionRhythm:str(j.captionRhythm,500),
    cta:transcriptTrusted?str(j.cta,500):"unknown",
    unknowns:arr(j.unknowns).slice(0,20).map(x=>str(x,220)).filter(Boolean),
    evidenceNotes:arr(j.evidenceNotes).slice(0,20).map(x=>str(x,300)).filter(Boolean),
    confidence:clamp01(j.confidence),
    hardLimits:["No creator-only retention inference","No engaged-view inference","No exact cut timing unless evidence supports it","No audio inference without trusted transcript/audio evidence"]
  };
}

export function referenceAnalysisIsTrusted(a={}){
  const type=str(a.evidenceType,100);
  const evidenceOk=type==="trusted-frames"||type==="trusted-frames-plus-transcript"||type==="trusted-video-analysis";
  return evidenceOk&&num(a.visualEvidenceCount)>=REFERENCE_FRAME_MIN&&clamp01(a.confidence)>=.6;
}
