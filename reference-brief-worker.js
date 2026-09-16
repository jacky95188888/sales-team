/* Reference Brief discovery helpers for Cloudflare Worker.
 * Uses YouTube Data API v3 public metadata only for discovery.
 * Structure analysis must come from trusted frame/transcript/video evidence; never invent creator-only retention.
 */
const arr=v=>Array.isArray(v)?v:[];
const str=(v,m=1200)=>String(v??"").trim().slice(0,m);
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const isoNow=()=>new Date().toISOString();

export const REFERENCE_MIN_CANDIDATES=3;
export const REFERENCE_TARGET_CANDIDATES=5;
export const TRUSTED_REFERENCE_EVIDENCE=new Set(["trusted-frames","trusted-frames-plus-transcript","trusted-video-analysis"]);

function metricRegime(publishedAt){
  const t=Date.parse(publishedAt||"");
  if(!Number.isFinite(t))return"unknown";
  // YouTube public view-count semantics changed in 2026-08-24 for all formats.
  return t>=Date.parse("2026-08-24T00:00:00Z")?"public-view-starts-2026-08-24+":"legacy-public-view-count";
}

function publicVideo(v={}){
  const sn=v.snippet||{},st=v.statistics||{},cd=v.contentDetails||{};
  return {
    videoId:str(v.id,80),
    title:str(sn.title,300),
    channelId:str(sn.channelId,120),
    channelTitle:str(sn.channelTitle,220),
    publishedAt:str(sn.publishedAt,80),
    description:str(sn.description,1200),
    duration:str(cd.duration,80),
    views:num(st.viewCount),
    likes:st.likeCount==null?null:num(st.likeCount),
    comments:st.commentCount==null?null:num(st.commentCount),
    likeViewRatio:st.likeCount==null||num(st.viewCount)<=0?null:num(st.likeCount)/num(st.viewCount),
    metricRegime:metricRegime(sn.publishedAt),
    publicUrl:v.id?`https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`:""
  };
}

async function ytJson(url){
  const r=await fetch(url,{headers:{accept:"application/json"}});
  const body=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(`YOUTUBE_API_${r.status}:${str(body?.error?.message||r.statusText,300)}`);e.status=r.status;throw e;}
  return body;
}

export async function discoverYouTubeReferences({env,query,maxResults=REFERENCE_TARGET_CANDIDATES,publishedAfter="",regionCode="TW",relevanceLanguage="zh-Hant"}){
  const key=str(env?.YOUTUBE_API_KEY,300);
  if(!key){const e=new Error("REFERENCE_DISCOVERY_UNAVAILABLE:YOUTUBE_API_KEY missing");e.status=503;throw e;}
  const q=str(query,300);
  if(!q){const e=new Error("REFERENCE_QUERY_REQUIRED");e.status=400;throw e;}
  const limit=Math.max(REFERENCE_MIN_CANDIDATES,Math.min(10,num(maxResults,REFERENCE_TARGET_CANDIDATES)));
  const p=new URLSearchParams({part:"snippet",type:"video",q,maxResults:String(limit),order:"viewCount",regionCode,key});
  if(relevanceLanguage)p.set("relevanceLanguage",relevanceLanguage);
  if(publishedAfter)p.set("publishedAfter",publishedAfter);
  const search=await ytJson(`https://www.googleapis.com/youtube/v3/search?${p}`);
  const ids=arr(search.items).map(x=>x?.id?.videoId).filter(Boolean).slice(0,limit);
  if(!ids.length)return {status:"REFERENCE_INSUFFICIENT",query:q,checkedAt:isoNow(),candidates:[],reason:"no_public_candidates"};
  const d=new URLSearchParams({part:"snippet,statistics,contentDetails",id:ids.join(","),key});
  const details=await ytJson(`https://www.googleapis.com/youtube/v3/videos?${d}`);
  const candidates=arr(details.items).map(publicVideo)
    .filter(x=>x.videoId&&x.views>0)
    .sort((a,b)=>b.views-a.views);
  return {
    status:candidates.length>=REFERENCE_MIN_CANDIDATES?"PUBLIC_EVIDENCE_READY":"REFERENCE_INSUFFICIENT",
    query:q,
    checkedAt:isoNow(),
    source:"YouTube Data API v3",
    candidateCount:candidates.length,
    candidates,
    privateMetricsAvailable:false,
    privateMetricsUnknown:["engagedViews","stayedToWatch","audienceRetention","averagePercentageViewed"],
    note:"Public metadata is discovery evidence only. Hook/story/edit breakdown requires trusted frame, transcript, or video analysis."
  };
}

export function normalizeReferenceAnalysis(input={}){
  return {
    videoId:str(input.videoId,80),
    hook:str(input.hook,500),
    firstCut:str(input.firstCut,300),
    firstPayoff:str(input.firstPayoff,500),
    storyBeats:arr(input.storyBeats).slice(0,10).map(x=>str(x,260)).filter(Boolean),
    conflictOrTwist:str(input.conflictOrTwist,500),
    climax:str(input.climax,500),
    presenterRatio:input.presenterRatio==null?null:Math.max(0,Math.min(1,num(input.presenterRatio))),
    brollTypes:arr(input.brollTypes).slice(0,10).map(x=>str(x,160)).filter(Boolean),
    productProof:arr(input.productProof).slice(0,8).map(x=>str(x,260)).filter(Boolean),
    effectBeats:arr(input.effectBeats).slice(0,12).map(x=>str(x,220)).filter(Boolean),
    soundBeats:arr(input.soundBeats).slice(0,12).map(x=>str(x,220)).filter(Boolean),
    captionRhythm:str(input.captionRhythm,500),
    cta:str(input.cta,500),
    evidenceType:str(input.evidenceType,100),
    visualEvidenceCount:Math.max(0,num(input.visualEvidenceCount)),
    transcriptEvidence:input.transcriptEvidence&&typeof input.transcriptEvidence==="object"?{
      available:input.transcriptEvidence.available===true,
      source:str(input.transcriptEvidence.source,200)
    }:{available:false,source:""},
    unknowns:arr(input.unknowns).slice(0,20).map(x=>str(x,220)).filter(Boolean),
    evidenceNotes:arr(input.evidenceNotes).slice(0,20).map(x=>str(x,300)).filter(Boolean),
    confidence:Math.max(0,Math.min(1,num(input.confidence,0)))
  };
}

function trustedAnalysis(x={}){
  return TRUSTED_REFERENCE_EVIDENCE.has(x.evidenceType)&&x.visualEvidenceCount>=3&&x.confidence>=.6;
}

function modeStrings(groups){
  const counts=new Map();
  for(const g of groups)for(const x of arr(g)){const k=str(x,260).toLowerCase();if(k&&k!=="unknown")counts.set(k,(counts.get(k)||0)+1);}
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]).filter(([,c])=>c>=2).slice(0,8).map(([pattern,count])=>({pattern,count}));
}

export function buildReferenceBrief({discovery,analyses=[],topic="",audience="",platform="shorts"}){
  const candidates=arr(discovery?.candidates);
  const normalized=arr(analyses).map(normalizeReferenceAnalysis).filter(x=>x.videoId);
  const trusted=normalized.filter(trustedAnalysis);
  const trustedIds=new Set(trusted.map(x=>x.videoId));
  const usableCandidates=candidates.filter(x=>trustedIds.has(x.videoId));
  const common={
    hookPatterns:modeStrings(trusted.map(x=>[x.hook])),
    storyPatterns:modeStrings(trusted.map(x=>x.storyBeats)),
    brollPatterns:modeStrings(trusted.map(x=>x.brollTypes)),
    effectPatterns:modeStrings(trusted.map(x=>x.effectBeats)),
    soundPatterns:modeStrings(trusted.filter(x=>x.transcriptEvidence.available).map(x=>x.soundBeats)),
    ctaPatterns:modeStrings(trusted.filter(x=>x.transcriptEvidence.available).map(x=>[x.cta]))
  };
  const structuralPatternCount=Object.values(common).reduce((n,x)=>n+x.length,0);
  const pass=usableCandidates.length>=REFERENCE_MIN_CANDIDATES&&structuralPatternCount>=3;
  const untrusted=normalized.filter(x=>!trustedAnalysis(x)).map(x=>({videoId:x.videoId,evidenceType:x.evidenceType,visualEvidenceCount:x.visualEvidenceCount,confidence:x.confidence}));
  return {
    version:"2.1.0",
    status:pass?"PASS":"REFERENCE_EVIDENCE_INCOMPLETE",
    topic:str(topic,300),
    audience:str(audience,300),
    platform:str(platform,80),
    checkedAt:isoNow(),
    source:"public-evidence-plus-trusted-structure-analysis",
    candidates:candidates.slice(0,10),
    analyzedVideoIds:[...trustedIds],
    commonPatterns:common,
    evidenceSummary:{
      publicCandidateCount:candidates.length,
      submittedAnalysisCount:normalized.length,
      trustedAnalysisCount:trusted.length,
      usableAnalyzedCount:usableCandidates.length,
      structuralPatternCount,
      analysesWithTranscript:trusted.filter(x=>x.transcriptEvidence.available).length
    },
    rejectedAnalyses:untrusted,
    inaccessibleMetrics:["creatorRetention","stayedToWatch","engagedViews"],
    originalityGuard:"Learn repeated structures only; do not copy a single creator's wording, character, signature scene, joke, or distinctive expression.",
    evidenceGuard:"Only trusted frame/transcript/video analysis with >=3 visual samples and confidence >=0.60 may satisfy the runtime gate.",
    issues:pass?[]:[
      ...(candidates.length<REFERENCE_MIN_CANDIDATES?["公開候選影片不足3支"]:[]),
      ...(usableCandidates.length<REFERENCE_MIN_CANDIDATES?["至少需要3支可信的結構分析"]:[]),
      ...(structuralPatternCount<3?["跨影片共同結構證據不足"]:[])
    ]
  };
}
